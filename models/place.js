const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const placeSchema = new Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  images: [{ type: String }],
  address: { type: String, required: true },
  creator: { type: mongoose.Types.ObjectId, required: true, ref: "User" },
  likes: [{ type: mongoose.Types.ObjectId, ref: "User" }],
  tags: [{ type: String }],
  lat: { type: Number },
  lon: { type: Number },
});

module.exports = mongoose.model("Place", placeSchema);
