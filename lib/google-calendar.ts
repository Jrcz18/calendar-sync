import { google } from 'googleapis';

const jwtClient = new google.auth.JWT(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  undefined,
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/calendar']
);

const calendar = google.calendar({
  version: 'v3',
  auth: jwtClient,
});

/**
 * Upsert booking into Google Calendar (all-day, check-in only).
 */
export async function upsertBookingToCalendar(booking: any, unit: any) {
  if (!booking.checkinDate) {
    console.error(`❌ Booking ${booking.id} missing checkinDate`, booking);
    return;
  }

  // End date = next day (exclusive) → event shows only on check-in day
  const endDate = new Date(booking.checkinDate);
  endDate.setDate(endDate.getDate() + 1);

  const event = {
    id: booking.id,
    summary: `Booking: ${unit.name}`,
    description: `Booked by ${booking.guestFirstName || ''} ${booking.guestLastName || ''}`,
    start: { date: booking.checkinDate },
    end: { date: endDate.toISOString().split('T')[0] },
    colorId: unit.colorId || '1',
  };

  try {
    await calendar.events.update({
      calendarId: process.env.GOOGLE_CALENDAR_ID!,
      eventId: booking.id,
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
 * Delete booking from Google Calendar.
 */
export async function deleteBookingFromCalendar(bookingId: string) {
  try {
    await calendar.events.delete({
      calendarId: process.env.GOOGLE_CALENDAR_ID!,
      eventId: bookingId,
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
