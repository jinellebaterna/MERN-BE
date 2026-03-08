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

router.get("/:uid/countries", usersControllers.getCountries);
router.post("/:uid/countries", checkAuth, usersControllers.addCountry);
router.patch(
  "/:uid/countries/reorder",
  checkAuth,
  usersControllers.reorderCountries,
);
router.delete(
  "/:uid/countries/:code",
  checkAuth,
  usersControllers.removeCountry,
);
router.patch(
  "/:uid/countries/:code/images",
  checkAuth,
  usersControllers.updateCountryImages,
);
router.patch(
  "/:uid/countries/:code",
  checkAuth,
  usersControllers.updateCountry,
);

router.get("/:uid/wishlist", usersControllers.getWishlist);
router.post("/:uid/wishlist", checkAuth, usersControllers.addToWishlist);
router.patch(
  "/:uid/wishlist/reorder",
  checkAuth,
  usersControllers.reorderWishlist,
);
router.delete(
  "/:uid/wishlist/:code",
  checkAuth,
  usersControllers.removeFromWishlist,
);
router.patch(
  "/:uid/wishlist/:code/details",
  checkAuth,
  usersControllers.updateWishlistDetails,
);

router.post("/:uid/follow", checkAuth, usersControllers.followUser);
router.delete("/:uid/follow", checkAuth, usersControllers.unfollowUser);

router.post(
  "/:uid/countries/:code/like",
  checkAuth,
  usersControllers.toggleLikeCountry,
);
router.post(
  "/:uid/countries/:code/comments",
  checkAuth,
  usersControllers.addCountryComment,
);
router.delete(
  "/:uid/countries/:code/comments/:commentId",
  checkAuth,
  usersControllers.deleteCountryComment,
);

module.exports = router;
