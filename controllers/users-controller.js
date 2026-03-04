const fs = require("fs");
const { validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/user");

const HttpError = require("../models/http-error");

const getUsers = async (req, res, next) => {
  let users;
  try {
    users = await User.find({}, "-password");
  } catch (err) {
    const error = new HttpError("Could not fetch users, please try again", 500);
    return next(error);
  }

  res.json({ users: users.map((user) => user.toObject({ getters: true })) });
};

const signup = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError("Invalid inputs", 422));
  }

  const { name, email, password } = req.body;

  let existingUser;

  try {
    existingUser = await User.findOne({ email: email });
  } catch (err) {
    const error = new HttpError("Signing up failed, please try again", 500);
    return next(error);
  }

  if (existingUser) {
    const error = new HttpError(
      "User exists already, please login instead",
      422,
    );
    return next(error);
  }

  let hashedPassword;
  try {
    hashedPassword = await bcrypt.hash(password, 12);
  } catch (err) {
    const error = new HttpError("Could not create user, please try again", 500);
    return next(error);
  }

  const createdUser = new User({
    name,
    email,
    image: req.file.path,
    password: hashedPassword,
    places: [],
  });

  try {
    await createdUser.save();
  } catch (err) {
    const error = new HttpError("Signing up failed, please try again", 500);
    return next(error);
  }

  let token;
  try {
    token = jwt.sign(
      { userId: createdUser.id, email: createdUser.email },
      "super_secret_key", // private key
      { expiresIn: "1h" },
    );
  } catch (err) {
    const error = new HttpError("Signing up failed, please try again", 500);
    return next(error);
  }

  res
    .status(201)
    .json({ userId: createdUser.id, email: createdUser.email, token: token });
};

const login = async (req, res, next) => {
  const { email, password } = req.body;

  let existingUser;

  try {
    existingUser = await User.findOne({ email: email });
  } catch (err) {
    const error = new HttpError("Logging in failed, please try again", 500);
    return next(error);
  }

  if (!existingUser) {
    const error = new HttpError("Logging in failed, please try again", 401);
    return next(error);
  }

  let isValidPassword = false;
  try {
    isValidPassword = await bcrypt.compare(password, existingUser.password);
  } catch (err) {
    const error = new HttpError(
      "Could not log you in, please check your credentials",
      500,
    );
    return next(error);
  }

  if (!isValidPassword) {
    const error = new HttpError(
      "Invalid credentials, could not log you in",
      403,
    );
    return next(error);
  }

  let token;
  try {
    token = jwt.sign(
      { userId: existingUser.id, email: existingUser.email },
      "super_secret_key",
      { expiresIn: "1h" },
    );
  } catch (err) {
    const error = new HttpError("Logging in failed, please try again", 500);
    return next(error);
  }

  res.json({
    userId: existingUser.id,
    email: existingUser.email,
    token: token,
  });
};

const getUserById = async (req, res, next) => {
  const userId = req.params.uid;

  let user;
  try {
    user = await User.findById(userId, "-password");
  } catch (err) {
    return next(new HttpError("Fetching user failed, please try again.", 500));
  }

  if (!user) {
    return next(
      new HttpError("Could not find a user for the provided id.", 404),
    );
  }

  res.json({ user: user.toObject({ getters: true }) });
};

const updateUser = async (req, res, next) => {
  const userId = req.params.uid;

  if (req.userData.userId !== userId) {
    return next(new HttpError("You are not allowed to edit this user.", 401));
  }

  let user;
  try {
    user = await User.findById(userId);
  } catch (err) {
    return next(new HttpError("Updating user failed, please try again.", 500));
  }

  if (!user) {
    return next(
      new HttpError("Could not find user for the provided id.", 404),
    );
  }

  const oldImagePath = user.image;

  user.name = req.body.name;
  if (req.file) {
    user.image = req.file.path;
  }

  try {
    await user.save();
  } catch (err) {
    return next(new HttpError("Updating user failed, please try again.", 500));
  }

  if (req.file && oldImagePath) {
    fs.unlink(oldImagePath, (err) => {
      console.log(err);
    });
  }

  res.status(200).json({ user: user.toObject({ getters: true }) });
};

exports.getUsers = getUsers;
exports.getUserById = getUserById;
exports.updateUser = updateUser;
exports.signup = signup;
exports.login = login;
