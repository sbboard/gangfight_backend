const express = require('express')
const router = express.Router()

const product_controller = require('../controllers/product.controller')

router.get('/people', product_controller.person_list)

router.get('/cats', product_controller.cat_list)

router.post('/create', product_controller.product_create)

router.put('/:id/update', product_controller.product_update)

router.delete('/:id/delete', product_controller.product_delete)

router.get('/:id', product_controller.person_info)

router.get('/', product_controller.whole_list)

module.exports = router