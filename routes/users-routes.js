const express = require("express");
const { check } = require("express-validator");

const usersControllers = require("../controllers/users-controller");
const checkAuth = require("../middleware/check-auth");

const router = express.Router();

router.get("/", usersControllers.getUsers);
router.get("/:uid", usersControllers.getUserById);
router.get("/:uid/liked-places", usersControllers.getLikedPlaces);
router.post(
  "/signup",
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
  [check("name").not().isEmpty()],
  usersControllers.updateUser,
);

router.patch(
  "/:uid/password",
  checkAuth,
  [
    check("newPassword").isLength({ min: 6 }),
    check("currentPassword").not().isEmpty(),
  ],
  usersControllers.changePassword,
);

router.delete("/:uid", checkAuth, usersControllers.deleteUser);

module.exports = router;
