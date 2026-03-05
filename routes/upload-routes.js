const express = require("express");
const fileUpload = require("../middleware/file-upload");
const router = express.Router();

router.post("/", fileUpload.array("files", 5), (req, res) => {
  if (!req.files?.length) return res.status(422).json({ message: "No files uploaded." });
  res.json({ paths: req.files.map((f) => f.path) });
});

module.exports = router;
