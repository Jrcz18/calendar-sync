import { google } from 'googleapis';
import { adminDb } from './firebase-admin'; // adjust your path

const serviceAccount = JSON.parse(
  process.env.GOOGLE_SERVICE_ACCOUNT || '{}'
);

if (!serviceAccount || !serviceAccount.client_email || !serviceAccount.private_key) {
  throw new Error('GOOGLE_SERVICE_ACCOUNT env is missing or invalid');
}

const jwtClient = new google.auth.JWT(
  serviceAccount.client_email,
  undefined,
  serviceAccount.private_key.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/calendar']
);

const calendar = google.calendar({ version: 'v3', auth: jwtClient });

// Utility delay
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Safe API call with retry for rate limits
async function safeApiCall(fn: () => Promise<any>, retries = 5, delayMs = 1000): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (err.code === 403 && err.errors?.[0]?.reason === 'rateLimitExceeded') {
        if (attempt < retries) {
          console.warn(`⚠️ Rate limit exceeded, retrying attempt ${attempt + 1} in ${delayMs}ms`);
          await delay(delayMs);
          delayMs *= 2;
          continue;
        }
      }
      throw err;
    }
  }
}

/**
 * Ensure Firestore documents include their ID
 */
export async function attachBookingIds(collectionName: string) {
  const snapshot = await adminDb.collection(collectionName).get();
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
}

/**
 * Remove duplicate events for a booking (keeps the first, deletes the rest)
 */
async function removeDuplicateBookings(booking: any, unit: any) {
  if (!booking.checkinDate || !booking.id) return;

  const startDate = new Date(booking.checkinDate);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);

  const summary = `Booking: ${unit.name}`;

  try {
    const res = await safeApiCall(() =>
      calendar.events.list({
        calendarId: process.env.GOOGLE_CALENDAR_ID!,
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        q: summary,
      })
    );

    const events = res.data.items || [];
    if (events.length <= 1) return;

    const [keep, ...duplicates] = events;
    const batchSize = 5;

    for (let i = 0; i < duplicates.length; i += batchSize) {
      const batch = duplicates.slice(i, i + batchSize);
      await Promise.all(batch.map(async (dup) => {
        if (dup.id) {
          try {
            await safeApiCall(() => calendar.events.delete({
              calendarId: process.env.GOOGLE_CALENDAR_ID!,
              eventId: dup.id,
            }));
            console.log(`🗑️ Removed duplicate event ${dup.id} for booking ${booking.id}`);
          } catch (err: any) {
            if (err.code === 410) return;
            throw err;
          }
        }
      }));
      await delay(500);
    }

    booking.googleCalendarEventId = keep.id;
  } catch (err: any) {
    console.error(`❌ Failed to remove duplicates for booking ${booking.id}`, err);
  }
}

/**
 * Upsert booking into Google Calendar
 */
export async function upsertBookingToCalendar(booking: any, unit: any) {
  if (!booking.checkinDate || !booking.id) {
    console.error(`❌ Booking missing checkinDate or id`, booking);
    return;
  }

  const firstName = booking.guestFirstName?.trim() || '';
  const lastName = booking.guestLastName?.trim() || '';

  const startDate = new Date(booking.checkinDate);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);

  const eventBody = {
    summary: `Booking: ${unit.name}`,
    description: `Booked by ${firstName} ${lastName}`.trim(),
    start: { date: startDate.toISOString().split('T')[0] },
    end: { date: endDate.toISOString().split('T')[0] },
    colorId: unit.colorId || '1',
  };

  try {
    if (!booking.googleCalendarEventId) {
      await removeDuplicateBookings(booking, unit);
    }

    const googleEventId = booking.googleCalendarEventId;

    if (googleEventId) {
      await safeApiCall(() =>
        calendar.events.update({
          calendarId: process.env.GOOGLE_CALENDAR_ID!,
          eventId: googleEventId,
          requestBody: eventBody,
        })
      );
      console.log(`✅ Updated booking ${booking.id}`);
    } else {
      const inserted = await safeApiCall(() =>
        calendar.events.insert({
          calendarId: process.env.GOOGLE_CALENDAR_ID!,
          requestBody: eventBody,
        })
      );
      booking.googleCalendarEventId = inserted.data.id;
      console.log(`➕ Inserted booking ${booking.id}`);
    }

  } catch (err: any) {
    console.error(`❌ Failed to sync booking ${booking.id}`, err);
  }
}

/**
 * Delete booking from Google Calendar
 */
export async function deleteBookingFromCalendar(bookingId: string, googleEventId?: string) {
  if (!googleEventId) {
    console.log(`⚠️ Booking ${bookingId} has no Google Calendar event ID`);
    return;
  }

  try {
    await safeApiCall(() =>
      calendar.events.delete({
        calendarId: process.env.GOOGLE_CALENDAR_ID!,
        eventId: googleEventId,
      })
    );
    console.log(`🗑️ Deleted booking ${bookingId}`);
  } catch (err: any) {
    if (err.code === 404 || err.code === 410) {
      console.log(`⚠️ Booking ${bookingId} not found or already deleted`);
    } else {
      console.error(`❌ Failed to delete booking ${bookingId}`, err);
    }
  }
}
