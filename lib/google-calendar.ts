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

export async function insertBookingToCalendar(calendarId: string, booking: BookingEvent) {
  await calendar.events.insert({
    calendarId,
    requestBody: {
      id: booking.id, // Google Calendar deduplication
      summary: booking.title,
      start: { dateTime: booking.start },
      end: { dateTime: booking.end },
    },
  });
}
