import { RedisClientType, createClient } from "redis";
import { MessageToApi } from "./types/toApi";

export class RedisManager {
  private client: RedisClientType;
  private static instance: RedisManager;

  private constructor() {
    this.client = createClient();
    this.client.connect();
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new RedisManager();
    }
    return this.instance;
  }

  public sendToApi(clientId: string, message: MessageToApi) {
    this.client.publish(clientId, JSON.stringify(message));
  }
}
