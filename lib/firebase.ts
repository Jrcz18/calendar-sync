// lib/firebase.ts
import admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // Optional: databaseURL if needed
    // databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
  });
}

export const db = admin.firestore();
