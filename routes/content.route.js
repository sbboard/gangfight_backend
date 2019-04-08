const express = require('express')
const router = express.Router()
const ROUTE_SECRET = require('../routesecret.js')

const product_controller = require('../controllers/content.controller')

router.post(`/${ROUTE_SECRET}/create`, product_controller.product_create)

router.put(`/${ROUTE_SECRET}/:id/update`, product_controller.product_update)

router.delete(`/${ROUTE_SECRET}/:id/delete`, product_controller.product_delete)

router.get('/projects', product_controller.proj_list)

router.get('/comics', product_controller.comic_list)

router.get('/:num?', product_controller.whole_list)

module.exports = router