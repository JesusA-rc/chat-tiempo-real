const token = localStorage.getItem('token');

if (!token) {
    window.location.href = '/login';
}

const logoutButton = document.getElementById('logout-button');
const usernameElement = document.getElementById('username');
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const loadingSpinner = document.getElementById('loading-spinner');
const usersList = document.getElementById('users-list');
const typingStatus = document.getElementById('typing-status');
const globalChatSelector = document.getElementById('global-chat-selector');
const chatWithElement = document.getElementById('chat-with');
const createGroupButton = document.getElementById('create-group-button');
const groupsList = document.getElementById('groups-list');

const viewGroupMembersButton = document.getElementById('view-group-members-button');
const groupMembersModal = document.getElementById('group-members-modal');
const closeGroupMembersButton = document.querySelector('.close-group-members');
const groupMembersList = document.getElementById('group-members-list');

const invitationsButton = document.getElementById('invitations-button');
const invitationBadge = document.getElementById('invitation-badge');
const invitationsModal = document.getElementById('invitations-modal');
const closeInvitationsButton = document.querySelector('.close-invitations');
const invitationsList = document.getElementById('invitations-list');

const socket = io({
    auth: {
        token: token
    }
});

let typingTimeout;
let blockedUsers = [];
let oldestMessageId = null;
let hasMoreMessages = true;
let isLoadingMore = false;
let currentRecipient = null; // null Chat Global

function showConfirm(title, message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    const messageEl = document.getElementById('confirm-message');
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');

    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.style.display = 'flex';

    const close = () => { modal.style.display = 'none'; };

    okBtn.onclick = () => {
        onConfirm();
        close();
    };

    cancelBtn.onclick = close;
}

function blockUser(username) {
    showConfirm(
        'Bloquear Usuario', 
        `¿Estás seguro de que quieres bloquear a ${username}? No verás sus mensajes ni él los tuyos.`, 
        () => {
            socket.emit('block user', username);
            blockedUsers.push(username);

            const userItems = usersList.querySelectorAll('li');
            userItems.forEach((item) => {
                if (item.textContent.includes(username)) {
                    item.remove();
                }
            });

            const allMessages = messages.querySelectorAll('.message');
            allMessages.forEach((message) => {
                const userName = message.querySelector('.username').textContent.replace(':', '');
                if (userName === username) {
                    message.remove();
                }
            });

            const messageItem = document.createElement('li');
            messageItem.textContent = `Has bloqueado a ${username}`;
            messageItem.style.color = 'red';
            messages.appendChild(messageItem);
            messages.scrollTop = messages.scrollHeight;
        }
    );
}

function addUserToList(user) {
    const userItem = document.createElement('li');
    userItem.classList.add('user-item');
    userItem.setAttribute('data-user', user);

    const userName = document.createElement('span');
    userName.textContent = user;
    userName.classList.add('user-name');

    const blockButton = document.createElement('button');
    blockButton.textContent = 'Bloquear';
    blockButton.classList.add('block-button');

    const inviteButton = document.createElement('button');
    inviteButton.textContent = 'Invitar';
    inviteButton.classList.add('invite-button');

    const unreadBadge = document.createElement('span');
    unreadBadge.classList.add('unread-badge');
    unreadBadge.textContent = '0';

    userItem.appendChild(userName);
    userItem.appendChild(unreadBadge);
    userItem.appendChild(inviteButton);
    userItem.appendChild(blockButton);

    usersList.appendChild(userItem);

    userItem.addEventListener('click', (e) => {
        if (e.target !== blockButton) {
            switchChat(user);
        }
    });

    blockButton.addEventListener('click', (e) => {
        e.stopPropagation();
        blockUser(user);
    });

    inviteButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentRecipient && currentRecipient.toString().startsWith('group:')) {
            socket.emit('invite to group', { recipient: user, groupId: currentRecipient });
            alert(`Invitación enviada a ${user}`);
        } else {
            alert('Selecciona un grupo primero para invitar a alguien.');
        }
    });
}

function addMessage(data, isPrepend = false) {
    const item = document.createElement('li');
    item.setAttribute('data-id', data.id);

    if (data.user === usernameElement.textContent) {
        item.classList.add('user-message');
        item.innerHTML = `
            <span class="timestamp">[${data.time}]</span>
            <span class="text">${data.text}</span>
            <span class="user-name"> :${data.user}</span> 
        `;
    } else {
        item.innerHTML = `
            <span class="username">${data.user}:</span> 
            <span class="text">${data.text}</span>
            <span class="timestamp">[${data.time}]</span>
        `;
    }

    if (isPrepend) {
        messages.prepend(item);
    } else {
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    }

    if (!oldestMessageId || (isPrepend && data.id < oldestMessageId)) {
        oldestMessageId = data.id;
    }
}

