import mongoose from "mongoose";
const { Schema } = mongoose;

mongoose.set("strictQuery", false);

export interface GangContent extends mongoose.Document {
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
  // credits: who wrote it, drew it and made its audio, each with an optional
  // link to their page (any of them can be left out)
  author?: string;
  artist?: string;
  musician?: string;
  authorUrl?: string;
  artistUrl?: string;
  musicianUrl?: string;
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
  comicsArray: { type: [Schema.Types.Mixed] },
  iframe: { type: Boolean, default: false },
  author: { type: String, trim: true },
  artist: { type: String, trim: true },
  musician: { type: String, trim: true },
  authorUrl: { type: String, trim: true },
  artistUrl: { type: String, trim: true },
  musicianUrl: { type: String, trim: true },
});

const GangContentModel = mongoose.model<GangContent>(
  "content",
  GangContentSchema
);

export default GangContentModel;
