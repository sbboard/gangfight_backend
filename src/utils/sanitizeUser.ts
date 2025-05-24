import { Bettor } from "../models/beans.model.js";

export const sanitizeUser = (
  user: Bettor
): Omit<Bettor, "password" | "referrer"> => {
  const sanitizedUser = user.toObject ? user.toObject() : { ...user };

  delete sanitizedUser.password;
  delete sanitizedUser.referrer;
  sanitizedUser.name = sanitizedUser.displayName || sanitizedUser.name;
  delete sanitizedUser.displayName;

  return sanitizedUser;
};

export default sanitizeUser;
