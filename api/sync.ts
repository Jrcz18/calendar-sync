import type { NextApiRequest, NextApiResponse } from 'next';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { calendar } from '../lib/google-calendar';

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

        const startDate = booking.checkinDate;

        if (!startDate) {
          console.error(`❌ Booking ${booking.id} missing checkinDate`, booking);
          continue;
        }

        // End date = next day (exclusive) so event only shows on the check-in date
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);

        const event = {
          id: booking.id,
          summary: `Booking: ${unit.name}`,
          description: `Booked by ${booking.guestFirstName || ''} ${booking.guestLastName || ''}`,
          start: { date: startDate },
          end: { date: endDate.toISOString().split('T')[0] },
          colorId: unit.colorId || '1',
        };

        try {
          await calendar.events.update({
            calendarId: process.env.GOOGLE_CALENDAR_ID!,
            eventId: booking.id,
            requestBody: event,
          });
          console.log(`✅ Updated booking ${booking.id}`);
        } catch (err: any) {
          if (err.code === 404) {
            await calendar.events.insert({
              calendarId: process.env.GOOGLE_CALENDAR_ID!,
              requestBody: event,
            });
            console.log(`➕ Inserted booking ${booking.id}`);
          } else {
            console.error(`❌ Failed to sync booking ${booking.id}`, err);
          }
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
