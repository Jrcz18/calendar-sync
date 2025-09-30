import { db } from '../lib/firebase';
import { calendar } from '../lib/google-calendar';

export default async function handler(req: any, res: any) {
  try {
    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    if (!calendarId) {
      return res.status(500).json({ error: 'GOOGLE_CALENDAR_ID is not set' });
    }

    // Fetch all units
    const unitsSnapshot = await db.collection('units').get();
    const units = unitsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as any[];

    for (const unit of units) {
      const colorId = unit.colorId || '9'; // fallback Blueberry if missing

      // Fetch all bookings for this unit
      const bookingsSnapshot = await db
        .collection('bookings')
        .where('unitId', '==', unit.id)
        .get();

      for (const bookingDoc of bookingsSnapshot.docs) {
        const booking = { id: bookingDoc.id, ...bookingDoc.data() } as any;

        const event = {
          id: booking.id,
          summary: `Booking: ${unit.name}`,
          description: `Booked by ${booking.customerName || 'Unknown'}`,
          start: { dateTime: booking.startDate },
          end: { dateTime: booking.endDate },
          colorId,
        };

        try {
          // Try updating existing event
          await calendar.events.update({
            calendarId,
            eventId: booking.id,
            requestBody: event,
          });
        } catch (err: any) {
          if (err.code === 404) {
            // If event not found, insert new one
            await calendar.events.insert({
              calendarId,
              requestBody: event,
            });
          } else {
            console.error(`Failed to sync booking ${booking.id}:`, err);
          }
        }
      }
    }

    return res
      .status(200)
      .json({ message: 'Bookings synced to Google Calendar (single calendar, color-coded)' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Sync failed' });
  }
}
