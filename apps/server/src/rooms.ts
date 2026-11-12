import { createHash, randomUUID } from "node:crypto";
import { createRuleGame } from "@danpan/shared";
import type { SqliteDatabase } from "./storage/database.js";
import { assertGameCapacity } from "./limits.js";
type Game = { game_id: string; white_player_id: string; black_player_id: string; status: string; state_json: string; ended_at_utc: string | null };
type Room = { expires_at_utc: string; white_left: number; black_left: number; closed: number };
type Retry = { applicant_player_id: string; status: string; deadline_utc: string; new_game_id: string | null; resolved_at_utc:string|null };
export type RoomChatMessage = { messageId: string; sequence: number; senderPlayerId: string; displayName: string; body: string; createdAtUtc: string };
type Chat = { sequence: number; messages: RoomChatMessage[]; ids: Map<string, { bodyHash: string; sequence: number }>; rates: Map<string, number[]> };
export class Rooms {
  private deadlines = new Map<string, number>();
  private retryDeadlines = new Map<string, number>();
  private chats = new Map<string, Chat>();
  constructor(private db: SqliteDatabase, private online: (player: string) => boolean, private publish: () => void, private preparationMs = 10000) {}
  private game(id: string, actor: string): Game {
    const game = this.db.prepare("SELECT * FROM games WHERE game_id=?").get(id) as Game | undefined;
    if (!game || ![game.white_player_id, game.black_player_id].includes(actor)) throw new Error("NOT_GAME_PARTICIPANT");
    return game;
  }
  private room(id: string) { return this.db.prepare("SELECT * FROM result_rooms WHERE game_id=?").get(id) as Room | undefined; }
  private retry(id: string) { return this.db.prepare("SELECT * FROM rematches WHERE game_id=?").get(id) as Retry | undefined; }
  private deadline(id: string, room: Room) {
    if (!this.deadlines.has(id)) this.deadlines.set(id, performance.now() + Math.max(0, Date.parse(room.expires_at_utc) - Date.now()));
    return this.deadlines.get(id)!;
  }
  private present(game: Game, room: Room) { return !room.closed && !room.white_left && !room.black_left && this.online(game.white_player_id) && this.online(game.black_player_id); }
  metadata(id: string, actor: string) {
    const game = this.game(id, actor), room = this.room(id), retry = this.retry(id);
    if(room) this.deadline(id,room);
    const state = JSON.parse(game.state_json);
    const loser = state.result?.kind === "WIN" ? state.result.winner === "WHITE" ? game.black_player_id : game.white_player_id : null;
    const names = this.db.prepare("SELECT player_id,nickname_display FROM players WHERE player_id IN (?,?)").all(game.white_player_id, game.black_player_id) as Array<{player_id: string; nickname_display: string}>;
    return {
      endedAtUtc: game.ended_at_utc,
      whiteName: names.find(p => p.player_id === game.white_player_id)!.nickname_display,
      blackName: names.find(p => p.player_id === game.black_player_id)!.nickname_display,
      messages: this.chats.get(id)?.messages ?? [],
      resultRoom: room ? { expiresAtUtc: room.expires_at_utc, retry: retry ? {requesterPlayerId:retry.applicant_player_id,status:retry.status,deadlineUtc:retry.deadline_utc,newGameId:retry.new_game_id} : null,
        canRequest: actor === loser && this.present(game, room) && retry?.status !== "PENDING" && (!retry?.resolved_at_utc||Date.now()>=Date.parse(retry.resolved_at_utc)+10000),
        canRespond: actor !== loser && loser !== null && this.present(game, room) && retry?.status === "PENDING",
        disabledReason: room.closed ? "결과방 5분이 만료되었습니다." : room.white_left || room.black_left ? "상대가 결과방을 나갔습니다." : !this.online(game.white_player_id) || !this.online(game.black_player_id) ? "상대 연결 복구 중에는 재도전할 수 없습니다." : !loser ? "무승부·무효 대국은 대기열에서 새로 신청하세요." : retry?.resolved_at_utc && Date.now()<Date.parse(retry.resolved_at_utc)+10000 ? "재도전 종료 후 10초가 지나면 다시 신청할 수 있습니다." : null } : null,
    };
  }
  command(actor: string, input: Record<string, unknown>) {
    this.sweep();
    const id = String(input.gameId), requestId = String(input.requestId);
    const game = this.game(id, actor);
    if (input.type === "chat.send") return this.chat(game, actor, input);
    const hash = createHash("sha256").update(JSON.stringify({ type: input.type, gameId: id, accept: input.accept })).digest("hex");
    const prior = this.db.prepare("SELECT * FROM successful_requests WHERE actor_player_id=? AND request_id=?").get(actor, requestId) as {request_hash: string; response_json: string} | undefined;
    if (prior) { if (prior.request_hash !== hash) throw new Error("REQUEST_ID_CONFLICT"); return { ...JSON.parse(prior.response_json), replayed: true }; }
    const room = this.room(id);
    if (!room || room.closed || this.deadline(id, room) <= performance.now()) throw new Error("RESULT_ROOM_EXPIRED");
    if (actor === game.white_player_id ? room.white_left : room.black_left) throw new Error("RESULT_ROOM_LEFT");
    let response: Record<string, unknown> = {};
    this.db.transaction(() => {
      if (input.type === "game.result.leave") {
        const column = actor === game.white_player_id ? "white_left" : "black_left";
        this.db.prepare(`UPDATE result_rooms SET ${column}=1 WHERE game_id=?`).run(id);
        this.db.prepare("UPDATE rematches SET status='CANCELLED',resolved_at_utc=? WHERE game_id=? AND status='PENDING'").run(new Date().toISOString(),id);
        response = { gameId: id, left: true };
      } else {
        if (!this.present(game, room)) throw new Error("REMATCH_OPPONENT_UNAVAILABLE");
        const state = JSON.parse(game.state_json), color = actor === game.white_player_id ? "WHITE" : "BLACK";
        const winner = state.result?.kind === "WIN" ? state.result.winner : null;
        if (!winner) throw new Error("REMATCH_NO_LOSER");
        if (input.type === "game.retry.request") {
          if (winner === color) throw new Error("REMATCH_LOSER_ONLY");
          const previous=this.retry(id);
          if (previous?.status === "PENDING") throw new Error("REMATCH_ALREADY_PENDING");
          if(previous?.resolved_at_utc&&Date.now()<Date.parse(previous.resolved_at_utc)+10000)throw new Error("REMATCH_COOLDOWN");
          const deadline = new Date(Math.min(Date.now() + 30000, Date.parse(room.expires_at_utc))).toISOString();
          this.db.prepare("INSERT INTO rematches(game_id,applicant_player_id,status,deadline_utc,new_game_id) VALUES(?,?,'PENDING',?,NULL) ON CONFLICT(game_id) DO UPDATE SET applicant_player_id=excluded.applicant_player_id,status='PENDING',deadline_utc=excluded.deadline_utc,new_game_id=NULL,resolved_at_utc=NULL").run(id,actor,deadline);
          response = { gameId: id, status: "PENDING", deadlineUtc: deadline };
        } else if(input.type==="game.retry.cancel"){
          const retry=this.retry(id);
          if(!retry||retry.status!=="PENDING"||retry.applicant_player_id!==actor)throw new Error("REMATCH_CLOSED");
          this.db.prepare("UPDATE rematches SET status='CANCELLED',resolved_at_utc=? WHERE game_id=?").run(new Date().toISOString(),id);response={gameId:id,status:"CANCELLED"};
        } else if (input.type === "game.retry.respond") {
          if (winner !== color) throw new Error("REMATCH_WINNER_ONLY");
          const retry = this.retry(id);
          if (!retry || retry.status !== "PENDING") throw new Error("REMATCH_CLOSED");
          if (typeof input.accept !== "boolean") throw new Error("INVALID_ACCEPT");
          if (!input.accept) {
            this.db.prepare("UPDATE rematches SET status='DECLINED',resolved_at_utc=? WHERE game_id=?").run(new Date().toISOString(),id);
            response = { gameId: id, status: "DECLINED" };
          } else {
            const busy = this.db.prepare("SELECT 1 FROM games WHERE status IN ('PREPARING','ACTIVE') AND (white_player_id IN (?,?) OR black_player_id IN (?,?))").get(actor,retry.applicant_player_id,actor,retry.applicant_player_id);
            const pending = this.db.prepare("SELECT 1 FROM challenges WHERE status='PENDING' AND (applicant_player_id IN (?,?) OR acceptor_player_id IN (?,?))").get(actor,retry.applicant_player_id,actor,retry.applicant_player_id);
            if (busy || pending) throw new Error("REMATCH_PLAYER_BUSY");
            assertGameCapacity(this.db);
            const newGameId = randomUUID(), now = new Date().toISOString();
            this.db.prepare("INSERT INTO games(game_id,white_player_id,black_player_id,status,revision,state_json,created_at_utc,updated_at_utc) VALUES(?,?,?,'PREPARING',0,?,?,?)")
              .run(newGameId,retry.applicant_player_id,actor,JSON.stringify(createRuleGame()),now,now);
            this.db.prepare("INSERT INTO game_preparation(game_id,deadline_utc) VALUES(?,?)").run(newGameId,new Date(Date.now()+this.preparationMs).toISOString());
            this.db.prepare("UPDATE rematches SET status='ACCEPTED',new_game_id=? WHERE game_id=?").run(newGameId,id);
            this.db.prepare("UPDATE result_rooms SET closed=1 WHERE game_id=?").run(id);
            response = { gameId: id, status: "ACCEPTED", newGameId };
          }
        } else throw new Error("UNKNOWN_ROOM_COMMAND");
      }
      this.db.prepare("INSERT INTO successful_requests VALUES(?,?,?,'GAME',?,?,?)").run(actor,requestId,hash,id,JSON.stringify(response),new Date().toISOString());
    }).immediate();
    if(input.type==="game.result.leave"){
      const left=this.room(id);if(left?.white_left&&left.black_left)this.chats.delete(id);
    }
    if (input.type === "game.retry.request") this.retryDeadlines.set(id, Math.min(performance.now()+30000,this.deadline(id,room)));
    this.publish();
    return response;
  }
  private chat(game: Game, actor: string, input: Record<string, unknown>) {
    const id = game.game_id, room = this.room(id);
    if (room && (room.closed || (actor === game.white_player_id ? room.white_left : room.black_left))) throw new Error("RESULT_ROOM_LEFT");
    if (typeof input.messageId !== "string" || !input.messageId || input.messageId.length>128 || typeof input.body !== "string") throw new Error("INVALID_CHAT");
    const body = input.body.trim();
    if ([...body].length<1 || [...body].length>200) throw new Error("CHAT_LENGTH");
    let chat = this.chats.get(id);
    if (!chat) { chat = {sequence:0,messages:[],ids:new Map(),rates:new Map()}; this.chats.set(id,chat); }
    const key = `${actor}:${input.messageId}`, bodyHash = createHash("sha256").update(body).digest("hex"), prior = chat.ids.get(key);
    if (prior) { if (prior.bodyHash !== bodyHash) throw new Error("MESSAGE_ID_CONFLICT"); return { messageId: input.messageId, sequence: prior.sequence, replayed: true }; }
    if (game.status !== "ACTIVE") throw new Error("CHAT_READ_ONLY");
    const now = performance.now(), recent = (chat.rates.get(actor) ?? []).filter(t => t > now-5000);
    if (recent.length>=5) throw Object.assign(new Error("CHAT_RATE_LIMIT"),{retryAfterMs:Math.max(1,Math.ceil(recent[0]!+5000-now))});
    const displayName = this.db.prepare("SELECT nickname_display FROM players WHERE player_id=?").pluck().get(actor) as string;
    const message = {messageId:input.messageId,sequence:chat.sequence+1,senderPlayerId:actor,displayName,body,createdAtUtc:new Date().toISOString()};
    chat.sequence++; chat.messages.push(message); chat.messages=chat.messages.slice(-100);
    chat.ids.set(key,{bodyHash,sequence:message.sequence}); chat.rates.set(actor,[...recent,now]);
    this.publish(); return { messageId: message.messageId, sequence: message.sequence };
  }
  disconnect(actor: string) {
    this.db.prepare("UPDATE rematches SET status='CANCELLED',resolved_at_utc=? WHERE status='PENDING' AND game_id IN (SELECT game_id FROM games WHERE white_player_id=? OR black_player_id=?)").run(new Date().toISOString(),actor,actor);
  }
  sweep() {
    let changed = false;
    const rooms = this.db.prepare("SELECT game_id,expires_at_utc,white_left,black_left,closed FROM result_rooms WHERE closed=0").all() as Array<Room & {game_id:string}>;
    for (const room of rooms) {
      const id=room.game_id, retry=this.retry(id);
      if (retry?.status === "PENDING" && !this.retryDeadlines.has(id)) this.retryDeadlines.set(id,performance.now()+Math.max(0,Date.parse(retry.deadline_utc)-Date.now()));
      if (this.deadline(id,room)<=performance.now()) {
        this.db.transaction(()=>{
          this.db.prepare("UPDATE result_rooms SET closed=1 WHERE game_id=?").run(id);
          this.db.prepare("UPDATE rematches SET status='CANCELLED',resolved_at_utc=? WHERE game_id=? AND status='PENDING'").run(new Date().toISOString(),id);
        }).immediate(); changed=true; this.chats.delete(id); this.deadlines.delete(id); this.retryDeadlines.delete(id);
      } else if (retry?.status === "PENDING" && this.retryDeadlines.get(id)!<=performance.now()) {
        this.db.prepare("UPDATE rematches SET status='EXPIRED',resolved_at_utc=? WHERE game_id=? AND status='PENDING'").run(new Date().toISOString(),id); changed=true;
      }
    }
    for (const id of new Set([...this.chats.keys(),...this.deadlines.keys()])) if (this.room(id)?.closed) { this.chats.delete(id); this.deadlines.delete(id); this.retryDeadlines.delete(id); }
    if(changed) this.publish();
  }
}
