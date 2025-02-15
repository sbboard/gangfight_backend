const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Poll Option Schema (Embedded Instead of Separate Model)
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
  options: [pollOptionSchema],
});

// User Schema
const userSchema = new Schema({
  name: { type: String, required: true },
  password: { type: String, required: true },
  wins: [{ type: String, required: true }], // Store poll IDs as strings
});

// Export models
module.exports = {
  User: mongoose.model("User", userSchema, "beans"),
  Poll: mongoose.model("Poll", pollSchema, "beans"),
};
