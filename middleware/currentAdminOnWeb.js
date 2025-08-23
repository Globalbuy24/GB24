// middleware/authenticate.js
import jwt from 'jsonwebtoken';

const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.data }; 
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

export default authenticateAdmin;
