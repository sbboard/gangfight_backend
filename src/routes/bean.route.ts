import express, { Request, Response, NextFunction, Router } from "express";
import * as adminController from "../controllers/beanAdmin.controller.js";
import * as storeController from "../controllers/beanStore.controller.js";
import * as wagerController from "../controllers/beanWager.controller.js";
import * as userController from "../controllers/beanUser.controller.js";

// Define the structure of the database and collection for type safety
interface BeansDb {
  collection: (collectionName: string) => any;
}

// Helper function to handle database operations
const handleRequest = (
  req: Request,
  res: Response,
  next: NextFunction,
  collectionName: string,
  controllerMethod: Function
): void => {
  const beansDb: BeansDb | undefined = req.beansDb; // Access the correct database (test or beans)

  if (!beansDb) {
    res.status(500).json({ error: "Database connection is not available" });
    return; // Return to stop further processing
  }

  const beansCollection = beansDb.collection(collectionName);
  controllerMethod(req, res, next, beansCollection);
};

const router: Router = express.Router();

// Poll Routes
router.post("/polls/create", (req, res, next) =>
  handleRequest(req, res, next, "polls", wagerController.createPoll)
);
router.post("/polls/set-winner", (req, res, next) =>
  handleRequest(req, res, next, "polls", wagerController.setPollWinner)
);
router.post("/polls/bet", (req, res, next) =>
  handleRequest(req, res, next, "polls", wagerController.placeBet)
);
router.get("/polls/:pollId", (req, res, next) =>
  handleRequest(req, res, next, "polls", wagerController.getPollById)
);
router.get("/polls/", (req, res, next) =>
  handleRequest(req, res, next, "polls", wagerController.getAllPolls)
);
router.get("/polls/type/:type", (req, res, next) =>
  handleRequest(req, res, next, "polls", wagerController.getPollsByType)
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
router.get("/user/winners-chart", (req, res, next) =>
  handleRequest(req, res, next, "users", userController.getTopTenLog)
);
router.get("/user/:id/:key", (req, res, next) =>
  handleRequest(req, res, next, "users", userController.getUser)
);
router.put("/user/:id", (req, res, next) =>
  handleRequest(req, res, next, "users", userController.updateUser)
);
router.put("/user/:id/update-notification", (req, res, next) =>
  handleRequest(req, res, next, "users", userController.updateNotification)
);
router.put("/user/:id/clear-notifications", (req, res, next) =>
  handleRequest(req, res, next, "users", userController.clearNotifications)
);
router.post("/user/bonus", (req, res, next) =>
  handleRequest(req, res, next, "users", userController.claimThursdayBonus)
);

// Admin Tools
router.post("/admin/mass-notification", (req, res, next) =>
  handleRequest(req, res, next, "users", adminController.sendMassNotification)
);
router.post("/admin/house-invites", (req, res, next) =>
  handleRequest(req, res, next, "users", adminController.createHouseInvite)
);
router.get("/admin/house-invites", (req, res, next) =>
  handleRequest(req, res, next, "users", adminController.getHouseInvites)
);
router.post("/admin/make-poll-illegal", (req, res, next) =>
  handleRequest(req, res, next, "users", adminController.makeWagerIllegal)
);
router.post("/admin/refund-wager", (req, res, next) =>
  handleRequest(req, res, next, "users", adminController.refundWager)
);

// Store routes
router.post("/store/buy-item", (req, res, next) =>
  handleRequest(req, res, next, "users", storeController.buyItem)
);
router.post("/store/sell-item", (req, res, next) =>
  handleRequest(req, res, next, "users", storeController.sellItem)
);
router.post("/store/lottery", (req, res, next) =>
  handleRequest(req, res, next, "users", storeController.runLottery)
);
router.get("/store/get-jackpot", (req, res, next) =>
  handleRequest(req, res, next, "users", storeController.getJackpot)
);
router.post("/store/send-beans", (req, res, next) =>
  handleRequest(req, res, next, "users", storeController.sendBeans)
);
router.post("/store/debt", (req, res, next) =>
  handleRequest(req, res, next, "users", userController.requestDebt)
);
router.post("/store/pay-debt", (req, res, next) =>
  handleRequest(req, res, next, "users", userController.payOffDebt)
);

export default router;
