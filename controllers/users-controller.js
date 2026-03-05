const fs = require("fs");
const { validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/user");
const Place = require("../models/place");
const Comment = require("../models/comment");

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
    image: req.body.image,
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
  if (req.body.image) {
    user.image = req.body.image;
  }

  try {
    await user.save();
  } catch (err) {
    return next(new HttpError("Updating user failed, please try again.", 500));
  }

  if (req.body.image && oldImagePath) {
    fs.unlink(oldImagePath, (err) => {
      console.log(err);
    });
  }

  res.status(200).json({ user: user.toObject({ getters: true }) });
};

const getLikedPlaces = async (req, res, next) => {
  const userId = req.params.uid;

  let places;
  try {
    places = await Place.find({ likes: userId });
  } catch (err) {
    return next(
      new HttpError("Fetching liked places failed, please try again.", 500),
    );
  }

  res.json({
    places: places.map((p) => p.toObject({ getters: true })),
  });
};

const changePassword = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError("Invalid inputs", 422));
  }

  const userId = req.params.uid;

  if (req.userData.userId !== userId) {
    return next(
      new HttpError("You are not allowed to change this user's password.", 401),
    );
  }

  const { currentPassword, newPassword } = req.body;

  let user;
  try {
    user = await User.findById(userId);
  } catch (err) {
    return next(
      new HttpError("Changing password failed, please try again.", 500),
    );
  }

  if (!user) {
    return next(new HttpError("Could not find user for the provided id.", 404));
  }

  let isValidPassword;
  try {
    isValidPassword = await bcrypt.compare(currentPassword, user.password);
  } catch (err) {
    return next(
      new HttpError("Changing password failed, please try again.", 500),
    );
  }

  if (!isValidPassword) {
    return next(new HttpError("Current password is incorrect.", 403));
  }

  let hashedPassword;
  try {
    hashedPassword = await bcrypt.hash(newPassword, 12);
  } catch (err) {
    return next(
      new HttpError("Changing password failed, please try again.", 500),
    );
  }

  user.password = hashedPassword;
  try {
    await user.save();
  } catch (err) {
    return next(
      new HttpError("Changing password failed, please try again.", 500),
    );
  }

  res.status(200).json({ message: "Password updated successfully." });
};

const deleteUser = async (req, res, next) => {
  const userId = req.params.uid;

  if (req.userData.userId !== userId) {
    return next(
      new HttpError("You are not allowed to delete this account.", 401),
    );
  }

  let user;
  try {
    user = await User.findById(userId).populate("places");
  } catch (err) {
    return next(
      new HttpError("Deleting account failed, please try again.", 500),
    );
  }

  if (!user) {
    return next(new HttpError("Could not find user for the provided id.", 404));
  }

  const imagePaths = user.places.map((p) => p.image);
  const placeIds = user.places.map((p) => p._id);

  try {
    await Comment.deleteMany({ place: { $in: placeIds } });
    await Place.deleteMany({ creator: userId });
    await user.deleteOne();
  } catch (err) {
    return next(
      new HttpError("Deleting account failed, please try again.", 500),
    );
  }

  imagePaths.forEach((imgPath) => {
    fs.unlink(imgPath, (err) => {
      console.log(err);
    });
  });

  if (user.image) {
    fs.unlink(user.image, (err) => {
      console.log(err);
    });
  }

  res.status(200).json({ message: "Account deleted." });
};

exports.getUsers = getUsers;
exports.getUserById = getUserById;
exports.updateUser = updateUser;
exports.signup = signup;
exports.login = login;
exports.getLikedPlaces = getLikedPlaces;
exports.changePassword = changePassword;
exports.deleteUser = deleteUser;
