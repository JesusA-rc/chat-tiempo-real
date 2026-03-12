const token = localStorage.getItem('token');
const logoutButton = document.getElementById('logout-button');
const usernameElement = document.getElementById('username');

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const loadingSpinner = document.getElementById('loading-spinner');
const usersList = document.getElementById('users-list');
const typingStatus = document.getElementById('typing-status');

let typingTimeout;

input.addEventListener('keydown', () => {
    socket.emit('typing', { user: usernameElement.textContent });

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('stop typing');
    }, 2000);
});

let blockedUsers = [];


//Funciones  -----------------------------------
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
            socket.emit('block user', username); //Registra el bloqueo en el servidor
            blockedUsers.push(username);

            const userItems = usersList.querySelectorAll('li'); //Lo elimina visualmente
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

    userItem.appendChild(userName);
    userItem.appendChild(blockButton);

    usersList.appendChild(userItem);

    blockButton.addEventListener('click', () => {
        blockUser(user);
    });
}

if (!token) {
    window.location.href = '/login';
}

// Conectar con Socket.IO 
const socket = io({
    auth: {
        token: token
    }
});


let oldestMessageId = null;
let hasMoreMessages = true;
let isLoadingMore = false;

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

socket.on('chat history', (history) => {
    history.forEach(msg => addMessage(msg));
    if (history.length < 20) hasMoreMessages = false;
});

socket.on('previous messages', (prevMessages) => 
{
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
    addMessage(data);
});

messages.addEventListener('scroll', () =>
{
    if (messages.scrollTop === 0 && hasMoreMessages && !isLoadingMore && oldestMessageId)
    {
        isLoadingMore = true;
        loadingSpinner.style.display = 'flex';
        socket.emit('load previous messages', oldestMessageId);
    }
});

socket.on('user connected', (username) => { //Se conecto un usuario
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


socket.on('redirect', (destination) => {
    window.location.href = destination;
});

socket.on('user typing', (username) => {
    typingStatus.textContent = `${username} está escribiendo...`;
});

socket.on('user stop typing', () => {
    typingStatus.textContent = '';
});

logoutButton.addEventListener('click', () => {
    showConfirm(
        'Cerrar Sesión',
        '¿Estás seguro de que quieres salir?',
        () => {
            socket.emit('logout');
            localStorage.removeItem('token');
            socket.disconnect();
            window.location.href = '/login';
        }
    );
});

let username = 'Usuario';
try {
    const payload = token.split('.')[1]; 
    const decodedPayload = JSON.parse(atob(payload));
    username = decodedPayload.username || 'Usuario';
} catch (error) {
    console.error('Error al decodificar el token:', error);
}
usernameElement.textContent = username;

window.addEventListener('storage', (event) => {
    if (event.key === 'token' && !event.newValue) {
        console.log('Sesión cerrada en otra pestaña');
        socket.disconnect();
        window.location.href = '/login';
    }
});

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value) {
        socket.emit('chat message', input.value);
        input.value = '';
    }
});

//Modal
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

socket.on('blocked users list', (blockedUsersList) => {
    blockedUsers = blockedUsersList;
});

closeModalButton.addEventListener('click', () => {
    blockedUsersModal.style.display = 'none';
});

window.addEventListener('click', (event) => {
    if (event.target === blockedUsersModal) {
        blockedUsersModal.style.display = 'none';
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
    const emoji = event.detail.unicode;
    input.value += emoji;
    input.focus();
});

document.addEventListener('click', (e) => {
    if (!emojiPickerContainer.contains(e.target) && e.target !== emojiButton) {
        emojiPickerContainer.style.display = 'none';
    }
});

form.addEventListener('submit', () => {
    emojiPickerContainer.style.display = 'none';
});

