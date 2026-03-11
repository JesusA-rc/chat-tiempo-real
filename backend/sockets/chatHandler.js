import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Message from '../models/Message.js';
import Block from '../models/Block.js';
import { formatDateTime } from '../utils/dateFormatter.js';

export const registerChatHandlers = (io, JWT_SECRET, users) => {

    const getSocketByUsername = (username) => {
        return Array.from(io.sockets.sockets.values()).find(s => s.user === username);
    };

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

            const updateBlockCache = async (targetSocket = socket) => {
                const blockedByMe = await Block.find({ blocker: targetSocket.user }).distinct('blocked');
                const whoBlockedMe = await Block.find({ blocked: targetSocket.user }).distinct('blocker');
                targetSocket.blockedByMe = new Set(blockedByMe);
                targetSocket.whoBlockedMe = new Set(whoBlockedMe);
            };
            
            await updateBlockCache();

            const connectedUsers = Array.from(users).filter(u => 
                u !== user.username && !socket.blockedByMe.has(u) && !socket.whoBlockedMe.has(u)
            );
            socket.emit('users connected', connectedUsers);

            const messages = await Message.find().sort({ createdAt: 1 }).lean();
            messages.filter(msg => !socket.blockedByMe.has(msg.user) && !socket.whoBlockedMe.has(msg.user))
                    .forEach(msg => {
                        socket.emit('chat message', { 
                            user: msg.user, 
                            text: msg.text, 
                            time: formatDateTime(msg.createdAt) 
                        });
                    });

            io.sockets.sockets.forEach((client) => {
                if (client.id === socket.id) return;
                const isBlocked = client.blockedByMe?.has(socket.user) || client.whoBlockedMe?.has(socket.user);
                if (!isBlocked) {
                    client.emit('user connected', socket.user);
                }
            });

            socket.on('chat message', async (msg) => {
                const formattedDate = formatDateTime(new Date());
                const newMessage = new Message({
                    user: socket.user,
                    text: msg,
                    createdAt: new Date(), 
                });
                await newMessage.save();

                io.sockets.sockets.forEach((client) => {
                    const isBlocked = client.blockedByMe?.has(socket.user) || client.whoBlockedMe?.has(socket.user);
                    if (!isBlocked) {
                        client.emit('chat message', { 
                            user: socket.user, 
                            text: msg, 
                            time: formattedDate 
                        });
                    }
                });
            });

            socket.on('block user', async (blockedUser) => {
                try {
                    const exists = await Block.exists({ blocker: socket.user, blocked: blockedUser });
                    if (!exists) {
                        await new Block({ blocker: socket.user, blocked: blockedUser }).save();
                        
                        await updateBlockCache(socket);
                        const otherSocket = getSocketByUsername(blockedUser);
                        if (otherSocket) await updateBlockCache(otherSocket);

                        socket.emit('user blocked', blockedUser);
                        socket.emit('user disconnected', blockedUser);
                        if (otherSocket) otherSocket.emit('user disconnected', socket.user);
                    }
                } catch (error) {
                    console.error('Error al bloquear:', error.message);
                }
            });

            socket.on('unblock user', async (blockedUser) => {
                try {
                    await Block.deleteOne({ blocker: socket.user, blocked: blockedUser });
                    
                    await updateBlockCache(socket);
                    const otherSocket = getSocketByUsername(blockedUser);
                    if (otherSocket) await updateBlockCache(otherSocket);

                    socket.emit('user unblocked', blockedUser);
                    if (users.has(blockedUser)) socket.emit('user connected', blockedUser);
                    if (otherSocket) otherSocket.emit('user connected', socket.user);
                } catch (error) {
                    console.error('Error al desbloquear:', error.message);
                }
            });

            socket.on('typing', () => {
                io.sockets.sockets.forEach(client => {
                    if (client.id !== socket.id && !client.blockedByMe?.has(socket.user) && !client.whoBlockedMe?.has(socket.user)) {
                        client.emit('user typing', socket.user);
                    }
                });
            });

            socket.on('stop typing', () => {
                io.sockets.sockets.forEach(client => {
                    if (client.id !== socket.id) client.emit('user stop typing');
                });
            });

            socket.on('get blocked users', () => {
                socket.emit('blocked users list', Array.from(socket.blockedByMe || []));
            });

            socket.on('logout', () => {
                users.delete(socket.user);
                socket.broadcast.emit('user disconnected', socket.user);
                socket.disconnect();
            });

            socket.on('disconnect', () => {
                users.delete(socket.user);
                socket.broadcast.emit('user disconnected', socket.user);
            });

        } catch (error) {
            console.error('Error de socket:', error.message);
            socket.disconnect(true);
        }
    });
};
