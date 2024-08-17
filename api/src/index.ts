import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { depthRouter, orderRouter } from "./routes";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/v1/order", orderRouter);
app.use("/api/v1/depth", depthRouter);

const port = process.env.PORT ?? 8000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}.`);
});
