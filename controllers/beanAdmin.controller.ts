exports.refundWager = async (req, res, next) => {
  try {
    const { pollId, userId, userKey } = req.body;

    // Validate admin
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== "admin")
      return res.status(403).json({ message: "User is not an admin" });
    if (user.password.slice(-10) !== userKey)
      return res.status(403).json({ message: "Invalid key" });

    // Find poll
    const poll = await Poll.findById(pollId);
    if (!poll) return res.status(404).json({ message: "Poll not found" });

    // Refund all bettors
    const userRefunds = new Map();
    poll.options.forEach((option) => {
      option.bettors.forEach((bettorId) => {
        userRefunds.set(
          bettorId,
          (userRefunds.get(bettorId) || 0) + poll.pricePerShare
        );
      });
    });

    await Promise.all(
      Array.from(userRefunds.entries()).map(async ([bettorId, refundAmt]) => {
        await User.findByIdAndUpdate(bettorId, {
          $inc: { beans: refundAmt },
          $push: {
            notifications: {
              text: `The wager "${
                poll.title
              }" has been refunded. The ${refundAmt.toLocaleString()} beans you bet have been returned to your bean bag.`,
            },
          },
        });
      })
    );

    // Refund creator
    const creator = await User.findById(poll.creatorId);
    if (creator) {
      creator.beans += poll.seed / 2;
      creator.notifications.push({
        text: `Your wager "${
          poll.title
        }" has been refunded. Your initial seed of ${(
          poll.seed / 2
        ).toLocaleString()} beans has been returned.`,
      });
      await creator.save();
    }

    // Delete poll
    await Poll.findByIdAndDelete(pollId);

    res.json({ message: "All bets refunded, wager deleted" });
  } catch (error) {
    next(error);
  }
};

exports.makeWagerIllegal = async (req, res, next) => {
  try {
    const { pollId, userId, userKey, lawsBroken } = req.body;

    // Fetch user and validate admin role
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== "admin")
      return res.status(403).json({ message: "User is not an admin" });
    if (user.password.slice(-10) !== userKey)
      return res.status(403).json({ message: "Invalid key" });

    // Fetch poll and validate existence
    const poll = await Poll.findById(pollId);
    if (!poll) return res.status(404).json({ message: "Poll not found" });

    // if poll is already illegal, return
    if (!poll.legalStatus.isLegal)
      return res.status(400).json({ message: "Wager already illegal" });

    //if poll is already settled, return
    if (poll.winner)
      return res.status(400).json({ message: "Wager already settled" });

    //if poll is already ended, return
    if (poll.endDate < Date.now())
      return res.status(400).json({ message: "Wager already ended" });

    //set End Date and settle date to now
    poll.endDate = Date.now();
    poll.settleDate = Date.now();

    // Mark poll as illegal
    poll.legalStatus = {
      isLegal: false,
      lawsBroken: lawsBroken.split(",").map((law) => law.trim()),
      dateBanned: new Date(),
    };
    await poll.save();

    // Fetch creator
    const creator = await User.findById(poll.creatorId);
    if (!creator) return res.status(404).json({ message: "Creator not found" });

    // Notify bettors
    const notification = {
      text: `ALERT: You are a victim! You bet in the wager "${poll.title}" which was found to be an illegal wager. 
        The wager has been closed, but ${creator.name} successfully stole all the beans associated with it.`,
    };

    await User.updateMany(
      { _id: { $in: poll.options.flatMap((opt) => opt.bettors) } },
      { $push: { notifications: notification } }
    );

    // Apply penalty and possible role change
    creator.penalties = (creator.penalties || 0) + 1;
    if (creator.penalties >= 3) {
      creator.role = "racketeer";
    }

    // Remove bookie license if present
    creator.inventory = creator.inventory.filter(
      (item) => item.name !== "bookie license"
    );

    // Notify creator
    const creatorNotification = {
      text:
        `Your wager "${poll.title}" was found to be illegal due to breaking the following laws: ${lawsBroken}.` +
        ` You did, however, successfully steal all ${poll.pot.toLocaleString()} beans associated with your illegal wager.` +
        (creator.penalties >= 3
          ? " You have been labeled a racketeer due to repeated offenses."
          : ""),
    };
    creator.notifications.push(creatorNotification);

    // Reward creator with the pot
    creator.beans += poll.pot;

    // Save creator changes
    await creator.save();

    res.json({ message: "Bet made illegal" });
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
