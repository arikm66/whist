const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Item = require('../models/Item');

// POST /api/items (protected)
router.post('/', auth, async (req, res) => {
  const newItem = new Item({ content: req.body.content, owner: req.user.id });
  await newItem.save();
  res.json(newItem);
});

// GET /api/items (return only user's items)
router.get('/', auth, async (req, res) => {
  const items = await Item.find({ owner: req.user.id }).sort({ date: -1 });
  res.json(items);
});

module.exports = router;