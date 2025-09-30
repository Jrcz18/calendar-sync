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

/**
 * Remove duplicate events for a booking (keeps the first, deletes the rest)
 */
async function removeDuplicateBookings(booking: any, unit: any) {
  if (!booking.checkinDate) return;

  const startDate = new Date(booking.checkinDate);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);

  const summary = `Booking: ${unit.name}`;

  try {
    const res = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID!,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      q: summary,
    });

    const events = res.data.items || [];

    if (events.length <= 1) return; // nothing to remove

    // Keep the first event, delete duplicates
    const [keep, ...duplicates] = events;
    for (const dup of duplicates) {
      if (dup.id) {
        await calendar.events.delete({
          calendarId: process.env.GOOGLE_CALENDAR_ID!,
          eventId: dup.id,
        });
        console.log(`🗑️ Removed duplicate event ${dup.id} for booking ${booking.id}`);
      }
    }

    // Assign the kept event ID to booking
    booking.googleCalendarEventId = keep.id;
  } catch (err: any) {
    console.error(`❌ Failed to remove duplicates for booking ${booking.id}`, err);
  }
}

/**
 * Upsert booking into Google Calendar (all-day, check-in only)
 */
export async function upsertBookingToCalendar(booking: any, unit: any) {
  if (!booking.checkinDate) {
    console.error(`❌ Booking ${booking.id} missing checkinDate`, booking);
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
    // Remove duplicates before insert/update
    await removeDuplicateBookings(booking, unit);

    const googleEventId = booking.googleCalendarEventId;

    if (googleEventId) {
      // Update existing event
      await calendar.events.update({
        calendarId: process.env.GOOGLE_CALENDAR_ID!,
        eventId: googleEventId,
        requestBody: eventBody,
      });
      console.log(`✅ Updated booking ${booking.id}`);
    } else {
      // Insert new event
      const inserted = await calendar.events.insert({
        calendarId: process.env.GOOGLE_CALENDAR_ID!,
        requestBody: eventBody,
      });
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
    await calendar.events.delete({
      calendarId: process.env.GOOGLE_CALENDAR_ID!,
      eventId: googleEventId,
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
