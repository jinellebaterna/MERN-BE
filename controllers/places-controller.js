const fs = require("fs");
const { validationResult } = require("express-validator");
const HttpError = require("../models/http-error");
const Place = require("../models/place");
const User = require("../models/user");
const Comment = require("../models/comment");

const getPlaceById = async (req, res, next) => {
  const placeId = req.params.pid;

  let place;
  try {
    place = await Place.findById(placeId);
  } catch (err) {
    const error = new HttpError("Something went wrong, please try again", 500);
    return next(error);
  }

  if (!place) {
    const error = new HttpError(
      "Could not find a place for the provided id.",
      404,
    );
    return next(error);
  }

  res.json({
    place: place.toObject({ getters: true }),
  });
};

const getPlacesByUserId = async (req, res, next) => {
  const userId = req.params.uid;
  let places;

  try {
    places = await Place.find({ creator: userId });
  } catch (err) {
    const error = new HttpError(
      "Fetching places failed, please try again",
      500,
    );
    return next(error);
  }

  res.json({
    places: places.map((place) => place.toObject({ getters: true })),
  });
};

const createPlace = async (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return next(new HttpError("Invalid inputs", 422));
  }

  if (!req.body.images?.length) {
    return next(new HttpError("At least one image is required.", 422));
  }

  const { title, description, address, creator, tags } = req.body;

  // Geocode address (non-fatal if it fails)
  let lat, lon;
  try {
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      { headers: { "User-Agent": "Wayfarer/1.0" } }
    );
    const geoData = await geoRes.json();
    if (geoData.length) {
      lat = parseFloat(geoData[0].lat);
      lon = parseFloat(geoData[0].lon);
    }
  } catch (_) {}

  const createdPlace = new Place({
    title,
    description,
    images: Array.isArray(req.body.images) ? req.body.images : [req.body.images],
    address,
    creator,
    tags: tags ? (Array.isArray(tags) ? tags : [tags]) : [],
    lat,
    lon,
  });

  let user;
  try {
    user = await User.findById(creator);
  } catch (err) {
    const error = new HttpError("Creating place failed, please try again", 500);
    return next(error);
  }

  if (!user) {
    const error = new HttpError(
      "Could not find user for provided id, please try again",
      404,
    );
    return next(error);
  }

  try {
    await createdPlace.save();
    user.places.push(createdPlace);
    await user.save();
  } catch (err) {
    const error = new HttpError("Creating place failed, please try again", 500);
    return next(error);
  }

  res.status(201).json({
    place: createdPlace,
  });
};

const updatePlace = async (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return next(new HttpError("Invalid inputs", 422));
  }

  const { title, description, tags, address } = req.body;
  const placeId = req.params.pid;

  let place;
  try {
    place = await Place.findById(placeId);
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, could not update place, please try again",
      500,
    );
    return next(error);
  }

  if (place.creator.toString() != req.userData.userId) {
    const error = new HttpError("You are not allowed to edit this place.", 401);
    return next(error);
  }

  place.title = title;
  place.description = description;
  if (address !== undefined && address !== place.address) {
    place.address = address;
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
        { headers: { "User-Agent": "Wayfarer/1.0" } }
      );
      const geoData = await geoRes.json();
      if (geoData.length) {
        place.lat = parseFloat(geoData[0].lat);
        place.lon = parseFloat(geoData[0].lon);
      }
    } catch (_) {}
  }
  if (tags !== undefined) {
    place.tags = Array.isArray(tags) ? tags : [tags];
  }
  if (req.body.newImages?.length) {
    place.images.push(...[].concat(req.body.newImages));
  }
  const { removeImages } = req.body;
  if (removeImages) {
    const toRemove = Array.isArray(removeImages) ? removeImages : [removeImages];
    toRemove.forEach((imgPath) => fs.unlink(imgPath, (err) => console.log(err)));
    place.images = place.images.filter((img) => !toRemove.includes(img));
  }

  try {
    await place.save();
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, could not update place, please try again",
      500,
    );
    return next(error);
  }
  res.status(200).json({ place: place.toObject({ getters: true }) });
};

const deletePlace = async (req, res, next) => {
  const placeId = req.params.pid;

  let place;
  try {
    place = await Place.findById(placeId).populate("creator");
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, could not delete place, please try again",
      500,
    );
    return next(error);
  }

  if (!place) {
    const error = new HttpError("Could not find place for this id.", 404);
    return next(error);
  }

  if (place.creator.id != req.userData.userId) {
    const error = new HttpError(
      "You are not allowed to delete this place.",
      401,
    );
    return next(error);
  }

  const imagePaths = place.images;

  try {
    await Comment.deleteMany({ place: placeId });
    await place.deleteOne();
    place.creator.places.pull(place);
    await place.creator.save();
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, could not delete place, please try again",
      500,
    );
    return next(error);
  }

  imagePaths.forEach((imgPath) => {
    fs.unlink(imgPath, (err) => {
      console.log(err);
    });
  });

  res.status(200).json({ message: "Place Deleted!" });
};

