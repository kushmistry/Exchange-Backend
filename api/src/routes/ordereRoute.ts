import { Router } from "express";
import { createOrder } from "../controller";

export const orderRouter = Router();

orderRouter.post("/", createOrder);
