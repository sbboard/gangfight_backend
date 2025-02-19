const { User } = require("../models/beans.model.js");
const crypto = require("crypto");

// Register a new user
exports.registerUser = async (req, res, next) => {
  try {
    const { name, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ name });
    if (existingUser) {
      return res.status(400).json({ message: "Username already taken" });
    }

    // Hash the password using crypto
    const hashedPassword = crypto
      .createHash("sha256")
      .update(password)
      .digest("hex");

    // Create a new user
    const user = new User({
      name,
      password: hashedPassword,
      wins: [],
    });

    await user.save();
    res.status(201).json({
      message: "User registered successfully",
      user,
    });
  } catch (error) {
    next(error);
  }
};

// Login a user
exports.loginUser = async (req, res, next) => {
  try {
    const { name, password } = req.body;

    const user = await User.findOne({ name });
    if (!user) {
      return res.status(400).json({ message: "Invalid username or password" });
    }

    const hashedInputPassword = crypto
      .createHash("sha256")
      .update(password)
      .digest("hex");

    if (hashedInputPassword !== user.password) {
      return res.status(400).json({ message: "Invalid username or password" });
    }

    res.json({ message: "Login successful", user });
  } catch (error) {
    next(error);
  }
};

// Get user details
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (error) {
    next(error);
  }
};

exports.getWinners = async (req, res, next) => {
  try {
    const winners = await User.find({ "wins.0": { $exists: true } })
      .sort({ wins: -1 })
      .select("name wins");
    res.json(winners);
  } catch (error) {
    next(error);
  }
};
