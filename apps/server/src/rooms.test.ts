import Database from "better-sqlite3";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createRuleGame } from "@danpan/shared";
import { runMigrations } from "./storage/migrations.js";
import { OnlineGames } from "./online-game.js";
import { Rooms } from "./rooms.js";
function setup() {
  const db=new Database(":memory:"); runMigrations(db); const now=new Date().toISOString();
  for(const p of ["w","b","outsider"]) db.prepare("INSERT INTO players VALUES(?,?,?,?)").run(p,p,p,now);
  db.prepare("INSERT INTO games(game_id,white_player_id,black_player_id,status,revision,state_json,created_at_utc,updated_at_utc) VALUES('g','w','b','PREPARING',0,?,?,?)").run(JSON.stringify(createRuleGame()),now,now);
  const online=new OnlineGames(db,()=>{}); online.start("g");
  const present=new Set(["w","b"]); const rooms=new Rooms(db,p=>present.has(p),()=>{});
  const end=()=>online.command("w",{type:"game.resign",gameId:"g",requestId:"resign",expectedRevision:1});
  const send=(actor:string,type:string,requestId:string,body={})=>rooms.command(actor,{type,requestId,gameId:"g",...body});
  return {db,online,rooms,present,end,send};
}
describe("result rooms, rematches and ephemeral chat",()=>{
  beforeEach(()=>{vi.useFakeTimers({toFake:["Date","performance"]});vi.setSystemTime(new Date("2026-11-12T00:00:00Z"));});
  afterEach(()=>vi.useRealTimers());
  const advance=(ms:number)=>{vi.setSystemTime(Date.now()+ms);vi.spyOn(performance,"now").mockReturnValue(performance.now()+ms);};
  it("A07 only loser requests and winner accepts; one atomic new game with reversed requester colors and fresh state",()=>{
    const s=setup();try{
      s.send("b","chat.send","c",{messageId:"old-chat",body:"지난 판"});s.end();
      expect(()=>s.send("b","game.retry.request","bad")).toThrow("REMATCH_LOSER_ONLY");
      s.send("w","game.retry.request","request");
      expect(()=>s.send("w","game.retry.respond","bad-reply",{accept:true})).toThrow("REMATCH_WINNER_ONLY");
      const accepted=s.send("b","game.retry.respond","accept",{accept:true});
      const next=s.db.prepare("SELECT * FROM games WHERE game_id=?").get(accepted.newGameId) as any;
      expect(next).toMatchObject({white_player_id:"w",black_player_id:"b",status:"PREPARING",revision:0});
      expect(JSON.parse(next.state_json)).toEqual(createRuleGame());
      expect(s.rooms.metadata(String(accepted.newGameId),"w").messages).toEqual([]);
      expect(s.send("b","game.retry.respond","accept",{accept:true})).toMatchObject({newGameId:accepted.newGameId,replayed:true});
      expect(s.db.prepare("SELECT COUNT(*) AS n FROM games").get()).toEqual({n:2});
      expect(s.db.prepare("SELECT deadline_utc FROM game_preparation WHERE game_id=?").get(accepted.newGameId)).toBeTruthy();
    }finally{s.db.close();}
  });
  it("A07 request at 5-minute boundary has only the remaining millisecond and expiry cancels it",()=>{
    const s=setup();try{
      s.end();const fixed=s.rooms.metadata("g","w").resultRoom!.expiresAtUtc;
      advance(299999);const request=s.send("w","game.retry.request","last-moment");
      expect(request.deadlineUtc).toBe(fixed);advance(1);s.rooms.sweep();
      expect(()=>s.send("b","game.retry.respond","too-late",{accept:true})).toThrow("RESULT_ROOM_EXPIRED");
      expect(s.db.prepare("SELECT closed FROM result_rooms").get()).toEqual({closed:1});
      expect(s.db.prepare("SELECT status FROM rematches").get()).toEqual({status:"CANCELLED"});
      expect(s.db.prepare("SELECT COUNT(*) AS n FROM games").get()).toEqual({n:1});
    }finally{s.db.close();}
  });
  it("A07 decline, disconnect and exit cancel pending requests without extending room lifetime",()=>{
    const s=setup();try{
      s.end();const expiry=s.rooms.metadata("g","w").resultRoom!.expiresAtUtc;
      s.send("w","game.retry.request","r1");s.send("b","game.retry.respond","no",{accept:false});
      s.send("w","game.retry.request","r2");s.present.delete("b");s.rooms.disconnect("b");
      expect(s.rooms.metadata("g","w").resultRoom!.canRequest).toBe(false);
      expect(()=>s.send("w","game.retry.request","r3")).toThrow("REMATCH_OPPONENT_UNAVAILABLE");
      s.present.add("b");s.send("w","game.retry.request","r4");s.send("b","game.result.leave","leave");
      expect(s.rooms.metadata("g","w").resultRoom).toMatchObject({expiresAtUtc:expiry,canRequest:false});
      expect(s.db.prepare("SELECT status FROM rematches").get()).toEqual({status:"CANCELLED"});
    }finally{s.db.close();}
  });
  it("A07 failed new-game persistence rolls back both retry and assignment",()=>{
    const s=setup();try{
      s.end();s.send("w","game.retry.request","r");
      s.db.exec("CREATE TRIGGER fail_retry BEFORE INSERT ON successful_requests BEGIN SELECT RAISE(ABORT,'retry storage failure'); END;");
      expect(()=>s.send("b","game.retry.respond","accept",{accept:true})).toThrow("retry storage failure");
      expect(s.db.prepare("SELECT COUNT(*) AS n FROM games").get()).toEqual({n:1});
      expect(s.db.prepare("SELECT status FROM rematches").get()).toEqual({status:"PENDING"});
      expect(s.db.prepare("SELECT closed FROM result_rooms").get()).toEqual({closed:0});
    }finally{s.db.close();}
  });
  it("A07 an unanswered request expires after 30 seconds without renewing the five-minute room",()=>{
    const s=setup();try{
      s.end();const expiry=s.rooms.metadata("g","w").resultRoom!.expiresAtUtc;
      s.send("w","game.retry.request","request");advance(30000);s.rooms.sweep();
      expect(s.rooms.metadata("g","w").resultRoom).toMatchObject({expiresAtUtc:expiry,retry:{status:"EXPIRED"}});
      expect(()=>s.send("b","game.retry.respond","late",{accept:true})).toThrow("REMATCH_CLOSED");
    }finally{s.db.close();}
  });
  it("A08 handles Korean, 1–200 code points, ownership, duplicate IDs and the 5-per-5s boundary without game revisions",()=>{
    const s=setup();try{
      expect(()=>s.send("outsider","chat.send","bad",{messageId:"bad",body:"침입"})).toThrow("NOT_GAME_PARTICIPANT");
      expect(()=>s.send("w","chat.send","empty",{messageId:"empty",body:" "})).toThrow("CHAT_LENGTH");
      expect(()=>s.send("w","chat.send","long",{messageId:"long",body:"한".repeat(201)})).toThrow("CHAT_LENGTH");
      const first=s.send("w","chat.send","first",{messageId:"id",body:"한글 조합 완료"});
      expect(s.send("w","chat.send","retry",{messageId:"id",body:"한글 조합 완료"})).toMatchObject({sequence:first.sequence,replayed:true});
      expect(()=>s.send("w","chat.send","conflict",{messageId:"id",body:"다른 내용"})).toThrow("MESSAGE_ID_CONFLICT");
      for(let i=1;i<5;i++)s.send("w","chat.send",`r${i}`,{messageId:`id${i}`,body:"한".repeat(200)});
      expect(()=>s.send("w","chat.send","sixth",{messageId:"id6",body:"초과"})).toThrow("CHAT_RATE_LIMIT");
      advance(5000);s.send("w","chat.send","after",{messageId:"after",body:"다시 전송"});
      expect(s.online.snapshot("g").revision).toBe(1);
      expect(s.rooms.metadata("g","b").messages[0]).toMatchObject({displayName:"w",body:"한글 조합 완료",sequence:1});
    }finally{s.db.close();}
  });
  it("A08 retains 100 bodies, deduplicates older IDs, and becomes read-only on termination",()=>{
    const s=setup();try{
      for(let i=0;i<105;i++){if(i%5===0)advance(5000);s.send("w","chat.send",`r${i}`,{messageId:`id${i}`,body:`내용 ${i}`});}
      expect(s.rooms.metadata("g","b").messages).toHaveLength(100);
      expect(s.rooms.metadata("g","b").messages[0]!.sequence).toBe(6);
      expect(s.send("w","chat.send","again",{messageId:"id0",body:"내용 0"})).toMatchObject({sequence:1,replayed:true});
      // The fake elapsed chat duration exceeds a real turn; reset the fixture turn only for this retention test.
      s.db.prepare("UPDATE games SET status='FINISHED',ended_at_utc=? WHERE game_id='g'").run(new Date().toISOString());
      expect(()=>s.send("w","chat.send","ended",{messageId:"new",body:"종료 후"})).toThrow("CHAT_READ_ONLY");
      expect(s.rooms.metadata("g","w").messages).toHaveLength(100);
    }finally{s.db.close();}
  });
});
