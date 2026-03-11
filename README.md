# Chat Real-Time App

Una aplicación de chat robusta desarrollada con **Node.js**, **Express**, **Socket.io** y **MongoDB**. Diseñada para ofrecer una experiencia de usuario fluida, segura y con un rendimiento optimizado.

## Características Principales

- **Mensajería Instantánea:** Comunicación bidireccional en tiempo real mediante WebSockets altamente optimizados.
- **Persistencia de Sesión (JWT):** Las sesiones de los usuarios se mantienen válidas incluso tras reiniciar el servidor gracias a la persistencia del `JWT_SECRET` en variables de entorno.
- **Rendimiento Optimizado:** Sistema de cache de bloqueos en memoria que reduce drásticamente las consultas a la base de datos (eliminación de consultas N+1), permitiendo una mensajería ultra-rápida.
- **Control de Privacidad Avanzado (Bloqueos):**
  - Sistema de bloqueo bidireccional e instantáneo (sin recargar la página).
  - Filtro automático de mensajes históricos y eventos de escritura (`typing`) para usuarios bloqueados.
- **Confirmación de Acciones Críticas:** Modal reutilizable para confirmar el cierre de sesión y bloqueos de usuarios, mejorando la experiencia de usuario (UX).
- **Persistencia de Datos:** Todos los mensajes y relaciones de bloqueo se almacenan de forma segura en MongoDB Atlas.
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
![image](https://github.com/user-attachments/assets/018130aa-d966-4e5e-a1e4-d1c6710953ef)

### Confirmación de Acciones (Nueva Mejora)
![alt text](image.png)
![alt text](image-1.png)

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
   Crea un archivo `.env` dentro de la carpeta `backend`:
   ```env
   PORT=3000
   MONGO_URI=tu_cadena_de_conexion_a_mongodb_atlas
   JWT_SECRET=clave_secreta_para_tokens_jwt
   ```

4. **Scripts Disponibles:**
   - **Producción:** `npm start` (inicia el servidor con Node.js).
   - **Desarrollo:** `npm run dev` (inicia el servidor con nodemon para reinicio automático).

5. **Acceder:**
   Abre tu navegador en [http://localhost:3000](http://localhost:3000)

---
