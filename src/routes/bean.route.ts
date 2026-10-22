import express, { NextFunction, Request, RequestHandler, Response, Router } from "express";
import * as adminController from "../controllers/beanAdmin.controller.js";
import * as storeController from "../controllers/beanStore.controller.js";
import * as wagerController from "../controllers/beanWager.controller.js";
import * as userController from "../controllers/beanUser.controller.js";

// Controllers are async and may return the response; this adapts them for Express
// and forwards any rejection to the error handler
const handle =
  (
    controller: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
  ): RequestHandler =>
  (req, res, next) => {
    controller(req, res, next).catch(next);
  };

const router: Router = express.Router();

// Poll Routes
router.post("/polls/create", handle(wagerController.createPoll));
router.post("/polls/set-winner", handle(wagerController.setPollWinner));
router.post("/polls/bet", handle(wagerController.placeBet));
router.get("/polls/:pollId", handle(wagerController.getPollById));
router.get("/polls/", handle(wagerController.getAllPolls));
router.get("/polls/type/:type", handle(wagerController.getPollsByType));

// User Routes
router.post("/user/register", handle(userController.registerUser));
router.post("/user/login", handle(userController.loginUser));
router.get("/user/winners", handle(userController.getWinners));
router.get("/user/winners-chart", handle(userController.getTopTenLog));
router.get("/user/:id/:key", handle(userController.getUser));
router.put("/user/:id", handle(userController.updateUser));
router.put("/user/:id/update-notification", handle(userController.updateNotification));
router.put("/user/:id/clear-notifications", handle(userController.clearNotifications));
router.post("/user/bonus", handle(userController.claimThursdayBonus));

// Admin Tools
router.post("/admin/mass-notification", handle(adminController.sendMassNotification));
router.post("/admin/house-invites", handle(adminController.createHouseInvite));
router.get("/admin/house-invites", handle(adminController.getHouseInvites));
router.post("/admin/make-poll-illegal", handle(adminController.makeWagerIllegal));
router.post("/admin/refund-wager", handle(adminController.refundWager));

// Store routes
router.post("/store/buy-item", handle(storeController.buyItem));
router.post("/store/sell-item", handle(storeController.sellItem));
router.post("/store/lottery", handle(storeController.runLottery));
router.get("/store/get-jackpot", handle(storeController.getJackpot));
router.post("/store/send-beans", handle(storeController.sendBeans));
router.post("/store/debt", handle(userController.requestDebt));
router.post("/store/pay-debt", handle(userController.payOffDebt));

export default router;
