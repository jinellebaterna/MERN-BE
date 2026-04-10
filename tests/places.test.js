const request = require('supertest');
const app = require('../app');
const Place = require('../models/place');
const { connect, disconnect, clearDatabase, generateToken, createUser } = require('./helpers');

// Prevent actual geocoding calls during tests
global.fetch = jest.fn().mockResolvedValue({
  json: jest.fn().mockResolvedValue([]),
});

beforeAll(connect);
afterAll(disconnect);
beforeEach(clearDatabase);

// Helper: creates a place directly in the DB
const createPlace = async (creatorId, overrides = {}) => {
  const place = new Place({
    title: overrides.title || 'Test Place',
    description: overrides.description || 'A nice spot to visit',
    images: overrides.images || ['img/test.jpg'],
    address: overrides.address || '123 Main St',
    creator: creatorId,
    tags: overrides.tags || [],
  });
  await place.save();
  return place;
};

// ─── Search & list ────────────────────────────────────────────────────────────

describe('GET /api/places', () => {
  it('returns all places when no filters are given', async () => {
    const user = await createUser();
    await createPlace(user.id, { title: 'Place A' });
    await createPlace(user.id, { title: 'Place B' });

    const res = await request(app).get('/api/places');
    expect(res.status).toBe(200);
    expect(res.body.places).toHaveLength(2);
    expect(res.body.totalCount).toBe(2);
  });

  it('filters by search term (title)', async () => {
    const user = await createUser();
    await createPlace(user.id, { title: 'Eiffel Tower' });
    await createPlace(user.id, { title: 'Big Ben' });

    const res = await request(app).get('/api/places?search=Eiffel');
    expect(res.status).toBe(200);
    expect(res.body.places).toHaveLength(1);
    expect(res.body.places[0].title).toBe('Eiffel Tower');
  });

  it('filters by creator', async () => {
    const user1 = await createUser({ email: 'u1@test.com' });
    const user2 = await createUser({ email: 'u2@test.com' });
    await createPlace(user1.id);
    await createPlace(user2.id);

    const res = await request(app).get(`/api/places?creator=${user1.id}`);
    expect(res.status).toBe(200);
    expect(res.body.places).toHaveLength(1);
  });

  it('filters by tag', async () => {
    const user = await createUser();
    await createPlace(user.id, { tags: ['beach'] });
    await createPlace(user.id, { tags: ['mountain'] });

    const res = await request(app).get('/api/places?tag=beach');
    expect(res.status).toBe(200);
    expect(res.body.places).toHaveLength(1);
  });

  it('paginates results', async () => {
    const user = await createUser();
    for (let i = 0; i < 5; i++) {
      await createPlace(user.id, { title: `Place ${i}` });
    }

    const res = await request(app).get('/api/places?page=1&limit=2');
    expect(res.status).toBe(200);
    expect(res.body.places).toHaveLength(2);
    expect(res.body.totalPages).toBe(3);
  });
});

describe('GET /api/places/popular', () => {
  it('returns places sorted by like count', async () => {
    const user = await createUser();
    const p1 = await createPlace(user.id, { title: 'Popular' });
    const p2 = await createPlace(user.id, { title: 'Unknown' });

    // Give p1 a like directly
    p1.likes.push(user._id);
    await p1.save();

    const res = await request(app).get('/api/places/popular');
    expect(res.status).toBe(200);
    expect(res.body.places[0].title).toBe('Popular');
  });
});

// ─── Place CRUD ───────────────────────────────────────────────────────────────

