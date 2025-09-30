import { db } from '../lib/firebase';
import { upsertBookingToCalendar, deleteBookingFromCalendar } from '../lib/google-calendar';

export default async function handler(req: any, res: any) {
  try {
    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    if (!calendarId) {
      console.error('❌ GOOGLE_CALENDAR_ID is not set');
      return res.status(500).json({ error: 'GOOGLE_CALENDAR_ID is not set' });
    }

    // Fetch all units
    const unitsSnapshot = await db.collection('units').get();
    const units = unitsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as any[];

    console.log(`📦 Found ${units.length} units`);

    for (const unit of units) {
      console.log(`\n🔹 Processing unit: ${unit.name} (${unit.id}) with colorId=${unit.colorId || '1'}`);

      // Fetch all bookings for this unit
      const bookingsSnapshot = await db
        .collection('bookings')
        .where('unitId', '==', unit.id)
        .get();

      const bookings = bookingsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      console.log(`📅 Found ${bookings.length} bookings for unit ${unit.name}`);

      for (const booking of bookings) {
        console.log(`➡️ Syncing booking ${booking.id} (${booking.guestFirstName || 'Unknown'})`);
        try {
          await upsertBookingToCalendar(booking, unit);
        } catch (err) {
          console.error(`❌ Error syncing booking ${booking.id}`, err);
        }
      }
    }

    return res
      .status(200)
      .json({ message: 'Bookings synced to Google Calendar (single calendar, color-coded)' });
  } catch (error) {
    console.error('❌ Sync failed', error);
    return res.status(500).json({ error: 'Sync failed' });
  }
}
