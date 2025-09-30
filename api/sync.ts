// api/sync.ts
import { db } from '../lib/firebase';
import calendar from '../lib/google-calendar';

export default async function handler(req: any, res: any) {
  try {
    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    if (!calendarId) {
      console.error('❌ GOOGLE_CALENDAR_ID is not set');
      return res.status(500).json({ error: 'GOOGLE_CALENDAR_ID is not set' });
    }

    console.log('⏱️ Starting booking sync...');

    // Fetch all units
    const unitsSnapshot = await db.collection('units').get();
    const units = unitsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as any[];

    for (const unit of units) {
      const colorId = unit.colorId || '9'; // default color if missing
      console.log(`📌 Syncing unit "${unit.name}" with colorId ${colorId}`);

      // Fetch bookings for this unit
      const bookingsSnapshot = await db
        .collection('bookings')
        .where('unitId', '==', unit.id)
        .get();

      for (const bookingDoc of bookingsSnapshot.docs) {
        const booking = { id: bookingDoc.id, ...bookingDoc.data() } as any;

        // All-day event using checkinDate
        const event = {
          id: booking.id,
          summary: `Booking: ${unit.name}`,
          description: `Booked by ${booking.guestFirstName || 'Unknown'} ${booking.guestLastName || ''}`,
          start: { date: booking.checkinDate },   // all-day event
          end: { date: booking.checkinDate },     // same day
          colorId,
        };

        try {
          // Try updating existing event
          await calendar.events.update({
            calendarId,
            eventId: booking.id,
            requestBody: event,
          });
          console.log(`✅ Updated booking ${booking.id}`);
        } catch (err: any) {
          if (err.code === 404) {
            // Insert new event if not found
            await calendar.events.insert({
              calendarId,
              requestBody: event,
            });
            console.log(`➕ Inserted booking ${booking.id}`);
          } else {
            console.error(`⚠️ Failed to sync booking ${booking.id}:`, err.message || err);
          }
        }
      }
    }

    console.log('✅ Booking sync completed');
    return res.status(200).json({ message: 'Bookings synced to Google Calendar (single calendar, color-coded)' });
  } catch (error: any) {
    console.error('❌ Sync failed:', error.message || error);
    return res.status(500).json({ error: 'Sync failed' });
  }
}
