const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const switchToRegister = document.getElementById('switch-to-register');
const switchToLogin = document.getElementById('switch-to-login');

switchToRegister.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.remove('active');
    registerForm.classList.add('active');
});

switchToLogin.addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.classList.remove('active');
    loginForm.classList.add('active');
});


loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorMessage = document.getElementById('login-error-message');
    errorMessage.textContent = ''; 
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('token', data.token);
            window.location.href = `/Pages/chat/chat.html?token=${data.token}`;
        } else {
            errorMessage.textContent = data.message || 'Error al iniciar sesión';
        }
    } catch (error) {
        errorMessage.textContent = 'Error al conectar con el servidor';
    }
});




registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorMessage = document.getElementById('register-error-message');
    errorMessage.textContent = '';

    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;

    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            alert(data.message || 'Registro exitoso');
            registerForm.classList.remove('active');
            loginForm.classList.add('active'); 
        } else {
            errorMessage.textContent = data.message || 'Error al registrar el usuario';
        }
    } catch (error) {
        errorMessage.textContent = 'Error al conectar con el servidor';
    }
});