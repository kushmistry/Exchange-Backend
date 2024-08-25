import fs from "fs";
import { RedisManager } from "../RedisManager";
import { ORDER_UPDATE, TRADE_ADDED } from "../types";
import {
  CANCEL_ORDER,
  CREATE_ORDER,
  GET_OPEN_ORDERS,
  MessageFromApi,
} from "../types/fromApi";
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
    let snapshot = null;
    try {
      if (process.env.WITH_SNAPSHOT) {
        snapshot = fs.readFileSync("./snapshot.json");
      }
    } catch (e) {
      console.log("No snapshot found");
    }

    if (snapshot) {
      const snapshotSnapshot = JSON.parse(snapshot.toString());
      this.orderbooks = snapshotSnapshot.orderbooks.map(
        (o: any) =>
          new Orderbook(
            o.baseAsset,
            o.bids,
            o.asks,
            o.lastTradeId,
            o.currentPrice
          )
      );
      this.balances = new Map(snapshotSnapshot.balances);
    } else {
      this.orderbooks = [new Orderbook("TATA", [], [], 0, 0)];
      this.setBaseBalances();
    }
    setInterval(() => {
      this.saveSnapshot();
    }, 1000 * 3);
  }

  saveSnapshot() {
    const snapshotSnapshot = {
      orderbooks: this.orderbooks.map((o) => o.getSnapshot()),
      balances: Array.from(this.balances.entries()),
    };
    fs.writeFileSync("./snapshot.json", JSON.stringify(snapshotSnapshot));
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

      case GET_OPEN_ORDERS:
        try {
          const openOrderBook = this.orderbooks.find(
            (o) => o.ticker() === message.data.market
          );
          if (!openOrderBook) {
            throw new Error("No orderbook found");
          }

          const openOrders = openOrderBook.getOpenOrders(message.data.userId);

          RedisManager.getInstance().sendToApi(clientId, {
            type: "OPEN_ORDERS",
            payload: openOrders,
          });
        } catch (e) {
          console.log(e);
        }
        break;

      case CANCEL_ORDER:
        try {
          const orderId = message.data.orderId;
          const market = message.data.market;
          const orderbook = this.orderbooks.find((o) => o.ticker() === market);
          const quoteAsset = market.split("_")[1];

          if (!orderbook) {
            throw new Error("No orderbook found");
          }

          const order =
            orderbook.getAsks().find((o) => o.orderId === orderId) ||
            orderbook.getBids().find((o) => o.orderId === orderId);
          if (!order) {
            console.log("No order found");
            throw new Error("No order found");
          }

          if (order.side === "buy") {
            const price = orderbook.cancleBid(order);
            const leftQuantity = order.quantity - order.filled;
            const returnAmount = Number(price) * leftQuantity;

            //@ts-ignore
            this.balances.get(order.userId)[quoteAsset].available +=
              returnAmount;

            //@ts-ignore
            this.balances.get(order.userId)[quoteAsset].locked -= returnAmount;
          } else {
            const price = orderbook.cancleAsk(order);
            const leftQuantity = order.quantity - order.filled;
            //@ts-ignore
            this.balances.get(order.userId)[quoteAsset].available +=
              leftQuantity;
            //@ts-ignore
            this.balances.get(order.userId)[quoteAsset].locked -= leftQuantity;
          }

          RedisManager.getInstance().sendToApi(clientId, {
            type: "ORDER_CANCELLED",
            payload: {
              orderId,
              executedQty: 0,
              remainingQty: 0,
            },
          });
        } catch (e) {
          console.log(e);
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
    this.updateDbOrders(order, executedQty, fills, market);

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

  updateDbOrders(
    order: Order,
    executedQty: number,
    fills: Fill[],
    market: string
  ) {
    RedisManager.getInstance().pushMessage({
      type: ORDER_UPDATE,
      data: {
        orderId: order.orderId,
        executedQty: executedQty,
        market: market,
        price: order.price.toString(),
        quantity: order.quantity.toString(),
        side: order.side,
      },
    });

    fills.forEach((fill) => {
      RedisManager.getInstance().pushMessage({
        type: ORDER_UPDATE,
        data: {
          orderId: fill.markerOrderId,
          executedQty: fill.qty,
        },
      });
    });
  }

  setBaseBalances() {
    this.balances.set("u001", {
      [BASE_CURRENCY]: {
        available: 10000000,
        locked: 0,
      },
      TATA: {
        available: 10000000,
        locked: 0,
      },
    });

    this.balances.set("u002", {
      [BASE_CURRENCY]: {
        available: 10000000,
        locked: 0,
      },
      TATA: {
        available: 10000000,
        locked: 0,
      },
    });

    this.balances.set("u003", {
      [BASE_CURRENCY]: {
        available: 10000000,
        locked: 0,
      },
      TATA: {
        available: 10000000,
        locked: 0,
      },
    });

    this.balances.set("u004", {
      [BASE_CURRENCY]: {
        available: 10000000,
        locked: 0,
      },
      TATA: {
        available: 10000000,
        locked: 0,
      },
    });

    this.balances.set("u005", {
      [BASE_CURRENCY]: {
        available: 10000000,
        locked: 0,
      },
      TATA: {
        available: 10000000,
        locked: 0,
      },
    });
  }
}
