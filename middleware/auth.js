const jwt = require('jsonwebtoken');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No valid token provided'
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
    
    if (decoded.isGuest) {
      req.user = {
        userId: decoded.userId,
        username: decoded.username,
        isGuest: true
      };
    } else {
      req.user = {
        userId: decoded.userId,
        username: decoded.username,
        email: decoded.email,
        isGuest: false
      };
    }

    next();
  } catch (error) {
    res.status(401).json({
      error: 'Access denied',
      message: 'Invalid token'
    });
  }
};

module.exports = authMiddleware;
