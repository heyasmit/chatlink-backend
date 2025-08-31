const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const uploadRoutes = require('./routes/upload');

// Import middleware
const authMiddleware = require('./middleware/auth');

const app = express();
const server = http.createServer(app);

// Socket.IO setup with CORS
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// CORS middleware
app.use(cors({
    origin: [
        'https://heyasmit.github.io',
        'https://heyasmit.github.io/chatlink-frontend',
        'http://localhost:3000',
        'http://localhost:5173'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));


// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use('/uploads', express.static('uploads'));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chatlink', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch((err) => console.error('❌ MongoDB connection error:', err));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/upload', uploadRoutes);

// Socket.IO connection handling
const activeUsers = new Map();
const roomUsers = new Map();

io.on('connection', (socket) => {
  console.log('👤 User connected:', socket.id);

  // Handle user authentication
  socket.on('authenticate', (data) => {
    const { userId, username, roomId } = data;
    socket.userId = userId;
    socket.username = username;
    socket.roomId = roomId;
    
    // Track active users
    activeUsers.set(userId, {
      socketId: socket.id,
      username: username,
      status: 'online'
    });
    
    // Join chat room
    if (roomId) {
      socket.join(roomId);
      
      // Track room users
      if (!roomUsers.has(roomId)) {
        roomUsers.set(roomId, new Set());
      }
      roomUsers.get(roomId).add(userId);
      
      // Notify room about user joining
      socket.to(roomId).emit('user-joined', {
        userId,
        username,
        timestamp: new Date().toISOString()
      });
      
      // Send updated user list to room
      const roomUserList = Array.from(roomUsers.get(roomId)).map(id => {
        const user = activeUsers.get(id);
        return user ? { id, username: user.username, status: user.status } : null;
      }).filter(Boolean);
      
      io.to(roomId).emit('room-users-updated', roomUserList);
    }
  });

  // Handle sending messages
  socket.on('send-message', async (messageData) => {
    try {
      const { roomId, content, type, fileUrl, fileName, fileSize } = messageData;
      
      const message = {
        id: require('uuid').v4(),
        roomId,
        senderId: socket.userId,
        senderUsername: socket.username,
        content,
        type: type || 'text',
        timestamp: new Date().toISOString(),
        fileUrl,
        fileName,
        fileSize,
        reactions: []
      };

      // Detect and create link previews
      if (type === 'text' && content) {
        const linkPreview = await generateLinkPreview(content);
        if (linkPreview) {
          message.linkPreview = linkPreview;
        }
      }

      // Save message to database (implement with your Message model)
      // await Message.create(message);

      // Broadcast message to room
      io.to(roomId).emit('new-message', message);
      
      console.log('📨 Message sent in room:', roomId);
    } catch (error) {
      console.error('❌ Error sending message:', error);
      socket.emit('message-error', { error: 'Failed to send message' });
    }
  });

  // Handle typing indicators
  socket.on('typing-start', (data) => {
    socket.to(data.roomId).emit('user-typing', {
      userId: socket.userId,
      username: socket.username,
      isTyping: true
    });
  });

  socket.on('typing-stop', (data) => {
    socket.to(data.roomId).emit('user-typing', {
      userId: socket.userId,
      username: socket.username,
      isTyping: false
    });
  });

  // Handle message reactions
  socket.on('add-reaction', (data) => {
    const { messageId, reaction, roomId } = data;
    io.to(roomId).emit('reaction-added', {
      messageId,
      reaction,
      userId: socket.userId,
      username: socket.username
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('👤 User disconnected:', socket.id);
    
    if (socket.userId) {
      // Remove from active users
      activeUsers.delete(socket.userId);
      
      // Remove from room users
      if (socket.roomId && roomUsers.has(socket.roomId)) {
        roomUsers.get(socket.roomId).delete(socket.userId);
        
        // Notify room about user leaving
        socket.to(socket.roomId).emit('user-left', {
          userId: socket.userId,
          username: socket.username,
          timestamp: new Date().toISOString()
        });
        
        // Send updated user list to room
        const roomUserList = Array.from(roomUsers.get(socket.roomId)).map(id => {
          const user = activeUsers.get(id);
          return user ? { id, username: user.username, status: user.status } : null;
        }).filter(Boolean);
        
        io.to(socket.roomId).emit('room-users-updated', roomUserList);
      }
    }
  });
});

// Simple link preview generator
async function generateLinkPreview(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = text.match(urlRegex);
  
  if (!urls || urls.length === 0) return null;
  
  const url = urls[0];
  
  // YouTube detection
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const videoId = extractYouTubeVideoId(url);
    if (videoId) {
      return {
        url,
        title: 'YouTube Video',
        description: 'Click to watch on YouTube',
        image: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        provider: 'YouTube'
      };
    }
  }
  
  // Instagram detection
  if (url.includes('instagram.com')) {
    return {
      url,
      title: 'Instagram Post',
      description: 'View on Instagram',
      image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=400&fit=crop',
      provider: 'Instagram'
    };
  }
  
  return null;
}

function extractYouTubeVideoId(url) {
  if (url.includes('youtube.com/watch?v=')) {
    const match = url.match(/[?&]v=([^&]+)/);
    return match ? match[1] : null;
  }
  if (url.includes('youtu.be/')) {
    const match = url.match(/youtu\.be\/([^?]+)/);
    return match ? match[1] : null;
  }
  return null;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    activeUsers: activeUsers.size,
    activeRooms: roomUsers.size
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 ChatLink server running on port ${PORT}`);
  console.log(`📡 Socket.IO ready for connections`);
});

module.exports = { app, io };
