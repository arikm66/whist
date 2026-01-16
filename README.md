# Whist Card Game

A full-stack multiplayer Whist card game built with React, Node.js, Express, Socket.IO, and MongoDB.

## Features

- Real-time multiplayer gameplay
- User authentication and registration
- Game rooms with unique room codes
- Auction and bidding phases
- Full Whist game logic implementation
- Responsive UI

## Tech Stack

### Backend
- Node.js & Express
- MongoDB with Mongoose
- Socket.IO for real-time communication
- JWT for authentication
- bcrypt for password hashing

### Frontend
- React 19
- Vite
- React Router
- Socket.IO Client
- Axios

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- MongoDB (local or MongoDB Atlas)
- npm

### Installation

1. Clone the repository and install dependencies:
```bash
npm run install-all
```

This will install backend dependencies, frontend dependencies, and build the client.

2. Create a `.env` file in the root directory:
```env
PORT=3000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
NODE_ENV=development
```

### Running the Application

#### Development Mode

Run backend server (with auto-reload):
```bash
npm run dev
```

Run frontend development server (in a separate terminal):
```bash
npm run client
```

#### Production Mode

Build and start:
```bash
npm run build
npm start
```

The backend server will serve the built React app.

## Testing

### Backend Tests (Jest)

Run all backend tests:
```bash
npm test
```

Run tests with coverage:
```bash
npm run test:coverage
```

Run tests in watch mode:
```bash
npm run test:watch
```

### Frontend Tests (Vitest)

Run all frontend tests:
```bash
cd client
npm test
```

Run tests with UI:
```bash
cd client
npm run test:ui
```

Run tests with coverage:
```bash
cd client
npm run test:coverage
```

## Project Structure

```
whist/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── context/       # React context providers
│   │   ├── services/      # API and socket services
│   │   └── test/          # Test setup
│   └── package.json
├── middleware/            # Express middleware
├── models/               # Mongoose models
├── routes/               # Express routes
├── sockets/              # Socket.IO event handlers
├── tests/                # Backend tests
├── utils/                # Utility functions (game logic)
├── server.js             # Express server entry point
└── package.json          # Backend dependencies

```

## Game Rules

Whist is a classic trick-taking card game for 4 players. The game includes:

1. **Auction Phase**: Players bid to determine trump suit
2. **Bidding Phase**: Players bid on number of tricks they'll win
3. **Playing Phase**: Players play cards to win tricks
4. **Scoring**: Points awarded based on bids and tricks won

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (requires auth)

### Socket Events
- `createRoom` - Create a new game room
- `joinRoom` - Join an existing room
- `startGame` - Start the game (4 players required)
- `placeBid` - Place a bid during bidding phase
- `playCard` - Play a card during playing phase

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

ISC
