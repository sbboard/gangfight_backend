import patreon from "patreon";
import dotenv from "dotenv";
dotenv.config();

const accessToken = process.env.PATREON_ACCESS_TOKEN as string;

const patreonAPI = patreon.patreon;
const campID = "4942396";

const patreonAPIClient = patreonAPI(accessToken);

interface PatreonUser {
  type: string;
  id: string;
  attributes: {
    full_name: string;
  };
}

function checkUser(item: PatreonUser): boolean {
  return item.type === "user" && item.attributes.full_name !== "Gang Fight";
}

import { Request, Response, NextFunction } from "express";

export const get_patrons = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  patreonAPIClient(`/campaigns/${campID}/pledges`)
    .then((result: any) => {
      const theIncluded: PatreonUser[] = result.rawJson.included || [];
      const weeded = theIncluded.filter(checkUser);
      const cleanArray = weeded.map((v) => ({
        name: v.attributes.full_name,
        id: v.id,
      }));
      res.send(cleanArray);
    })
    .catch((err: any) => {
      console.error("❌ Error:", err);
      res.status(500).send(err);
    });
};