const searchPlaces = async (req, res, next) => {
  const { search, creator, tag, page = 1, limit = 9 } = req.query;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const filter = {};

  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { address: { $regex: search, $options: "i" } },
    ];
  }

  if (creator) {
    filter.creator = creator;
  }

  if (tag) {
    filter.tags = tag;
  }

  let places, totalCount;
  try {
    [places, totalCount] = await Promise.all([
      Place.find(filter).skip(skip).limit(limitNum),
      Place.countDocuments(filter),
    ]);
  } catch (err) {
    return next(new HttpError("Searching failed, please try again.", 500));
  }

  res.json({
    places: places.map((p) => p.toObject({ getters: true })),
    totalCount,
    currentPage: pageNum,
    totalPages: Math.ceil(totalCount / limitNum),
  });
};

const likePlace = async (req, res, next) => {
  const placeId = req.params.pid;
  const userId = req.userData.userId;

  let place;
  try {
    place = await Place.findById(placeId);
  } catch (err) {
    return next(new HttpError("Something went wrong, please try again.", 500));
  }

  if (!place) {
    return next(new HttpError("Could not find place for this id.", 404));
  }

  if (place.likes.includes(userId)) {
    return next(new HttpError("You already liked this place.", 422));
  }

  place.likes.push(userId);
  try {
    await place.save();
  } catch (err) {
    return next(new HttpError("Liking place failed, please try again.", 500));
  }

  res.json({ likes: place.likes });
};

const unlikePlace = async (req, res, next) => {
  const placeId = req.params.pid;
  const userId = req.userData.userId;

  let place;
  try {
    place = await Place.findById(placeId);
  } catch (err) {
    return next(new HttpError("Something went wrong, please try again.", 500));
  }

  if (!place) {
    return next(new HttpError("Could not find place for this id.", 404));
  }

  if (!place.likes.includes(userId)) {
    return next(new HttpError("You have not liked this place.", 422));
  }

  place.likes.pull(userId);
  try {
    await place.save();
  } catch (err) {
    return next(new HttpError("Unliking place failed, please try again.", 500));
  }

  res.json({ likes: place.likes });
};

const getPopularPlaces = async (req, res, next) => {
  const limitNum = parseInt(req.query.limit) || 6;

  let places;
  try {
    places = await Place.aggregate([
      { $addFields: { likesCount: { $size: "$likes" } } },
      { $sort: { likesCount: -1 } },
      { $limit: limitNum },
    ]);
  } catch (err) {
    return next(
      new HttpError("Fetching popular places failed, please try again.", 500),
    );
  }

  res.json({
    places: places.map((p) => ({ ...p, id: p._id.toString() })),
  });
};

const addComment = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError("Invalid inputs", 422));
  }

  const placeId = req.params.pid;
  const { text } = req.body;

  let place;
  try {
    place = await Place.findById(placeId);
  } catch (err) {
    return next(new HttpError("Something went wrong, please try again.", 500));
  }

  if (!place) {
    return next(new HttpError("Could not find place for this id.", 404));
  }

  const comment = new Comment({
    text,
    author: req.userData.userId,
    place: placeId,
  });

  try {
    await comment.save();
  } catch (err) {
    return next(
      new HttpError("Adding comment failed, please try again.", 500),
    );
  }

  await comment.populate("author", "name image");

  res.status(201).json({ comment: { ...comment.toObject({ getters: true }) } });
};

const getComments = async (req, res, next) => {
  const placeId = req.params.pid;

  let comments;
  try {
    comments = await Comment.find({ place: placeId })
      .populate("author", "name image")
      .sort({ createdAt: -1 });
  } catch (err) {
    return next(
      new HttpError("Fetching comments failed, please try again.", 500),
    );
  }

  res.json({
    comments: comments.map((c) => c.toObject({ getters: true })),
  });
};

const deleteComment = async (req, res, next) => {
  const { pid, cid } = req.params;

  let comment;
  try {
    comment = await Comment.findById(cid);
  } catch (err) {
    return next(new HttpError("Something went wrong, please try again.", 500));
  }

  if (!comment) {
    return next(new HttpError("Could not find comment for this id.", 404));
  }

  if (comment.place.toString() !== pid) {
    return next(new HttpError("Comment does not belong to this place.", 422));
  }

  if (comment.author.toString() !== req.userData.userId) {
    return next(
      new HttpError("You are not allowed to delete this comment.", 401),
    );
  }

  try {
    await comment.deleteOne();
  } catch (err) {
    return next(
      new HttpError("Deleting comment failed, please try again.", 500),
    );
  }

  res.status(200).json({ message: "Comment deleted." });
};

exports.getPlaceById = getPlaceById;
exports.getPlacesByUserId = getPlacesByUserId;
exports.createPlace = createPlace;
exports.updatePlace = updatePlace;
exports.deletePlace = deletePlace;
exports.searchPlaces = searchPlaces;
exports.likePlace = likePlace;
exports.unlikePlace = unlikePlace;
exports.getPopularPlaces = getPopularPlaces;
exports.addComment = addComment;
exports.getComments = getComments;
exports.deleteComment = deleteComment;
