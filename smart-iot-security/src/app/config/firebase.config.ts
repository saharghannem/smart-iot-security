// Configuration Firebase - DON'T INITIALIZE HERE!
// Initialization belongs ONLY in app.config.ts via AngularFire's dependency injection.
// Redundant exports like 'export const db = ...' cause 'Type Mismatch' crashes 
// by creating conflicting SDK instances.
export const firebaseConfig = {
  apiKey: "AIzaSyAT8Ev4lQGnLiVWxTVLApuvtnWpCeWbCrE",
  authDomain: "pfa-iot-d5516.firebaseapp.com",
  databaseURL: "https://pfa-iot-d5516-default-rtdb.firebaseio.com",
  projectId: "pfa-iot-d5516",
  storageBucket: "pfa-iot-d5516.firebasestorage.app",
  messagingSenderId: "594740434732",
  appId: "1:594740434732:web:5d25deab03ad68f1b5be89",
  measurementId: "G-N8S4PG2NZ3"
};
