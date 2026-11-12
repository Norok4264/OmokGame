import type { ApplicationServer } from "./http.js";
import type { SqliteDatabase } from "./storage/database.js";

/** Stop accepting work, drain WS/HTTP, then close SQLite; startup reconciles saved active games. */
export function stopApplication(app:ApplicationServer,db:SqliteDatabase,graceMs=10000):Promise<void>{
  return new Promise((resolve,reject)=>{
    let done=false,remaining=2;
    const finish=()=>{if(done)return;done=true;clearTimeout(timer);try{db.close();resolve();}catch(error){reject(error);}};
    const closed=()=>{if(--remaining===0)finish();};
    const timer=setTimeout(()=>{for(const socket of app.webSocketServer.clients)socket.terminate();app.httpServer.closeAllConnections();finish();},graceMs);
    timer.unref();
    app.lobby.close();
    for(const socket of app.webSocketServer.clients)socket.close(1012,"Server restarting");
    app.webSocketServer.close(closed);
    app.httpServer.close(closed);
  });
}
