import { db } from '../lib/firebase';
import calendar, { upsertBookingToCalendar, deleteBookingFromCalendar } from './google-calendar';

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
 */
export default async function syncBookings() {
  console.log('📦 Starting booking sync...');

  const units = await fetchUnits();
  console.log(`🔹 Found ${units.length} units`);

  for (const unit of units) {
    console.log(`➡️ Processing unit: ${unit.name} (${unit.id}) with colorId=${unit.colorId || 1}`);

    const bookings = await fetchBookingsForUnit(unit.id);
    console.log(`📅 Found ${bookings.length} bookings for unit ${unit.name}`);

    for (const booking of bookings) {
      try {
        // Let Google Calendar generate an ID instead of using Firestore ID
        await upsertBookingToCalendar({ ...booking, id: undefined }, unit);
      } catch (err: any) {
        console.error(`❌ Error syncing booking ${booking.id}`, err.message || err);
      }
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
  } catch (err) {
    console.error('❌ Booking sync failed', err);
    res.status(500).json({ error: 'Booking sync failed', details: err.message || err });
  }
}
