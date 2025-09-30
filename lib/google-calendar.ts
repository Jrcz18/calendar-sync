import { google } from 'googleapis';

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

export default calendar;

// sanitize booking ID for Google Calendar
function sanitizeEventId(id: string) {
  return id.replace(/[^a-zA-Z0-9-_]/g, '_'); // only allow letters, numbers, hyphens, underscores
}

/**
 * Upsert booking into Google Calendar (all-day, check-in only)
 */
export async function upsertBookingToCalendar(booking: any, unit: any) {
  if (!booking.checkinDate) {
    console.error(`❌ Booking ${booking.id} missing checkinDate`, booking);
    return;
  }

  const endDate = new Date(booking.checkinDate);
  endDate.setDate(endDate.getDate() + 1);

  const eventId = sanitizeEventId(booking.id);

  const event = {
    id: eventId,
    summary: `Booking: ${unit.name}`,
    description: `Booked by ${booking.guestFirstName || ''} ${booking.guestLastName || ''}`,
    start: { date: booking.checkinDate },
    end: { date: endDate.toISOString().split('T')[0] },
    colorId: unit.colorId || '1',
  };

  try {
    await calendar.events.update({
      calendarId: process.env.GOOGLE_CALENDAR_ID!,
      eventId,
      requestBody: event,
    });
    console.log(`✅ Updated booking ${booking.id}`);
  } catch (err: any) {
    if (err.code === 404) {
      await calendar.events.insert({
        calendarId: process.env.GOOGLE_CALENDAR_ID!,
        requestBody: event,
      });
      console.log(`➕ Inserted booking ${booking.id}`);
    } else {
      console.error(`❌ Failed to sync booking ${booking.id}`, err);
    }
  }
}

/**
 * Delete booking from Google Calendar
 */
export async function deleteBookingFromCalendar(bookingId: string) {
  const eventId = sanitizeEventId(bookingId);
  try {
    await calendar.events.delete({
      calendarId: process.env.GOOGLE_CALENDAR_ID!,
      eventId,
    });
    console.log(`🗑️ Deleted booking ${bookingId}`);
  } catch (err: any) {
    if (err.code === 404) {
      console.log(`⚠️ Booking ${bookingId} not found in Google Calendar`);
    } else {
      console.error(`❌ Failed to delete booking ${bookingId}`, err);
    }
  }
}
