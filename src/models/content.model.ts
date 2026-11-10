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
  // its place in its series' reading order (0 first) - which isn't always
  // the order they came out in. Only comics in a series have one; set from
  // gambee's Series Order page, and never touches the dates.
  seriesOrder?: number;
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
  seriesOrder: { type: Number },
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
