const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
  content: String,
  date: { type: Date, default: Date.now },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

module.exports = mongoose.model('Item', ItemSchema);
