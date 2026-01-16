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

      expect(response.body).toHaveProperty('msg', 'User already exists');
    });

    it('should reject registration with invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'not-an-email',
          password: 'password123'
        })
        .expect(400);

      expect(response.body).toHaveProperty('errors');
      expect(response.body.errors).toBeInstanceOf(Array);
    });

    it('should reject registration with password < 6 characters', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'short'
        })
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });

    it('should handle server error during registration', async () => {
      User.findOne.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue('hashedpassword');
      User.mockImplementation(() => ({
        save: jest.fn().mockRejectedValue(new Error('DB error'))
      }));

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(500);

      expect(response.body).toHaveProperty('msg', 'Server error');
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

    it('should reject login with invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'not-an-email',
          password: 'password123'
        })
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });

    it('should reject login with non-existent user', async () => {
      User.findOne.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123'
        })
        .expect(400);

      expect(response.body).toHaveProperty('msg', 'Invalid credentials');
    });

    it('should reject login with wrong password', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        password: 'hashedpassword'
      };

      User.findOne.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        })
        .expect(400);

      expect(response.body).toHaveProperty('msg', 'Invalid credentials');
    });

    it('should handle server error during login', async () => {
      User.findOne.mockRejectedValue(new Error('DB error'));

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(500);

      expect(response.body).toHaveProperty('msg', 'Server error');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user with valid token', async () => {
      const mockUser = {
        id: 'user123',
        email: 'test@example.com'
      };

      const validToken = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
      
      // Mock the Mongoose query chain: findById().select()
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.id).toBe('user123');
      expect(response.body.user.email).toBe('test@example.com');
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body).toHaveProperty('msg', 'No token, authorization denied');
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalidtoken')
        .expect(401);

      expect(response.body).toHaveProperty('msg', 'Token is not valid');
    });

    it('should return 404 when user not found', async () => {
      const validToken = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
      
      // Mock the query chain to return null
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('msg', 'User not found');
    });

    it('should handle server error when fetching user', async () => {
      const validToken = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
      
      // Mock the query chain to reject
      User.findById.mockReturnValue({
        select: jest.fn().mockRejectedValue(new Error('DB error'))
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(500);

      expect(response.body).toHaveProperty('msg', 'Server error');
    });
  });
});
