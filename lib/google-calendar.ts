import { google } from 'googleapis';

export async function getCalendarClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!),
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  const client = await auth.getClient();
  return google.calendar({ version: 'v3', auth: client });
}

