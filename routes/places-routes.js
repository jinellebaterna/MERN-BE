const express = require("express");
const { check } = require("express-validator");

const placesControllers = require("../controllers/places-controller");
const checkAuth = require("../middleware/check-auth");
const router = express.Router();

router.get("/", placesControllers.searchPlaces);
router.get("/popular", placesControllers.getPopularPlaces);
router.get("/:pid", placesControllers.getPlaceById);
router.get("/user/:uid", placesControllers.getPlacesByUserId);
router.get("/:pid/comments", placesControllers.getComments);

router.use(checkAuth);

router.post(
  "/",
  [
    check("title").not().isEmpty(),
    check("description").isLength({ min: 5 }),
    check("address").not().isEmpty(),
  ],
  placesControllers.createPlace,
);

router.patch(
  "/:pid",
  [check("title").not().isEmpty(), check("description").isLength({ min: 5 })],
  placesControllers.updatePlace,
);
router.delete("/:pid", placesControllers.deletePlace);
router.post("/:pid/like", placesControllers.likePlace);
router.delete("/:pid/like", placesControllers.unlikePlace);

router.post(
  "/:pid/comments",
  [check("text").isLength({ min: 1 })],
  placesControllers.addComment,
);
router.delete("/:pid/comments/:cid", placesControllers.deleteComment);

module.exports = router;
