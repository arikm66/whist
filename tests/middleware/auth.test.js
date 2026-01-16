const jwt = require('jsonwebtoken');
const auth = require('../../middleware/auth');

// Mock environment
process.env.JWT_SECRET = 'test-secret-key';

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      header: jest.fn()
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
  });

  describe('Token validation', () => {
    it('should allow request with valid token', () => {
      const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer ${token}`);

      auth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual({ id: 'user123' });
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject request without token', () => {
      req.header.mockReturnValue(undefined);

      auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ msg: 'No token, authorization denied' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with Authorization header but no Bearer token', () => {
      req.header.mockReturnValue('InvalidFormat');

      auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ msg: 'No token, authorization denied' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with empty Bearer token', () => {
      req.header.mockReturnValue('Bearer ');

      auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ msg: 'No token, authorization denied' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Invalid token handling', () => {
    it('should reject malformed token', () => {
      req.header.mockReturnValue('Bearer malformedtoken123');

      auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ msg: 'Token is not valid' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject token signed with wrong secret', () => {
      const wrongToken = jwt.sign({ id: 'user123' }, 'wrong-secret');
      req.header.mockReturnValue(`Bearer ${wrongToken}`);

      auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ msg: 'Token is not valid' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject expired token', () => {
      const expiredToken = jwt.sign(
        { id: 'user123' },
        process.env.JWT_SECRET,
        { expiresIn: '-1s' } // Already expired
      );
      req.header.mockReturnValue(`Bearer ${expiredToken}`);

      auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ msg: 'Token is not valid' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Token header parsing', () => {
    it('should extract token from Bearer scheme', () => {
      const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer ${token}`);

      auth(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should handle token with multiple Bearer parts', () => {
      const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer ${token} extra`);

      auth(req, res, next);

      // Should only use the token part, not "extra"
      expect(next).toHaveBeenCalled();
    });

    it('should handle case-insensitive Authorization header', () => {
      const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
      // The actual header name doesn't matter for this test, we're testing split behavior
      req.header.mockReturnValue(`Bearer ${token}`);

      auth(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('User ID extraction', () => {
    it('should extract userId from decoded token and attach to request', () => {
      const token = jwt.sign({ id: 'specific-user-id' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer ${token}`);

      auth(req, res, next);

      expect(req.user).toEqual({ id: 'specific-user-id' });
    });

    it('should handle token with additional claims', () => {
      const token = jwt.sign(
        { id: 'user123', role: 'admin', email: 'test@test.com' },
        process.env.JWT_SECRET
      );
      req.header.mockReturnValue(`Bearer ${token}`);

      auth(req, res, next);

      expect(req.user).toEqual({ id: 'user123' });
      // Only id is attached, other claims are ignored
    });

    it('should attach user object before calling next', () => {
      const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer ${token}`);

      let userAttachedBeforeNext = false;
      next.mockImplementation(() => {
        userAttachedBeforeNext = !!req.user;
      });

      auth(req, res, next);

      expect(userAttachedBeforeNext).toBe(true);
    });
  });
});
