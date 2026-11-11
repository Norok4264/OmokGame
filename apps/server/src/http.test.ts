import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { createApplicationServer } from "./http.js";
import { openDatabase } from "./storage/database.js";

describe("server health and readiness", () => {
  it("reports health and SQLite readiness after migrations", async () => {
    const db = openDatabase(":memory:");
    const app = createApplicationServer(db);
    app.httpServer.listen(0, "127.0.0.1");
    await once(app.httpServer, "listening");
    const address = app.httpServer.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const health = await fetch(`${baseUrl}/healthz`);
      const ready = await fetch(`${baseUrl}/readyz`);
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ status: "ok" });
      expect(ready.status).toBe(200);
      expect(await ready.json()).toMatchObject({ status: "ready", checks: { sqlite: true } });
    } finally {
      app.webSocketServer.close();
      app.httpServer.close();
      await once(app.httpServer, "close");
      db.close();
    }
  });
});
