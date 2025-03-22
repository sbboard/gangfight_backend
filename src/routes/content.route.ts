import express from "express";
import * as productController from "../controllers/content.controller.js";
import * as patreonController from "../controllers/patreon.controller.js";
import dotenv from "dotenv";
dotenv.config();

const ROUTE_SECRET = process.env.ROUTE_SECRET;

const router = express.Router();

router.post(`/${ROUTE_SECRET}/create`, productController.product_create);

// Update posts a new item under the update category
router.post(`/${ROUTE_SECRET}/update`, productController.post_update);

router.put(
  `/${ROUTE_SECRET}/:id/seriesChange`,
  productController.update_series
);

router.put(
  `/${ROUTE_SECRET}/:id/iframeChange`,
  productController.update_iframe
);

router.delete(`/${ROUTE_SECRET}/:id/delete`, productController.product_delete);

router.get("/comic/:id", productController.comic_info);

router.get("/category/:cat", productController.category_list);

router.get("/patrons/", patreonController.get_patrons);

router.get("/:num?", productController.whole_list);

export default router;
