import { RedisClientType, createClient } from "redis";
import { MessageToEngine } from "./types/to";
import { MessageFromOrderbook } from "./types";

export class RedisManager {
  private client: RedisClientType;
  private publisher: RedisClientType;
  private static instance: RedisManager;

  private constructor() {
    this.client = createClient();
    this.client.connect();
    this.publisher = createClient();
    this.publisher.connect();
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new RedisManager();
    }
    return this.instance;
  }

  public getRandomClientId() {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }

  public sendAndAwait(message: MessageToEngine) {
    console.log("sending message", message);
    return new Promise<MessageFromOrderbook>((resolve) => {
      const id = this.getRandomClientId();
      console.log("client id", id);
      this.client.subscribe(id, (msg) => {
        this.client.unsubscribe(id);
        console.log("received message", msg);
        resolve(JSON.parse(msg));
      });
      this.publisher.lPush(
        "messages",
        JSON.stringify({ clientId: id, message })
      );
    });
  }
}
