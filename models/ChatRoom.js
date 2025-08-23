const mongoose = require('mongoose');

const chatRoomSchema = new mongoose.Schema({
  inviteCode: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500,
    default: ''
  },
  participants: [{
    type: String, // Can be ObjectId for registered users or string for guests
    required: true
  }],
  createdBy: {
    type: String, // Can be ObjectId or string for guest creators
    required: true
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  maxParticipants: {
    type: Number,
    default: 100
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  settings: {
    allowFileSharing: {
      type: Boolean,
      default: true
    },
    allowGuestUsers: {
      type: Boolean,
      default: true
    },
    messageRetention: {
      type: Number,
      default: 30 // days
    }
  }
}, {
  timestamps: true
});

// Indexes for performance
chatRoomSchema.index({ inviteCode: 1 });
chatRoomSchema.index({ participants: 1 });
chatRoomSchema.index({ createdBy: 1 });
chatRoomSchema.index({ lastActivity: -1 });

module.exports = mongoose.model('ChatRoom', chatRoomSchema);