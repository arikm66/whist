const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error(err));

// API Routes
const authRoutes = require('./routes/auth');
const itemsRoutes = require('./routes/items');

app.use('/api/auth', authRoutes);
app.use('/api/items', itemsRoutes);

// 3. Serve Frontend (Vite specific)
// This part tells Node to serve the React files after you run 'npm run build' in the client folder
if (process.env.NODE_ENV === 'production') {
  // Serve the static files from the Vite build folder
  app.use(express.static(path.join(__dirname, 'client/dist')));

  // Handle any requests that don't match the ones above by sending back the index.html file
  app.get('/*splat', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
  });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 5000;
// Socket.io game logic
require('./sockets/gameSocket')(io);

httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));