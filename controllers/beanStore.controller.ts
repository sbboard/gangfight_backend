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

      //send all users a notification that user won the lottery
      const users = await User.find({ contentType: "user" });
      users.forEach(async (u) => {
        if (!u.notifications) u.notifications = [];
        u.notifications.push({
          text: `${
            user.name
          } won the lottery! The jackpot was ${wonBeans.toLocaleString()}.`,
        });
        await u.save();
      });
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

    recipient.notifications = recipient.notifications || [];
    recipient.notifications.push({
      text: `${sender.name} sent you ${amount.toLocaleString()} beans`,
    });

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
