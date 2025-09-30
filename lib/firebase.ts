import * as admin from 'firebase-admin';

// Only initialize the Firebase app once
if (!admin.apps.length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : null;

  if (!serviceAccount || Object.keys(serviceAccount).length === 0) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT env is missing or invalid');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log('✅ Firebase initialized');
}

// Export Firestore DB for use in other modules
export const db = admin.firestore();
