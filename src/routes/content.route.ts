import express from "express";
import * as productController from "../controllers/content.controller.js";
//import * as patreonController from "../controllers/patreon.controller.js";
import { ROUTE_SECRET } from "../env.js";

const router = express.Router();

router.post(`/${ROUTE_SECRET}/create`, productController.product_create);

router.put(
  `/${ROUTE_SECRET}/:id/seriesChange`,
  productController.update_series
);

// body: { series, order: [every comic id in the series, first to read
// first] } - sets the series' reading order, leaving dates alone
router.put(`/${ROUTE_SECRET}/seriesOrder`, productController.series_order);

// body: { title, subtitle } - renames a comic (its url and dates stay)
router.put(`/${ROUTE_SECRET}/:id/titleChange`, productController.update_title);

// body: any of author, artist, musician and their authorUrl/artistUrl/musicianUrl
// links - a blank value clears it
router.put(
  `/${ROUTE_SECRET}/:id/creditsChange`,
  productController.update_credits
);

router.delete(`/${ROUTE_SECRET}/:id/delete`, productController.product_delete);

router.get("/comic/:id", productController.comic_info);

router.get("/category/:cat", productController.category_list);

//router.get("/patrons/", patreonController.get_patrons);

router.get("/:num?", productController.whole_list);

export default router;
