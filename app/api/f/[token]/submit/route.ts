import { NextResponse } from 'next/server';
import {
  FormLookupError,
  getFormByToken,
  submitResponse,
} from '@/lib/db/queries/participant';
import { validateAnswers } from '@/lib/form/validate-answers';
import { MAX_SUBMISSION_BYTES, submissionSchema } from '@/lib/validation/schemas';
import { checkRateLimit, clientIpForRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Anonymous feedback submission.
 *
 * This is a public endpoint -- no session, no identity. Every trust decision is
 * made here, server-side, in this order:
 *
 *   1. request size cap        6. required answers (visible questions only)
 *   2. rate limit (see note)   7. answer types and allowed option ids
 *   3. token active            8. text length limits
 *   4. event status = open     9. hidden answers stripped before insert
 *   5. form version current   10. idempotency key dedupe
 *
 * The token is never logged, and no request metadata is stored with the response.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // 1. Size cap before reading the body into memory.
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_SUBMISSION_BYTES) {
    return NextResponse.json(
      { message: 'That response is too large to submit.' },
      { status: 413 },
    );
  }

  // 2. Proportionate abuse control. The IP is hashed with an ephemeral salt for
  //    counting only and is never persisted alongside feedback.
  const limit = checkRateLimit(clientIpForRateLimit(request.headers));
  if (!limit.allowed) {
    return NextResponse.json(
      { message: 'Too many attempts. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_SUBMISSION_BYTES) {
    return NextResponse.json(
      { message: 'That response is too large to submit.' },
      { status: 413 },
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 });
  }

  const parsed = submissionSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 });
  }

  // 3. Token must resolve to an active row. Rotation revokes the old row, so a
  //    superseded link fails here for submitting exactly as it does for loading.
  let form;
  try {
    form = await getFormByToken(token);
  } catch (error) {
    if (error instanceof FormLookupError) {
      // 503 tells the client this is temporary. The participant's answers stay
      // on screen and the same idempotency key is reused on retry, so a
      // successful retry still produces exactly one response.
      return NextResponse.json(
        {
          message:
            'We could not save your feedback just now. Your answers are still here — please try again in a moment.',
        },
        { status: 503 },
      );
    }
    throw error;
  }

  if (!form) {
    return NextResponse.json(
      { message: 'This feedback link is no longer valid.' },
      { status: 404 },
    );
  }

  // 4. Status is checked here AND again inside the write, so a form left open in
  //    a browser cannot be submitted after collection closes.
  if (form.status !== 'open') {
    return NextResponse.json(
      { message: 'This event is no longer collecting feedback.' },
      { status: 409 },
    );
  }

  // 5. The participant must submit the version they were served.
  if (parsed.data.formVersionId !== form.formVersionId) {
    return NextResponse.json(
      {
        message:
          'This form was updated while you were answering. Please reload the page -- your answers are still on screen, so you can copy anything you want to keep first.',
      },
      { status: 409 },
    );
  }

  // 6-9. Re-validate everything against the real question definitions, and drop
  //      answers to questions that are not visible.
  const validation = validateAnswers(form.questions, parsed.data.answers);
  if (!validation.ok) {
    return NextResponse.json(
      { message: 'Please check your answers.', errors: validation.errors },
      { status: 422 },
    );
  }

  // 10. Idempotent write.
  const outcome = await submitResponse({
    eventId: form.eventId,
    formVersionId: form.formVersionId,
    idempotencyKey: parsed.data.idempotencyKey,
    answers: validation.answers,
    questions: form.questions,
  });

  if (!outcome.ok) {
    const message =
      outcome.reason === 'closed'
        ? 'This event is no longer collecting feedback.'
        : 'This form was updated while you were answering. Please reload the page.';
    return NextResponse.json({ message }, { status: 409 });
  }

  // Success is returned only after the database has confirmed the write.
  return NextResponse.json({ ok: true, duplicate: outcome.duplicate }, { status: 201 });
}
