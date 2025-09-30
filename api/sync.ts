import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../lib/firebase';
import { getCalendarClient } from '../lib/google-calendar';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const calendar = await getCalendarClient();

    // Fetch all units
    const unitsSnap = await db.collection('units').get();
    const units = unitsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    for (const unit of units) {
      if (!unit.calendarId) continue;

      // Fetch bookings for this unit
      const bookingsSnap = await db
        .collection('bookings')
        .where('unitId', '==', unit.id)
        .get();

      for (const bookingDoc of bookingsSnap.docs) {
        const booking = bookingDoc.data();

        // Create or update event
        await calendar.events.insert({
          calendarId: unit.calendarId,
          requestBody: {
            id: bookingDoc.id, // use booking ID as Google event ID
            summary: `${booking.guestFirstName || 'Guest'} - ${unit.name}`,
            start: { dateTime: booking.checkinDate },
            end: { dateTime: booking.checkoutDate },
          },
        });
      }
    }

    res.status(200).json({ message: 'Bookings synced to Google Calendar' });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

