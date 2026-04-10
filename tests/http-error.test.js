const HttpError = require('../models/http-error');

describe('HttpError', () => {
  it('sets message and code', () => {
    const err = new HttpError('Something went wrong', 404);
    expect(err.message).toBe('Something went wrong');
    expect(err.code).toBe(404);
  });

  it('is an instance of Error', () => {
    const err = new HttpError('fail', 500);
    expect(err).toBeInstanceOf(Error);
  });

  it('can be thrown and caught', () => {
    expect(() => {
      throw new HttpError('thrown', 422);
    }).toThrow('thrown');
  });
});
