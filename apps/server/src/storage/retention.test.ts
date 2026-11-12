import Database from "better-sqlite3";
import { describe,it,expect } from "vitest";
import { runMigrations } from "./migrations.js";
import { purgeExpiredRecords } from "./retention.js";
describe("B12 result retention",()=>{
  function setup(){const db=new Database(":memory:");db.pragma("foreign_keys=ON");runMigrations(db);const now=Date.parse("2026-11-12T00:00:00Z"),ended=new Date(now-86400000).toISOString();
    for(const p of ["w","b"])db.prepare("INSERT INTO players VALUES(?,?,?,?)").run(p,p,p,ended);
    db.prepare("INSERT INTO player_sessions(session_id,player_id,token_hash,created_at_utc,expires_at_utc) VALUES('s','w','hash',?,?)").run(ended,ended);
    for(const [id,status] of [["old","FINISHED"],["active","ACTIVE"]])db.prepare("INSERT INTO games(game_id,white_player_id,black_player_id,status,state_json,created_at_utc,updated_at_utc,ended_at_utc) VALUES(?,?,?,?,'{}',?,?,?)").run(id,"w","b",status,ended,ended,status==="ACTIVE"?null:ended);
    db.prepare("INSERT INTO result_rooms VALUES('old',?,0,0,1)").run(ended);
    db.prepare("INSERT INTO successful_requests VALUES('w','request','hash','GAME','old','{}',?)").run(ended);
    return {db,now};}
  it("keeps a result until the exact 24h boundary, then deletes result/replay/access links atomically while retaining active games",()=>{
    const {db,now}=setup();try{expect(purgeExpiredRecords(db,now-1)).toBe(0);expect(purgeExpiredRecords(db,now)).toBe(1);
      expect(db.prepare("SELECT game_id FROM games").all()).toEqual([{game_id:"active"}]);expect(db.prepare("SELECT count(*) FROM successful_requests").pluck().get()).toBe(0);expect(db.prepare("SELECT count(*) FROM result_rooms").pluck().get()).toBe(0);
      db.prepare("DELETE FROM games WHERE game_id='active'").run();purgeExpiredRecords(db,now);expect(db.prepare("SELECT count(*) FROM player_sessions").pluck().get()).toBe(0);expect(db.prepare("SELECT count(*) FROM players").pluck().get()).toBe(0);
    }finally{db.close();}
  });
  it("rolls back every dependent deletion if cleanup storage fails",()=>{const {db,now}=setup();try{db.exec("CREATE TRIGGER fail_cleanup BEFORE DELETE ON games BEGIN SELECT RAISE(ABORT,'cleanup failure'); END");expect(()=>purgeExpiredRecords(db,now)).toThrow("cleanup failure");expect(db.prepare("SELECT count(*) FROM successful_requests").pluck().get()).toBe(1);expect(db.prepare("SELECT count(*) FROM result_rooms").pluck().get()).toBe(1);}finally{db.close();}});
});
