const { User } = require("../models/beans.model.js");
const crypto = require("crypto");
const mongoose = require("mongoose");
const sanitizeUser = require("../utils/sanitizeUser");
const { HOUSE_ID, DUPE_ID } = require("../beansecret.js");

const getKey = (string) => string.slice(-10);

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
    res.status(201).json({
      message: "User registered successfully",
      user: sanitizeUser(user),
      key: getKey(hashedPassword),
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

    res.json({
      message: "Login successful",
      user: sanitizeUser(user),
      key: getKey(hashedInputPassword),
    });
  } catch (error) {
    next(error);
  }
};

// Get user details
exports.getUser = async (req, res, next) => {
  try {
    const { id, key } = req.params;

    if (!id) return res.status(400).json({ message: "Missing id" });
    if (!key) return res.status(400).json({ message: "Missing key" });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Check if the key matches the last 10 characters of the stored password
    if (user.password.slice(-10) !== key)
      return res.status(403).json({ message: "Invalid key" });

    res.status(200).json(sanitizeUser(user));
  } catch (error) {
    next(error);
  }
};

exports.getWinners = async (req, res, next) => {
  try {
    const excludedUsers = [
      new mongoose.Types.ObjectId(HOUSE_ID),
      new mongoose.Types.ObjectId(DUPE_ID),
    ];

    const winners = await User.find({
      contentType: "user",
      _id: { $nin: excludedUsers }, // Exclude specific users
    }).select("name beans debt wins -_id");

    // Sort by beans - debt in descending order
    winners.sort((a, b) => b.beans - b.debt - (a.beans - a.debt));

    res.json(winners);
  } catch (error) {
    next(error);
  }
};

// Update user information
//this controller should not exist, really
exports.updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    delete updateData.password;
    delete updateData.contentType;
    delete updateData._id;
    delete updateData.role;
    delete updateData.beans;
    delete updateData.wins;
    delete updateData.inventory;
    delete updateData.name;
    delete updateData.penalties;

    const user = await User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      message: "User updated successfully",
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
};

