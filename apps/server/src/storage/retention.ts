import type { SqliteDatabase } from "./database.js";
import { LIMITS } from "../limits.js";

/** No active game is removed. Foreign-key dependent records and replay grants expire together. */
export function purgeExpiredRecords(db:SqliteDatabase,now=Date.now(),protectedPlayers:readonly string[]=[]):number {
  const cutoff=new Date(now-LIMITS.retentionMs).toISOString();
  return db.transaction(()=>{
    const expired=db.prepare("SELECT game_id FROM games WHERE status IN ('FINISHED','ABORTED','CANCELLED') AND ended_at_utc<=?").all(cutoff) as {game_id:string}[];
    for(const {game_id:id} of expired){
      db.prepare("DELETE FROM successful_requests WHERE entity_type='GAME' AND entity_id=?").run(id);
      db.prepare("DELETE FROM rematches WHERE game_id=? OR new_game_id=?").run(id,id);
      db.prepare("DELETE FROM result_rooms WHERE game_id=?").run(id);
      db.prepare("DELETE FROM game_preparation WHERE game_id=?").run(id);
      db.prepare("DELETE FROM game_moves WHERE game_id=?").run(id);
      db.prepare("DELETE FROM games WHERE game_id=?").run(id);
    }
    const oldChallenges=db.prepare("SELECT challenge_id FROM challenges WHERE status<>'PENDING' AND updated_at_utc<=? AND NOT EXISTS(SELECT 1 FROM games WHERE games.challenge_id=challenges.challenge_id)").all(cutoff) as {challenge_id:string}[];
    for(const {challenge_id:id} of oldChallenges){db.prepare("DELETE FROM successful_requests WHERE entity_type='CHALLENGE' AND entity_id=?").run(id);db.prepare("DELETE FROM challenges WHERE challenge_id=?").run(id);}
    db.prepare("DELETE FROM challenge_cooldowns WHERE requested_at_utc<=?").run(cutoff);
    const orphans=db.prepare(`SELECT player_id FROM players p WHERE NOT EXISTS(SELECT 1 FROM games WHERE white_player_id=p.player_id OR black_player_id=p.player_id)
      AND NOT EXISTS(SELECT 1 FROM challenges WHERE applicant_player_id=p.player_id OR acceptor_player_id=p.player_id)
      AND NOT EXISTS(SELECT 1 FROM player_sessions WHERE player_id=p.player_id AND ended_at_utc IS NULL AND expires_at_utc>?)`).all(new Date(now).toISOString()) as {player_id:string}[];
    for(const {player_id:id} of orphans)if(!protectedPlayers.includes(id)){
      db.prepare("DELETE FROM successful_requests WHERE actor_player_id=?").run(id);
      db.prepare("DELETE FROM challenge_cooldowns WHERE applicant_player_id=? OR acceptor_player_id=?").run(id,id);
      db.prepare("DELETE FROM player_sessions WHERE player_id=?").run(id);
      db.prepare("DELETE FROM players WHERE player_id=?").run(id);
    }
    return expired.length;
  }).immediate();
}
