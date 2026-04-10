const jwt = require('jsonwebtoken');
const checkAuth = require('../middleware/check-auth');

const SECRET = 'super_secret_key';

const mockReqResWith = (headers = {}, method = 'GET') => {
  const req = { method, headers };
  const res = {};
  const next = jest.fn();
  return { req, res, next };
};

describe('checkAuth middleware', () => {
  it('passes OPTIONS requests without checking token', () => {
    const { req, res, next } = mockReqResWith({}, 'OPTIONS');
    checkAuth(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('sets req.userData and calls next for a valid token', () => {
    const token = jwt.sign({ userId: 'user123' }, SECRET, { expiresIn: '1h' });
    const { req, res, next } = mockReqResWith({ authorization: `Bearer ${token}` });
    checkAuth(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.userData).toEqual({ userId: 'user123' });
  });

  it('calls next with 401 HttpError when Authorization header is missing', () => {
    const { req, res, next } = mockReqResWith({});
    checkAuth(req, res, next);
    const [error] = next.mock.calls[0];
    expect(error.code).toBe(401);
    expect(error.message).toMatch(/authentication failed/i);
  });

  it('calls next with 401 HttpError for an invalid token', () => {
    const { req, res, next } = mockReqResWith({ authorization: 'Bearer badtoken' });
    checkAuth(req, res, next);
    const [error] = next.mock.calls[0];
    expect(error.code).toBe(401);
  });

  it('calls next with 401 HttpError for an expired token', () => {
    const token = jwt.sign({ userId: 'user123' }, SECRET, { expiresIn: '-1s' });
    const { req, res, next } = mockReqResWith({ authorization: `Bearer ${token}` });
    checkAuth(req, res, next);
    const [error] = next.mock.calls[0];
    expect(error.code).toBe(401);
  });
});
