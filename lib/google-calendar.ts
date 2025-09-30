import { google } from 'googleapis';

const jwtClient = new google.auth.JWT(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  undefined,
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/calendar']
);

export const calendar = google.calendar({
  version: 'v3',
  auth: jwtClient,
});

/**
 * Insert or update a booking on the calendar.
 * Only blocks the check-in date as an all-day event.
 */
export async function upsertBookingToCalendar(booking: any, unit: any) {
  const startDate = booking.checkinDate;
  if (!startDate) {
    console.error(`❌ Booking ${booking.id} missing checkinDate`, booking);
    return;
  }

  // End date = next day (exclusive) so event shows only on the check-in date
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);

  const event = {
    id: booking.id,
    summary: `Booking: ${unit.name}`,
    description: `Booked by ${booking.guestFirstName || ''} ${booking.guestLastName || ''}`,
    start: { date: startDate },
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
 * Delete a booking from the calendar by its booking ID.
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
      console.log(`ℹ️ Booking ${bookingId} not found on calendar, nothing to delete.`);
    } else {
      console.error(`❌ Failed to delete booking ${bookingId}`, err);
    }
  }
}