function addGroupToList(group) {
    const groupItem = document.createElement('li');
    groupItem.classList.add('user-item');
    groupItem.setAttribute('data-group', group.id);

    const groupName = document.createElement('span');
    groupName.textContent = `👥 ${group.name}`;
    groupName.classList.add('user-name');

    const unreadBadge = document.createElement('span');
    unreadBadge.classList.add('unread-badge');
    unreadBadge.textContent = '0';

    groupItem.appendChild(groupName);
    groupItem.appendChild(unreadBadge);

    groupsList.appendChild(groupItem);

    groupItem.addEventListener('click', () => {
        switchChat(group.id);
    });
}

function switchChat(recipient) {
    currentRecipient = recipient;
    messages.innerHTML = '';
    oldestMessageId = null;
    hasMoreMessages = true;
    isLoadingMore = false;

    document.querySelectorAll('.user-item, #global-chat-selector').forEach(el => el.classList.remove('active'));
    if (recipient === null) {
        globalChatSelector.classList.add('active');
        chatWithElement.textContent = 'Chat Global';
        viewGroupMembersButton.style.display = 'none';
    } else if (typeof recipient === 'string' && recipient.startsWith('group:')) {
        const groupEl = document.querySelector(`.user-item[data-group="${recipient}"]`);
        if (groupEl) {
            groupEl.classList.add('active');
            groupEl.classList.remove('has-unread');
            const badge = groupEl.querySelector('.unread-badge');
            if (badge) badge.textContent = '0';
        }
        const groupName = document.querySelector(`.user-item[data-group="${recipient}"] .user-name`)?.textContent || 'Grupo';
        chatWithElement.textContent = `Grupo: ${groupName.replace('👥 ', '')}`;
        viewGroupMembersButton.style.display = 'block';
    } else {
        const userEl = document.querySelector(`.user-item[data-user="${recipient}"]`);
        if (userEl) {
            userEl.classList.add('active');
            userEl.classList.remove('has-unread');
            const badge = userEl.querySelector('.unread-badge');
            if (badge) badge.textContent = '0';
        }
        chatWithElement.textContent = `Conversación con: ${recipient}`;
        viewGroupMembersButton.style.display = 'none';
    }

    socket.emit('get chat history', recipient);
}

// Eventos de Socket.IO -----------------------------------

globalChatSelector.addEventListener('click', () => switchChat(null));

socket.on('chat history', (history) => {
    history.forEach(msg => addMessage(msg));
    if (history.length < 20) hasMoreMessages = false;
});

socket.on('previous messages', (prevMessages) => {
    loadingSpinner.style.display = 'none';
    if (prevMessages.length === 0) {
        hasMoreMessages = false;
        isLoadingMore = false;
        return;
    }

    const previousScrollHeight = messages.scrollHeight;
    prevMessages.reverse().forEach(msg => addMessage(msg, true));
    messages.scrollTop = messages.scrollHeight - previousScrollHeight;
    
    if (prevMessages.length < 20) hasMoreMessages = false;
    isLoadingMore = false;
});

socket.on('chat message', (data) => {
    const isGlobalMatch = currentRecipient === null && data.recipient === null;
    const isPrivateMatch = currentRecipient !== null && 
        ((data.user === currentRecipient && data.recipient === usernameElement.textContent) || 
         (data.user === usernameElement.textContent && data.recipient === currentRecipient));
    const isGroupMatch = currentRecipient !== null && currentRecipient.toString().startsWith('group:') && data.recipient === currentRecipient;

    if (isGlobalMatch || isPrivateMatch || isGroupMatch) {
        addMessage(data);
    } else if (data.recipient !== null) {
        const selector = data.recipient.toString().startsWith('group:') 
            ? `.user-item[data-group="${data.recipient}"]`
            : `.user-item[data-user="${data.user}"]`;
            
        const itemEl = document.querySelector(selector);
        if (itemEl) {
            itemEl.classList.add('has-unread');
            const badge = itemEl.querySelector('.unread-badge');
            if (badge) {
                const count = parseInt(badge.textContent || '0') + 1;
                badge.textContent = count;
            }
        }
    }
});

socket.on('my groups', (groups) => {
    groupsList.innerHTML = '';
    groups.forEach(group => addGroupToList(group));
});

