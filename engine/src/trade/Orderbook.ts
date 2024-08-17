import { BASE_CURRENCY } from "./Engine";

export interface Order {
  price: number;
  quantity: number;
  orderId: string;
  filled: number;
  side: "buy" | "sell";
  userId: string;
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
}
