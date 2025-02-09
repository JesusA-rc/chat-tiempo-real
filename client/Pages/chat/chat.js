

const token = localStorage.getItem('token');
const logoutButton = document.getElementById('logout-button');
const usernameElement = document.getElementById('username');

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const usersList = document.getElementById('users-list');

let blockedUsers = [];


//Funciones  -----------------------------------
function blockUser(username) {
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


socket.on('chat message', (data) => {
    const item = document.createElement('li');

    if (data.user === usernameElement.textContent) {
        item.classList.add('user-message');

        item.innerHTML = `
        <span class="timestamp">[${data.time}]</span>
        <span class="text">${data.text}</span>
        <span class="user-name"> :${data.user}</span> 
    `;
    }else{
        item.innerHTML = `
        <span class="username">${data.user}:</span> 
        <span class="text">${data.text}</span>
        <span class="timestamp">[${data.time}]</span>
    `;
    }

    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
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

logoutButton.addEventListener('click', () => {
    socket.emit('logout');
    localStorage.removeItem('token');
    socket.disconnect();
    window.location.href = '/login';
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
