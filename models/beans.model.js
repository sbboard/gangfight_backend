const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const pollOptionSchema = new Schema({
  text: { type: String, required: true },
  bettors: [{ type: String, required: true }],
});

const CREATION_FEE = 2000000;

// Poll Schema
const pollSchema = new Schema({
  creatorId: { type: String, required: true }, // Store user ID as a string
  title: { type: String, required: true },
  description: { type: String, required: true },
  endDate: { type: Date, required: true },
  settleDate: { type: Date, default: null },
  winner: { type: String, default: null },
  creationDate: { type: Date, default: Date.now },
  pricePerShare: { type: Number, default: 1000000 },
  pot: { type: Number, default: CREATION_FEE },
  options: [pollOptionSchema],
  abstained: [{ type: String, required: true }], // Store user IDs as strings
  contentType: {
    type: String,
    default: "poll",
    immutable: true,
  },
  pollType: { type: String, default: "bet" },
});

// User Schema
const userSchema = new Schema({
  name: { type: String, required: true },
  displayName: {
    type: String,
    default: function () {
      return this.name;
    },
  },
  lastIP: { type: String },
  password: { type: String, required: true },
  role: { type: String, default: "spectator" },
  inventory: [{ type: String }],
  probationEndDate: { type: Date, default: null },
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
  CREATION_FEE,
};
