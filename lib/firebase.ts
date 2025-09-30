import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT || '{}'
  );

  if (!serviceAccount || Object.keys(serviceAccount).length === 0) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT env is missing or invalid');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const db = admin.firestore();
