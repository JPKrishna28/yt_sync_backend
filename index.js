const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Create Express app
const app = express();
const server = http.createServer(app);

// Setup CORS
app.use(cors({
  origin: "http://localhost:3000",
  methods: ["GET", "POST"],
  credentials: true
}));

// Create Socket.io server with CORS settings
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Track active rooms and users
const rooms = {};

// Add a simple health check route
app.get('/', (req, res) => {
  res.send('Server is running');
});

// Add a test route for rooms
app.get('/rooms', (req, res) => {
  res.json({
    roomCount: Object.keys(rooms).length,
    rooms: rooms
  });
});

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join a room
  socket.on('join-room', (roomId) => {
    console.log(`Received join-room event for room ${roomId} from user ${socket.id}`);
    
    // Check if room exists and has less than 10 users
    if (!rooms[roomId]) {
      rooms[roomId] = { users: [] };
      console.log(`Created new room: ${roomId}`);
    }

    if (rooms[roomId].users.length >= 10) {
      console.log(`Room ${roomId} is full, rejecting user ${socket.id}`);
      socket.emit('room-full');
      return;
    }

    // Add user to room
    rooms[roomId].users.push(socket.id);
    socket.join(roomId);
    
    // Notify user they've joined successfully
    socket.emit('room-joined', {
      roomId,
      userId: socket.id,
      isFirstUser: rooms[roomId].users.length === 1
    });

    // Notify all users in room about new user
    io.to(roomId).emit('user-connected', {
      roomId,
      usersCount: rooms[roomId].users.length
    });

    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  // Video player events
  socket.on('video-action', (data) => {
    const { roomId, action, currentTime, videoId } = data;
    
    // Broadcast action to other users in the room
    socket.to(roomId).emit('video-action', {
      action,
      currentTime,
      videoId
    });
    
    console.log(`User ${socket.id} in room ${roomId} triggered ${action} at ${currentTime}`);
  });

  // Chat events
  socket.on('chat-message', (messageData) => {
    const { roomId, userId, username, message, timestamp } = messageData;
    
    // Broadcast message to all users in the room (including sender)
    io.to(roomId).emit('chat-message', {
      roomId,
      userId,
      username,
      message,
      timestamp
    });
    
    console.log(`Chat message in room ${roomId} from ${username}: ${message}`);
  });

  // Typing indicators
  socket.on('user-typing', (data) => {
    const { roomId, userId } = data;
    
    // Broadcast typing indicator to other users in the room
    socket.to(roomId).emit('user-typing', {
      userId,
      username: `User ${userId.slice(-4)}`
    });
  });

  socket.on('user-stopped-typing', (data) => {
    const { roomId, userId } = data;
    
    // Broadcast stop typing to other users in the room
    socket.to(roomId).emit('user-stopped-typing', {
      userId,
      username: `User ${userId.slice(-4)}`
    });
  });

  // WebRTC signaling events
  socket.on('call-offer', (data) => {
    const { roomId, offer } = data;
    console.log(`Call offer in room ${roomId}`);
    
    // Forward offer to other users in the room
    socket.to(roomId).emit('call-offer', {
      offer,
      from: socket.id
    });
  });

  socket.on('call-answer', (data) => {
    const { roomId, answer } = data;
    console.log(`Call answer in room ${roomId}`);
    
    // Forward answer to other users in the room
    socket.to(roomId).emit('call-answer', {
      answer,
      from: socket.id
    });
  });

  socket.on('ice-candidate', (data) => {
    const { roomId, candidate } = data;
    console.log(`ICE candidate in room ${roomId}`);
    
    // Forward ICE candidate to other users in the room
    socket.to(roomId).emit('ice-candidate', {
      candidate,
      from: socket.id
    });
  });

  socket.on('call-ended', (data) => {
    const { roomId } = data;
    console.log(`Call ended in room ${roomId}`);
    
    // Notify other users that call ended
    socket.to(roomId).emit('call-ended', {
      from: socket.id
    });
  });

  socket.on('video-toggle', (data) => {
    const { roomId, enabled } = data;
    console.log(`Video toggle in room ${roomId}: ${enabled}`);
    
    // Forward video toggle state to other users
    socket.to(roomId).emit('video-toggle', {
      enabled,
      from: socket.id
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Remove user from all rooms they were part of
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const userIndex = room.users.indexOf(socket.id);
      
      if (userIndex !== -1) {
        room.users.splice(userIndex, 1);
        
        // Notify remaining users
        io.to(roomId).emit('user-disconnected', {
          roomId,
          usersCount: room.users.length
        });
        
        // Clean up empty rooms
        if (room.users.length === 0) {
          delete rooms[roomId];
          console.log(`Room ${roomId} deleted (empty)`);
        }
      }
    }
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