// STORE
const ITEMS = {
  invite: {
    price: 20000000,
    generateMeta: () =>
      Math.random()
        .toString(36)
        .substring(2, 7)
        .replace(/[0-9]/g, "")
        .toUpperCase(),
  },
  "bookie license": { price: 11000000, generateMeta: () => "" },
  adblock: { price: 1000000, generateMeta: () => "" },
  "magic beans": {
    price: 100000000,
    generateMeta: () => "",
    maintainsValue: true,
  },
  "shield of turin": {
    price: 250000000,
    generateMeta: () => "",
    maintainsValue: true,
  },
  head: { price: 500000000, generateMeta: () => "", maintainsValue: true },
  demon: { price: 1000000000, generateMeta: () => "", maintainsValue: true },
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

    if (user.role === "racketeer" && itemName === "bookie license") {
      return res
        .status(400)
        .json({ message: "You can't buy a bookie license" });
    }

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

    res.json({ message: "Item purchased", user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
};

exports.sendBeans = async (req, res, next) => {
  try {
    const { userId, userKey, recipientName, message, amount } = req.body;

    let sender = await User.findById(userId);
    if (!sender) return res.status(404).json({ message: "User not found" });

    if (sender.password.slice(-10) !== userKey) {
      return res.status(403).json({ message: "Invalid key" });
    }

    if (sender.debt > 0) {
      return res
        .status(400)
        .json({ message: "You can't transfer beans while in debt" });
    }

    if (sender.beans < amount) {
      return res.status(400).json({ message: "Not enough beans" });
    }

    if (amount < 500_000) {
      return res
        .status(400)
        .json({ message: "Minimum transfer amount is 500,000 beans" });
    }

    const recipient = await User.findOne({
      contentType: "user",
      name: recipientName.trim(),
    }).collation({ locale: "en", strength: 2 });

    if (!recipient)
      return res.status(404).json({ message: "Recipient not found" });

    // Add item to recipient's inventory
    const item = {
      name: "bean bag",
      meta: sender.name,
      specialPrice: amount,
      specialDescription: message,
    };

    sender.beans -= amount;
    recipient.inventory = recipient.inventory || [];
    recipient.inventory.push(item);

    await Promise.all([sender.save(), recipient.save()]);

    // **Fetch updated sender info**
    sender = await User.findById(userId).lean();

    res.json({
      message: "Beans transferred successfully",
      user: sanitizeUser(sender), // Ensure latest sender data is sent
    });
  } catch (error) {
    next(error);
  }
};

exports.sellItem = async (req, res, next) => {
  try {
    const { userId, itemName, itemId } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.inventory.length === 0) {
      return res.status(400).json({ message: "User has no items to sell" });
    }

    let itemValue = null;
    let itemIndex = -1;

    if (itemId) {
      itemIndex = user.inventory.findIndex((i) => i._id == itemId);
      if (itemIndex !== -1) {
        itemValue = user.inventory[itemIndex].specialPrice;
      }
    }

    if (itemValue === null && itemName) {
      const item = ITEMS[itemName.toLowerCase()];
      if (!item) {
        return res.status(400).json({ message: "Invalid item name" });
      }

      itemIndex = user.inventory.findIndex(
        (i) => i.name.toLowerCase() === itemName.toLowerCase()
      );

      if (itemIndex !== -1) {
        itemValue = item.maintainsValue ? item.price : item.price / 2;
      }
    }

    if (itemIndex === -1) {
      return res.status(400).json({ message: "Item not found in inventory" });
    }

    user.inventory.splice(itemIndex, 1);
    user.beans += Math.floor(itemValue);
    await user.save();

    res.json({ message: "Item sold", user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
};

exports.updateNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) return res.status(404).json({ message: "User not found" });

    user.notificationsLastChecked = new Date();
    await user.save();

    res.json({
      message: "Last notification check updated",
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
};

exports.getJackpot = async (req, res, next) => {
  try {
    const house = await User.findById(HOUSE_ID);
    if (!house) {
      return res.status(404).json({ message: "House account not found" });
    }

    res.json({ jackpot: house.beans ?? 0 });
  } catch (error) {
    next(error);
  }
};

exports.createHouseInvite = async (req, res, next) => {
  try {
    const { userId, userKey } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.role !== "admin")
      return res.status(403).json({ message: "User is not an admin" });

    if (user.password.slice(-10) !== userKey)
      return res.status(403).json({ message: "Invalid key" });

    const house = await User.findById(HOUSE_ID);
    if (!house)
      return res.status(404).json({ message: "House account not found" });

    const inviteCode = await generateUniqueInviteCode();

    house.inventory.push({ name: "invite", meta: inviteCode });
    await house.save();

    const invites = house.inventory.filter((item) => item.name === "invite");

    res.json({ message: "Invite created", invites });
  } catch (error) {
    next(error);
  }
};

exports.getHouseInvites = async (req, res, next) => {
  try {
    const { userId, userKey } = req.query;

    // Find the user by ID
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    //check if user is an admin
    if (user.role !== "admin")
      return res.status(403).json({ message: "User is not an admin" });

    // Check if the key matches the last 10 characters of the stored password
    if (user.password.slice(-10) !== userKey)
      return res.status(403).json({ message: "Invalid key" });

    // Find all users
    const house = await User.findById(HOUSE_ID);
    if (!house)
      return res.status(404).json({ message: "House account not found" });

    const invites = house.inventory.filter((item) => item.name === "invite");

    res.json({ invites });
  } catch (error) {
    next(error);
  }
};

exports.runLottery = async (req, res, next) => {
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

    const isWinner = Math.random() < 1 / 100000;

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
      user: sanitizeUser(user),
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

    if (user.debt > 0) {
      return res.status(400).json({ message: "User already has a debt" });
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
      user: sanitizeUser(user),
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
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
};

exports.sendMassNotification = async (req, res, next) => {
  try {
    const { userId, userKey, message } = req.body;

    // Find the user by ID
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    //check if user is an admin
    if (user.role !== "admin")
      return res.status(403).json({ message: "User is not an admin" });

    // Check if the key matches the last 10 characters of the stored password
    if (user.password.slice(-10) !== userKey)
      return res.status(403).json({ message: "Invalid key" });

    // Find all users
    const users = await User.find({ contentType: "user" });
    if (!users) return res.status(404).json({ message: "No users found" });

    // Send the message to all users
    users.forEach(async (u) => {
      if (!u.notifications) u.notifications = [];
      u.notifications.push({ text: message });
      await u.save();
    });

    res.json({ message: "Message sent to all users" });
  } catch (error) {
    next(error);
  }
};
