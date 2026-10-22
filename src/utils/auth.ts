import crypto from "crypto";
import { Bettor, User } from "../models/beans.model.js";

export const hashPassword = (password: string): string =>
  crypto.createHash("sha256").update(password).digest("hex");

// the "key" clients hold is the tail of the password hash
export const getKey = (hash: string): string => hash.slice(-10);

export const hasValidKey = (user: Bettor, key: unknown): boolean =>
  !!user.password && getKey(user.password) === key;

type AdminCheck =
  | { admin: Bettor; status?: never; message?: never }
  | { admin?: never; status: number; message: string };

export const verifyAdmin = async (
  userId: unknown,
  userKey: unknown
): Promise<AdminCheck> => {
  const user = await User.findById(userId);
  if (!user) return { status: 404, message: "User not found" };
  if (user.role !== "admin") {
    return { status: 403, message: "User is not an admin" };
  }
  if (!hasValidKey(user, userKey)) return { status: 403, message: "Invalid key" };
  return { admin: user };
};