socket.on('group created', (group) => {
    addGroupToList(group);
    switchChat(group.id);
});

socket.on('group members list', (data) => {
    const { creator, members } = data;
    groupMembersList.innerHTML = '';
    
    const creatorItem = document.createElement('li');
    creatorItem.innerHTML = `<strong>👑 ${creator}</strong> <em>(Dueño)</em>`;
    groupMembersList.appendChild(creatorItem);

    members.forEach(member => {
        if (member !== creator) {
            const memberItem = document.createElement('li');
            memberItem.textContent = member;
            groupMembersList.appendChild(memberItem);
        }
    });

    groupMembersModal.style.display = 'flex';
});

socket.on('user connected', (username) => {
    if (!document.querySelector(`li[data-user="${username}"]`)) {
        addUserToList(username);
    }
});

socket.on('user disconnected', (username) => {
    const userItem = document.querySelector(`li[data-user="${username}"]`);
    if (userItem) {
        userItem.remove();
    }
});

socket.on('users connected', (connectedUsers) => {
    usersList.innerHTML = '';
    connectedUsers.forEach((user) => {
        addUserToList(user); 
    });
});

socket.on('user typing', (data) => {
    const user = typeof data === 'string' ? data : data.user;
    const isGlobal = typeof data === 'string' ? true : data.isGlobal;
    const isGroup = data && typeof data === 'object' ? data.isGroup : false;
    const groupId = data && typeof data === 'object' ? data.groupId : null;

    const isGlobalMatch = currentRecipient === null && isGlobal;
    const isPrivateMatch = currentRecipient !== null && !isGlobal && !isGroup && user === currentRecipient;
    const isGroupMatch = currentRecipient !== null && isGroup && groupId === currentRecipient;

    if (isGlobalMatch || isPrivateMatch || isGroupMatch) {
        typingStatus.textContent = `${user} está escribiendo...`;
    }
});

socket.on('user stop typing', (data) => {
    const user = data && typeof data === 'object' ? data.user : null;
    
    // Si el usuario que dejó de escribir es el que estamos mostrando, lo quitamos.
    // Esto es robusto contra desconexiones y cambios de contexto incompletos.
    if (user && typingStatus.textContent.startsWith(user)) {
        typingStatus.textContent = '';
        return;
    }

    const isGlobal = data && typeof data === 'object' ? data.isGlobal : true;
    const isGroup = data && typeof data === 'object' ? data.isGroup : false;
    const groupId = data && typeof data === 'object' ? data.groupId : null;

    const isGlobalMatch = currentRecipient === null && isGlobal;
    const isPrivateMatch = currentRecipient !== null && !isGlobal && !isGroup && user === currentRecipient;
    const isGroupMatch = currentRecipient !== null && isGroup && groupId === currentRecipient;

    if (isGlobalMatch || isPrivateMatch || isGroupMatch || !data) {
        typingStatus.textContent = '';
    }
});

socket.on('redirect', (destination) => {
    window.location.href = destination;
});

socket.on('error', (data) => {
    alert(data.message);
});

socket.on('pending invitations', (invitations) => {
    updateInvitationsUI(invitations);
});

socket.on('new invitation', (invitation) => {
    alert(`¡Nueva invitación de ${invitation.sender} al grupo ${invitation.groupName}!`);
});

socket.on('invitation accepted', (data) => {
    alert(`${data.user} ha aceptado tu invitación al grupo ${data.groupName}`);
});

function updateInvitationsUI(invitations) {
    invitationsList.innerHTML = '';
    const count = invitations.length;
    
    if (count > 0) {
        invitationBadge.textContent = count;
        invitationBadge.style.display = 'inline-block';
    } else {
        invitationBadge.style.display = 'none';
    }

    if (count === 0) {
        invitationsList.innerHTML = '<li>No tienes invitaciones pendientes.</li>';
        return;
    }

    invitations.forEach(inv => {
        const item = document.createElement('li');
        item.classList.add('invitation-item');
        item.innerHTML = `
            <div class="invitation-info">
                <strong>${inv.sender}</strong> te invita a <strong>${inv.groupName}</strong>
            </div>
            <div class="invitation-actions">
                <button class="btn-accept" data-id="${inv.id}">Aceptar</button>
                <button class="btn-reject" data-id="${inv.id}">Rechazar</button>
            </div>
        `;
        invitationsList.appendChild(item);
    });

    invitationsList.querySelectorAll('.btn-accept').forEach(btn => {
        btn.addEventListener('click', () => {
            socket.emit('accept invitation', btn.getAttribute('data-id'));
        });
    });

    invitationsList.querySelectorAll('.btn-reject').forEach(btn => {
        btn.addEventListener('click', () => {
            socket.emit('reject invitation', btn.getAttribute('data-id'));
        });
    });
}

