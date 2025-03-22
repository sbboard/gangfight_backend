import { ITEMS } from "../constants/items.js";
import { User } from "../models/beans.model.js";

export const generateUniqueInviteCode = async () => {
  let code = "";
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
