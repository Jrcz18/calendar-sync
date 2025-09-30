import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { upsertBookingToCalendar, deleteBookingFromCalendar } from '../lib/google-calendar';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      privateKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

export default async function handler(req: any, res: any) {
  console.log('🚀 Sync job started');

  try {
    const unitsSnapshot = await db.collection('units').get();
    console.log(`📦 Found ${unitsSnapshot.size} units`);

    for (const unitDoc of unitsSnapshot.docs) {
      const unit = { id: unitDoc.id, ...unitDoc.data() } as any;

      // Fetch bookings for this unit
      const bookingsSnapshot = await db
        .collection('bookings')
        .where('unitId', '==', unit.id)
        .get();

      console.log(`📅 Found ${bookingsSnapshot.size} bookings for unit ${unit.id}`);

      for (const bookingDoc of bookingsSnapshot.docs) {
        const booking = { id: bookingDoc.id, ...bookingDoc.data() } as any;

        if (booking.status === 'cancelled') {
          console.log(`🗑️ Booking ${booking.id} is cancelled, removing from calendar...`);
          await deleteBookingFromCalendar(booking.id);
        } else {
          console.log(`🔄 Syncing booking ${booking.id} to calendar...`);
          await upsertBookingToCalendar(booking, unit);
        }
      }
    }

    console.log('🎉 Sync completed successfully');
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Sync job failed', err);
    return res.status(500).json({ error: 'Sync job failed', details: err });
  }
}
