import express from 'express';
import logger from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Middlewares locales
import { authenticateToken } from './middleware/auth.js';

// Rutas
import { authRoutes } from './routes/authRoutes.js';

// Sockets
import { registerChatHandlers } from './sockets/chatHandler.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev-only';
const MONGO_URI = process.env.MONGO_URI;
const users = new Set();

// Definir __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware de la App
const app = express();
app.use(express.json());
app.use(logger('dev'));
app.use(express.static(path.join(__dirname, '../client')));

// Configuración del Servidor
const port = process.env.PORT ?? 3000;
const server = createServer(app);
const io = new Server(server, {
    connectionStateRecovery: {}
});

// Conexión a MongoDB Atlas
mongoose.connect(MONGO_URI)
    .then(() => console.log('Conectado a MongoDB Atlas'))
    .catch(err => console.error('Error al conectar a MongoDB:', err));

// Registro de Rutas
app.use('/', authRoutes(JWT_SECRET));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/Pages/login', 'login.html'));
});

app.get('/chat', authenticateToken(JWT_SECRET), (req, res) => {
    res.sendFile(path.join(__dirname, '../client/Pages/chat', 'chat.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/Pages/login', 'login.html'));
});

// Registro de Handlers de Socket.io
registerChatHandlers(io, JWT_SECRET, users);

// Iniciar el servidor
server.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
