# Chat Real-Time App

Una aplicación de chat desarrollada con **Node.js**, **Express**, **Socket.io** y **MongoDB**. Permite comunicación instantánea entre usuarios autenticados con funcionalidades de privacidad.

## Características Principales

- **Mensajería Instantánea:** Comunicación bidireccional en tiempo real mediante WebSockets.
- **Persistencia de Datos:** Los mensajes se almacenan de forma segura en MongoDB Atlas.
- **Autenticación Robusta:** Registro e inicio de sesión con contraseñas encriptadas (Bcrypt) y sesiones protegidas por JSON Web Tokens (JWT).
- **Control de Privacidad (Bloqueos):** Sistema de bloqueo de usuarios para filtrar mensajes y estado de conexión.
- **Indicador de Escritura:** Visualización en tiempo real cuando otros usuarios están escribiendo mensajes.
- **Diseño Responsivo:** Interfaz adaptable a diferentes dispositivos (móvil, tablet y escritorio).

---

## Tecnologías Utilizadas

- **Backend:** Node.js, Express, Socket.io, Mongoose, JWT, Bcrypt.
- **Frontend:** HTML5, CSS3, JavaScript Vanilla.
- **Base de Datos:** MongoDB Atlas.

---

## Capturas de Pantalla

###  Autenticación (Login & Registro)
![image](https://github.com/user-attachments/assets/bbbc99dd-3e2b-4418-a73a-5b62bbac0cc2)
![image](https://github.com/user-attachments/assets/e3d5d02d-b480-44c6-97f8-10dba170e08a)

### Interfaz de Chat
Permite ver los usuarios conectados, chatear de forma general y gestionar bloqueos.

![image](https://github.com/user-attachments/assets/018130aa-d966-4e5e-a1e4-d1c6710953ef)
![image](https://github.com/user-attachments/assets/9f167b40-e724-42b9-9972-d5dbf72c3c48)

### Indicador de Escritura
Visualización en tiempo real de la actividad de los usuarios.

<img width="1091" height="623" alt="image" src="https://github.com/user-attachments/assets/b3008e26-6c7f-49ca-9fa4-0bdad13c3103" >

###  Vista de Usuario Bloqueado
![image](https://github.com/user-attachments/assets/3eb7483e-a925-40ee-8409-9e9d14d3262d)

###  Diseño Responsivo
![image](https://github.com/user-attachments/assets/2b665331-3b80-4d04-9565-90a2d88df5ef)
![image](https://github.com/user-attachments/assets/2494ccc3-ef01-4c9b-a6a2-41c803818b23)

---

## Configuración e Instalación

1. **Clonar el repositorio:**
   ```bash
   git clone <https://github.com/JesusA-rc/chat-tiempo-real.git>
   cd "chat real"
   ```

2. **Instalar dependencias del Backend:**
   ```bash
   cd backend
   npm install
   ```

3. **Configurar variables de entorno:**
   Crea un archivo `.env` dentro de la carpeta `backend` con el siguiente contenido:
   ```env
   PORT=3000
   MONGO_URI=tu_cadena_de_conexion_a_mongodb_atlas
   ```

4. **Iniciar la aplicación:**
   ```bash
   node server.js
   ```

5. **Acceder:**
   Abre tu navegador en [http://localhost:3000](http://localhost:3000)
