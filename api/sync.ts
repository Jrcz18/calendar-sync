import { db } from '../lib/firebase';
import { calendar } from '../lib/google-calendar';

export default async function handler(req: any, res: any) {
  try {
    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    if (!calendarId) {
      console.error('❌ Missing GOOGLE_CALENDAR_ID env variable');
      return res.status(500).json({ error: 'GOOGLE_CALENDAR_ID is not set' });
    }

    console.log('🚀 Sync job started');
    console.log(`Using calendarId: ${calendarId}`);

    // Fetch all units
    const unitsSnapshot = await db.collection('units').get();
    const units = unitsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as any[];

    console.log(`📦 Found ${units.length} units`);

    for (const unit of units) {
      console.log(`\n➡️ Processing unit: ${unit.id} (${unit.name})`);
      const colorId = unit.colorId || '9'; // fallback Blueberry if missing

      // Fetch all bookings for this unit
      const bookingsSnapshot = await db
        .collection('bookings')
        .where('unitId', '==', unit.id)
        .get();

      console.log(`   📑 Found ${bookingsSnapshot.docs.length} bookings for this unit`);

      for (const bookingDoc of bookingsSnapshot.docs) {
        const booking = { id: bookingDoc.id, ...bookingDoc.data() } as any;
        console.log(`   ⏳ Syncing booking ${booking.id}:`, booking);

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
          console.log(`   ✅ Updated booking ${booking.id} in calendar`);
        } catch (err: any) {
          if (err.code === 404) {
            console.log(`   ➕ Event not found, inserting booking ${booking.id}`);
            await calendar.events.insert({
              calendarId,
              requestBody: event,
            });
            console.log(`   ✅ Inserted booking ${booking.id}`);
          } else {
            console.error(`   ❌ Failed to sync booking ${booking.id}:`, err);
          }
        }
      }
    }

    console.log('🎉 Sync job finished successfully');
    return res
      .status(200)
      .json({ message: 'Bookings synced to Google Calendar (single calendar, color-coded)' });
  } catch (error) {
    console.error('🔥 Sync failed:', error);
    return res.status(500).json({ error: 'Sync failed' });
  }
}
