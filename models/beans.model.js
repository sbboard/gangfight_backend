const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const pollOptionSchema = new Schema({
  text: { type: String, required: true },
  betters: [{ type: String, required: true }], // Store user IDs as strings
});

// Poll Schema
const pollSchema = new Schema({
  creatorId: { type: String, required: true }, // Store user ID as a string
  title: { type: String, required: true },
  description: { type: String, required: true },
  endDate: { type: Date, required: true },
  winner: { type: String, default: null },
  creationDate: { type: Date, default: Date.now },
  options: [pollOptionSchema],
  abstained: [{ type: String, required: true }], // Store user IDs as strings
  contentType: {
    type: String,
    required: true,
    default: "poll",
    immutable: true,
  },
  pollType: {
    type: String,
    required: true,
    default: "bet",
  },
});

// User Schema
const userSchema = new Schema({
  name: { type: String, required: true },
  password: { type: String, required: true },
  inventory: [{ type: String, required: true }],
  beans: { type: Number, required: true, default: 100 },
  registrationDate: { type: Date, default: Date.now },
  wins: [{ type: String, required: true }], // Store poll IDs as strings
  contentType: {
    type: String,
    required: true,
    default: "user",
    immutable: true,
  },
});

// Export models
module.exports = {
  User: mongoose.model("User", userSchema, "beans"),
  Poll: mongoose.model("Poll", pollSchema, "beans"),
};
