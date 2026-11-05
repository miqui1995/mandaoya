// ===== CONFIGURACIÓN DE MANDAOYA =====
// Mientras firebase sea null, la app funciona en MODO DEMO (datos solo en el teléfono).
// Para el modo real, pega aquí la configuración de tu app web de Firebase
// (Consola de Firebase › Configuración del proyecto › Tus apps › SDK setup and configuration › Config).
window.MANDAOYA_CONFIG = {
  firebase: null,
  /* Ejemplo:
  firebase: {
    apiKey: "AIza...",
    authDomain: "mandaoya-xxxx.firebaseapp.com",
    projectId: "mandaoya-xxxx",
    storageBucket: "mandaoya-xxxx.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef"
  },
  */
  center: [1.69684, -78.24514], // San José, Roberto Payán
};
