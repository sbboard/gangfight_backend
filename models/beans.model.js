const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const pollOptionSchema = new Schema({
  text: { type: String, required: true },
  bettors: [{ type: String, required: true }],
});

// Poll Schema
const pollSchema = new Schema({
  creatorId: { type: String, required: true }, // Store user ID as a string
  title: { type: String, required: true },
  description: { type: String, required: true },
  endDate: { type: Date, required: true },
  settleDate: {
    type: Date,
    default: function () {
      return this.endDate;
    },
  },
  winner: { type: String, default: null },
  creationDate: { type: Date, default: Date.now },
  pricePerShare: { type: Number, default: 1000000 },
  seed: { type: Number, default: 2000000 },
  pot: { type: Number, default: 2000000 },
  options: [pollOptionSchema],
  contentType: {
    type: String,
    default: "poll",
    immutable: true,
  },
});

// User Schema
const inventoryItemSchema = new Schema({
  name: { type: String, required: true },
  meta: { type: String, default: "" },
});

const userSchema = new Schema({
  name: { type: String, required: true },
  displayName: {
    type: String,
    default: function () {
      return this.name;
    },
  },
  lastIP: { type: String },
  debt: { type: Number, default: 0 },
  password: { type: String, required: true },
  role: { type: String, default: "spectator" },
  punishmentReason: { type: String, default: "" },
  inventory: [inventoryItemSchema],
  beans: { type: Number, default: 10000000 },
  registrationDate: { type: Date, default: Date.now },
  wins: [{ type: String }], // Store poll IDs as strings
  contentType: {
    type: String,
    default: "user",
    immutable: true,
  },
});

// Export models
module.exports = {
  User: mongoose.model("User", userSchema, "beans"),
  Poll: mongoose.model("Poll", pollSchema, "beans"),
};
