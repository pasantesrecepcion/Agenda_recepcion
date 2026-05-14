const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Configuración de rutas estáticas para servir el Frontend
app.use(express.static(path.join(__dirname, 'public')));

// Ruta del archivo credenciales
const serviceAccountPath = path.join(__dirname, 'credentials.json');

// Inicializar Firebase Admin
try {
    if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://agenda-b100-nexcorp-default-rtdb.firebaseio.com"
        });
        console.log("🔥 Firebase Admin inicializado correctamente.");
    } else {
        console.warn("⚠️ ADVERTENCIA: El archivo credentials.json no se encontró en la raíz del proyecto. Firebase no se ha inicializado.");
    }
} catch (error) {
    console.error("❌ Error al inicializar Firebase Admin:", error);
}

// Configurar conexión con el cliente (Socket.io)
io.on('connection', (socket) => {
    console.log(`🔌 Cliente conectado: ${socket.id}`);

    if (admin.apps.length > 0) {
        const db = admin.database();
        const agendaRef = db.ref('/agenda');

        // Escuchar cambios en la base de datos (Realtime Streaming)
        agendaRef.on('value', (snapshot) => {
            const data = snapshot.val();
            // Emitir los datos actualizados a todos los clientes conectados
            socket.emit('data-update', data || {});
        }, (error) => {
            console.error("❌ Error leyendo Firebase:", error);
            socket.emit('firebaseError', { message: error.message });
        });
    }

    socket.on('disconnect', () => {
        console.log(`🔴 Cliente desconectado: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
});
