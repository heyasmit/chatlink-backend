const express = require('express');
const { v4: uuidv4 } = require('uuid');
const ChatRoom = require('../models/ChatRoom');
const Message = require('../models/Message');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Create new chat room
router.post('/create-room', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    const inviteCode = uuidv4().slice(0, 8); // Short invite code

    const chatRoom = new ChatRoom({
      inviteCode,
      name: name || `Chat Room ${inviteCode}`,
      participants: [req.user.userId],
      createdBy: req.user.userId,
      isPublic: true
    });

    await chatRoom.save();

    res.status(201).json({
      message: 'Chat room created successfully',
      room: {
        id: chatRoom._id,
        inviteCode: chatRoom.inviteCode,
        name: chatRoom.name,
        participants: chatRoom.participants,
        createdBy: chatRoom.createdBy,
        createdAt: chatRoom.createdAt,
        inviteUrl: `${process.env.CLIENT_URL || 'http://localhost:3000'}/chat/${chatRoom.inviteCode}`
      }
    });

  } catch (error) {
    console.error('Room creation error:', error);
    res.status(500).json({
      error: 'Failed to create chat room',
      message: 'Internal server error'
    });
  }
});

// Join chat room by invite code
router.post('/join/:inviteCode', authMiddleware, async (req, res) => {
  try {
    const { inviteCode } = req.params;
    
    const chatRoom = await ChatRoom.findOne({ inviteCode });
    if (!chatRoom) {
      return res.status(404).json({
        error: 'Chat room not found',
        message: 'Invalid invite code'
      });
    }

    // Add user to participants if not already present
    if (!chatRoom.participants.includes(req.user.userId)) {
      chatRoom.participants.push(req.user.userId);
      await chatRoom.save();
    }

    // Get recent messages
    const messages = await Message.find({ roomId: chatRoom._id })
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();

    res.json({
      message: 'Successfully joined chat room',
      room: {
        id: chatRoom._id,
        inviteCode: chatRoom.inviteCode,
        name: chatRoom.name,
        participants: chatRoom.participants,
        createdBy: chatRoom.createdBy,
        createdAt: chatRoom.createdAt
      },
      messages: messages.reverse()
    });

  } catch (error) {
    console.error('Room join error:', error);
    res.status(500).json({
      error: 'Failed to join chat room',
      message: 'Internal server error'
    });
  }
});

// Get chat room info
router.get('/room/:inviteCode', async (req, res) => {
  try {
    const { inviteCode } = req.params;
    
    const chatRoom = await ChatRoom.findOne({ inviteCode });
    
    if (!chatRoom) {
      return res.status(404).json({
        error: 'Chat room not found',
        message: 'Invalid invite code'
      });
    }

    res.json({
      room: {
        id: chatRoom._id,
        inviteCode: chatRoom.inviteCode,
        name: chatRoom.name,
        participants: chatRoom.participants,
        createdBy: chatRoom.createdBy,
        createdAt: chatRoom.createdAt,
        participantCount: chatRoom.participants.length
      }
    });

  } catch (error) {
    console.error('Room info error:', error);
    res.status(500).json({
      error: 'Failed to get room info',
      message: 'Internal server error'
    });
  }
});

// Get messages for a chat room
router.get('/room/:inviteCode/messages', authMiddleware, async (req, res) => {
  try {
    const { inviteCode } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    const chatRoom = await ChatRoom.findOne({ inviteCode });
    if (!chatRoom) {
      return res.status(404).json({
        error: 'Chat room not found'
      });
    }

    // Check if user is participant
    if (!chatRoom.participants.includes(req.user.userId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a participant in this chat room'
      });
    }

    const messages = await Message.find({ roomId: chatRoom._id })
      .sort({ timestamp: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    res.json({
      messages: messages.reverse(),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: messages.length === limit
      }
    });

  } catch (error) {
    console.error('Messages fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch messages',
      message: 'Internal server error'
    });
  }
});

// Send message to chat room
router.post('/room/:inviteCode/messages', authMiddleware, async (req, res) => {
  try {
    const { inviteCode } = req.params;
    const { content, type = 'text', fileUrl, fileName, fileSize } = req.body;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Message content cannot be empty'
      });
    }
    
    const chatRoom = await ChatRoom.findOne({ inviteCode });
    if (!chatRoom) {
      return res.status(404).json({
        error: 'Chat room not found'
      });
    }

    // Check if user is participant
    if (!chatRoom.participants.includes(req.user.userId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a participant in this chat room'
      });
    }

    const message = new Message({
      roomId: chatRoom._id,
      senderId: req.user.userId,
      senderUsername: req.user.username,
      content: content.trim(),
      type,
      fileUrl,
      fileName,
      fileSize,
      timestamp: new Date()
    });

    await message.save();

    // Update room's last activity
    chatRoom.lastActivity = new Date();
    await chatRoom.save();

    res.status(201).json({
      message: 'Message sent successfully',
      data: message
    });

  } catch (error) {
    console.error('Message send error:', error);
    res.status(500).json({
      error: 'Failed to send message',
      message: 'Internal server error'
    });
  }
});

// Get user's chat rooms
router.get('/rooms', authMiddleware, async (req, res) => {
  try {
    const chatRooms = await ChatRoom.find({ 
      participants: req.user.userId 
    })
    .sort({ lastActivity: -1 });

    res.json({
      rooms: chatRooms.map(room => ({
        id: room._id,
        inviteCode: room.inviteCode,
        name: room.name,
        participants: room.participants,
        createdBy: room.createdBy,
        createdAt: room.createdAt,
        lastActivity: room.lastActivity,
        participantCount: room.participants.length
      }))
    });

  } catch (error) {
    console.error('Rooms fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch rooms',
      message: 'Internal server error'
    });
  }
});

module.exports = router;