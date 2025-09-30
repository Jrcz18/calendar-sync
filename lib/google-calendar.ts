// lib/google-calendar.ts
import { google } from 'googleapis';
import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || '{}');

if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
  throw new Error('GOOGLE_SERVICE_ACCOUNT env is missing or invalid');
}

const jwtClient = new google.auth.JWT(
  serviceAccount.client_email,
  undefined,
  serviceAccount.private_key.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/calendar']
);

export const calendar = google.calendar({ version: 'v3', auth: jwtClient });

// ---------------- Utility ----------------
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function safeApiCall(fn: () => Promise<any>, retries = 5, delayMs = 1000) {
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

// ---------------- Upsert Booking ----------------
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
    // 1️⃣ Skip if booking already has a Google event ID
    if (booking.googleCalendarEventId) {
      console.log(`⚠️ Booking ${booking.id} already has a calendar event. Skipping.`);
      return;
    }

    // 2️⃣ Check if an event with this booking already exists in Google Calendar
    const existing = await safeApiCall(() =>
      calendar.events.list({
        calendarId: process.env.GOOGLE_CALENDAR_ID!,
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        q: `Booking: ${unit.name}`,
      })
    );

    if (existing.data.items?.length) {
      console.log(`⚠️ Booking ${booking.id} already exists in Google Calendar. Skipping.`);
      // Optionally, attach the existing event ID to booking
      booking.googleCalendarEventId = existing.data.items[0].id;
      return;
    }

    // 3️⃣ Insert new event
    const inserted = await safeApiCall(() =>
      calendar.events.insert({
        calendarId: process.env.GOOGLE_CALENDAR_ID!,
        requestBody: eventBody,
      })
    );

    booking.googleCalendarEventId = inserted.data.id;
    console.log(`➕ Inserted booking ${booking.id}`);

    // Optional: save back to Firestore
    await admin.firestore().collection('bookings').doc(booking.id).update({
      googleCalendarEventId: inserted.data.id,
    });

  } catch (err: any) {
    console.error(`❌ Failed to sync booking ${booking.id}`, err);
  }
}

// ---------------- Delete Booking ----------------
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
