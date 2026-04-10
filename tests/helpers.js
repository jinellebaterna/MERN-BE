const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/user');

let mongod;

const connect = async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
};

const disconnect = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await mongod.stop();
};

const clearDatabase = async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
};

const generateToken = (userId) =>
  jwt.sign({ userId: userId.toString() }, 'super_secret_key', { expiresIn: '1h' });

const createUser = async ({ name = 'Test User', email = 'test@test.com', rawPassword = 'password123' } = {}) => {
  const hashedPassword = await bcrypt.hash(rawPassword, 12);
  const user = new User({ name, email, password: hashedPassword });
  await user.save();
  return user;
};

module.exports = { connect, disconnect, clearDatabase, generateToken, createUser };
