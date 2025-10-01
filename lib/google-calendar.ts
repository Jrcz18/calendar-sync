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
  const bookingId = booking.id || '(no-id)';

  if (!booking.checkinDate || !booking.checkoutDate) {
    console.error(`❌ Booking ${bookingId} missing checkinDate or checkoutDate`, booking);
    return;
  }

  const firstName = booking.guestFirstName?.trim() || '';
  const lastName = booking.guestLastName?.trim() || '';

  const checkin = new Date(booking.checkinDate);
  const checkout = new Date(booking.checkoutDate);

  try {
    let current = new Date(checkin);

    while (current < checkout) {
      const day = current.toISOString().split('T')[0];

      const eventBody = {
        summary: `Booking: ${unit.name}`,
        description: `Booked by ${firstName} ${lastName}`.trim(),
        start: { date: day },
        end: { date: day }, // same-day all-day block
        colorId: unit.colorId || '1',
      };

      // Check if event already exists for this exact day
      const existingEvents = await calendar.events.list({
        calendarId: process.env.GOOGLE_CALENDAR_ID!,
        timeMin: new Date(current).toISOString(),
        timeMax: new Date(new Date(current).setDate(current.getDate() + 1)).toISOString(),
      });

      const match = existingEvents.data.items?.find(ev =>
        ev.summary === `Booking: ${unit.name}` &&
        ev.start?.date === day &&
        ev.end?.date === day
      );

      if (match) {
        console.log(`⚠️ Booking ${bookingId} already exists in calendar for ${day}`);
      } else {
        await calendar.events.insert({
          calendarId: process.env.GOOGLE_CALENDAR_ID!,
          requestBody: eventBody,
        });
        console.log(`➕ Inserted booking ${bookingId} for ${day}`);
      }

      current.setDate(current.getDate() + 1); // move to next night
    }

  } catch (err: any) {
    console.error(`❌ Failed to sync booking ${bookingId}`, err);
  }
}
