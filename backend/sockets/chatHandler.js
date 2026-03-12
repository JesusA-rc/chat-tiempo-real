import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Message from '../models/Message.js';
import Block from '../models/Block.js';
import Group from '../models/Group.js';
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

            const fetchMessages = async (query = {}, limit = 20, recipient = null) => {
                const finalQuery = { ...query };
                if (recipient === null) {
                    finalQuery.recipient = null;
                } else if (recipient && recipient.startsWith('group:')) {
                    finalQuery.recipient = recipient;
                } else {
                    finalQuery.$or = [
                        { user: socket.user, recipient: recipient },
                        { user: recipient, recipient: socket.user }
                    ];
                }

                const messages = await Message.find(finalQuery).sort({ _id: -1 }).limit(limit).lean();
                return messages
                    .filter(msg => {
                        return !socket.blockedByMe.has(msg.user) && !socket.whoBlockedMe.has(msg.user);
                    })
                    .map(msg => ({
                        id: msg._id,
                        user: msg.user,
                        recipient: msg.recipient,
                        text: msg.text,
                        time: formatDateTime(msg.createdAt)
                    }))
                    .reverse();
            };

            const initialMessages = await fetchMessages();
            socket.emit('chat history', initialMessages);

            socket.on('get chat history', async (recipient) => {
                const history = await fetchMessages({}, 20, recipient);
                socket.emit('chat history', history);
            });

            socket.on('load previous messages', async (data) => {
                const { lastId, recipient } = data;
                const previousMessages = await fetchMessages({ _id: { $lt: lastId } }, 20, recipient);
                socket.emit('previous messages', previousMessages);
            });

            io.sockets.sockets.forEach((client) => {
                if (client.id === socket.id) return;
                const isBlocked = client.blockedByMe?.has(socket.user) || client.whoBlockedMe?.has(socket.user);
                if (!isBlocked) {
                    client.emit('user connected', socket.user);
                }
            });

            // Grupos -----------------------------------
            const emitMyGroups = async () => {
                try {
                    const myGroups = await Group.find({ members: socket.user }).lean();
                    socket.emit('my groups', myGroups.map(g => ({
                        id: `group:${g._id}`,
                        name: g.name,
                        members: g.members
                    })));
                } catch (error) {
                    console.error('Error fetching groups:', error.message);
                }
            };

            await emitMyGroups();

            socket.on('create group', async (data) => {
                try {
                    const { name } = data;
                    if (!name) return;
                    
                    const newGroup = new Group({
                        name: name,
                        creator: socket.user,
                        members: [socket.user]
                    });
                    const savedGroup = await newGroup.save();
                    
                    const groupData = {
                        id: `group:${savedGroup._id}`,
                        name: savedGroup.name,
                        members: savedGroup.members
                    };
                    
                    socket.emit('group created', groupData);
                    await emitMyGroups();
                } catch (error) {
                    console.error('Error creating group:', error.message);
                }
            });

            socket.on('chat message', async (data) => {
                const { text, recipient } = data;
                const formattedDate = formatDateTime(new Date());
                const newMessage = new Message({
                    user: socket.user,
                    recipient: recipient || null,
                    text: text,
                    createdAt: new Date(), 
                });
                const savedMessage = await newMessage.save();

                const messageData = { 
                    id: savedMessage._id,
                    user: socket.user,
                    recipient: recipient || null,
                    text: text, 
                    time: formattedDate 
                };

                if (!recipient) {
                    // Mensaje Global
                    io.sockets.sockets.forEach((client) => {
                        const isBlocked = client.blockedByMe?.has(socket.user) || client.whoBlockedMe?.has(socket.user);
                        if (!isBlocked) {
                            client.emit('chat message', messageData);
                        }
                    });
                } else if (recipient.startsWith('group:')) {
                    // Mensaje de Grupo
                    const groupId = recipient.replace('group:', '');
                    try {
                        const group = await Group.findById(groupId);
                        if (group && group.members.includes(socket.user)) {
                            io.sockets.sockets.forEach((client) => {
                                if (group.members.includes(client.user)) {
                                    const isBlocked = client.blockedByMe?.has(socket.user) || client.whoBlockedMe?.has(socket.user);
                                    if (!isBlocked) {
                                        client.emit('chat message', messageData);
                                    }
                                }
                            });
                        }
                    } catch (error) {
                        console.error('Error sending group message:', error.message);
                    }
                } else {
                    // Mensaje Privado
                    const targetSocket = getSocketByUsername(recipient);
                    if (targetSocket) {
                        const isBlocked = targetSocket.blockedByMe?.has(socket.user) || targetSocket.whoBlockedMe?.has(socket.user);
                        if (!isBlocked) {
                            targetSocket.emit('chat message', messageData);
                        }
                    }
                    // Siempre enviar al emisor
                    socket.emit('chat message', messageData);
                }
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

            socket.on('typing', (data) => {
                const { recipient } = data;
                if (!recipient) {
                    io.sockets.sockets.forEach(client => {
                        if (client.id !== socket.id && !client.blockedByMe?.has(socket.user) && !client.whoBlockedMe?.has(socket.user)) {
                            client.emit('user typing', { user: socket.user, isGlobal: true });
                        }
                    });
                } else {
                    const targetSocket = getSocketByUsername(recipient);
                    if (targetSocket) {
                        const isBlocked = targetSocket.blockedByMe?.has(socket.user) || targetSocket.whoBlockedMe?.has(socket.user);
                        if (!isBlocked) {
                            targetSocket.emit('user typing', { user: socket.user, isGlobal: false });
                        }
                    }
                }
            });

            socket.on('stop typing', (data) => {
                const { recipient } = data;
                if (!recipient) {
                    io.sockets.sockets.forEach(client => {
                        if (client.id !== socket.id) client.emit('user stop typing', { user: socket.user, isGlobal: true });
                    });
                } else {
                    const targetSocket = getSocketByUsername(recipient);
                    if (targetSocket) targetSocket.emit('user stop typing', { user: socket.user, isGlobal: false });
                }
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
