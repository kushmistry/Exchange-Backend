import { RedisManager } from "../RedisManager";
import { CREATE_ORDER, MessageFromApi } from "../types/fromApi";
import { Order, Orderbook } from "./Orderbook";

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
    console.log({ market, price, quantity, side, userId });

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

    console.log("asks & bids: ", orderbook.getAsksBids());

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
    console.log({ baseAsset, quoteAsset, side, userId, price, quantity });
    if (side === "buy") {
      const userQuoteAssetBalance =
        this.balances.get(userId)?.[quoteAsset]?.available ?? 0;
      if (userQuoteAssetBalance < Number(quantity) * Number(price)) {
        throw new Error("Insufficient funds");
      }

      //@ts-ignore
      this.balances.get(userId)?.[quoteAsset]?.available =
        userQuoteAssetBalance - Number(quantity) * Number(price);

      //@ts-ignore
      this.balances.get(userId)?.[quoteAsset]?.locked =
        this.balances.get(userId)?.[quoteAsset]?.locked ??
        0 + Number(quantity) * Number(price);
    } else {
      const userBaseAssetBalance =
        this.balances.get(userId)?.[baseAsset]?.available ?? 0;
      if (userBaseAssetBalance < Number(quantity)) {
        throw new Error("Insufficient funds");
      }

      //@ts-ignore
      this.balances.get(userId)?.[baseAsset]?.available =
        userBaseAssetBalance - Number(quantity);

      //@ts-ignore
      this.balances.get(userId)?.[baseAsset]?.locked =
        this.balances.get(userId)?.[baseAsset]?.locked ?? 0 + Number(quantity);
    }
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
