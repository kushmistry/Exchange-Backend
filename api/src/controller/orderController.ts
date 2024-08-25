import { Request, Response } from "express";
import { RedisManager } from "../RedisManager";
import { CANCEL_ORDER, CREATE_ORDER, GET_OPEN_ORDERS } from "../types";

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

export const getOpenOrders = async (req: Request, res: Response) => {
  const response = await RedisManager.getInstance().sendAndAwait({
    type: GET_OPEN_ORDERS,
    data: {
      userId: req.query.userId as string,
      market: req.query.market as string,
    },
  });

  res.json(response.payload);
};

export const deleteOrder = async (req: Request, res: Response) => {
  const { orderId, market } = req.body;
  const response = await RedisManager.getInstance().sendAndAwait({
    type: CANCEL_ORDER,
    data: {
      orderId,
      market,
    },
  });

  return res.json(response.payload);
};
