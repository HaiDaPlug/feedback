import { NextResponse } from 'next/server';
import { AuthorizationError, assertEventInOrg, requireModeratorApi } from '@/lib/auth/guards';
import { getEvent } from '@/lib/db/queries/events';
import { getIndividualResponses } from '@/lib/results/aggregate';
import { buildResponsesCsv, csvFilename } from '@/lib/results/csv';

export const dynamic = 'force-dynamic';

/**
 * CSV export of anonymous responses.
 *
 * Protected: unauthenticated or non-moderator callers get 401/403 rather than
 * data. The output contains event details, question wording, and answers -- and
 * deliberately no idempotency key, no access token, no IP, and no submission
 * time finer than the date.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  try {
    const moderator = await requireModeratorApi();
    await assertEventInOrg(eventId, moderator.orgId);

    const event = await getEvent(eventId, moderator.orgId);
    if (!event) {
      return NextResponse.json({ message: 'Event not found.' }, { status: 404 });
    }

    const responses = await getIndividualResponses(eventId);

    const csv = buildResponsesCsv({
      eventName: event.name,
      eventDate: event.eventDate,
      location: event.location,
      responses: responses.map((response) => ({
        label: response.label,
        submittedOn: response.submittedOn,
        answers: response.answers.map((answer) => ({
          label: answer.label,
          display: answer.display,
        })),
      })),
    });

    // BOM so Excel opens UTF-8 correctly.
    return new NextResponse(`﻿${csv}`, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${csvFilename(event.name, event.eventDate)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
