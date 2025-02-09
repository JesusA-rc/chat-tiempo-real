import express from 'express';
import logger from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';



dotenv.config();

const JWT_SECRET = crypto.randomBytes(32).toString('hex');
const MONGO_URI = process.env.MONGO_URI;
const users = new Set();

// Definir __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Middleware
const app = express();
app.use(express.json());
app.use(logger('dev'));
app.use(express.static(path.join(__dirname, '../client')));


//Funciones --------------------------------------------------------------------------------------------------------------------
function authenticateToken(req, res, next) {
    const token = req.query.token || req.headers['authorization'];

    if (!token) {
        console.error('Error de autenticación: Token no proporcionado');
        return res.redirect('/login'); 
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next(); 
    } catch (error) {
        console.error('Error de autenticación:', error.message);
        return res.redirect('/login');
    }
}

function formatDateTime(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); 
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}


// Puerto del servidor
const port = process.env.PORT ?? 3000;

const server = createServer(app);
const io = new Server(server, {
    connectionStateRecovery: {}
});

// Conexión a MongoDB Atlas------------------------------------------------------------------------------------------------------------------
mongoose.connect(MONGO_URI)
    .then(() => console.log('Conectado a MongoDB Atlas'))
    .catch(err => console.error('Error al conectar a MongoDB:', err));


//Esquemas -------------------------------------------------------------------------------------------------------------------
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
    user: { type: String, required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);


const blockSchema = new mongoose.Schema({
    blocker: String, // Usuario que bloquea
    blocked: String, // Usuario bloqueado
});
const Block = mongoose.model('Block', blockSchema);



// Ruta principal (chat)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/Pages/login', 'login.html'));
});

//ruta chat
app.get('/chat', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, '../client/Pages/chat', 'chat.html'));
});

app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'El usuario ya existe' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();

        res.status(201).json({ message: 'Usuario registrado exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al registrar el usuario' });
    }
});

// Ruta para mostrar el formulario de inicio de sesión
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/Pages/login', 'login.html'));
});


app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Usuario no encontrado' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ message: 'Contraseña incorrecta' });
        }

        const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '1h' });

        res.json({ message: 'Inicio de sesión exitoso', token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al iniciar sesión' });
    }
});

