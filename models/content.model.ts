import mongoose, { Document, Schema, Model } from "mongoose";

mongoose.set("strictQuery", false); // `useFindAndModify` is deprecated in Mongoose 6+

export interface GangContent extends Document {
  title: string;
  subtitle?: string;
  img: string;
  url: string;
  category: string;
  date: Date;
  updatedDate: Date;
  series?: string;
  assetFolder?: string;
  comicsArray?: any[];
  iframe?: boolean;
}

const GangContentSchema = new Schema<GangContent>({
  title: { type: String, required: true },
  subtitle: { type: String },
  img: { type: String, required: true },
  url: { type: String, required: true },
  category: { type: String, required: true },
  date: { type: Date, required: true },
  updatedDate: { type: Date, required: true },
  series: { type: String },
  assetFolder: { type: String },
  comicsArray: { type: [Schema.Types.Mixed] }, // Allows different data types in the array
  iframe: { type: Boolean, default: false },
});

const GangContentModel: Model<GangContent> = mongoose.model<GangContent>(
  "content",
  GangContentSchema
);

export default GangContentModel;
