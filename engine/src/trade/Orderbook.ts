import { BASE_CURRENCY } from "./Engine";

export interface Order {
  price: number;
  quantity: number;
  orderId: string;
  filled: number;
  side: "buy" | "sell";
  userId: string;
}

export interface Fill {
  price: string;
  qty: number;
  tradeId: number;
  otherUserId: string;
  markerOrderId: string;
}

export class Orderbook {
  private bids: Order[];
  private asks: Order[];
  private baseAsset: string;
  private quoteAsset: string = BASE_CURRENCY;
  private lastTradeId: number;
  private currentPrice: number;

  constructor(
    bids: Order[],
    asks: Order[],
    baseAsset: string,
    lastTradeId: number,
    currentPrice: number
  ) {
    this.bids = bids;
    this.asks = asks;
    this.baseAsset = baseAsset;
    this.lastTradeId = lastTradeId ?? 0;
    this.currentPrice = currentPrice ?? 0;
  }

  public ticker() {
    return `${this.baseAsset}_${this.quoteAsset}`;
  }

  public addOrder(order: Order): {
    executedQty: number;
    fills: Fill[];
  } {
    const { side } = order;

    if (side === "buy") {
      const { fills, executedQty } = this.matchBid(order);
      order.filled = executedQty;
      if (executedQty === order.quantity) {
        return {
          fills,
          executedQty,
        };
      }
      this.bids.push(order);
      return {
        fills,
        executedQty,
      };
    } else {
      const { executedQty, fills } = this.matchAsk(order);
      order.filled = executedQty;
      if (executedQty === order.quantity) {
        return {
          fills,
          executedQty,
        };
      }
      this.asks.push(order);
      return {
        fills,
        executedQty,
      };
    }
  }

  matchBid(order: Order): {
    fills: Fill[];
    executedQty: number;
  } {
    let executedQty = 0;
    const fills: Fill[] = [];

    this.asks.sort((a, b) => a.price - b.price);
    const totalAsks = this.asks;

    for (const ask of totalAsks) {
      if (executedQty === order.quantity) {
        break;
      }
      if (ask.price <= order.price) {
        const filledQty = Math.min(order.quantity - executedQty, ask.quantity);
        executedQty += filledQty;
        ask.filled += filledQty;
        fills.push({
          price: ask.price.toString(),
          qty: filledQty,
          tradeId: this.lastTradeId++,
          otherUserId: ask.userId,
          markerOrderId: order.orderId,
        });
      }
    }

    for (let i = totalAsks.length - 1; i >= 0; i--) {
      if (totalAsks[i].filled === totalAsks[i].quantity) {
        totalAsks.splice(i, 1);
      }
    }

    return {
      executedQty,
      fills,
    };
  }

  matchAsk(order: Order): {
    fills: Fill[];
    executedQty: number;
  } {
    let executedQty = 0;
    const fills: Fill[] = [];

    this.bids.sort((a, b) => b.price - a.price);
    const totalBids = this.bids;

    for (const bid of totalBids) {
      if (executedQty === order.quantity) {
        break;
      }
      if (bid.price >= order.price) {
        const filledQty = Math.min(order.quantity - executedQty, bid.quantity);
        executedQty += filledQty;
        bid.filled += filledQty;
        fills.push({
          price: bid.price.toString(),
          qty: filledQty,
          tradeId: this.lastTradeId++,
          otherUserId: bid.userId,
          markerOrderId: order.orderId,
        });
      }
    }

    for (let i = totalBids.length - 1; i >= 0; i--) {
      if (totalBids[i].filled === totalBids[i].quantity) {
        totalBids.splice(i, 1);
      }
    }
    return {
      executedQty,
      fills,
    };
  }

  getAsksBids() {
    return {
      asks: this.asks,
      bids: this.bids,
    };
  }
}
