// api/sync.ts
import { db } from '../lib/firebase';
import { upsertBookingToCalendar, deleteBookingFromCalendar } from '../lib/google-calendar';

export default async function handler(req: any, res: any) {
  try {
    const unitsSnapshot = await db.collection('units').get();
    const units = unitsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as { id: string; name: string; calendarId: string }[];

    for (const unit of units) {
      if (!unit.calendarId) continue;

      // Get bookings from Firestore
      const bookingsSnapshot = await db
        .collection('bookings')
        .where('unitId', '==', unit.id)
        .get();

      const firestoreBookings = bookingsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as any[];

      // 1. Upsert each Firestore booking into Calendar
      for (const booking of firestoreBookings) {
        await upsertBookingToCalendar(unit.calendarId, {
          id: booking.id,
          title: booking.guestName || `Booking ${booking.id}`,
          start: booking.startDate,
          end: booking.endDate,
        });
      }

      // 2. Delete calendar events that no longer exist in Firestore
      const events = await (await (await import('googleapis')).google.calendar({ version: 'v3', auth: undefined }))
        .events.list({ calendarId: unit.calendarId });
      
      const eventIds = events.data.items?.map((e) => e.id) || [];
      const bookingIds = firestoreBookings.map((b) => b.id);

      for (const eventId of eventIds) {
        if (eventId && !bookingIds.includes(eventId)) {
          await deleteBookingFromCalendar(unit.calendarId, eventId);
        }
      }
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
