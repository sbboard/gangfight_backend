import { Bettor } from "../models/beans.model.js";
import { LeanDocument } from "mongoose";

export const sanitizeUser = (user: Bettor): Bettor => {
  const sanitizedUser = user.toObject
    ? (user.toObject() as LeanDocument<Bettor>)
    : { ...user };

  delete sanitizedUser.password;
  delete sanitizedUser.referrer;

  return sanitizedUser as Bettor;
};

export default sanitizeUser;
