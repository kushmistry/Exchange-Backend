import { Router } from "express";

export const depthRouter = Router();

depthRouter.get("/", async (req, res) => {
  console.log("here");
  return res.send("hello from depth!");
});
