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

  res.status(201).json({
    userId: createdUser.id,
    email: createdUser.email,
    token: token,
    name: createdUser.name,
    image: createdUser.image,
  });
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
    name: existingUser.name,
    image: existingUser.image,
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
    return next(new HttpError("Could not find user for the provided id.", 404));
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
  const countryImagePaths = user.countries.flatMap((c) => c.images);
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

  countryImagePaths.forEach((imgPath) => {
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

const getCountries = async (req, res, next) => {
  const userId = req.params.uid;

  let user;
  try {
    user = await User.findById(userId, "countries");
  } catch (err) {
    return next(
      new HttpError("Fetching countries failed, please try again.", 500),
    );
  }

  if (!user) {
    return next(new HttpError("Could not find user for the provided id.", 404));
  }

  const anyOrdered = user.countries.some(
    (c) => c.order !== null && c.order !== undefined,
  );
  const sorted = [...user.countries].sort((a, b) =>
    anyOrdered
      ? (a.order ?? 999999) - (b.order ?? 999999)
      : new Date(b.addedAt) - new Date(a.addedAt),
  );

  res.json({ countries: sorted.map((c) => c.toObject({ getters: true })) });
};

const addCountry = async (req, res, next) => {
  const userId = req.params.uid;

  if (req.userData.userId !== userId) {
    return next(
      new HttpError(
        "You are not allowed to modify this user's countries.",
        401,
      ),
    );
  }

  const { name, code } = req.body;
  if (!name || !code) {
    return next(new HttpError("Name and code are required.", 422));
  }

  let user;
  try {
    user = await User.findById(userId);
  } catch (err) {
    return next(new HttpError("Adding country failed, please try again.", 500));
  }

  if (!user) {
    return next(new HttpError("Could not find user for the provided id.", 404));
  }

  if (user.countries.some((c) => c.code === code)) {
    return next(new HttpError("Country already added.", 422));
  }

  user.countries.push({ name, code, images: [], addedAt: new Date() });

  try {
    await user.save();
  } catch (err) {
    return next(new HttpError("Adding country failed, please try again.", 500));
  }

  const added = user.countries[user.countries.length - 1];
  res.status(201).json({ country: added.toObject({ getters: true }) });
};

const removeCountry = async (req, res, next) => {
  const { uid: userId, code } = req.params;

  if (req.userData.userId !== userId) {
    return next(
      new HttpError(
        "You are not allowed to modify this user's countries.",
        401,
      ),
    );
  }

  let user;
  try {
    user = await User.findById(userId);
  } catch (err) {
    return next(
      new HttpError("Removing country failed, please try again.", 500),
    );
  }

  if (!user) {
    return next(new HttpError("Could not find user for the provided id.", 404));
  }

  const country = user.countries.find((c) => c.code === code);
  if (!country) {
    return next(new HttpError("Country not found.", 404));
  }

  const imagePaths = [...country.images];
  user.countries.pull({ _id: country._id });

  try {
    await user.save();
  } catch (err) {
    return next(
      new HttpError("Removing country failed, please try again.", 500),
    );
  }

  imagePaths.forEach((imgPath) => {
    fs.unlink(imgPath, (err) => {
      console.log(err);
    });
  });

  res.status(200).json({ message: "Country removed." });
};

const updateCountryImages = async (req, res, next) => {
  const { uid: userId, code } = req.params;

  if (req.userData.userId !== userId) {
    return next(
      new HttpError(
        "You are not allowed to modify this user's countries.",
        401,
      ),
    );
  }

  const { addImages = [], removeImages = [] } = req.body;

  let user;
  try {
    user = await User.findById(userId);
  } catch (err) {
    return next(
      new HttpError("Updating images failed, please try again.", 500),
    );
  }

  if (!user) {
    return next(new HttpError("Could not find user for the provided id.", 404));
  }

  const country = user.countries.find((c) => c.code === code);
  if (!country) {
    return next(new HttpError("Country not found.", 404));
  }

  country.images = [
    ...country.images.filter((img) => !removeImages.includes(img)),
    ...addImages,
  ];

  try {
    await user.save();
  } catch (err) {
    return next(
      new HttpError("Updating images failed, please try again.", 500),
    );
  }

  removeImages.forEach((imgPath) => {
    fs.unlink(imgPath, (err) => {
      console.log(err);
    });
  });

  res.status(200).json({ country: country.toObject({ getters: true }) });
};

const updateCountry = async (req, res, next) => {
  const { uid: userId, code } = req.params;

  if (req.userData.userId !== userId) {
    return next(
      new HttpError(
        "You are not allowed to modify this user's countries.",
        401,
      ),
    );
  }

  const { story, cities, ratings, visitedAt } = req.body;

  let user;
  try {
    user = await User.findById(userId);
  } catch (err) {
    return next(
      new HttpError("Updating country failed, please try again.", 500),
    );
  }

  if (!user) {
    return next(new HttpError("Could not find user for the provided id.", 404));
  }

  const country = user.countries.find((c) => c.code === code);
  if (!country) {
    return next(new HttpError("Country not found.", 404));
  }

  if (story !== undefined) country.story = story;
  if (cities !== undefined) country.cities = cities;
  if (ratings !== undefined) {
    country.ratings = {
      food: ratings.food ?? country.ratings?.food ?? 0,
      nature: ratings.nature ?? country.ratings?.nature ?? 0,
      cost: ratings.cost ?? country.ratings?.cost ?? 0,
      transport: ratings.transport ?? country.ratings?.transport ?? 0,
      shopping: ratings.shopping ?? country.ratings?.shopping ?? 0,
    };
  }
  if (visitedAt !== undefined)
    country.visitedAt = visitedAt ? new Date(visitedAt) : null;

  try {
    await user.save();
  } catch (err) {
    return next(
      new HttpError("Updating country failed, please try again.", 500),
    );
  }

  res.status(200).json({ country: country.toObject({ getters: true }) });
};

const getWishlist = async (req, res, next) => {
  const userId = req.params.uid;
  let user;
  try {
    user = await User.findById(userId, "wishlist");
  } catch (err) {
    return next(
      new HttpError("Fetching wishlist failed, please try again.", 500),
    );
  }
  if (!user) return next(new HttpError("User not found.", 404));
  const anyOrdered = user.wishlist.some(
    (c) => c.order !== null && c.order !== undefined,
  );
  const sorted = [...user.wishlist].sort((a, b) =>
    anyOrdered
      ? (a.order ?? 999999) - (b.order ?? 999999)
      : new Date(b.addedAt) - new Date(a.addedAt),
  );
  res.json({ wishlist: sorted.map((c) => c.toObject({ getters: true })) });
};

const addToWishlist = async (req, res, next) => {
  const userId = req.params.uid;
  if (req.userData.userId !== userId)
    return next(new HttpError("Not authorized.", 401));
  const { name, code } = req.body;
  if (!name || !code)
    return next(new HttpError("Name and code are required.", 422));
  let user;
  try {
    user = await User.findById(userId);
  } catch (err) {
    return next(
      new HttpError("Adding to wishlist failed, please try again.", 500),
    );
  }
  if (!user) return next(new HttpError("User not found.", 404));
  if (user.wishlist.some((c) => c.code === code))
    return next(new HttpError("Country already in wishlist.", 422));
  user.wishlist.push({ name, code, addedAt: new Date() });
  try {
    await user.save();
  } catch (err) {
    return next(
      new HttpError("Adding to wishlist failed, please try again.", 500),
    );
  }
  const added = user.wishlist[user.wishlist.length - 1];
  res.status(201).json({ country: added.toObject({ getters: true }) });
};

const removeFromWishlist = async (req, res, next) => {
  const { uid: userId, code } = req.params;
  if (req.userData.userId !== userId)
    return next(new HttpError("Not authorized.", 401));
  let user;
  try {
    user = await User.findById(userId);
  } catch (err) {
    return next(
      new HttpError("Removing from wishlist failed, please try again.", 500),
    );
  }
  if (!user) return next(new HttpError("User not found.", 404));
  const country = user.wishlist.find((c) => c.code === code);
  if (!country)
    return next(new HttpError("Country not found in wishlist.", 404));
  user.wishlist.pull({ _id: country._id });
  try {
    await user.save();
  } catch (err) {
    return next(
      new HttpError("Removing from wishlist failed, please try again.", 500),
    );
  }
  res.status(200).json({ message: "Removed from wishlist." });
};

const reorderCountries = async (req, res, next) => {
  const userId = req.params.uid;
  if (req.userData.userId !== userId)
    return next(new HttpError("Not authorized.", 401));
  const { codes } = req.body;
  let user;
  try {
    user = await User.findById(userId);
  } catch (err) {
    return next(new HttpError("Could not find user.", 500));
  }
  codes.forEach((code, index) => {
    const country = user.countries.find((c) => c.code === code);
    if (country) country.order = index;
  });
  try {
    await user.save();
  } catch (err) {
    return next(new HttpError("Reordering failed.", 500));
  }
  res.json({ message: "Order updated." });
};

const reorderWishlist = async (req, res, next) => {
  const userId = req.params.uid;
  if (req.userData.userId !== userId)
    return next(new HttpError("Not authorized.", 401));
  const { codes } = req.body;
  let user;
  try {
    user = await User.findById(userId);
  } catch (err) {
    return next(new HttpError("Could not find user.", 500));
  }
  codes.forEach((code, index) => {
    const country = user.wishlist.find((c) => c.code === code);
    if (country) country.order = index;
  });
  try {
    await user.save();
  } catch (err) {
    return next(new HttpError("Reordering failed.", 500));
  }
  res.json({ message: "Order updated." });
};

exports.getUsers = getUsers;
exports.getUserById = getUserById;
exports.updateUser = updateUser;
exports.signup = signup;
exports.login = login;
exports.getLikedPlaces = getLikedPlaces;
exports.changePassword = changePassword;
exports.deleteUser = deleteUser;
exports.getCountries = getCountries;
exports.addCountry = addCountry;
exports.removeCountry = removeCountry;
exports.updateCountryImages = updateCountryImages;
exports.updateCountry = updateCountry;
exports.getWishlist = getWishlist;
exports.addToWishlist = addToWishlist;
exports.removeFromWishlist = removeFromWishlist;
exports.reorderCountries = reorderCountries;
exports.reorderWishlist = reorderWishlist;

const updateWishlistDetails = async (req, res, next) => {
  const { uid: userId, code } = req.params;
  if (req.userData.userId !== userId)
    return next(new HttpError("Not authorized.", 401));
  const { notes, priority, targetYear } = req.body;
  let user;
  try {
    user = await User.findById(userId);
  } catch (err) {
    return next(new HttpError("Could not find user.", 500));
  }
  if (!user) return next(new HttpError("User not found.", 404));
  const country = user.wishlist.find((c) => c.code === code);
  if (!country)
    return next(new HttpError("Country not found in wishlist.", 404));
  if (notes !== undefined) country.notes = notes;
  if (priority !== undefined) country.priority = priority;
  if (targetYear !== undefined) country.targetYear = targetYear;
  try {
    await user.save();
  } catch (err) {
    return next(new HttpError("Saving details failed.", 500));
  }
  res.json({ country: country.toObject({ getters: true }) });
};

exports.updateWishlistDetails = updateWishlistDetails;

const followUser = async (req, res, next) => {
  const { uid: targetId } = req.params;
  const followerId = req.userData.userId;

  if (followerId === targetId)
    return next(new HttpError("You cannot follow yourself.", 422));

  let follower, target;
  try {
    [follower, target] = await Promise.all([
      User.findById(followerId),
      User.findById(targetId),
    ]);
  } catch (err) {
    return next(new HttpError("Follow failed, please try again.", 500));
  }

  if (!follower || !target) return next(new HttpError("User not found.", 404));

  if (follower.following.includes(targetId))
    return next(new HttpError("Already following this user.", 422));

  follower.following.push(targetId);
  target.followers.push(followerId);

  try {
    await Promise.all([follower.save(), target.save()]);
  } catch (err) {
    return next(new HttpError("Follow failed, please try again.", 500));
  }

  res.status(200).json({ message: "Followed successfully." });
};

const unfollowUser = async (req, res, next) => {
  const { uid: targetId } = req.params;
  const followerId = req.userData.userId;

  let follower, target;
  try {
    [follower, target] = await Promise.all([
      User.findById(followerId),
      User.findById(targetId),
    ]);
  } catch (err) {
    return next(new HttpError("Unfollow failed, please try again.", 500));
  }

  if (!follower || !target) return next(new HttpError("User not found.", 404));

  follower.following.pull(targetId);
  target.followers.pull(followerId);

  try {
    await Promise.all([follower.save(), target.save()]);
  } catch (err) {
    return next(new HttpError("Unfollow failed, please try again.", 500));
  }

  res.status(200).json({ message: "Unfollowed successfully." });
};

const toggleLikeCountry = async (req, res, next) => {
  const { uid: userId, code } = req.params;
  const likerId = req.userData.userId;

  let user;
  try {
    user = await User.findById(userId);
  } catch (err) {
    return next(new HttpError("Like failed, please try again.", 500));
  }

  if (!user) return next(new HttpError("User not found.", 404));

  const country = user.countries.find((c) => c.code === code);
  if (!country) return next(new HttpError("Country not found.", 404));

  const alreadyLiked = country.likes.includes(likerId);
  if (alreadyLiked) {
    country.likes.pull(likerId);
  } else {
    country.likes.push(likerId);
  }

  try {
    await user.save();
  } catch (err) {
    return next(new HttpError("Like failed, please try again.", 500));
  }

  res.status(200).json({ likes: country.likes, liked: !alreadyLiked });
};

const addCountryComment = async (req, res, next) => {
  const { uid: userId, code } = req.params;
  const commenterId = req.userData.userId;
  const { text } = req.body;

  if (!text || !text.trim())
    return next(new HttpError("Comment text is required.", 422));

  let user;
  try {
    user = await User.findById(userId);
  } catch (err) {
    return next(new HttpError("Adding comment failed, please try again.", 500));
  }

  if (!user) return next(new HttpError("User not found.", 404));

  const country = user.countries.find((c) => c.code === code);
  if (!country) return next(new HttpError("Country not found.", 404));

  country.comments.push({ user: commenterId, text: text.trim() });

  try {
    await user.save();
  } catch (err) {
    return next(new HttpError("Adding comment failed, please try again.", 500));
  }

  await user.populate("countries.comments.user", "name image");

  const added = country.comments[country.comments.length - 1];
  res.status(201).json({ comment: added.toObject({ getters: true }) });
};

const deleteCountryComment = async (req, res, next) => {
  const { uid: userId, code, commentId } = req.params;
  const requesterId = req.userData.userId;

  let user;
  try {
    user = await User.findById(userId);
  } catch (err) {
    return next(
      new HttpError("Deleting comment failed, please try again.", 500),
    );
  }

  if (!user) return next(new HttpError("User not found.", 404));

  const country = user.countries.find((c) => c.code === code);
  if (!country) return next(new HttpError("Country not found.", 404));

  const comment = country.comments.id(commentId);
  if (!comment) return next(new HttpError("Comment not found.", 404));

  const isCountryOwner = userId === requesterId;
  const isCommentOwner = comment.user.toString() === requesterId;

  if (!isCountryOwner && !isCommentOwner)
    return next(new HttpError("Not authorized to delete this comment.", 401));

  country.comments.pull({ _id: commentId });

  try {
    await user.save();
  } catch (err) {
    return next(
      new HttpError("Deleting comment failed, please try again.", 500),
    );
  }

  res.status(200).json({ message: "Comment deleted." });
};

exports.followUser = followUser;
exports.unfollowUser = unfollowUser;
exports.toggleLikeCountry = toggleLikeCountry;
exports.addCountryComment = addCountryComment;
exports.deleteCountryComment = deleteCountryComment;