// Eventos de Socket.IO
io.on('connection', async (socket) => {
    const token = socket.handshake.auth.token;

    if (!token) {
        console.error('Error de autenticación: Token no proporcionado');
        socket.emit('redirect', '/login');
        return socket.disconnect(true);
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findOne({ username: decoded.username });
        if (!user) {
            throw new Error('Usuario no autenticado');
        }

        console.log(`${user.username} se ha conectado`);
        socket.user = user.username;
        users.add(user.username);

        const blockedByCurrentUser = await Block.find({ blocker: user.username }).distinct('blocked');
        const currentUserBlockedBy = await Block.find({ blocked: user.username }).distinct('blocker');

        let connectedUsers;
        if (blockedByCurrentUser.length > 0 || currentUserBlockedBy.length > 0) {
            connectedUsers = Array.from(users).filter(
                u => u !== user.username && !blockedByCurrentUser.includes(u) && !currentUserBlockedBy.includes(u)
            );
        } else {
            connectedUsers = Array.from(users).filter(u => u !== user.username);
        }
        socket.emit('users connected', connectedUsers);

        const messages = await Message.find().sort({ createdAt: 1 }); //Mensajes anteriores
        const filteredMessages = await Promise.all(
            messages.map(async (msg) => {
                const isBlockedByRecipient = await Block.exists({
                    blocker: msg.user, // Remitente del mensaje
                    blocked: user.username, // Usuario actual
                });
        
                const hasBlockedRecipient = await Block.exists({
                    blocker: user.username, // Usuario actual
                    blocked: msg.user, // Remitente del mensaje
                });
        
                return !(isBlockedByRecipient || hasBlockedRecipient) ? msg : null;
            })
        );
        
        const validMessages = filteredMessages.filter(msg => msg !== null);

        validMessages.forEach((msg) => {
            const formattedDate = formatDateTime(msg.createdAt);
            socket.emit('chat message', { user: msg.user, text: msg.text, time: formattedDate });
        });

        // Lista de usuarios conectados
        io.sockets.sockets.forEach(async (client) => {
            try {
                const recipient = client.user;


                if (recipient === user.username) {              
                    return; 
                }

                const blockedByRecipient = await Block.find({ blocker: recipient }).distinct('blocked');
                const recipientBlockedBy = await Block.find({ blocked: recipient }).distinct('blocker');

                if (blockedByRecipient.length > 0 || recipientBlockedBy.length > 0) { //Bloqueos activos
                    const hasBlockedUser = blockedByRecipient.includes(user.username);
                    const isBlockedByUser = recipientBlockedBy.includes(user.username);

                    if (!(hasBlockedUser || isBlockedByUser)) {
                        client.emit('user connected', user.username);
                    }
                } else {
                    client.emit('user connected', user.username);
                }
            } catch (error) {
                console.error('Error al filtrar usuario conectado:', error.message);
            }
        });

        socket.on('chat message', async (msg) => {
            const formattedDate = formatDateTime(new Date());
        
            const newMessage = new Message({
                user: socket.user,
                text: msg,
                createdAt: formattedDate,
            });
        
            await newMessage.save();
        
            io.sockets.sockets.forEach(async (client) => { //Envio de mensajes
                try {
                    const recipient = client.user;
        
                    const hasBlockedRecipient = await Block.exists({
                        blocker: socket.user,
                        blocked: recipient,
                    });

                    const isBlockedByRecipient = await Block.exists({
                        blocker: recipient,
                        blocked: socket.user,
                    });
        
                    if (hasBlockedRecipient || isBlockedByRecipient) {
                        return; 
                    }
        
                    client.emit('chat message', { user: socket.user, text: msg, time: formattedDate });
                } catch (error) {
                    console.error('Error al filtrar mensaje:', error.message);
                }
            });
        });

        socket.on('logout', async () => {
            console.log(`${socket.user} ha cerrado sesión`);
            users.delete(socket.user);
        
            io.sockets.sockets.forEach(async (client) => {
                try {
                    const recipient = client.user;
        
                    const blockedByRecipient = await Block.find({ blocker: recipient }).distinct('blocked');
                    const recipientBlockedBy = await Block.find({ blocked: recipient }).distinct('blocker');
        
                    const hasBlockedRecipient = blockedByRecipient.includes(socket.user);
                    const isBlockedByRecipient = recipientBlockedBy.includes(socket.user);
        
                    if (!(hasBlockedRecipient || isBlockedByRecipient)) {
                        client.emit('chat message', { user: socket.user, text: msg, time: formattedDate });
                    }
                } catch (error) {
                    console.error('Error al filtrar mensaje:', error.message);
                }
            });
        
            socket.disconnect();
        });

        socket.on('block user', async (blockedUser) => {
            try {
                const block = new Block({ blocker: socket.user, blocked: blockedUser });
                await block.save();
                io.to(socket.id).emit('user blocked', blockedUser); 

                const allMessages = await Message.find().sort({ createdAt: 1 });

                const filteredMessages = allMessages.filter((msg) => msg.user !== blockedUser);

                filteredMessages.forEach((msg) => {
                    const formattedDate = formatDateTime(msg.createdAt);
                    io.to(socket.id).emit('chat message', { user: msg.user, text: msg.text, time: formattedDate });
                });
            } catch (error) {
                console.error('Error al bloquear el usuario:', error.message);
            }
        });

        socket.on('unblock user', async (blockedUser) => {
            try {
                await Block.deleteOne({ blocker: socket.user, blocked: blockedUser });
                socket.emit('user unblocked', blockedUser);

                const isBlockedUserConnected = users.has(blockedUser);
                if (isBlockedUserConnected) {
                    socket.emit('user connected', blockedUser);
                }

                const previousMessages = await Message.find({ user: blockedUser }).sort({ createdAt: 1 });
                previousMessages.forEach((msg) => {
                    const formattedDate = formatDateTime(msg.createdAt);
                    socket.emit('chat message', { user: msg.user, text: msg.text, time: formattedDate });
                });
            } catch (error) {
                console.error('Error al desbloquear usuario:', error.message);
            }
        });

        socket.on('get blocked users', async () => {
            const blockedUsers = await Block.find({ blocker: socket.user }).distinct('blocked'); //lista de bloqueados
            socket.emit('blocked users list', blockedUsers);
        });

        socket.on('disconnect', () => {
            console.log(`${socket.user} se ha desconectado`);
            users.delete(socket.user);
        
            io.sockets.sockets.forEach(async (client) => {
                try {
                    const recipient = client.user;
            
                    const blockedByRecipient = await Block.find({ blocker: recipient }).distinct('blocked');
                    const recipientBlockedBy = await Block.find({ blocked: recipient }).distinct('blocker');
            
                    if (blockedByRecipient.length > 0 || recipientBlockedBy.length > 0) {
                        const hasBlockedUser = blockedByRecipient.includes(socket.user);
                        const isBlockedByUser = recipientBlockedBy.includes(socket.user);
            
                        if (!(hasBlockedUser || isBlockedByUser)) {
                            client.emit('user disconnected', socket.user);
                        }
                    } else {
                        client.emit('user disconnected', socket.user);
                    }
                } catch (error) {
                    console.error('Error al filtrar usuario desconectado:', error.message);
                }
            });
        });

    } catch (error) {
        console.error('Error de autenticación:', error.message);
        socket.disconnect(true);
    }
});






// Iniciar el servidor
server.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});