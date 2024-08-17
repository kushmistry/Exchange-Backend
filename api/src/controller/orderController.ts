import { Request, Response } from "express";
import { RedisManager } from "../RedisManager";
import { CREATE_ORDER } from "../types";

export const createOrder = async (req: Request, res: Response) => {
  const { market, price, quantity, side, userId } = req.body;
  console.log({ market, price, quantity, side, userId });

  const response = await RedisManager.getInstance().sendAndAwait({
    type: CREATE_ORDER,
    data: {
      market,
      price,
      quantity,
      side,
      userId,
    },
  });
  console.log({ response });
  res.json(response.payload);
};
