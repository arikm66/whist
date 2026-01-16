const request = require('supertest');
const express = require('express');
const authRoutes = require('../../routes/auth');
const User = require('../../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// Mock the User model
jest.mock('../../models/User');

// Mock bcrypt
jest.mock('bcrypt');

// Mock environment variables
process.env.JWT_SECRET = 'test-secret-key';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const newUser = {
        email: 'test@example.com',
        password: 'password123'
      };

      const mockSavedUser = {
        _id: 'user123',
        email: newUser.email,
        password: 'hashedpassword'
      };

      User.findOne.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue('hashedpassword');
      User.mockImplementation(() => ({
        save: jest.fn().mockResolvedValue(mockSavedUser),
        ...mockSavedUser
      }));

      const response = await request(app)
        .post('/api/auth/register')
        .send(newUser)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.email).toBe(newUser.email);
    });

    it('should reject registration with existing email', async () => {
      const existingUser = {
        email: 'existing@example.com',
        password: 'password123'
      };

      User.findOne.mockResolvedValue({ email: existingUser.email });

      const response = await request(app)
        .post('/api/auth/register')
        .send(existingUser)
        .expect(400);

      expect(response.body).toHaveProperty('msg', 'User already exists')
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'password123'
      };

      const mockUser = {
        _id: 'user123',
        email: credentials.email,
        password: 'hashedpassword'
      };

      User.findOne.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/auth/login')
        .send(credentials)
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(credentials.email);
    });
  });
});