invitationsButton.addEventListener('click', () => {
    invitationsModal.style.display = 'flex';
});

closeInvitationsButton.addEventListener('click', () => {
    invitationsModal.style.display = 'none';
});

messages.addEventListener('scroll', () => {
    if (messages.scrollTop === 0 && hasMoreMessages && !isLoadingMore && oldestMessageId) {
        isLoadingMore = true;
        loadingSpinner.style.display = 'flex';
        socket.emit('load previous messages', { lastId: oldestMessageId, recipient: currentRecipient });
    }
});

logoutButton.addEventListener('click', () => {
    showConfirm('Cerrar Sesión', '¿Estás seguro de que quieres salir?', () => {
        socket.emit('logout');
        localStorage.removeItem('token');
        socket.disconnect();
        window.location.href = '/login';
    });
});

try {
    const payload = token.split('.')[1]; 
    const decodedPayload = JSON.parse(atob(payload));
    usernameElement.textContent = decodedPayload.username || 'Usuario';
} catch (error) {
    console.error('Error al decodificar el token:', error);
}

window.addEventListener('storage', (event) => {
    if (event.key === 'token' && !event.newValue) {
        socket.disconnect();
        window.location.href = '/login';
    }
});

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value) {
        socket.emit('chat message', {
            text: input.value,
            recipient: currentRecipient
        });
        input.value = '';
    }
});

input.addEventListener('keydown', () => {
    socket.emit('typing', { recipient: currentRecipient });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('stop typing', { recipient: currentRecipient });
    }, 2000);
});

const blockedUsersButton = document.getElementById('blocked-users-button');
const blockedUsersModal = document.getElementById('blocked-users-modal');
const closeModalButton = document.querySelector('.close');
const blockedUsersList = document.getElementById('blocked-users-list');

blockedUsersButton.addEventListener('click', () => {
    socket.emit('get blocked users');
    blockedUsersList.innerHTML = '';

    socket.once('blocked users list', (blockedUsers) => {
        blockedUsers.forEach((user) => {
            const userItem = document.createElement('li');
            const userName = document.createElement('span');
            userName.textContent = user;
            const unblockButton = document.createElement('button');
            unblockButton.textContent = 'Desbloquear';

            userItem.appendChild(userName);
            userItem.appendChild(unblockButton);
            blockedUsersList.appendChild(userItem);

            unblockButton.addEventListener('click', () => {
                socket.emit('unblock user', user);
                userItem.remove(); 
            });
        });
    });
    blockedUsersModal.style.display = 'flex';
});

closeModalButton.addEventListener('click', () => {
    blockedUsersModal.style.display = 'none';
});

viewGroupMembersButton.addEventListener('click', () => {
    if (currentRecipient && typeof currentRecipient === 'string' && currentRecipient.startsWith('group:')) {
        socket.emit('get group members', currentRecipient);
    }
});

closeGroupMembersButton.addEventListener('click', () => {
    groupMembersModal.style.display = 'none';
});

window.addEventListener('click', (event) => {
    if (event.target === blockedUsersModal) {
        blockedUsersModal.style.display = 'none';
    }
    if (event.target === groupMembersModal) {
        groupMembersModal.style.display = 'none';
    }
});

document.getElementById("toggle-sidebar").addEventListener("click", function() {
    document.getElementById("sidebar").classList.toggle("open");
});

const emojiButton = document.getElementById('emoji-button');
const emojiPickerContainer = document.getElementById('emoji-picker-container');
const emojiPicker = document.querySelector('emoji-picker');

emojiButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = emojiPickerContainer.style.display === 'none';
    emojiPickerContainer.style.display = isHidden ? 'block' : 'none';
});

emojiPicker.addEventListener('emoji-click', (event) => {
    input.value += event.detail.unicode;
    input.focus();
});

document.addEventListener('click', (e) => {
    if (!emojiPickerContainer.contains(e.target) && e.target !== emojiButton) {
        emojiPickerContainer.style.display = 'none';
    }
});

createGroupButton.addEventListener('click', () => {
    const groupName = prompt('Ingrese el nombre del grupo:');
    if (groupName) {
        socket.emit('create group', { name: groupName });
    }
});
