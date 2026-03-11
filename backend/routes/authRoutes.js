import express from 'express';
import { register, login } from '../controllers/authController.js';

export const authRoutes = (jwtSecret) => {
    const router = express.Router();

    router.post('/register', register);
    router.post('/login', login(jwtSecret));

    return router;
};
