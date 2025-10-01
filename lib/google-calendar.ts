import { google } from 'googleapis';

// Initialize Google Calendar client
const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || '{}');

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

export async function upsertBookingToCalendar(booking: any, unit: any) {
  if (!booking.checkinDate || !booking.checkoutDate) {
    console.error(`❌ Booking ${booking.id} missing checkinDate or checkoutDate`, booking);
    return;
  }

  const firstName = booking.guestFirstName?.trim() || '';
  const lastName = booking.guestLastName?.trim() || '';

  const startDate = new Date(booking.checkinDate);
  const endDate = new Date(booking.checkoutDate);
  endDate.setDate(endDate.getDate() - 1); // blocking ends on checkoutDate - 1

  const eventBody = {
    summary: `Booking: ${unit.name}`,
    description: `Booked by ${firstName} ${lastName}`.trim(),
    start: { date: startDate.toISOString().split('T')[0] },
    end: { date: endDate.toISOString().split('T')[0] },
    colorId: unit.colorId || '1',
  };

  try {
    if (booking.googleCalendarEventId) {
      // Update existing event
      await calendar.events.update({
        calendarId: process.env.GOOGLE_CALENDAR_ID!,
        eventId: booking.googleCalendarEventId,
        requestBody: eventBody,
      });
      console.log(`✅ Updated booking ${booking.id}`);
    } else {
      // List events for the full booking range
      const existingEvents = await calendar.events.list({
        calendarId: process.env.GOOGLE_CALENDAR_ID!,
        timeMin: startDate.toISOString(),
        timeMax: new Date(booking.checkoutDate).toISOString(),
      });

      // Match on summary, description, and exact dates
      const match = existingEvents.data.items?.find(ev =>
        ev.summary === `Booking: ${unit.name}` &&
        ev.description === `Booked by ${firstName} ${lastName}`.trim() &&
        ev.start?.date === startDate.toISOString().split('T')[0] &&
        ev.end?.date === endDate.toISOString().split('T')[0]
      );

      if (match) {
        booking.googleCalendarEventId = match.id;
        console.log(`⚠️ Booking ${booking.id} already exists in calendar. Using existing event.`);
      } else {
        const inserted = await calendar.events.insert({
          calendarId: process.env.GOOGLE_CALENDAR_ID!,
          requestBody: eventBody,
        });
        booking.googleCalendarEventId = inserted.data.id;
        console.log(`➕ Inserted booking ${booking.id}`);
      }

      // Optionally, save the googleCalendarEventId to Firestore:
      // await db.collection('bookings').doc(booking.id).update({ googleCalendarEventId: booking.googleCalendarEventId });
    }
  } catch (err: any) {
    console.error(`❌ Failed to sync booking ${booking.id}`, err);
  }
}
