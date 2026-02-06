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

// Helper to compare auction bids (C < D < H < S < NT)
function compareAuctionBids(bid1, bid2) {
  const suitRanks = { 'C': 0, 'D': 1, 'H': 2, 'S': 3, 'NT': 4 };
  
  if (bid1.quantity > bid2.quantity) return 1;
  if (bid1.quantity < bid2.quantity) return -1;
  
  const rank1 = suitRanks[bid1.suit];
  const rank2 = suitRanks[bid2.suit];
  
  if (rank1 > rank2) return 1;
  if (rank1 < rank2) return -1;
  return 0;
}

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
            
            // Helper function to calculate and place bid or pass
            const processBidTurn = (playerIdx, game) => {
                const client = setup.getClient(playerIdx);
                const user = setup.getUser(playerIdx);
                
                // Calculate bids for all trump options
                const trumpOptions = ['H', 'D', 'C', 'S', 'NT'];
                const bidEstimates = trumpOptions.map(trump => {
                    const trumpSuit = trump === 'NT' ? null : trump;
                    const result = calculateTrickBid(playerHands[playerIdx], trumpSuit);
                    return {
                        suit: trump,
                        quantity: result.bid
                    };
                });
                
                // Find the best bid considering both quantity and suit strength
                const bestBid = bidEstimates.reduce((max, current) => 
                    compareAuctionBids(current, max) > 0 ? current : max
                );
                
                const currentHighBid = game.auctionHighestBid;
                const isFirstBidder = !currentHighBid;
                
                // Decide whether to bid or pass (minimum 5 tricks, must beat current high bid)
                const meetsMinimum = bestBid.quantity >= 5;
                const shouldBid = meetsMinimum && (isFirstBidder || compareAuctionBids(bestBid, currentHighBid) > 0);
                
                if (shouldBid) {
                    testLog(`Player ${playerIdx} bids ${bestBid.quantity} tricks with ${bestBid.suit}`);
                    client.emit('placeAuctionBid', { 
                        roomCode: setup.roomCode, 
                        userId: user.userId,
                        quantity: bestBid.quantity,
                        suit: bestBid.suit
                    });
                } else {
                    const highBidStr = currentHighBid ? `${currentHighBid.quantity} ${currentHighBid.suit}` : 'none';
                    testLog(`Player ${playerIdx} decides to pass (best: ${bestBid.quantity} ${bestBid.suit}, current high: ${highBidStr})`);
                    client.emit('passAuction', { roomCode: setup.roomCode, userId: user.userId });
                }
            };
            
            // Set up handlers for each player that call the helper function
            for (let i = 0; i < 4; i++) {
                const handler = (data) => {
                    if (data.game.auctionCurrentBidder === i) {
                        processBidTurn(i, data.game);
                    }
                };
                
                auctionNextBidderHandlers.push(handler);
                setup.getClient(i).on('auctionNextBidder', handler);
            }
            
            // Trigger the first player to start
            testLog(`Starting auction, first bidder: Player ${currentGame.auctionCurrentBidder}`);
            processBidTurn(currentGame.auctionCurrentBidder, currentGame)
            
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
            
            if (result.type === 'complete') {
                const winningBid = result.game.auctionHighestBid;
                const winner = result.game.auctionWinner;
                testLog(`Auction phase completed: Player ${winner} won with ${winningBid.quantity} ${winningBid.suit}`);
            } else {
                testLog(`Auction phase completed: Frish - all players passed`);
            }
            expect(result.type).toBeDefined();
        });
    });

    // TODO: Add more describe blocks as tests are added
    // describe('Bidding Phase', () => { ... });
    // describe('Playing Phase', () => { ... });
    // describe('Scoring & Round Completion', () => { ... });
});