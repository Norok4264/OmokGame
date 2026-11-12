import type { WebSocket } from "ws";
import type { SqliteDatabase } from "./storage/database.js";

export const LIMITS = Object.freeze({ sessions:40, games:20, inputBytes:8192, requests:100, windowMs:10000, bufferedBytes:1048576, retentionMs:86400000 });
export const DEVELOPMENT_ORIGINS = ["http://127.0.0.1:5173","http://localhost:5173","http://127.0.0.1:4173","http://localhost:4173"];
export function assertGameCapacity(db:SqliteDatabase):void {
  if(Number(db.prepare("SELECT count(*) FROM games WHERE status IN ('PREPARING','ACTIVE')").pluck().get())>=LIMITS.games) throw new Error("GAME_CAPACITY");
}
export function sendBounded(socket:WebSocket,message:Record<string,unknown>):void {
  if(socket.readyState!==1)return;
  if(socket.bufferedAmount>LIMITS.bufferedBytes){socket.close(4008,"Send buffer limit; reconnect for snapshot");return;}
  socket.send(JSON.stringify(message));
  if(socket.bufferedAmount>LIMITS.bufferedBytes)socket.close(4008,"Send buffer limit; reconnect for snapshot");
}
/** Sliding window, including malformed requests. Do not extend the window on rejection. */
export function admitRequest(history:number[],now:number):boolean {
  while(history.length&&history[0]!<=now-LIMITS.windowMs)history.shift();
  if(history.length>=LIMITS.requests)return false;
  history.push(now);return true;
}
