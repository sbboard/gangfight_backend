const { User } = require("../models/beans.model.js");
const crypto = require("crypto");
const mongoose = require("mongoose");

// Register a new user
exports.registerUser = async (req, res, next) => {
  try {
    const { name, password, inviteCode } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ name });
    if (existingUser) {
      return res.status(400).json({ message: "Username already taken" });
    }

    let referrer = null;
    if (!inviteCode) {
      return res.status(400).json({ message: "Invite code required" });
    }
    // Find user with the invite
    const inviter = await User.findOne({
      "inventory.name": "invite",
      "inventory.meta": inviteCode,
    });

    if (!inviter) {
      return res.status(404).json({ message: "Invalid invite code" });
    }

    // Remove invite from inviter's inventory
    inviter.inventory = inviter.inventory.filter(
      (item) => !(item.name === "invite" && item.meta === inviteCode)
    );
    await inviter.save();
    referrer = inviter._id;

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
      referrer,
    });

    await user.save();
    res.status(201).json({ message: "User registered successfully", user });
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
    const user = await User.findById(req.params.id).select(
      "-password -lastIP -punishmentReason -registrationDate -referrer"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (error) {
    next(error);
  }
};

exports.getWinners = async (req, res, next) => {
  try {
    const excludedUsers = [
      new mongoose.Types.ObjectId("67bbdee28094dd05bc218d1d"), // the house
      new mongoose.Types.ObjectId("67b7d251d82f7305bc9b3425"), // dupe
    ];

    const winners = await User.find({
      contentType: "user",
      _id: { $nin: excludedUsers }, // Exclude specific users
      role: { $ne: "banned" }, // Exclude banned users
    }).select("name beans debt wins");

    // Sort by beans - debt in descending order
    winners.sort((a, b) => b.beans - b.debt - (a.beans - a.debt));

    res.json(winners);
  } catch (error) {
    next(error);
  }
};

// Update user information
exports.updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    delete updateData.password;
    delete updateData.contentType;

    const user = await User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ message: "User updated successfully", user });
  } catch (error) {
    next(error);
  }
};

// STORE

const ITEMS = {
  invite: {
    price: 20000000,
    generateMeta: () =>
      Math.random().toString(36).substring(2, 7).toUpperCase(),
  },
  "bookie license": { price: 11000000, generateMeta: () => "" },
  adblock: { price: 1000000, generateMeta: () => "" },
};

const generateUniqueInviteCode = async () => {
  let code;
  let isDuplicate = true;

  while (isDuplicate) {
    code = ITEMS.invite.generateMeta();
    const existingInvite = await User.findOne({
      "inventory.name": "invite",
      "inventory.meta": code,
    });

    if (!existingInvite) isDuplicate = false;
  }

  return code;
};

exports.buyItem = async (req, res, next) => {
  try {
    const { userId, itemName } = req.body;
    const item = ITEMS[itemName.toLowerCase()];
    if (!item) return res.status(400).json({ message: "Invalid item" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.debt > 0)
      return res
        .status(400)
        .json({ message: "You can't buy items while in debt" });

    if (user.beans < item.price)
      return res.status(400).json({ message: "Not enough beans" });

    let meta = "";
    if (itemName.toLowerCase() === "invite") {
      meta = await generateUniqueInviteCode();
    } else {
      meta = item.generateMeta();
    }

    user.beans -= item.price;
    user.inventory.push({ name: itemName, meta });
    await user.save();

    res.json({ message: "Item purchased", user });
  } catch (error) {
    next(error);
  }
};

exports.sellItem = async (req, res, next) => {
  try {
    const { userId, itemName } = req.body;
    const item = ITEMS[itemName.toLowerCase()];
    if (!item) return res.status(400).json({ message: "Invalid item" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const itemIndex = user.inventory.findIndex(
      (i) => i.name.toLowerCase() === itemName.toLowerCase()
    );
    if (itemIndex === -1)
      return res.status(400).json({ message: "Item not found in inventory" });

    user.inventory.splice(itemIndex, 1);
    user.beans += Math.floor(item.price / 2);
    await user.save();

    res.json({ message: "Item sold", user });
  } catch (error) {
    next(error);
  }
};

exports.runLottery = async (req, res, next) => {
  const HOUSE_ID = "67bbdee28094dd05bc218d1d";
  try {
    const LOTTO_PRICE = 10000;
    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Deduct beans for lottery participation
    if (user.beans < LOTTO_PRICE)
      return res
        .status(400)
        .json({ message: "Not enough beans to participate" });

    user.beans -= LOTTO_PRICE;
    await user.save();

    const isWinner = Math.random() < 1 / 10000;

    let house = await User.findById(HOUSE_ID);
    if (!house) {
      return res.status(404).json({ message: "Lottery account not found" });
    }

    let message;
    let wonBeans = 0;

    if (isWinner) {
      wonBeans = house.beans;
      user.beans += wonBeans;
      house.beans = 10000000;
      await house.save();
      await user.save();
      message = `Congratulations! You won ${wonBeans} beans!`;
    } else {
      house.beans += LOTTO_PRICE;
      await house.save();
      message = "Better luck next time!";
    }

    house = await User.findById(HOUSE_ID);

    res.json({
      message,
      user,
      houseBeans: house.beans,
    });
  } catch (error) {
    next(error);
  }
};

// Debt Request Controller
exports.requestDebt = async (req, res, next) => {
  try {
    const { userId, amount } = req.body;

    // Find the user by ID
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Ensure the user has less than 1,000,000 beans and no items in their inventory
    if (user.beans >= 2000000) {
      return res
        .status(400)
        .json({ message: "User has enough beans to not be eligible for debt" });
    }

    if (user.inventory.length > 0) {
      return res.status(400).json({
        message:
          "User cannot request debt if they have items in their inventory",
      });
    }

    if (amount < 2000000 || amount > 50000000) {
      return res.status(400).json({
        message: "Requested amount must be between 2,000,000 and 50,000,000",
      });
    }

    // Calculate the debt with the 20% fee
    const debtWithFee = Math.floor(amount * 1.2); // Adding 20% fee

    // Add the debt and the requested beans to the user's account
    user.debt += debtWithFee;
    user.beans += amount;

    // Save the updated user data
    await user.save();

    res.json({
      message: `Debt of ${amount} requested successfully. Total debt with 20% fee: ${debtWithFee}`,
      user,
    });
  } catch (error) {
    next(error);
  }
};

// Debt Payment Controller
exports.payOffDebt = async (req, res, next) => {
  try {
    const { userId, amount } = req.body;

    // Find the user by ID
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Check if the user has any debt
    if (user.debt <= 0) {
      return res.status(400).json({ message: "User has no debt to pay off" });
    }

    // Ensure the user has enough beans to pay off the debt
    if (user.beans < amount) {
      return res
        .status(400)
        .json({ message: "Not enough beans to pay off the debt" });
    }

    // Calculate the amount to pay off, ensuring it doesn't exceed the user's debt
    const payAmount = Math.min(amount, user.debt);

    // Deduct the payment from the user's beans
    user.beans -= payAmount;
    user.debt -= payAmount;

    // Save the updated user data
    await user.save();

    res.json({
      message: `Successfully paid off ${payAmount} of the debt. Remaining debt: ${user.debt}`,
      user,
    });
  } catch (error) {
    next(error);
  }
};
