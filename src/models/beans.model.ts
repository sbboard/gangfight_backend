import mongoose from "mongoose";

const { Schema } = mongoose; // Destructure Schema from the default import

// Poll Option Schema Interface
export interface PollOption extends mongoose.Document {
  _id: string;
  text: string;
  bettors: string[];
}

export interface WriteIns extends mongoose.Document {
  text: string;
  bettor: string;
}

// Poll Schema Interface
interface Poll extends mongoose.Document {
  _id: string;
  creatorId?: string;
  creatorName?: string;
  title: string;
  description: string;
  endDate: Date;
  settleDate?: Date;
  winner?: string | null; //deprecated
  winners: string[];
  creationDate: Date;
  pricePerShare: number;
  seed: number;
  pot: number;
  options: PollOption[];
  contentType: string;
  legalStatus: {
    isLegal: boolean;
    lawsBroken: string[];
  };
  betPerWager?: number;
  writeInsEnabled?: boolean;
  writeIns?: WriteIns[];
}

// User Schema Interface
export interface Bettor extends mongoose.Document {
  _id: string;
  name: string;
  displayName?: string;
  lastIP?: string;
  debt: number;
  password?: string;
  role: string;
  inventory: InventoryItem[];
  beans: number;
  registrationDate: Date;
  wins: string[]; // Store poll IDs as strings
  referrer?: string | null;
  contentType: string;
  notifications: Notification[];
  notificationsLastChecked?: Date;
  penalties: number;
  lastDonation?: Date;
  lastBonusClaimed?: Date;
}

// Notification Schema Interface
interface Notification {
  text: string;
  date?: Date;
}

// Inventory Item Schema Interface
export interface InventoryItem extends mongoose.Document {
  name: string;
  meta: string;
  specialDescription?: string;
  specialPrice?: number;
}

// Poll Option Schema
const pollOptionSchema = new Schema<PollOption>({
  text: { type: String, required: true },
  bettors: [{ type: String, required: true }],
});

const WriteInsSchema = new Schema<WriteIns>({
  text: { type: String, required: true },
  bettor: [{ type: String, required: true }],
});

// Poll Schema
const pollSchema = new Schema<Poll>({
  creatorId: { type: String, required: true }, // Store user ID as a string
  title: { type: String, required: true },
  description: { type: String, required: true },
  endDate: { type: Date, required: true },
  winners: { type: [String], default: [] },
  creationDate: { type: Date, default: Date.now },
  pricePerShare: { type: Number, default: 500000 },
  seed: { type: Number, default: 1000000 },
  pot: { type: Number, default: 1000000 },
  options: [pollOptionSchema],
  contentType: {
    type: String,
    default: "poll",
    immutable: true,
  },
  legalStatus: {
    isLegal: { type: Boolean, default: true },
    lawsBroken: { type: [String], default: [] },
  },
  betPerWager: { type: Number },
  settleDate: {
    type: Date,
    default: function (this: Poll) {
      return this.endDate;
    },
  },
  winner: { type: String }, // deprecated
  writeInsEnabled: { type: Boolean, default: false },
  writeIns: [WriteInsSchema],
});

// Notification Schema
const notificationSchema = new Schema<Notification>({
  text: { type: String, required: true },
  date: { type: Date, default: Date.now },
});

// Inventory Item Schema
const inventoryItemSchema = new Schema<InventoryItem>({
  name: { type: String, required: true },
  meta: { type: String, default: "" },
  specialDescription: { type: String },
  specialPrice: { type: Number },
});

// User Schema
const userSchema = new Schema<Bettor>({
  name: { type: String, required: true },
  displayName: {
    type: String,
    default: function (this: Bettor) {
      return this.name;
    },
  },
  lastIP: { type: String },
  debt: { type: Number, default: 0 },
  password: { type: String, required: true },
  role: { type: String, default: "spectator" },
  inventory: [inventoryItemSchema],
  beans: { type: Number, default: 10000000 },
  registrationDate: { type: Date, default: Date.now },
  wins: [{ type: String }], // Store poll IDs as strings
  referrer: { type: String, default: null },
  contentType: {
    type: String,
    default: "user",
    immutable: true,
  },
  notifications: [notificationSchema],
  penalties: { type: Number, default: 0 },
  notificationsLastChecked: { type: Date },
  lastBonusClaimed: { type: Date },
  lastDonation: { type: Date },
});

// Export models
const User = mongoose.model<Bettor>("User", userSchema, "beans");
const Poll = mongoose.model<Poll>("Poll", pollSchema, "beans");
const Item = mongoose.model<InventoryItem>(
  "Item",
  inventoryItemSchema,
  "beans"
);

export { User, Poll, Item };
