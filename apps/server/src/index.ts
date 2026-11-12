import { loadEnvFile } from "node:process";
import { createApplicationServer } from "./http.js";
import { openDatabase } from "./storage/database.js";
import { DEVELOPMENT_ORIGINS } from "./limits.js";
import { stopApplication } from "./shutdown.js";

try {
  loadEnvFile(".env");
} catch (error) {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
}

const databasePath = process.env.DATABASE_PATH ?? "./data/omok.sqlite";
const port = Number.parseInt(process.env.PORT ?? "3001", 10);
const host = process.env.HOST ?? "127.0.0.1";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer from 1 to 65535");
}

const db = openDatabase(databasePath);
const origins=process.env.ALLOWED_ORIGINS?.split(",").map(value=>value.trim()).filter(Boolean)??DEVELOPMENT_ORIGINS;
const { httpServer, webSocketServer, lobby } = createApplicationServer(db,undefined,origins);

httpServer.listen(port, host, () => {
  process.stdout.write(`danpan-omok server listening on http://${host}:${port}\n`);
});

let stopping=false;
function shutdown(): void {
  if(stopping)return;stopping=true;
  void stopApplication({httpServer,webSocketServer,lobby},db).then(()=>process.exit(0),()=>process.exit(1));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
