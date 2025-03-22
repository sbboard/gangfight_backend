import { Connection } from "mongoose"; // Correct import for the connection type

declare global {
  namespace Express {
    interface Request {
      beansDb?: Connection; // Use Connection type here
    }
  }
}
