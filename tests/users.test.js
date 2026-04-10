const request = require('supertest');
const app = require('../app');
const { connect, disconnect, clearDatabase, generateToken, createUser } = require('./helpers');

beforeAll(connect);
afterAll(disconnect);
beforeEach(clearDatabase);

// ─── Auth ───────────────────────────────────────────────────────────────────

describe('POST /api/users/signup', () => {
  it('creates a new user and returns a token', async () => {
    const res = await request(app)
      .post('/api/users/signup')
      .send({ name: 'Alice', email: 'alice@test.com', password: 'secret1' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.email).toBe('alice@test.com');
    expect(res.body.name).toBe('Alice');
  });

  it('rejects duplicate email with 422', async () => {
    await createUser({ email: 'dup@test.com' });
    const res = await request(app)
      .post('/api/users/signup')
      .send({ name: 'Bob', email: 'dup@test.com', password: 'secret1' });

    expect(res.status).toBe(422);
  });

  it('rejects missing name with 422', async () => {
    const res = await request(app)
      .post('/api/users/signup')
      .send({ email: 'x@test.com', password: 'secret1' });

    expect(res.status).toBe(422);
  });

  it('rejects short password with 422', async () => {
    const res = await request(app)
      .post('/api/users/signup')
      .send({ name: 'Bob', email: 'bob@test.com', password: '12' });

    expect(res.status).toBe(422);
  });
});

describe('POST /api/users/login', () => {
  it('returns a token for valid credentials', async () => {
    await createUser({ email: 'user@test.com', rawPassword: 'password123' });
    const res = await request(app)
      .post('/api/users/login')
      .send({ email: 'user@test.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('returns 401 for unknown email', async () => {
    const res = await request(app)
      .post('/api/users/login')
      .send({ email: 'nobody@test.com', password: 'password123' });

    expect(res.status).toBe(401);
  });

  it('returns 403 for wrong password', async () => {
    await createUser({ email: 'user@test.com', rawPassword: 'password123' });
    const res = await request(app)
      .post('/api/users/login')
      .send({ email: 'user@test.com', password: 'wrongpassword' });

    expect(res.status).toBe(403);
  });
});

// ─── User CRUD ───────────────────────────────────────────────────────────────

describe('GET /api/users', () => {
  it('returns all users without passwords', async () => {
    await createUser({ email: 'a@test.com' });
    await createUser({ email: 'b@test.com' });

    const res = await request(app).get('/api/users');

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(2);
    res.body.users.forEach((u) => expect(u).not.toHaveProperty('password'));
  });
});

describe('GET /api/users/:uid', () => {
  it('returns a user by id', async () => {
    const user = await createUser();
    const res = await request(app).get(`/api/users/${user.id}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user).not.toHaveProperty('password');
  });

  it('returns 404 for a non-existent user', async () => {
    const res = await request(app).get('/api/users/64a1f00000000000000000aa');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/users/:uid', () => {
  it('updates own user', async () => {
    const user = await createUser();
    const token = generateToken(user.id);

    const res = await request(app)
      .patch(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Updated Name');
  });

  it('returns 401 without a token', async () => {
    const user = await createUser();
    const res = await request(app)
      .patch(`/api/users/${user.id}`)
      .send({ name: 'Hacker' });

    expect(res.status).toBe(401);
  });

  it('returns 401 when editing another user', async () => {
    const owner = await createUser({ email: 'owner@test.com' });
    const other = await createUser({ email: 'other@test.com' });
    const token = generateToken(other.id);

    const res = await request(app)
      .patch(`/api/users/${owner.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hacker' });

    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/users/:uid/password', () => {
  it('changes password with correct current password', async () => {
    const user = await createUser({ rawPassword: 'oldpass1' });
    const token = generateToken(user.id);

    const res = await request(app)
      .patch(`/api/users/${user.id}/password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'oldpass1', newPassword: 'newpass1' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/updated/i);
  });

  it('returns 403 for wrong current password', async () => {
    const user = await createUser({ rawPassword: 'oldpass1' });
    const token = generateToken(user.id);

    const res = await request(app)
      .patch(`/api/users/${user.id}/password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrongpass', newPassword: 'newpass1' });

    expect(res.status).toBe(403);
  });

  it('returns 422 for short new password', async () => {
    const user = await createUser({ rawPassword: 'oldpass1' });
    const token = generateToken(user.id);

    const res = await request(app)
      .patch(`/api/users/${user.id}/password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'oldpass1', newPassword: '12' });

    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/users/:uid', () => {
  it('deletes own account', async () => {
    const user = await createUser();
    const token = generateToken(user.id);

    const res = await request(app)
      .delete(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });

  it('returns 401 when deleting another account', async () => {
    const owner = await createUser({ email: 'owner@test.com' });
    const other = await createUser({ email: 'other@test.com' });
    const token = generateToken(other.id);

    const res = await request(app)
      .delete(`/api/users/${owner.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});

// ─── Countries ────────────────────────────────────────────────────────────────

describe('GET /api/users/:uid/countries', () => {
  it('returns empty array for a new user', async () => {
    const user = await createUser();
    const res = await request(app).get(`/api/users/${user.id}/countries`);

    expect(res.status).toBe(200);
    expect(res.body.countries).toHaveLength(0);
  });

  it('returns countries sorted by addedAt descending when unordered', async () => {
    const user = await createUser();
    const token = generateToken(user.id);

    await request(app)
      .post(`/api/users/${user.id}/countries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'France', code: 'FR' });

    await request(app)
      .post(`/api/users/${user.id}/countries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Germany', code: 'DE' });

    const res = await request(app).get(`/api/users/${user.id}/countries`);
    expect(res.status).toBe(200);
    // Most recently added (Germany) should be first
    expect(res.body.countries[0].code).toBe('DE');
  });
});

describe('POST /api/users/:uid/countries', () => {
  it('adds a country', async () => {
    const user = await createUser();
    const token = generateToken(user.id);

    const res = await request(app)
      .post(`/api/users/${user.id}/countries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Japan', code: 'JP' });

    expect(res.status).toBe(201);
    expect(res.body.country.code).toBe('JP');
  });

  it('rejects duplicate country with 422', async () => {
    const user = await createUser();
    const token = generateToken(user.id);

    await request(app)
      .post(`/api/users/${user.id}/countries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Japan', code: 'JP' });

    const res = await request(app)
      .post(`/api/users/${user.id}/countries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Japan', code: 'JP' });

    expect(res.status).toBe(422);
  });

  it('returns 401 without auth', async () => {
    const user = await createUser();
    const res = await request(app)
      .post(`/api/users/${user.id}/countries`)
      .send({ name: 'Japan', code: 'JP' });

    expect(res.status).toBe(401);
  });

  it('returns 401 for another user\'s list', async () => {
    const owner = await createUser({ email: 'owner@test.com' });
    const other = await createUser({ email: 'other@test.com' });
    const token = generateToken(other.id);

    const res = await request(app)
      .post(`/api/users/${owner.id}/countries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Japan', code: 'JP' });

    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/users/:uid/countries/:code', () => {
  it('removes a country', async () => {
    const user = await createUser();
    const token = generateToken(user.id);

    await request(app)
      .post(`/api/users/${user.id}/countries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Brazil', code: 'BR' });

    const res = await request(app)
      .delete(`/api/users/${user.id}/countries/BR`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('returns 404 for a country that doesn\'t exist', async () => {
    const user = await createUser();
    const token = generateToken(user.id);

    const res = await request(app)
      .delete(`/api/users/${user.id}/countries/XX`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/users/:uid/countries/:code', () => {
  it('updates country story and ratings', async () => {
    const user = await createUser();
    const token = generateToken(user.id);

    await request(app)
      .post(`/api/users/${user.id}/countries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Italy', code: 'IT' });

    const res = await request(app)
      .patch(`/api/users/${user.id}/countries/IT`)
      .set('Authorization', `Bearer ${token}`)
      .send({ story: 'Amazing trip!', ratings: { food: 5, nature: 4, cost: 3, transport: 4, shopping: 3 } });

    expect(res.status).toBe(200);
    expect(res.body.country.story).toBe('Amazing trip!');
    expect(res.body.country.ratings.food).toBe(5);
  });
});

describe('PATCH /api/users/:uid/countries/reorder', () => {
  it('reorders countries', async () => {
    const user = await createUser();
    const token = generateToken(user.id);

    await request(app)
      .post(`/api/users/${user.id}/countries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'France', code: 'FR' });

    await request(app)
      .post(`/api/users/${user.id}/countries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Germany', code: 'DE' });

    const res = await request(app)
      .patch(`/api/users/${user.id}/countries/reorder`)
      .set('Authorization', `Bearer ${token}`)
      .send({ codes: ['DE', 'FR'] });

    expect(res.status).toBe(200);

    const listRes = await request(app).get(`/api/users/${user.id}/countries`);
    expect(listRes.body.countries[0].code).toBe('DE');
  });
});

// ─── Wishlist ─────────────────────────────────────────────────────────────────

describe('GET /api/users/:uid/wishlist', () => {
  it('returns an empty wishlist', async () => {
    const user = await createUser();
    const res = await request(app).get(`/api/users/${user.id}/wishlist`);
    expect(res.status).toBe(200);
    expect(res.body.wishlist).toHaveLength(0);
  });
});

describe('POST /api/users/:uid/wishlist', () => {
  it('adds a country to wishlist', async () => {
    const user = await createUser();
    const token = generateToken(user.id);

    const res = await request(app)
      .post(`/api/users/${user.id}/wishlist`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Peru', code: 'PE' });

    expect(res.status).toBe(201);
    expect(res.body.country.code).toBe('PE');
  });

  it('rejects duplicate wishlist entry with 422', async () => {
    const user = await createUser();
    const token = generateToken(user.id);

    await request(app)
      .post(`/api/users/${user.id}/wishlist`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Peru', code: 'PE' });

    const res = await request(app)
      .post(`/api/users/${user.id}/wishlist`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Peru', code: 'PE' });

    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/users/:uid/wishlist/:code', () => {
  it('removes a country from wishlist', async () => {
    const user = await createUser();
    const token = generateToken(user.id);

    await request(app)
      .post(`/api/users/${user.id}/wishlist`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Peru', code: 'PE' });

    const res = await request(app)
      .delete(`/api/users/${user.id}/wishlist/PE`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('returns 404 for a non-existent wishlist entry', async () => {
    const user = await createUser();
    const token = generateToken(user.id);

    const res = await request(app)
      .delete(`/api/users/${user.id}/wishlist/ZZ`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/users/:uid/wishlist/:code/details', () => {
  it('updates notes, priority, and targetYear', async () => {
    const user = await createUser();
    const token = generateToken(user.id);

    await request(app)
      .post(`/api/users/${user.id}/wishlist`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Peru', code: 'PE' });

    const res = await request(app)
      .patch(`/api/users/${user.id}/wishlist/PE/details`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Machu Picchu!', priority: 'high', targetYear: 2027 });

    expect(res.status).toBe(200);
    expect(res.body.country.notes).toBe('Machu Picchu!');
    expect(res.body.country.priority).toBe('high');
    expect(res.body.country.targetYear).toBe(2027);
  });
});

describe('PATCH /api/users/:uid/wishlist/reorder', () => {
  it('reorders wishlist', async () => {
    const user = await createUser();
    const token = generateToken(user.id);

    await request(app)
      .post(`/api/users/${user.id}/wishlist`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Peru', code: 'PE' });

    await request(app)
      .post(`/api/users/${user.id}/wishlist`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Chile', code: 'CL' });

    const res = await request(app)
      .patch(`/api/users/${user.id}/wishlist/reorder`)
      .set('Authorization', `Bearer ${token}`)
      .send({ codes: ['CL', 'PE'] });

    expect(res.status).toBe(200);

    const listRes = await request(app).get(`/api/users/${user.id}/wishlist`);
    expect(listRes.body.wishlist[0].code).toBe('CL');
  });
});

// ─── Follow ───────────────────────────────────────────────────────────────────

describe('POST /api/users/:uid/follow', () => {
  it('follows another user', async () => {
    const follower = await createUser({ email: 'follower@test.com' });
    const target = await createUser({ email: 'target@test.com' });
    const token = generateToken(follower.id);

    const res = await request(app)
      .post(`/api/users/${target.id}/follow`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('returns 422 when trying to follow yourself', async () => {
    const user = await createUser();
    const token = generateToken(user.id);

    const res = await request(app)
      .post(`/api/users/${user.id}/follow`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
  });

  it('returns 422 when already following', async () => {
    const follower = await createUser({ email: 'follower@test.com' });
    const target = await createUser({ email: 'target@test.com' });
    const token = generateToken(follower.id);

    await request(app)
      .post(`/api/users/${target.id}/follow`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/api/users/${target.id}/follow`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/users/:uid/follow', () => {
  it('unfollows a user', async () => {
    const follower = await createUser({ email: 'follower@test.com' });
    const target = await createUser({ email: 'target@test.com' });
    const token = generateToken(follower.id);

    await request(app)
      .post(`/api/users/${target.id}/follow`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .delete(`/api/users/${target.id}/follow`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

// ─── Country Social ───────────────────────────────────────────────────────────

describe('POST /api/users/:uid/countries/:code/like', () => {
  it('toggles a like on a country', async () => {
    const owner = await createUser({ email: 'owner@test.com' });
    const liker = await createUser({ email: 'liker@test.com' });
    const ownerToken = generateToken(owner.id);
    const likerToken = generateToken(liker.id);

    await request(app)
      .post(`/api/users/${owner.id}/countries`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Spain', code: 'ES' });

    const likeRes = await request(app)
      .post(`/api/users/${owner.id}/countries/ES/like`)
      .set('Authorization', `Bearer ${likerToken}`);

    expect(likeRes.status).toBe(200);
    expect(likeRes.body.liked).toBe(true);

    // Toggle off
    const unlikeRes = await request(app)
      .post(`/api/users/${owner.id}/countries/ES/like`)
      .set('Authorization', `Bearer ${likerToken}`);

    expect(unlikeRes.body.liked).toBe(false);
  });
});

describe('POST /api/users/:uid/countries/:code/comments', () => {
  it('adds a comment to a country', async () => {
    const owner = await createUser({ email: 'owner@test.com' });
    const commenter = await createUser({ email: 'commenter@test.com' });
    const ownerToken = generateToken(owner.id);
    const commenterToken = generateToken(commenter.id);

    await request(app)
      .post(`/api/users/${owner.id}/countries`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Spain', code: 'ES' });

    const res = await request(app)
      .post(`/api/users/${owner.id}/countries/ES/comments`)
      .set('Authorization', `Bearer ${commenterToken}`)
      .send({ text: 'Great country!' });

    expect(res.status).toBe(201);
    expect(res.body.comment.text).toBe('Great country!');
  });

  it('rejects empty comment text with 422', async () => {
    const owner = await createUser({ email: 'owner@test.com' });
    const commenter = await createUser({ email: 'commenter@test.com' });
    const ownerToken = generateToken(owner.id);
    const commenterToken = generateToken(commenter.id);

    await request(app)
      .post(`/api/users/${owner.id}/countries`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Spain', code: 'ES' });

    const res = await request(app)
      .post(`/api/users/${owner.id}/countries/ES/comments`)
      .set('Authorization', `Bearer ${commenterToken}`)
      .send({ text: '   ' });

    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/users/:uid/countries/:code/comments/:commentId', () => {
  it('allows the country owner to delete a comment', async () => {
    const owner = await createUser({ email: 'owner@test.com' });
    const commenter = await createUser({ email: 'commenter@test.com' });
    const ownerToken = generateToken(owner.id);
    const commenterToken = generateToken(commenter.id);

    await request(app)
      .post(`/api/users/${owner.id}/countries`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Spain', code: 'ES' });

    const commentRes = await request(app)
      .post(`/api/users/${owner.id}/countries/ES/comments`)
      .set('Authorization', `Bearer ${commenterToken}`)
      .send({ text: 'A comment' });

    const commentId = commentRes.body.comment.id;

    const res = await request(app)
      .delete(`/api/users/${owner.id}/countries/ES/comments/${commentId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
  });

  it('allows the comment author to delete their own comment', async () => {
    const owner = await createUser({ email: 'owner@test.com' });
    const commenter = await createUser({ email: 'commenter@test.com' });
    const ownerToken = generateToken(owner.id);
    const commenterToken = generateToken(commenter.id);

    await request(app)
      .post(`/api/users/${owner.id}/countries`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Spain', code: 'ES' });

    const commentRes = await request(app)
      .post(`/api/users/${owner.id}/countries/ES/comments`)
      .set('Authorization', `Bearer ${commenterToken}`)
      .send({ text: 'My comment' });

    const commentId = commentRes.body.comment.id;

    const res = await request(app)
      .delete(`/api/users/${owner.id}/countries/ES/comments/${commentId}`)
      .set('Authorization', `Bearer ${commenterToken}`);

    expect(res.status).toBe(200);
  });

  it('returns 401 for an unauthorized user', async () => {
    const owner = await createUser({ email: 'owner@test.com' });
    const commenter = await createUser({ email: 'commenter@test.com' });
    const rando = await createUser({ email: 'rando@test.com' });
    const ownerToken = generateToken(owner.id);
    const commenterToken = generateToken(commenter.id);
    const randoToken = generateToken(rando.id);

    await request(app)
      .post(`/api/users/${owner.id}/countries`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Spain', code: 'ES' });

    const commentRes = await request(app)
      .post(`/api/users/${owner.id}/countries/ES/comments`)
      .set('Authorization', `Bearer ${commenterToken}`)
      .send({ text: 'Not mine' });

    const commentId = commentRes.body.comment.id;

    const res = await request(app)
      .delete(`/api/users/${owner.id}/countries/ES/comments/${commentId}`)
      .set('Authorization', `Bearer ${randoToken}`);

    expect(res.status).toBe(401);
  });
});
