// lib/google-calendar.ts
import { google } from 'googleapis';

const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!);

const jwtClient = new google.auth.JWT(
  serviceAccount.client_email,
  undefined,
  serviceAccount.private_key,
  ['https://www.googleapis.com/auth/calendar']
);

const calendar = google.calendar({ version: 'v3', auth: jwtClient });

interface BookingEvent {
  id: string;
  title: string;
  start: string;
  end: string;
}

// Insert or Update
export async function upsertBookingToCalendar(calendarId: string, booking: BookingEvent) {
  try {
    await calendar.events.update({
      calendarId,
      eventId: booking.id,
      requestBody: {
        summary: booking.title,
        start: { dateTime: booking.start },
        end: { dateTime: booking.end },
      },
    });
    console.log(`✅ Updated booking ${booking.id} in calendar ${calendarId}`);
  } catch (err: any) {
    if (err.code === 404) {
      await calendar.events.insert({
        calendarId,
        requestBody: {
          id: booking.id,
          summary: booking.title,
          start: { dateTime: booking.start },
          end: { dateTime: booking.end },
        },
      });
      console.log(`➕ Inserted booking ${booking.id} into calendar ${calendarId}`);
    } else {
      throw err;
    }
  }
}

// Delete if booking removed
export async function deleteBookingFromCalendar(calendarId: string, bookingId: string) {
  try {
    await calendar.events.delete({
      calendarId,
      eventId: bookingId,
    });
    console.log(`🗑️ Deleted booking ${bookingId} from calendar ${calendarId}`);
  } catch (err: any) {
    if (err.code === 404) {
      console.log(`⚠️ Event ${bookingId} not found in calendar ${calendarId}`);
    } else {
      throw err;
    }
  }
}