describe('GET /api/places/:pid', () => {
  it('returns a place by id', async () => {
    const user = await createUser();
    const place = await createPlace(user.id);

    const res = await request(app).get(`/api/places/${place.id}`);
    expect(res.status).toBe(200);
    expect(res.body.place.id).toBe(place.id);
  });

  it('returns 404 for a non-existent place', async () => {
    const res = await request(app).get('/api/places/64a1f00000000000000000bb');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/places', () => {
  it('creates a place', async () => {
    const user = await createUser();
    const token = generateToken(user.id);

    const res = await request(app)
      .post('/api/places')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'New Spot',
        description: 'A great place to visit',
        address: 'Tokyo, Japan',
        images: ['img/new.jpg'],
        creator: user.id,
      });

    expect(res.status).toBe(201);
    expect(res.body.place.title).toBe('New Spot');
  });

  it('returns 422 when images are missing', async () => {
    const user = await createUser();
    const token = generateToken(user.id);

    const res = await request(app)
      .post('/api/places')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'New Spot',
        description: 'A great place to visit',
        address: 'Tokyo, Japan',
        images: [],
        creator: user.id,
      });

    expect(res.status).toBe(422);
  });

  it('returns 422 when title is missing', async () => {
    const user = await createUser();
    const token = generateToken(user.id);

    const res = await request(app)
      .post('/api/places')
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'A great place to visit',
        address: 'Tokyo, Japan',
        images: ['img/new.jpg'],
        creator: user.id,
      });

    expect(res.status).toBe(422);
  });

  it('returns 401 without auth', async () => {
    const user = await createUser();
    const res = await request(app)
      .post('/api/places')
      .send({ title: 'Spot', description: 'Nice place', address: 'Tokyo', images: ['img/x.jpg'], creator: user.id });

    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/places/:pid', () => {
  it('updates a place', async () => {
    const user = await createUser();
    const token = generateToken(user.id);
    const place = await createPlace(user.id);

    const res = await request(app)
      .patch(`/api/places/${place.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated Title', description: 'Updated description text' });

    expect(res.status).toBe(200);
    expect(res.body.place.title).toBe('Updated Title');
  });

  it('returns 401 when updating another user\'s place', async () => {
    const owner = await createUser({ email: 'owner@test.com' });
    const other = await createUser({ email: 'other@test.com' });
    const otherToken = generateToken(other.id);
    const place = await createPlace(owner.id);

    const res = await request(app)
      .patch(`/api/places/${place.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'Hacked', description: 'Updated description text' });

    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/places/:pid', () => {
  it('deletes a place', async () => {
    const user = await createUser();
    const token = generateToken(user.id);
    const place = await createPlace(user.id);

    const res = await request(app)
      .delete(`/api/places/${place.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });

  it('returns 404 for a non-existent place', async () => {
    const user = await createUser();
    const token = generateToken(user.id);

    const res = await request(app)
      .delete('/api/places/64a1f00000000000000000bb')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('returns 401 when deleting another user\'s place', async () => {
    const owner = await createUser({ email: 'owner@test.com' });
    const other = await createUser({ email: 'other@test.com' });
    const otherToken = generateToken(other.id);
    const place = await createPlace(owner.id);

    const res = await request(app)
      .delete(`/api/places/${place.id}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(401);
  });
});

// ─── Likes ────────────────────────────────────────────────────────────────────

describe('POST /api/places/:pid/like', () => {
  it('likes a place', async () => {
    const owner = await createUser({ email: 'owner@test.com' });
    const liker = await createUser({ email: 'liker@test.com' });
    const place = await createPlace(owner.id);
    const token = generateToken(liker.id);

    const res = await request(app)
      .post(`/api/places/${place.id}/like`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.likes).toHaveLength(1);
  });

  it('returns 422 when already liked', async () => {
    const owner = await createUser({ email: 'owner@test.com' });
    const liker = await createUser({ email: 'liker@test.com' });
    const place = await createPlace(owner.id);
    const token = generateToken(liker.id);

    await request(app)
      .post(`/api/places/${place.id}/like`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/api/places/${place.id}/like`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/places/:pid/like', () => {
  it('unlikes a place', async () => {
    const owner = await createUser({ email: 'owner@test.com' });
    const liker = await createUser({ email: 'liker@test.com' });
    const place = await createPlace(owner.id);
    const token = generateToken(liker.id);

    await request(app)
      .post(`/api/places/${place.id}/like`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .delete(`/api/places/${place.id}/like`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.likes).toHaveLength(0);
  });

  it('returns 422 when not previously liked', async () => {
    const owner = await createUser({ email: 'owner@test.com' });
    const user = await createUser({ email: 'user@test.com' });
    const place = await createPlace(owner.id);
    const token = generateToken(user.id);

    const res = await request(app)
      .delete(`/api/places/${place.id}/like`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
  });
});

// ─── Comments ─────────────────────────────────────────────────────────────────

describe('GET /api/places/:pid/comments', () => {
  it('returns an empty list for a new place', async () => {
    const user = await createUser();
    const place = await createPlace(user.id);

    const res = await request(app).get(`/api/places/${place.id}/comments`);
    expect(res.status).toBe(200);
    expect(res.body.comments).toHaveLength(0);
  });
});

describe('POST /api/places/:pid/comments', () => {
  it('adds a comment', async () => {
    const owner = await createUser({ email: 'owner@test.com' });
    const commenter = await createUser({ email: 'commenter@test.com' });
    const place = await createPlace(owner.id);
    const token = generateToken(commenter.id);

    const res = await request(app)
      .post(`/api/places/${place.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Loved this place!' });

    expect(res.status).toBe(201);
    expect(res.body.comment.text).toBe('Loved this place!');
  });
});

describe('DELETE /api/places/:pid/comments/:cid', () => {
  it('allows the comment author to delete their comment', async () => {
    const owner = await createUser({ email: 'owner@test.com' });
    const commenter = await createUser({ email: 'commenter@test.com' });
    const place = await createPlace(owner.id);
    const token = generateToken(commenter.id);

    const commentRes = await request(app)
      .post(`/api/places/${place.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'My comment' });

    const commentId = commentRes.body.comment.id;

    const res = await request(app)
      .delete(`/api/places/${place.id}/comments/${commentId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('returns 401 when another user tries to delete the comment', async () => {
    const owner = await createUser({ email: 'owner@test.com' });
    const commenter = await createUser({ email: 'commenter@test.com' });
    const rando = await createUser({ email: 'rando@test.com' });
    const place = await createPlace(owner.id);
    const commenterToken = generateToken(commenter.id);
    const randoToken = generateToken(rando.id);

    const commentRes = await request(app)
      .post(`/api/places/${place.id}/comments`)
      .set('Authorization', `Bearer ${commenterToken}`)
      .send({ text: 'Not yours' });

    const commentId = commentRes.body.comment.id;

    const res = await request(app)
      .delete(`/api/places/${place.id}/comments/${commentId}`)
      .set('Authorization', `Bearer ${randoToken}`);

    expect(res.status).toBe(401);
  });
});
