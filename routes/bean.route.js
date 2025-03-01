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
router.get("/polls/:pollId", (req, res, next) =>
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

// Store routes
router.post("/store/buy-item", (req, res, next) =>
  handleRequest(req, res, next, "users", userController.buyItem)
);
router.post("/store/sell-item", (req, res, next) =>
  handleRequest(req, res, next, "users", userController.sellItem)
);
router.post("/store/check-invite", (req, res, next) =>
  handleRequest(req, res, next, "users", userController.checkInvite)
);
router.post("/store/lottery", (req, res, next) =>
  handleRequest(req, res, next, "users", userController.runLottery)
);
router.get("/store/get-jackpot", (req, res, next) =>
  handleRequest(req, res, next, "users", userController.getJackpot)
);
router.post("/store/debt", (req, res, next) =>
  handleRequest(req, res, next, "users", userController.requestDebt)
);
router.post("/store/pay-debt", (req, res, next) =>
  handleRequest(req, res, next, "users", userController.payOffDebt)
);

module.exports = router;
