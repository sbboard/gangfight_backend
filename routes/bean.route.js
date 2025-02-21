const express = require("express");
const router = express.Router();
const pollController = require("../controllers/bean.controller");
const userController = require("../controllers/beanUser.controller");

// Helper function to handle database operations
const handleRequest = (req, res, next, collectionName, controllerMethod) => {
  const beansDb = req.beansDb; // Access the correct database (test or beans)
  const beansCollection = beansDb.collection(collectionName);
  controllerMethod(req, res, next, beansCollection);
};

// Poll Routes
router.post("/polls/create", (req, res, next) =>
  handleRequest(req, res, next, "polls", pollController.createPoll)
);
router.post("/polls/set-winner", (req, res, next) =>
  handleRequest(req, res, next, "polls", pollController.setPollWinner)
);
router.post("/polls/bet", (req, res, next) =>
  handleRequest(req, res, next, "polls", pollController.placeBet)
);
router.delete("/polls/:id/delete", (req, res, next) =>
  handleRequest(req, res, next, "polls", pollController.deletePoll)
);
router.get("/polls/:id", (req, res, next) =>
  handleRequest(req, res, next, "polls", pollController.getPollById)
);
router.get("/polls/", (req, res, next) =>
  handleRequest(req, res, next, "polls", pollController.getAllPolls)
);

// User Routes
router.post("/user/register", (req, res, next) =>
  handleRequest(req, res, next, "users", userController.registerUser)
);
router.post("/user/login", (req, res, next) =>
  handleRequest(req, res, next, "users", userController.loginUser)
);
router.get("/user/winners", (req, res, next) =>
  handleRequest(req, res, next, "users", userController.getWinners)
);
router.get("/user/:id", (req, res, next) =>
  handleRequest(req, res, next, "users", userController.getUser)
);
router.put("/user/:id", (req, res, next) =>
  handleRequest(req, res, next, "users", userController.updateUser)
);

module.exports = router;
