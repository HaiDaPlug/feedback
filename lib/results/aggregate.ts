import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { answers, questions, responses } from '@/lib/db/schema';
import { RATING_MAX, RATING_MIN } from '@/lib/form/types';
import type { QuestionOption, QuestionType } from '@/lib/db/schema';

/**
 * Anonymous results aggregation.
 *
 * Reads across ALL form versions of an event so historical responses remain
 * visible after a form edit, using each answer's own question row -- which is
 * why the original wording survives.
 *
 * Deliberately absent: any per-response timestamp beyond a coarse date, any
 * cross-event identifier, and any "unique attendees" or response-rate metric.
 */

export type RatingSummary = {
  average: number;
  /** Count per score, indexed 1..5. */
  distribution: { score: number; count: number }[];
  answered: number;
};

export type ChoiceSummary = {
  options: { id: string; label: string; count: number; percentage: number }[];
  answered: number;
  /** True for multi_choice, where totals can exceed the response count. */
  allowsMultiple: boolean;
};

export type TextSummary = {
  entries: string[];
};

export type QuestionResult = {
  questionId: string;
  label: string;
  type: QuestionType;
  rating?: RatingSummary;
  choice?: ChoiceSummary;
  text?: TextSummary;
};

export type EventResults = {
  /** Labelled "Responses" in the UI -- NOT unique attendees. */
  responseCount: number;
  questions: QuestionResult[];
};

type AnswerRow = {
  responseId: string;
  questionId: string;
  valueText: string | null;
  valueNumber: number | null;
  valueOptionIds: string[];
  label: string;
  type: QuestionType;
  options: QuestionOption[];
  position: number;
  formVersionId: string;
};

async function loadAnswers(eventId: string): Promise<AnswerRow[]> {
  return db
    .select({
      responseId: answers.responseId,
      questionId: answers.questionId,
      valueText: answers.valueText,
      valueNumber: answers.valueNumber,
      valueOptionIds: answers.valueOptionIds,
      label: questions.label,
      type: questions.type,
      options: questions.options,
      position: questions.position,
      formVersionId: questions.formVersionId,
    })
    .from(answers)
    .innerJoin(responses, eq(responses.id, answers.responseId))
    .innerJoin(questions, eq(questions.id, answers.questionId))
    .where(eq(responses.eventId, eventId))
    .orderBy(asc(questions.position));
}

/**
 * Group answers by question wording so that a question whose text was never
 * changed reports one combined summary across form versions, while an edited
 * question reports separately under each wording it was actually asked in.
 */
function groupKey(row: AnswerRow): string {
  return `${row.type}::${row.label}`;
}

export async function getEventResults(eventId: string): Promise<EventResults> {
  const allResponses = await db
    .select({ id: responses.id })
    .from(responses)
    .where(eq(responses.eventId, eventId));

  const rows = await loadAnswers(eventId);
  const groups = new Map<string, AnswerRow[]>();

  for (const row of rows) {
    const key = groupKey(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const results: QuestionResult[] = [];

  for (const [, group] of groups) {
    const first = group[0];
    const base = {
      questionId: first.questionId,
      label: first.label,
      type: first.type,
    };

    switch (first.type) {
      case 'rating': {
        const values = group
          .map((r) => r.valueNumber)
          .filter((v): v is number => typeof v === 'number');

        const distribution = [];
        for (let score = RATING_MIN; score <= RATING_MAX; score += 1) {
          distribution.push({
            score,
            count: values.filter((v) => v === score).length,
          });
        }

        const average =
          values.length > 0
            ? values.reduce((sum, v) => sum + v, 0) / values.length
            : 0;

        results.push({
          ...base,
          rating: { average, distribution, answered: values.length },
        });
        break;
      }

      case 'single_choice':
      case 'multi_choice': {
        // Union the option sets seen across versions so an option removed in a
        // later edit still shows the votes it received.
        const optionMap = new Map<string, string>();
        for (const row of group) {
          for (const option of row.options ?? []) {
            if (!optionMap.has(option.id)) optionMap.set(option.id, option.label);
          }
        }

        const counts = new Map<string, number>();
        const respondents = new Set<string>();

        for (const row of group) {
          if (row.valueOptionIds.length > 0) respondents.add(row.responseId);
          for (const optionId of row.valueOptionIds) {
            counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
            if (!optionMap.has(optionId)) optionMap.set(optionId, optionId);
          }
        }

        const answered = respondents.size;

        results.push({
          ...base,
          choice: {
            allowsMultiple: first.type === 'multi_choice',
            answered,
            options: [...optionMap.entries()].map(([id, label]) => {
              const count = counts.get(id) ?? 0;
              return {
                id,
                label,
                count,
                percentage: answered > 0 ? (count / answered) * 100 : 0,
              };
            }),
          },
        });
        break;
      }

      case 'short_text':
      case 'long_text': {
        const entries = group
          .map((r) => r.valueText?.trim())
          .filter((v): v is string => Boolean(v));

        results.push({ ...base, text: { entries } });
        break;
      }
    }
  }

  return {
    responseCount: allResponses.length,
    questions: results,
  };
}

/**
 * Individual anonymous responses.
 *
 * Labels are positional within THIS event only ("Response 1", "Response 2"),
 * derived from a stable ordering of response ids. They intentionally carry no
 * meaning across events, so "Response 3" at two different events says nothing
 * about it being the same person.
 */
export type IndividualResponse = {
  label: string;
  submittedOn: string;
  answers: { label: string; type: QuestionType; display: string }[];
};

export async function getIndividualResponses(
  eventId: string,
): Promise<IndividualResponse[]> {
  const responseRows = await db
    .select({
      id: responses.id,
      submittedOn: responses.submittedOn,
    })
    .from(responses)
    .where(eq(responses.eventId, eventId))
    .orderBy(asc(responses.submittedOn), asc(responses.id));

  const rows = await loadAnswers(eventId);
  const byResponse = new Map<string, AnswerRow[]>();

  for (const row of rows) {
    const list = byResponse.get(row.responseId);
    if (list) list.push(row);
    else byResponse.set(row.responseId, [row]);
  }

  return responseRows.map((response, index) => ({
    label: `Response ${index + 1}`,
    submittedOn: response.submittedOn,
    answers: (byResponse.get(response.id) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((row) => ({
        label: row.label,
        type: row.type,
        display: formatAnswer(row),
      })),
  }));
}

export function formatAnswer(row: {
  type: QuestionType;
  valueText: string | null;
  valueNumber: number | null;
  valueOptionIds: string[];
  options: QuestionOption[];
}): string {
  switch (row.type) {
    case 'rating':
      return row.valueNumber !== null ? `${row.valueNumber} / ${RATING_MAX}` : '';
    case 'single_choice':
    case 'multi_choice': {
      const labels = new Map((row.options ?? []).map((o) => [o.id, o.label]));
      return row.valueOptionIds.map((id) => labels.get(id) ?? id).join(', ');
    }
    default:
      return row.valueText ?? '';
  }
}
