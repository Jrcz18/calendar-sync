import { google } from 'googleapis';

// Initialize Google Calendar client
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

const calendar = google.calendar({ version: 'v3', auth: jwtClient });

/**
 * Upsert booking → creates new, updates changed, skips identical, deletes duplicates
 */
export async function upsertBookingToCalendar(booking: any, unit: any) {
  const bookingId = booking.id; // 🔑 Firestore doc.id only
  if (!bookingId) {
    console.error("❌ Skipping booking with no ID:", booking);
    return;
  }

  if (!booking.checkinDate || !booking.checkoutDate) {
    console.error(`❌ Booking ${bookingId} missing checkinDate or checkoutDate`, booking);
    return;
  }

  const firstName = booking.guestFirstName?.trim() || '';
  const lastName = booking.guestLastName?.trim() || '';

  const checkin = new Date(booking.checkinDate);
  const checkout = new Date(booking.checkoutDate);

  // ✅ Only block until checkout - 1 day
  const lastNight = new Date(checkout);
  lastNight.setDate(lastNight.getDate() - 1);

  try {
    let current = new Date(checkin);

    while (current <= lastNight) {
      const day = current.toISOString().split('T')[0];

      const eventBody = {
        summary: `Booking: ${unit.name}`,
        description: `Booking ID: ${bookingId}\nBooked by ${firstName} ${lastName}`.trim(),
        start: { date: day },
        end: { date: day }, // all-day block
        colorId: unit.colorId || '1',
        extendedProperties: {
          private: { bookingId }, // 🔑 store Firestore ID in event
        },
      };

      // 🔎 Look for ALL events with this bookingId
      const existingEvents = await calendar.events.list({
        calendarId: process.env.GOOGLE_CALENDAR_ID!,
        privateExtendedProperty: `bookingId=${bookingId}`,
      });

      // ✅ Filter to this exact day
      const matches = existingEvents.data.items?.filter(
        ev => ev.start?.date === day && ev.end?.date === day
      ) || [];

      if (matches.length > 0) {
        const event = matches[0];

        // ✅ Update if details changed
        const needsUpdate =
          event.summary !== eventBody.summary ||
          event.description !== eventBody.description ||
          event.start?.date !== eventBody.start.date ||
          event.end?.date !== eventBody.end.date;

        if (needsUpdate && event.id) {
          await calendar.events.update({
            calendarId: process.env.GOOGLE_CALENDAR_ID!,
            eventId: event.id,
            requestBody: eventBody,
          });
          console.log(`🔄 Updated booking ${bookingId} for ${day}`);
        } else {
          console.log(`⏭️ Skipped booking ${bookingId} (no changes)`);
        }

        // 🗑️ Delete duplicates beyond the first
        if (matches.length > 1) {
          for (let i = 1; i < matches.length; i++) {
            const duplicate = matches[i];
            if (duplicate.id) {
              await calendar.events.delete({
                calendarId: process.env.GOOGLE_CALENDAR_ID!,
                eventId: duplicate.id,
              });
              console.log(`🗑️ Deleted duplicate event for ${bookingId} on ${day}`);
            }
          }
        }
      } else {
        // ➕ Insert new
        await calendar.events.insert({
          calendarId: process.env.GOOGLE_CALENDAR_ID!,
          requestBody: eventBody,
        });
        console.log(`➕ Inserted booking ${bookingId} for ${day}`);
      }

      current.setDate(current.getDate() + 1); // next night
    }
  } catch (err: any) {
    console.error(`❌ Failed to sync booking ${bookingId}`, err);
  }
}

/**
 * Delete all calendar events for a booking
 */
export async function deleteBookingFromCalendar(bookingId: string) {
  if (!bookingId) return;

  try {
    const existingEvents = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID!,
      privateExtendedProperty: `bookingId=${bookingId}`,
    });

    const matches = existingEvents.data.items || [];

    for (const ev of matches) {
      if (ev.id) {
        await calendar.events.delete({
          calendarId: process.env.GOOGLE_CALENDAR_ID!,
          eventId: ev.id,
        });
        console.log(`🗑️ Deleted event ${ev.id} for booking ${bookingId}`);
      }
    }

    if (matches.length === 0) {
      console.log(`⚠️ No events found for booking ${bookingId}`);
    }
  } catch (err: any) {
    console.error(`❌ Failed to delete events for booking ${bookingId}`, err);
  }
}

export default calendar;
