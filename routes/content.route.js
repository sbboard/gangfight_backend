const express = require("express");
const router = express.Router();
const ROUTE_SECRET = require("../routesecret.js");

const product_controller = require("../controllers/content.controller");
const patreon_controller = require("../controllers/patreon.controller");

router.post(`/${ROUTE_SECRET}/create`, product_controller.product_create);

//update posts a new item under the update category
router.post(`/${ROUTE_SECRET}/update`, product_controller.post_update);

//edit is used to edit existing fields
router.put(`/${ROUTE_SECRET}/:id/edit`, product_controller.product_update);

router.delete(`/${ROUTE_SECRET}/:id/delete`, product_controller.product_delete);

router.get("/comic/:id", product_controller.comic_info);

router.get("/category/:cat", product_controller.category_list);

router.get("/patrons/", patreon_controller.patreon);

router.get("/:num?", product_controller.whole_list);

module.exports = router;
