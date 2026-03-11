import jwt from 'jsonwebtoken';

export const authenticateToken = (jwtSecret) => (req, res, next) => {
    const token = req.query.token || req.headers['authorization'];

    if (!token) {
        console.error('Error de autenticación: Token no proporcionado');
        return res.redirect('/login'); 
    }

    try {
        const decoded = jwt.verify(token, jwtSecret);
        req.user = decoded;
        next(); 
    } catch (error) {
        console.error('Error de autenticación:', error.message);
        return res.redirect('/login');
    }
};
