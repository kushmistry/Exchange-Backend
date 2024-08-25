import { Router } from "express";
import { createOrder, deleteOrder, getOpenOrders } from "../controller";

export const orderRouter = Router();

orderRouter.post("/", createOrder);
orderRouter.delete("/", deleteOrder);
orderRouter.get("/open", getOpenOrders);
