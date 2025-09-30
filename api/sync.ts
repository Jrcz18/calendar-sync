// api/sync.ts
import { db } from '../lib/firebase';
import { insertBookingToCalendar } from '../lib/google-calendar';

// Vercel handler – no @vercel/node needed
export default async function handler(req: any, res: any) {
  try {
    // Get units with calendarId
    const unitsSnapshot = await db.collection('units').get();
    const units = unitsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as { id: string; name: string; calendarId: string }[];

    for (const unit of units) {
      if (!unit.calendarId) continue;

      // Get bookings for this unit
      const bookingsSnapshot = await db
        .collection('bookings')
        .where('unitId', '==', unit.id)
        .get();

      const bookings = bookingsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as any[];

      // Insert each booking to Google Calendar
      for (const booking of bookings) {
        await insertBookingToCalendar(unit.calendarId, {
          id: booking.id,
          title: booking.guestName || `Booking ${booking.id}`,
          start: booking.startDate,
          end: booking.endDate,
        });
      }
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
