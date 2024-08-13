const mongoose = require("mongoose");
mongoose.set("useFindAndModify", false);
const Schema = mongoose.Schema;

const GangContent = new Schema({
  title: { type: String, required: true },
  subtitle: { type: String },
  img: { type: String, required: true },
  url: { type: String, required: true },
  category: { type: String, required: true },
  date: { type: Date, required: true },
  updatedDate: { type: Date, required: true },
  series: { type: String },
  assetFolder: { type: String },
  comicsArray: { type: Array },
  iframe: { type: Boolean, default: false },
});

module.exports = mongoose.model("content", GangContent);
