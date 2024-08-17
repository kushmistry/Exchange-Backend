import { RedisManager } from "../RedisManager";
import { CREATE_ORDER, MessageFromApi } from "../types/fromApi";
import { Orderbook } from "./Orderbook";

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
          console.log("In Process => ", message.data);
          RedisManager.getInstance().sendToApi(clientId, {
            type: "ORDER_PLACED",
            payload: {
              orderId: "123",
              executedQty: 0,
              fills: [],
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
  }
}
