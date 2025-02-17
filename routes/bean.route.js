const express = require("express");
const router = express.Router();
const pollController = require("../controllers/bean.controller");
const userController = require("../controllers/beanUser.controller");

// Helper function to handle database operations
const handleRequest = (req, res, collectionName, controllerMethod) => {
  const beansDb = req.beansDb; // Access the correct database (test or beans)
  const beansCollection = beansDb.collection(collectionName);
  controllerMethod(req, res, beansCollection);
};

// Poll Routes
router.post("/polls/create", (req, res) =>
  handleRequest(req, res, "polls", pollController.createPoll)
);
router.post("/polls/set-winner", (req, res) =>
  handleRequest(req, res, "polls", pollController.setPollWinner)
);
router.post("/polls/random", (req, res) =>
  handleRequest(req, res, "polls", pollController.createRandomPoll)
);
router.get("/polls/", (req, res) =>
  handleRequest(req, res, "polls", pollController.getAllPolls)
);
router.get("/polls/:id", (req, res) =>
  handleRequest(req, res, "polls", pollController.getPollById)
);
router.post("/polls/bet", (req, res) =>
  handleRequest(req, res, "polls", pollController.placeBet)
);
router.delete("/polls/:id/delete", (req, res) =>
  handleRequest(req, res, "polls", pollController.deletePoll)
);

// User Routes
router.get("/user/:id", (req, res) =>
  handleRequest(req, res, "users", userController.getUser)
);
router.post("/user/register", (req, res) =>
  handleRequest(req, res, "users", userController.registerUser)
);
router.post("/user/login", (req, res) =>
  handleRequest(req, res, "users", userController.loginUser)
);

module.exports = router;
