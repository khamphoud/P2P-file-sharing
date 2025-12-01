// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDAUuOY_u2by0XLjPXRrARCbGCotmucab0",
  authDomain: "p2p-file-sharing-3a6ed.firebaseapp.com",
  databaseURL: "https://p2p-file-sharing-3a6ed-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "p2p-file-sharing-3a6ed",
  storageBucket: "p2p-file-sharing-3a6ed.firebasestorage.app",
  messagingSenderId: "535161195186",
  appId: "1:535161195186:web:8994e5b80f112ec957d7ab",
  measurementId: "G-EEWN2H0M31"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Get a reference to the database service
const database = firebase.database();

// Helper function to clear old connections
function cleanupOldConnections() {
    const cutoff = Date.now() - 3600000; // 1 hour ago
    database.ref('connections').once('value').then((snapshot) => {
        snapshot.forEach((childSnapshot) => {
            const data = childSnapshot.val();
            if (data.timestamp && data.timestamp < cutoff) {
                childSnapshot.ref.remove();
            }
        });
    });
}

// Cleanup old connections on page load
window.addEventListener('load', cleanupOldConnections);
