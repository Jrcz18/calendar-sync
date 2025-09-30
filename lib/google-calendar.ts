export async function upsertBookingToCalendar(booking: any, unit: any) {
  if (!booking.checkinDate) {
    console.error(`❌ Booking ${booking.id} missing checkinDate`, booking);
    return;
  }

  const firstName = booking.guestFirstName?.trim() || '';
  const lastName = booking.guestLastName?.trim() || '';

  const startDate = new Date(booking.checkinDate);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);

  const eventBody = {
    summary: `Booking: ${unit.name}`,
    description: `Booked by ${firstName} ${lastName}`.trim(),
    start: { date: startDate.toISOString().split('T')[0] },
    end: { date: endDate.toISOString().split('T')[0] },
    colorId: unit.colorId || '1',
  };

  try {
    if (booking.googleCalendarEventId) {
      // Update existing event
      await calendar.events.update({
        calendarId: process.env.GOOGLE_CALENDAR_ID!,
        eventId: booking.googleCalendarEventId,
        requestBody: eventBody,
      });
      console.log(`✅ Updated booking ${booking.id}`);
    } else {
      // Check if an event already exists for this booking (avoid duplicates)
      const existingEvents = await calendar.events.list({
        calendarId: process.env.GOOGLE_CALENDAR_ID!,
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        q: `Booking: ${unit.name}`, // search by summary
      });

      if (existingEvents.data.items?.length) {
        // Attach the first matching event's ID to booking to prevent re-adding
        booking.googleCalendarEventId = existingEvents.data.items[0].id;
        console.log(`⚠️ Booking ${booking.id} already exists in calendar. Using existing event.`);
      } else {
        // Insert new event
        const inserted = await calendar.events.insert({
          calendarId: process.env.GOOGLE_CALENDAR_ID!,
          requestBody: eventBody,
        });
        booking.googleCalendarEventId = inserted.data.id;
        console.log(`➕ Inserted booking ${booking.id}`);
      }

      // Save the googleCalendarEventId to Firestore if applicable
      // await db.collection('bookings').doc(booking.id).update({ googleCalendarEventId: booking.googleCalendarEventId });
    }
  } catch (err: any) {
    console.error(`❌ Failed to sync booking ${booking.id}`, err);
  }
}
