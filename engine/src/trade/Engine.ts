import { RedisManager } from "../RedisManager";
import { TRADE_ADDED } from "../types";
import { CREATE_ORDER, MessageFromApi } from "../types/fromApi";
import { Fill, Order, Orderbook } from "./Orderbook";

export const BASE_CURRENCY = "INR";

interface UserBalance {
  [key: string]: {
    available: number;
    locked: number;
  };
}

export class Engine {
  private orderbooks: Orderbook[] = [];
  private balances: Map<string, UserBalance> = new Map();

  constructor() {
    this.orderbooks = [new Orderbook([], [], "TATA", 0, 0)];
    this.setBaseBalances();
  }

  process({
    message,
    clientId,
  }: {
    message: MessageFromApi;
    clientId: string;
  }) {
    switch (message.type) {
      case CREATE_ORDER:
        try {
          const { market, price, quantity, side, userId } = message.data;

          const { executedQty, fills, orderId } = this.createOrder(
            market,
            price,
            quantity,
            side,
            userId
          );

          RedisManager.getInstance().sendToApi(clientId, {
            type: "ORDER_PLACED",
            payload: {
              orderId,
              executedQty,
              fills,
            },
          });
        } catch (e) {
          console.log(e);
          RedisManager.getInstance().sendToApi(clientId, {
            type: "ORDER_CANCELLED",
            payload: {
              orderId: "",
              executedQty: 0,
              remainingQty: 0,
            },
          });
        }

        break;
    }
  }

  createOrder(
    market: string,
    price: string,
    quantity: string,
    side: "buy" | "sell",
    userId: string
  ) {
    console.log("In Engine - createOrder: ");
    const orderbook = this.orderbooks.find((o) => o.ticker() === market);
    const baseAsset = market.split("_")[0];
    const quoteAsset = market.split("_")[1];

    if (!orderbook) {
      throw new Error("No orderbook found");
    }

    try {
      this.checkAndLockFunds(
        baseAsset,
        quoteAsset,
        side,
        userId,
        price,
        quantity
      );
    } catch (error) {
      console.log("Error locking funds: ", error);
      throw error;
    }

    const order: Order = {
      price: Number(price),
      quantity: Number(quantity),
      orderId:
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15),
      filled: 0,
      side,
      userId,
    };

    const { executedQty, fills } = orderbook.addOrder(order);

    this.updateBalance(userId, baseAsset, quoteAsset, side, fills);
    this.createDbTrades(fills, market, userId);

    console.log("asks & bids: ", orderbook.getAsksBids());
    console.log("balances: ", this.balances);

    return {
      executedQty,
      fills,
      orderId: order.orderId,
    };
  }

  checkAndLockFunds(
    baseAsset: string,
    quoteAsset: string,
    side: "buy" | "sell",
    userId: string,
    price: string,
    quantity: string
  ) {
    if (side === "buy") {
      if (
        (this.balances.get(userId)?.[quoteAsset]?.available ?? 0) <
        Number(quantity) * Number(price)
      ) {
        throw new Error("Insufficient funds");
      }

      //@ts-ignore
      this.balances.get(userId)?.[quoteAsset]?.available =
        (this.balances.get(userId)?.[quoteAsset]?.available ?? 0) -
        Number(quantity) * Number(price);

      //@ts-ignore
      this.balances.get(userId)?.[quoteAsset]?.locked =
        (this.balances.get(userId)?.[quoteAsset]?.locked ?? 0) +
        Number(quantity) * Number(price);
    } else {
      if (
        (this.balances.get(userId)?.[baseAsset]?.available ?? 0) <
        Number(quantity)
      ) {
        throw new Error("Insufficient funds");
      }

      //@ts-ignore
      this.balances.get(userId)?.[baseAsset]?.available =
        (this.balances.get(userId)?.[baseAsset]?.available ?? 0) -
        Number(quantity);

      //@ts-ignore
      this.balances.get(userId)?.[baseAsset]?.locked =
        (this.balances.get(userId)?.[baseAsset]?.locked ?? 0) +
        Number(quantity);
    }
  }

  updateBalance(
    userId: string,
    baseAsset: string,
    quoteAsset: string,
    side: "buy" | "sell",
    fills: Fill[]
  ) {
    if (side === "buy") {
      fills.forEach((fill) => {
        // seller user balance updates

        // @ts-ignore
        this.balances.get(fill.otherUserId)?.[quoteAsset].available =
          (this.balances.get(fill.otherUserId)?.[quoteAsset]?.available ?? 0) +
          fill.qty * Number(fill.price);

        // @ts-ignore
        this.balances.get(fill.otherUserId)?.[baseAsset].locked =
          (this.balances.get(fill.otherUserId)?.[baseAsset].locked ?? 0) -
          fill.qty;

        // buyer user balance updates

        // @ts-ignore
        this.balances.get(userId)?.[quoteAsset]?.locked =
          (this.balances.get(userId)?.[quoteAsset]?.locked ?? 0) -
          fill.qty * Number(fill.price);

        // @ts-ignore
        this.balances.get(userId)?.[baseAsset]?.available =
          (this.balances.get(userId)?.[baseAsset]?.available ?? 0) + fill.qty;
      });
    } else {
      fills.forEach((fill) => {
        // seller user balance updates

        // @ts-ignore
        this.balances.get(userId)?.[baseAsset]?.locked =
          (this.balances.get(userId)?.[baseAsset].locked ?? 0) - fill.qty;

        //@ts-ignore
        this.balances.get(userId)?.[quoteAsset].available =
          (this.balances.get(userId)?.[quoteAsset].available ?? 0) +
          fill.qty * Number(fill.price);

        // buyer user balance updates

        // @ts-ignore
        this.balances.get(fill.otherUserId)?.[quoteAsset]?.locked =
          (this.balances.get(fill.otherUserId)?.[quoteAsset]?.locked ?? 0) -
          fill.qty * Number(fill.price);

        // @ts-ignore
        this.balances.get(fill.otherUserId)?.[baseAsset]?.available =
          (this.balances.get(fill.otherUserId)?.[baseAsset]?.available ?? 0) +
          fill.qty;
      });
    }
  }

  createDbTrades(fills: Fill[], market: string, userId: string) {
    fills.forEach((fill) => {
      RedisManager.getInstance().pushMessage({
        type: TRADE_ADDED,
        data: {
          market: market,
          id: fill.tradeId.toString(),
          isBuyerMaker: fill.otherUserId === userId,
          price: fill.price,
          quantity: fill.qty.toString(),
          quoteQuantity: (fill.qty * Number(fill.price)).toString(),
          timestamp: Date.now(),
        },
      });
    });
  }

  setBaseBalances() {
    this.balances.set("u001", {
      [BASE_CURRENCY]: {
        available: 10000,
        locked: 0,
      },
      TATA: {
        available: 10000,
        locked: 0,
      },
    });

    this.balances.set("u002", {
      [BASE_CURRENCY]: {
        available: 10000,
        locked: 0,
      },
      TATA: {
        available: 10000,
        locked: 0,
      },
    });

    this.balances.set("u003", {
      [BASE_CURRENCY]: {
        available: 10000,
        locked: 0,
      },
      TATA: {
        available: 10000,
        locked: 0,
      },
    });

    this.balances.set("u004", {
      [BASE_CURRENCY]: {
        available: 10000,
        locked: 0,
      },
      TATA: {
        available: 10000,
        locked: 0,
      },
    });

    this.balances.set("u005", {
      [BASE_CURRENCY]: {
        available: 10000,
        locked: 0,
      },
      TATA: {
        available: 10000,
        locked: 0,
      },
    });
  }
}
