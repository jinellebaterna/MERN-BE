const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const commentSchema = new Schema({
  user: { type: mongoose.Types.ObjectId, required: true, ref: "User" },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const countrySchema = new Schema({
  name: { type: String, required: true },
  code: { type: String, required: true },
  images: [String],
  story: { type: String, default: "" },
  cities: [String],
  likes: [{ type: mongoose.Types.ObjectId, ref: "User" }],
  comments: [commentSchema],
  addedAt: { type: Date, default: Date.now },
  order: { type: Number, default: null },
});

const wishlistSchema = new Schema({
  name: { type: String, required: true },
  code: { type: String, required: true },
  addedAt: { type: Date, default: Date.now },
  order: { type: Number, default: null },
  notes: { type: String, default: "" },
  priority: {
    type: String,
    enum: ["low", "medium", "high"],
    default: "medium",
  },
  targetYear: { type: Number, default: null },
});

const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true, minLength: 6 },
  image: { type: String, default: null },
  places: [{ type: mongoose.Types.ObjectId, required: true, ref: "Place" }],
  countries: [countrySchema],
  wishlist: [wishlistSchema],
  followers: [{ type: mongoose.Types.ObjectId, ref: "User" }],
  following: [{ type: mongoose.Types.ObjectId, ref: "User" }],
});

module.exports = mongoose.model("User", userSchema);
