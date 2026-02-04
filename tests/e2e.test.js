require('dotenv').config();
const { createTestSetup } = require('./helpers/testSetup');
const {
  testLog,
  getRoomsList,
  placeAuctionBid,
  passAuction,
  passAuctionFinal,
  delay
} = require('./helpers/socketHelpers');
const { calculateTrickBid } = require('./helpers/biddingHelper');

describe('E2E Whist Game', () => {
    testLog(`===== Starting E2E Whist Game tests`);
    const setup = createTestSetup();
    let dealer;
    const playerHands = [null, null, null, null]; // Store each player's hand

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
        test('player after dealer can place first auction bid', async () => {
            expect(typeof dealer).toBe('number');
            const firstBidderIdx = (dealer + 1) % 4;
            const bidValue = 5;
            const bidSuit = 'C';
            
            const bidData = await placeAuctionBid(
                setup.getClient(firstBidderIdx),
                setup.roomCode,
                setup.getUser(firstBidderIdx).userId,
                bidValue,
                bidSuit
            );
            
            expect(bidData).toBeDefined();
            expect(bidData.position).toBe(firstBidderIdx);
            expect(bidData.bid.quantity).toBe(bidValue);
            expect(bidData.bid.suit).toBe(bidSuit);
            testLog(`Player ${firstBidderIdx} placed first auction bid: ${bidValue} ${bidSuit}`);
        });

        test('remaining players pass to complete auction', async () => {
            expect(typeof dealer).toBe('number');
            const firstBidderIdx = (dealer + 1) % 4;
            
            // First 3 players pass (expecting auctionPassed events)
            for (let i = 1; i <= 3; i++) {
                const bidderIdx = (firstBidderIdx + i) % 4;
                await delay(100);
                
                const passData = await passAuction(
                    setup.getClient(bidderIdx),
                    setup.roomCode,
                    setup.getUser(bidderIdx).userId,
                    bidderIdx
                );
                
                expect(passData).toBeDefined();
                expect(passData.position).toBe(bidderIdx);
                testLog(`Player ${bidderIdx} passed auction (pass ${i} of 3)`);
            }
            
            // 4th pass: auction winner passes, triggering auctionComplete
            await delay(100);
            
            const completeData = await passAuctionFinal(
                setup.getClient(firstBidderIdx),
                setup.roomCode,
                setup.getUser(firstBidderIdx).userId
            );
            
            expect(completeData).toBeDefined();
            expect(completeData.game).toBeDefined();
            expect(completeData.game.status).toBe('bidding');
            expect(completeData.game.auctionWinner).toBe(firstBidderIdx);

            // Log recommended bids with trump suit
            const trumpSuit = completeData.game.trumpSuit; // Can be 'S', 'H', 'D', 'C', or null
            testLog(`--- Auction Complete: Winner Player ${firstBidderIdx}, Trump: ${trumpSuit || 'NT'} ---`);
            testLog('--- Recommended Bids (With Trump) ---');
            for (let i = 0; i < 4; i++) {
                if (playerHands[i]) {
                    const { bid, reasoning } = calculateTrickBid(playerHands[i], trumpSuit);
                    testLog(`Player ${i}: Bid ${bid} tricks (${reasoning})`);
                }
            }
        });
    });

    // TODO: Add more describe blocks as tests are added
    // describe('Bidding Phase', () => { ... });
    // describe('Playing Phase', () => { ... });
    // describe('Scoring & Round Completion', () => { ... });
});