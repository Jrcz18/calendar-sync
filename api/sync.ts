import { db } from '../lib/firebase';
import calendar, { upsertBookingToCalendar, deleteBookingFromCalendar } from '../lib/google-calendar';

/**
 * Fetch all units from Firestore
 */
async function fetchUnits() {
  const snapshot = await db.collection('units').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Fetch bookings for a given unit
 */
async function fetchBookingsForUnit(unitId: string) {
  const snapshot = await db
    .collection('bookings')
    .where('unitId', '==', unitId)
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Sync all bookings to Google Calendar
 * - Creates/updates events
 * - Skips identical ones
 * - Deletes duplicates automatically (via upsertBookingToCalendar)
 * - Removes events if booking is missing from Firestore
 */
export default async function syncBookings() {
  console.log('📦 Starting booking sync...');

  const units = await fetchUnits();
  console.log(`🔹 Found ${units.length} units`);

  for (const unit of units) {
    console.log(`➡️ Processing unit: ${unit.name} (${unit.id}) with colorId=${unit.colorId || 1}`);

    // Firestore bookings
    const bookings = await fetchBookingsForUnit(unit.id);
    const bookingIds = bookings.map(b => b.id);
    console.log(`📅 Found ${bookings.length} bookings for unit ${unit.name}`);

    // ✅ Upsert all Firestore bookings into Calendar
    for (const booking of bookings) {
      try {
        await upsertBookingToCalendar(booking, unit);
      } catch (err: any) {
        console.error(`❌ Error syncing booking ${booking.id}`, err.message || err);
      }
    }

    // 🗑️ Cleanup: remove events in Calendar that no longer exist in Firestore
    try {
      const existingEvents = await calendar.events.list({
        calendarId: process.env.GOOGLE_CALENDAR_ID!,
      });

      const items = existingEvents.data.items || [];

      for (const ev of items) {
        const bookingId = ev.extendedProperties?.private?.bookingId;
        if (bookingId && !bookingIds.includes(bookingId)) {
          await deleteBookingFromCalendar(bookingId);
          console.log(`🗑️ Removed stale event for deleted booking ${bookingId}`);
        }
      }
    } catch (err: any) {
      console.error(`❌ Failed to clean up old events for unit ${unit.id}`, err);
    }
  }

  console.log('✅ Booking sync completed.');
}

/**
 * Optional: endpoint for Vercel serverless function
 */
export async function handler(req: any, res: any) {
  try {
    await syncBookings();
    res.status(200).json({ message: 'Booking sync completed' });
  } catch (err: any) {
    console.error('❌ Booking sync failed', err);
    res.status(500).json({ error: 'Booking sync failed', details: err.message || err });
  }
}
