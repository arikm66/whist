require('dotenv').config();
const { createTestSetup } = require('./helpers/testSetup');
const {
  testLog,
  getRoomsList,
  joinRoom,
  placeAuctionBid,
  passAuction,
  passAuctionFinal,
  delay
} = require('./helpers/socketHelpers');
const { calculateTrickBid } = require('./helpers/biddingHelper');

describe('E2E Whist Game', () => {
    testLog(`=================================================`);
    testLog(`=====     Starting E2E Whist Game tests     =====`);
    testLog(`=================================================`);
    const setup = createTestSetup();
    let dealer;
    const playerHands = [null, null, null, null]; // Store each player's hand
    let currentGame = null; // Store the game state from gameStarted

    afterAll(async () => {
      const skipCleanup = process.env.SKIP_ROOM_CLEANUP === '1';
      await setup.cleanup(skipCleanup);
    });

    describe('Authentication & Connection', () => {
        test('logs in 4 players', async () => {
          const tokens = await setup.loginAllUsers();
          expect(tokens).toHaveLength(4);
          expect(tokens.every(t => t)).toBe(true);
          testLog(`Successfully logged in 4 test users`);
        });

        test('connects 4 socket clients', async () => {
            const clients = await setup.connectAllClients();
            expect(clients).toHaveLength(4);
            clients.forEach((client) => {
                expect(client.connected).toBe(true);
            });
            testLog('All 4 clients connected');
        });
    });

    describe('Room Creation & Setup', () => {
        test('user1 creates a room and all four players join', async () => {
            // Set up listeners for gameStarted event before creating room
            const gameStartedPromises = [];
            for (let i = 0; i < 4; i++) {
                const promise = new Promise((resolve) => {
                    setup.getClient(i).once('gameStarted', (data) => {
                        // Each player receives filtered game with only their own hand
                        playerHands[i] = data.game.players[i].hand;
                        // Store the game state from player 0
                        if (i === 0) {
                            currentGame = data.game;
                        }
                        testLog(`Player ${i} received hand with ${playerHands[i].length} cards`);
                        resolve();
                    });
                });
                gameStartedPromises.push(promise);
            }

            const roomCode = await setup.createRoomAndJoin();
            expect(roomCode).toBeDefined();
            expect(roomCode).toBeTruthy();

            // Wait for all players to receive their gameStarted event
            await Promise.all(gameStartedPromises);

            // Verify each player received a 13-card hand
            for (let i = 0; i < 4; i++) {
                expect(playerHands[i]).toBeDefined();
                expect(playerHands[i]).toHaveLength(13);
                testLog(`Player ${i} hand: ${playerHands[i].join(', ')}`);
            }
        });

        test('dealer in created room is valid', async () => {
            expect(setup.roomCode).toBeTruthy();
            
            const rooms = await getRoomsList(setup.getClient(0));
            expect(rooms).toBeDefined();
            
            const foundRoom = rooms.find(r => r.roomCode === setup.roomCode);
            expect(foundRoom).toBeDefined();
            
            dealer = foundRoom.dealer;
            expect(dealer).toBeDefined();
            expect(typeof dealer).toBe('number');
            expect(dealer).toBeGreaterThanOrEqual(0);
            expect(dealer).toBeLessThan(4);
            
            testLog(`Dealer for room ${setup.roomCode} is: ${dealer}`);
        });
    });

    describe('Auction Phase', () => {
        test('auction proceeds until complete', async () => {
            // Use the game state from gameStarted event
            expect(currentGame).toBeDefined();
            expect(currentGame.auctionCurrentBidder).toBeDefined();
            
            // Set up each player's AI logic that reacts to events
            const auctionNextBidderHandlers = [];
            
            for (let i = 0; i < 4; i++) {
                const client = setup.getClient(i);
                const user = setup.getUser(i);
                
                const handler = (data) => {
                    // Check if it's my turn based on the updated game state
                    if (data.game.auctionCurrentBidder === i) {
                        testLog(`Player ${i} received turn via auctionNextBidder event`);
                        
                        // TODO: Implement player logic (bid or pass)
                        
                        // For now, just pass
                        testLog(`Player ${i} decides to pass`);
                        client.emit('passAuction', { roomCode: setup.roomCode, userId: user.userId });
                    }
                };
                
                auctionNextBidderHandlers.push(handler);
                client.on('auctionNextBidder', handler);
            }
            
            // Trigger the first player to start
            const firstBidderIdx = currentGame.auctionCurrentBidder;
            testLog(`Starting auction, first bidder: Player ${firstBidderIdx}`);
            testLog(`Player ${firstBidderIdx} decides to pass`);
            setup.getClient(firstBidderIdx).emit('passAuction', { 
                roomCode: setup.roomCode, 
                userId: setup.getUser(firstBidderIdx).userId 
            });
            
            // Wait for auction to complete
            const result = await new Promise((resolve) => {
                setup.getClient(0).once('auctionComplete', (data) => {
                    resolve({ type: 'complete', game: data.game });
                });
                setup.getClient(0).once('frishStarted', (data) => {
                    resolve({ type: 'frish', game: data.game });
                });
            });
            
            // Clean up listeners
            for (let i = 0; i < 4; i++) {
                setup.getClient(i).off('auctionNextBidder', auctionNextBidderHandlers[i]);
            }
            
            testLog(`Auction phase completed: ${result.type}`);
            expect(result.type).toBeDefined();
        });
    });

    // TODO: Add more describe blocks as tests are added
    // describe('Bidding Phase', () => { ... });
    // describe('Playing Phase', () => { ... });
    // describe('Scoring & Round Completion', () => { ... });
});