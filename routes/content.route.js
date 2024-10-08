const express = require("express");
const router = express.Router();
const ROUTE_SECRET = require("../routesecret.js");

const product_controller = require("../controllers/content.controller");
const patreon_controller = require("../controllers/patreon.controller");

router.post(`/${ROUTE_SECRET}/create`, product_controller.product_create);

//update posts a new item under the update category
router.post(`/${ROUTE_SECRET}/update`, product_controller.post_update);

router.put(
  `/${ROUTE_SECRET}/:id/seriesChange`,
  product_controller.update_series
);

router.put(
  `/${ROUTE_SECRET}/:id/iframeChange`,
  product_controller.update_iframe
);

router.delete(`/${ROUTE_SECRET}/:id/delete`, product_controller.product_delete);

router.get("/comic/:id", product_controller.comic_info);

router.get("/category/:cat", product_controller.category_list);

router.get("/patrons/", patreon_controller.patreon);

router.get("/:num?", product_controller.whole_list);

module.exports = router;
