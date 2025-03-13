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
  pricePerShare: { type: Number, default: 500000 },
  seed: { type: Number, default: 1000000 },
  pot: { type: Number, default: 1000000 },
  options: [pollOptionSchema],
  contentType: {
    type: String,
    default: "poll",
    immutable: true,
  },
  legalStatus: {
    isLegal: { type: Boolean, default: true },
    lawsBroken: { type: [String], default: [] },
    dateBanned: { type: Date },
  },
});

// User Schema
const notificationSchema = new Schema({
  text: { type: String, required: true },
  date: { type: Date, default: Date.now },
});

const inventoryItemSchema = new Schema({
  name: { type: String, required: true },
  meta: { type: String, default: "" },
  specialDescription: { type: String },
  specialPrice: { type: Number },
});

const userSchema = new Schema({
  name: { type: String, required: true },
  lastIP: { type: String },
  debt: { type: Number, default: 0 },
  password: { type: String, required: true },
  role: { type: String, default: "spectator" },
  inventory: [inventoryItemSchema],
  beans: { type: Number, default: 10000000 },
  registrationDate: { type: Date, default: Date.now },
  wins: [{ type: String }], // Store poll IDs as strings
  referrer: { type: String, default: null },
  contentType: {
    type: String,
    default: "user",
    immutable: true,
  },
  notifications: [notificationSchema],
  notificationsLastChecked: { type: Date, default: Date.now },
  penalties: { type: Number, default: 0 },
});

// Export models
module.exports = {
  User: mongoose.model("User", userSchema, "beans"),
  Poll: mongoose.model("Poll", pollSchema, "beans"),
  Item: mongoose.model("Item", inventoryItemSchema, "beans"),
};
