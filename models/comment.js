const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const commentSchema = new Schema({
  text: { type: String, required: true, minLength: 1 },
  author: { type: mongoose.Types.ObjectId, required: true, ref: "User" },
  place: { type: mongoose.Types.ObjectId, required: true, ref: "Place" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Comment", commentSchema);
