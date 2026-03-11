import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Message from '../models/Message.js';
import Block from '../models/Block.js';
import { formatDateTime } from '../utils/dateFormatter.js';

export const registerChatHandlers = (io, JWT_SECRET, users) => {
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
                            client.emit('user disconnected', socket.user);
                        }
                    } catch (error) {
                        console.error('Error al filtrar desconexión:', error.message);
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

            socket.on('typing', (data) => {
                socket.broadcast.emit('user typing', data.user);
            });

            socket.on('stop typing', () => {
                socket.broadcast.emit('user stop typing');
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
};
