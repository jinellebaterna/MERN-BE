const express = require("express");
const { check } = require("express-validator");

const usersControllers = require("../controllers/users-controller");
const fileUpload = require("../middleware/file-upload");
const checkAuth = require("../middleware/check-auth");

const router = express.Router();

router.get("/", usersControllers.getUsers);
router.get("/:uid", usersControllers.getUserById);
router.post(
  "/signup",
  fileUpload.single("image"),
  [
    check("name").not().isEmpty(),
    check("email").normalizeEmail().isEmail(),
    check("password").isLength({ min: 6 }),
  ],
  usersControllers.signup,
);
router.post("/login", usersControllers.login);

router.patch(
  "/:uid",
  checkAuth,
  fileUpload.single("image"),
  [check("name").not().isEmpty()],
  usersControllers.updateUser,
);

module.exports = router;
