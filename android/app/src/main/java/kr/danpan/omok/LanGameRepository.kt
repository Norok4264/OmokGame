package kr.danpan.omok

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.os.SystemClock
import org.json.JSONObject
import java.security.MessageDigest
import java.util.Locale
import java.util.UUID

/** SQLite authority. Every accepted command is validated and committed before a snapshot is returned. */
internal class LanGameRepository(context: Context, val localPlayerId: String) : AutoCloseable {
    private val helper = Helper(context.applicationContext)
    private val db: SQLiteDatabase = helper.writableDatabase
    @Volatile private var localNickname = "게스트"
    private var monotonicDeadline: Long? = null
    private val participantLastSeenElapsed = mutableMapOf<String, Long>()

    init { recoverAfterProcessStart() }

    @Synchronized fun configureLocal(displayName: String): JSONObject {
        val result = transaction {
            val name = registerPlayer(localPlayerId, displayName)
            localNickname = name
        }
        return snapshot()
    }

    @Synchronized fun handle(input: JSONObject, local: Boolean = false): JSONObject {
        val type = input.optString("type")
        val actor = input.optString("actorId")
        val requestId = input.optString("requestId")
        if (actor.isBlank() || requestId.length !in 8..80 || type.isBlank()) return failure("INVALID_REQUEST")

        var outcome: JSONObject? = null
        try {
            db.beginTransaction()
            expireChallengeInside()
            expireGameDeadlineInside()
            expireRematchesInside()

            if (!(local && actor == localPlayerId || authorized(actor, input))) {
                outcome = failure("NOT_AUTHORIZED")
                db.setTransactionSuccessful()
            } else {
                if (actor != localPlayerId && input.optString("type") in setOf("snapshot", "heartbeat", "game.move", "game.resign", "challenge.accept", "challenge.decline", "challenge.cancel", "rematch.request", "rematch.respond", "rematch.cancel", "chat.send")) {
                    participantLastSeenElapsed[actor] = SystemClock.elapsedRealtime()
                }
                val existing = request(actor, requestId)
                if (existing != null) {
                    val hash = requestHash(input)
                    outcome = if (existing.first != hash) failure("REQUEST_ID_CONFLICT")
                    else JSONObject(existing.second).put("replayed", true)
                    db.setTransactionSuccessful()
                } else {
                    val commandResult = try {
                        when (type) {
                            "snapshot" -> success()
                            "challenge.create" -> createChallenge(input, actor)
                            "challenge.offer" -> offerChallenge(input, actor)
                            "challenge.accept" -> answerChallenge(input, actor, true)
                            "challenge.decline" -> answerChallenge(input, actor, false)
                            "challenge.cancel" -> cancelChallenge(input, actor)
                            "heartbeat" -> heartbeat(input, actor)
                            "game.move" -> move(input, actor)
                            "game.resign" -> resign(input, actor)
                            "rematch.request" -> requestRematch(input, actor)
                            "rematch.respond" -> respondRematch(input, actor)
                            "rematch.cancel" -> cancelRematch(input, actor)
                            "chat.send" -> sendChat(input, actor)
                            else -> throw IllegalArgumentException("UNKNOWN_MESSAGE")
                        }
                    } catch (error: IllegalArgumentException) {
                        failure(error.message ?: "INVALID_REQUEST")
                    } catch (error: IllegalStateException) {
                        failure(error.message ?: "INVALID_STATE")
                    }
                    if (commandResult.optBoolean("ok") && type != "snapshot") {
                        insertRequest(actor, requestId, requestHash(input), commandResult)
                    }
                    outcome = commandResult
                    db.setTransactionSuccessful()
                }
            }
        } catch (error: Exception) {
            return failure("STORAGE_UNAVAILABLE", error.localizedMessage)
        } finally {
            if (db.inTransaction()) db.endTransaction()
        }
        val response = outcome ?: failure("STORAGE_UNAVAILABLE")
        if (response.optString("error") == "NOT_AUTHORIZED") return response
        return response.put("requestId", requestId).put("snapshot", snapshotInside(actor))
    }

    @Synchronized fun snapshot(): JSONObject {
        try {
            db.beginTransaction()
            expireChallengeInside()
            expireGameDeadlineInside()
            expireRematchesInside()
            db.setTransactionSuccessful()
        } finally {
            if (db.inTransaction()) db.endTransaction()
        }
        return snapshotInside()
    }

    @Synchronized fun expireDue(): Boolean {
        val before = snapshotInside().toString()
        snapshot()
        return snapshotInside().toString() != before
    }

    private fun createChallenge(input: JSONObject, actor: String): JSONObject {
        require(actor != localPlayerId) { "SELF_CHALLENGE" }
        require(input.optString("accessToken").length >= 32) { "INVALID_TOKEN" }
        require(queryLong("SELECT COUNT(*) FROM lan_games WHERE status='ACTIVE'") == 0L) { "GAME_IN_PROGRESS" }
        require(queryLong("SELECT COUNT(*) FROM lan_challenges WHERE status='PENDING'") == 0L) { "CHALLENGE_IN_PROGRESS" }
        val requested = input.optString("nickname")
        val display = registerPlayer(actor, requested)
        val challengeId = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        val deadline = now + CHALLENGE_MS
        db.execSQL(
            "INSERT INTO lan_challenges(challenge_id,applicant_id,acceptor_id,status,revision,created_at_ms,deadline_ms,token_hash) VALUES(?,?,?,'PENDING',0,?,?,?)",
            arrayOf<Any?>(challengeId, actor, localPlayerId, now, deadline, sha256(input.getString("accessToken"))),
        )
        return success().put("challengeId", challengeId).put("applicantNickname", display).put("deadlineUtcMs", deadline)
    }

    private fun offerChallenge(input: JSONObject, actor: String): JSONObject {
        require(actor == localPlayerId) { "ONLY_AUTHORITY_CAN_OFFER" }
        val targetId = input.optString("targetId")
        require(targetId.isNotBlank() && targetId > localPlayerId) { "INVALID_TARGET" }
        require(queryLong("SELECT COUNT(*) FROM lan_games WHERE status='ACTIVE'") == 0L) { "GAME_IN_PROGRESS" }
        require(queryLong("SELECT COUNT(*) FROM lan_challenges WHERE status='PENDING'") == 0L) { "CHALLENGE_IN_PROGRESS" }
        val applicant = playerName(localPlayerId) ?: throw IllegalArgumentException("PLAYER_NOT_FOUND")
        val target = registerPlayer(targetId, input.optString("nickname"), allowAssignedGuest = true)
        val challengeId = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        val deadline = now + CHALLENGE_MS
        db.execSQL(
            "INSERT INTO lan_challenges(challenge_id,applicant_id,acceptor_id,status,revision,created_at_ms,deadline_ms,token_hash) VALUES(?,?,?,'PENDING',0,?,?,?)",
            arrayOf<Any?>(challengeId, localPlayerId, targetId, now, deadline, sha256(challengeId)),
        )
        return success().put("challengeId", challengeId).put("applicantNickname", applicant).put("acceptorNickname", target).put("deadlineUtcMs", deadline)
    }

    private fun answerChallenge(input: JSONObject, actor: String, accept: Boolean): JSONObject {
        val challenge = challenge(input.optString("challengeId")) ?: throw IllegalArgumentException("CHALLENGE_NOT_FOUND")
        require(actor == challenge.acceptorId) { "ONLY_ACCEPTOR_CAN_ANSWER" }
        require(challenge.status == "PENDING") { "CHALLENGE_NOT_PENDING" }
        require(integer(input, "expectedRevision", challenge.revision) == challenge.revision) { "STALE_CHALLENGE_REVISION" }
        if (System.currentTimeMillis() >= challenge.deadline) {
            updateChallenge(challenge.id, "EXPIRED", challenge.revision + 1)
            throw IllegalArgumentException("CHALLENGE_EXPIRED")
        }
        if (!accept) {
            updateChallenge(challenge.id, "DECLINED", challenge.revision + 1)
            return success().put("challengeId", challenge.id).put("challengeStatus", "DECLINED")
        }
        require(queryLong("SELECT COUNT(*) FROM lan_games WHERE status='ACTIVE'") == 0L) { "GAME_IN_PROGRESS" }
        val applicant = playerName(challenge.applicantId) ?: throw IllegalArgumentException("PLAYER_NOT_FOUND")
        val acceptor = playerName(challenge.acceptorId) ?: throw IllegalArgumentException("PLAYER_NOT_FOUND")
        val gameId = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        participantLastSeenElapsed[if (challenge.applicantId == localPlayerId) challenge.acceptorId else challenge.applicantId] = SystemClock.elapsedRealtime()
        val state = JSONObject()
            .put("board", LanGameJson.encode(LanGameRules.empty()).getJSONArray("board"))
            .put("nextColor", "BLACK")
            .put("status", "ACTIVE")
            .put("result", JSONObject.NULL)
            .put("lastMove", JSONObject.NULL)
            .put("whitePlayerId", challenge.applicantId)
            .put("blackPlayerId", challenge.acceptorId)
            .put("whiteName", applicant)
            .put("blackName", acceptor)
            .put("authorityPlayerId", localPlayerId)
            .put("turnDeadlineUtcMs", now + TURN_MS)
            .put("endReason", JSONObject.NULL)
            .put("winnerPlayerId", JSONObject.NULL)
        updateChallenge(challenge.id, "ACCEPTED", challenge.revision + 1)
        db.execSQL(
            "INSERT INTO lan_games(game_id,challenge_id,white_id,black_id,authority_id,status,revision,state_json,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,'ACTIVE',0,?,?,?)",
            arrayOf<Any?>(gameId, challenge.id, challenge.applicantId, challenge.acceptorId, localPlayerId, state.toString(), now, now),
        )
        monotonicDeadline = SystemClock.elapsedRealtime() + TURN_MS
        return success().put("challengeId", challenge.id).put("challengeStatus", "ACCEPTED").put("gameId", gameId)
    }

    private fun cancelChallenge(input: JSONObject, actor: String): JSONObject {
        val challenge = challenge(input.optString("challengeId")) ?: throw IllegalArgumentException("CHALLENGE_NOT_FOUND")
        require(actor == challenge.applicantId) { "ONLY_APPLICANT_CAN_CANCEL" }
        require(challenge.status == "PENDING") { "CHALLENGE_NOT_PENDING" }
        updateChallenge(challenge.id, "CANCELLED", challenge.revision + 1)
        return success().put("challengeId", challenge.id).put("challengeStatus", "CANCELLED")
    }

    private fun move(input: JSONObject, actor: String): JSONObject {
        val game = activeGame(input.optString("gameId")) ?: throw IllegalArgumentException("GAME_NOT_ACTIVE")
        require(integer(input, "expectedRevision", Int.MIN_VALUE) == game.revision) { "STALE_REVISION" }
        val state = JSONObject(game.state)
        val color = if (actor == game.whiteId) "WHITE" else if (actor == game.blackId) "BLACK" else throw IllegalArgumentException("NOT_GAME_PARTICIPANT")
        val x = integer(input, "x", Int.MIN_VALUE)
        val y = integer(input, "y", Int.MIN_VALUE)
        val next = LanGameRules.play(LanGameJson.parse(state), x, y, color)
        val nextJson = LanGameJson.encode(next, state)
        val newRevision = game.revision + 1
        val now = System.currentTimeMillis()
        if (next.status == "ACTIVE") nextJson.put("turnDeadlineUtcMs", now + TURN_MS)
        else nextJson.put("turnDeadlineUtcMs", JSONObject.NULL)
        val reason = next.resultKind
        val update = db.update("lan_games", contentValues("state_json" to nextJson.toString(), "status" to next.status, "revision" to newRevision, "updated_at_ms" to now, "ended_at_ms" to if (reason == null) null else now), "game_id=? AND revision=? AND status='ACTIVE'", arrayOf(game.id, game.revision.toString()))
        require(update == 1) { "STALE_REVISION" }
        db.execSQL("INSERT INTO lan_moves(game_id,revision,request_id,player_id,x,y,color,accepted_at_ms) VALUES(?,?,?,?,?,?,?,?)", arrayOf(game.id, newRevision, input.getString("requestId"), actor, x, y, color, now))
        monotonicDeadline = if (reason == null) SystemClock.elapsedRealtime() + TURN_MS else null
        return success().put("gameId", game.id).put("approvedRevision", newRevision)
    }

    private fun heartbeat(input: JSONObject, actor: String): JSONObject {
        val game = anyGame(input.optString("gameId")) ?: throw IllegalArgumentException("GAME_NOT_FOUND")
        require(actor == game.whiteId || actor == game.blackId) { "NOT_GAME_PARTICIPANT" }
        return success().put("gameId", game.id).put("serverTimeUtcMs", System.currentTimeMillis())
    }

    private fun resign(input: JSONObject, actor: String): JSONObject {
        val game = activeGame(input.optString("gameId")) ?: throw IllegalArgumentException("GAME_NOT_ACTIVE")
        require(integer(input, "expectedRevision", Int.MIN_VALUE) == game.revision) { "STALE_REVISION" }
        val color = when (actor) { game.whiteId -> "WHITE"; game.blackId -> "BLACK"; else -> throw IllegalArgumentException("NOT_GAME_PARTICIPANT") }
        val state = JSONObject(game.state)
        val winner = if (color == "BLACK") "WHITE" else "BLACK"
        state.put("status", "FINISHED").put("nextColor", JSONObject.NULL)
            .put("result", JSONObject().put("kind", "WIN").put("winner", winner))
            .put("endReason", "RESIGNATION").put("winnerPlayerId", if (winner == "WHITE") game.whiteId else game.blackId)
            .put("turnDeadlineUtcMs", JSONObject.NULL)
        val revision = game.revision + 1
        val now = System.currentTimeMillis()
        require(db.update("lan_games", contentValues("state_json" to state.toString(), "status" to "FINISHED", "revision" to revision, "updated_at_ms" to now, "ended_at_ms" to now), "game_id=? AND revision=?", arrayOf(game.id, game.revision.toString())) == 1) { "STALE_REVISION" }
        monotonicDeadline = null
        return success().put("gameId", game.id).put("approvedRevision", revision)
    }

    private fun requestRematch(input: JSONObject, actor: String): JSONObject {
        val old = finishedGame(input.optString("gameId")) ?: throw IllegalArgumentException("RESULT_ROOM_EXPIRED")
        require(old.winnerId != null) { "REMATCH_NOT_AVAILABLE" }
        val loser = if (old.winnerId == old.whiteId) old.blackId else old.whiteId
        require(actor == loser) { "ONLY_LOSER_CAN_REQUEST_REMATCH" }
        val now = System.currentTimeMillis()
        val deadline = LanResultChatPolicy.rematchDeadline(now, old.endedAt ?: now) ?: throw IllegalArgumentException("RESULT_ROOM_EXPIRED")
        val existing = db.rawQuery("SELECT rematch_id,status,deadline_ms,responded_at_ms FROM lan_rematches WHERE game_id=?", arrayOf(old.id)).use { c ->
            if (!c.moveToFirst()) null else ExistingRematch(c.getString(0), c.getString(1), c.getLong(2), if (c.isNull(3)) null else c.getLong(3))
        }
        if (existing != null) {
            if (existing.status == "PENDING" && now < existing.deadline) {
                return success().put("gameId", old.id).put("rematchId", existing.id).put("rematchDeadlineUtcMs", existing.deadline)
            }
            require(existing.status in setOf("DECLINED", "CANCELLED", "EXPIRED")) { "REMATCH_ALREADY_CLOSED" }
            val resolvedAt = existing.respondedAt ?: existing.deadline
            require(now >= LanResultChatPolicy.rematchRequestAllowedAt(resolvedAt)) { "REMATCH_COOLDOWN" }
        }
        val id = UUID.randomUUID().toString()
        if (existing == null) {
            db.execSQL("INSERT INTO lan_rematches(rematch_id,game_id,requester_id,responder_id,status,requested_at_ms,deadline_ms) VALUES(?,?,?,?,'PENDING',?,?)", arrayOf<Any?>(id, old.id, actor, old.winnerId, now, deadline))
        } else {
            db.execSQL("UPDATE lan_rematches SET rematch_id=?,requester_id=?,responder_id=?,status='PENDING',requested_at_ms=?,deadline_ms=?,responded_at_ms=NULL,new_game_id=NULL WHERE game_id=?", arrayOf<Any?>(id, actor, old.winnerId, now, deadline, old.id))
        }
        return success().put("rematchId", id).put("gameId", old.id).put("rematchDeadlineUtcMs", deadline)
    }

    private fun respondRematch(input: JSONObject, actor: String): JSONObject {
        val id = input.optString("rematchId")
        val row = db.rawQuery("SELECT game_id,requester_id,responder_id,status,deadline_ms FROM lan_rematches WHERE rematch_id=?", arrayOf(id)).use { c ->
            if (!c.moveToFirst()) null else Rematch(c.getString(0), c.getString(1), c.getString(2), c.getString(3), c.getLong(4))
        } ?: throw IllegalArgumentException("REMATCH_NOT_FOUND")
        require(actor == row.responderId) { "ONLY_WINNER_CAN_RESPOND" }
        require(row.status == "PENDING") { "REMATCH_NOT_PENDING" }
        val now = System.currentTimeMillis()
        val old = finishedGame(row.gameId) ?: throw IllegalArgumentException("RESULT_ROOM_EXPIRED")
        require(now < row.deadline && now < (old.endedAt ?: 0L) + RESULT_ROOM_MS) { "RESULT_ROOM_EXPIRED" }
        val accept = input.optBoolean("accept", false)
        if (!accept) {
            db.execSQL("UPDATE lan_rematches SET status='DECLINED',responded_at_ms=? WHERE rematch_id=? AND status='PENDING'", arrayOf(now, id))
            return success().put("rematchId", id).put("rematchStatus", "DECLINED")
        }
        require(queryLong("SELECT COUNT(*) FROM lan_games WHERE status='ACTIVE'") == 0L) { "GAME_IN_PROGRESS" }
        val gameId = UUID.randomUUID().toString()
        val whiteName = playerName(row.requesterId) ?: throw IllegalArgumentException("PLAYER_NOT_FOUND")
        val blackName = playerName(row.responderId) ?: throw IllegalArgumentException("PLAYER_NOT_FOUND")
        val state = JSONObject().put("board", LanGameJson.encode(LanGameRules.empty()).getJSONArray("board"))
            .put("nextColor", "BLACK").put("status", "ACTIVE").put("result", JSONObject.NULL).put("lastMove", JSONObject.NULL)
            .put("whitePlayerId", row.requesterId).put("blackPlayerId", row.responderId).put("whiteName", whiteName).put("blackName", blackName)
            .put("authorityPlayerId", old.authorityId).put("turnDeadlineUtcMs", now + TURN_MS).put("endReason", JSONObject.NULL).put("winnerPlayerId", JSONObject.NULL)
        require(db.update("lan_rematches", contentValues("status" to "ACCEPTED", "responded_at_ms" to now, "new_game_id" to gameId), "rematch_id=? AND status='PENDING'", arrayOf(id)) == 1) { "REMATCH_ALREADY_CLOSED" }
        db.execSQL("INSERT INTO lan_games(game_id,challenge_id,white_id,black_id,authority_id,status,revision,state_json,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,'ACTIVE',0,?,?,?)",
            arrayOf<Any?>(gameId, old.challengeId, row.requesterId, row.responderId, old.authorityId, state.toString(), now, now))
        monotonicDeadline = SystemClock.elapsedRealtime() + TURN_MS
        return success().put("rematchId", id).put("rematchStatus", "ACCEPTED").put("newGameId", gameId)
    }

    private fun cancelRematch(input: JSONObject, actor: String): JSONObject {
        val id = input.optString("rematchId")
        val row = db.rawQuery("SELECT game_id,requester_id,status FROM lan_rematches WHERE rematch_id=?", arrayOf(id)).use { c ->
            if (!c.moveToFirst()) null else Triple(c.getString(0), c.getString(1), c.getString(2))
        } ?: throw IllegalArgumentException("REMATCH_NOT_FOUND")
        require(actor == row.second) { "ONLY_REQUESTER_CAN_CANCEL_REMATCH" }
        require(row.third == "PENDING") { "REMATCH_NOT_PENDING" }
        val now = System.currentTimeMillis()
        db.execSQL("UPDATE lan_rematches SET status='CANCELLED',responded_at_ms=? WHERE rematch_id=? AND status='PENDING'", arrayOf(now, id))
        return success().put("gameId", row.first).put("rematchId", id).put("rematchStatus", "CANCELLED")
    }

    private fun sendChat(input: JSONObject, actor: String): JSONObject {
        val gameId = input.optString("gameId")
        val messageId = input.optString("messageId")
        val body = input.optString("body")
        val game = anyGame(gameId) ?: throw IllegalArgumentException("GAME_NOT_FOUND")
        require(actor == game.whiteId || actor == game.blackId) { "NOT_GAME_PARTICIPANT" }
        require(messageId.length in 8..80) { "INVALID_MESSAGE_ID" }
        require(LanResultChatPolicy.isValidChatBody(body)) { "CHAT_LENGTH" }
        val bodyHash = sha256(body)
        val prior = db.rawQuery("SELECT sender_id,body_hash,sequence FROM lan_chat_ids WHERE game_id=? AND message_id=?", arrayOf(gameId, messageId)).use { c ->
            if (!c.moveToFirst()) null else Triple(c.getString(0), c.getString(1), c.getInt(2))
        }
        if (prior != null) {
            require(prior.first == actor && prior.second == bodyHash) { "MESSAGE_ID_CONFLICT" }
            return success().put("gameId", gameId).put("messageId", messageId).put("sequence", prior.third).put("duplicate", true)
        }
        require(game.status == "ACTIVE") { "CHAT_READ_ONLY" }
        val now = System.currentTimeMillis()
        val recentTimes = mutableListOf<Long>()
        db.rawQuery("SELECT sent_at_ms FROM lan_chat_messages WHERE game_id=? AND sender_id=? ORDER BY sequence DESC LIMIT 100", arrayOf(gameId, actor)).use { rows -> while (rows.moveToNext()) recentTimes += rows.getLong(0) }
        val inWindowCount = recentTimes.count { LanResultChatPolicy.isInChatWindow(it, now) }
        require(LanResultChatPolicy.canSendChat(inWindowCount)) { "CHAT_RATE_LIMIT" }
        val sequence = queryLong("SELECT COALESCE(MAX(sequence),0)+1 FROM lan_chat_messages WHERE game_id=?", arrayOf(gameId)).toInt()
        db.execSQL("INSERT INTO lan_chat_messages(game_id,sequence,message_id,sender_id,body,sent_at_ms) VALUES(?,?,?,?,?,?)", arrayOf<Any?>(gameId, sequence, messageId, actor, body, now))
        db.execSQL("INSERT INTO lan_chat_ids(game_id,message_id,sender_id,body_hash,sequence,created_at_ms) VALUES(?,?,?,?,?,?)", arrayOf<Any?>(gameId, messageId, actor, bodyHash, sequence, now))
        db.execSQL("DELETE FROM lan_chat_messages WHERE game_id=? AND sequence NOT IN (SELECT sequence FROM lan_chat_messages WHERE game_id=? ORDER BY sequence DESC LIMIT 100)", arrayOf(gameId, gameId))
        return success().put("gameId", gameId).put("messageId", messageId).put("sequence", sequence)
    }

    private fun expireChallengeInside() {
        val row = db.rawQuery("SELECT challenge_id,revision FROM lan_challenges WHERE status='PENDING' AND deadline_ms<=? LIMIT 1", arrayOf(System.currentTimeMillis().toString())).use { if (it.moveToFirst()) it.getString(0) to it.getInt(1) else null } ?: return
        updateChallenge(row.first, "EXPIRED", row.second + 1)
    }

    private fun expireRematchesInside() {
        val now = System.currentTimeMillis()
        db.execSQL("UPDATE lan_rematches SET status='EXPIRED',responded_at_ms=? WHERE status='PENDING' AND (deadline_ms<=? OR game_id IN (SELECT game_id FROM lan_games WHERE ended_at_ms IS NOT NULL AND ended_at_ms+?<=?))", arrayOf(now, now, RESULT_ROOM_MS, now))
        db.execSQL("DELETE FROM lan_chat_messages WHERE game_id IN (SELECT game_id FROM lan_games WHERE ended_at_ms IS NOT NULL AND ended_at_ms+?<=?)", arrayOf(RESULT_ROOM_MS, now))
        db.execSQL("DELETE FROM lan_chat_ids WHERE game_id IN (SELECT game_id FROM lan_games WHERE ended_at_ms IS NOT NULL AND ended_at_ms+?<=?)", arrayOf(RESULT_ROOM_MS, now))
    }

    private fun expireGameDeadlineInside() {
        val game = activeGame(null) ?: return
        val state = JSONObject(game.state)
        val remotePlayer = listOf(game.whiteId, game.blackId).firstOrNull { it != localPlayerId } ?: return
        val lastSeen = participantLastSeenElapsed[remotePlayer] ?: return
        val deadline = state.optLong("turnDeadlineUtcMs", 0L)
        if (deadline <= 0L) return
        val turnElapsedDeadline = monotonicDeadline ?: (SystemClock.elapsedRealtime() + (deadline - System.currentTimeMillis()).coerceAtLeast(0)).also { monotonicDeadline = it }
        val evaluation = LanRecoveryPolicy.evaluate(SystemClock.elapsedRealtime(), lastSeen, turnElapsedDeadline)
        val terminal = evaluation.terminal ?: return
        val winner: String
        val winnerId: String
        val reason: String
        if (terminal == LanRecoveryPolicy.End.TIMEOUT) {
            val loser = state.optString("nextColor")
            winner = if (loser == "BLACK") "WHITE" else "BLACK"
            winnerId = if (winner == "WHITE") game.whiteId else game.blackId
            reason = "TIMEOUT"
        } else {
            val disconnectedColor = if (remotePlayer == game.whiteId) "WHITE" else "BLACK"
            winner = if (disconnectedColor == "WHITE") "BLACK" else "WHITE"
            winnerId = if (winner == "WHITE") game.whiteId else game.blackId
            reason = "DISCONNECT"
        }
        state.put("status", "FINISHED").put("nextColor", JSONObject.NULL)
            .put("result", JSONObject().put("kind", "WIN").put("winner", winner))
            .put("endReason", reason).put("winnerPlayerId", winnerId)
            .put("turnDeadlineUtcMs", JSONObject.NULL)
        val now = System.currentTimeMillis()
        val revision = game.revision + 1
        if (db.update("lan_games", contentValues("state_json" to state.toString(), "status" to "FINISHED", "revision" to revision, "updated_at_ms" to now, "ended_at_ms" to now), "game_id=? AND revision=? AND status='ACTIVE'", arrayOf(game.id, game.revision.toString())) == 1) {
            insertRequest("SYSTEM", "system-${reason.lowercase()}:${game.id}:${game.revision}", "${reason.lowercase()}:${game.id}:${remotePlayer}", success().put("gameId", game.id).put("approvedRevision", revision))
        }
        monotonicDeadline = null
    }

    /** Host process restart is a system interruption, never a locally invented player win. */
    @Synchronized private fun recoverAfterProcessStart() {
        db.beginTransaction()
        try {
            val now = System.currentTimeMillis()
            db.execSQL("UPDATE lan_challenges SET status='CANCELLED',revision=revision+1,updated_at_ms=? WHERE status='PENDING'", arrayOf(now))
            val row = db.rawQuery("SELECT game_id,revision,state_json FROM lan_games WHERE status='ACTIVE' LIMIT 1", emptyArray()).use { c ->
                if (!c.moveToFirst()) null else Triple(c.getString(0), c.getInt(1), c.getString(2))
            }
            if (row != null) {
                val (gameId, oldRevision, rawState) = row
                val revision = oldRevision + 1
                val state = JSONObject(rawState).put("status", "ABORTED").put("nextColor", JSONObject.NULL)
                    .put("result", JSONObject.NULL).put("endReason", "SYSTEM_ABORT")
                    .put("winnerPlayerId", JSONObject.NULL).put("turnDeadlineUtcMs", JSONObject.NULL)
                db.update("lan_games", contentValues("state_json" to state.toString(), "status" to "ABORTED", "revision" to revision, "updated_at_ms" to now, "ended_at_ms" to now), "game_id=? AND revision=? AND status='ACTIVE'", arrayOf(gameId, oldRevision.toString()))
                insertRequest("SYSTEM", "system-startup-abort:$gameId:$oldRevision", "startup-abort:$gameId:$oldRevision", success().put("gameId", gameId).put("approvedRevision", revision))
            }
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
        monotonicDeadline = null
        participantLastSeenElapsed.clear()
    }

    @Synchronized fun stopForSystemReason() {
        db.beginTransaction()
        try {
            val row = db.rawQuery("SELECT game_id,revision,state_json FROM lan_games WHERE status='ACTIVE' LIMIT 1", emptyArray()).use { c ->
                if (!c.moveToFirst()) null else Triple(c.getString(0), c.getInt(1), c.getString(2))
            }
            if (row != null) {
                val (gameId, oldRevision, rawState) = row
                val revision = oldRevision + 1
                val now = System.currentTimeMillis()
                val state = JSONObject(rawState).put("status", "ABORTED").put("nextColor", JSONObject.NULL)
                    .put("result", JSONObject.NULL).put("endReason", "SYSTEM_ABORT")
                    .put("winnerPlayerId", JSONObject.NULL).put("turnDeadlineUtcMs", JSONObject.NULL)
                db.update("lan_games", contentValues("state_json" to state.toString(), "status" to "ABORTED", "revision" to revision, "updated_at_ms" to now, "ended_at_ms" to now), "game_id=? AND revision=? AND status='ACTIVE'", arrayOf(gameId, oldRevision.toString()))
                insertRequest("SYSTEM", "system-user-stop:$gameId:$oldRevision", "user-stop:$gameId:$oldRevision", success().put("gameId", gameId).put("approvedRevision", revision))
            }
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
        monotonicDeadline = null
    }

    private data class Challenge(val id: String, val applicantId: String, val acceptorId: String, val status: String, val revision: Int, val deadline: Long)
    private data class Game(val id: String, val whiteId: String, val blackId: String, val revision: Int, val status: String, val state: String)
    private fun challenge(id: String): Challenge? = db.rawQuery("SELECT challenge_id,applicant_id,acceptor_id,status,revision,deadline_ms FROM lan_challenges WHERE challenge_id=?", arrayOf(id)).use { if (!it.moveToFirst()) null else Challenge(it.getString(0), it.getString(1), it.getString(2), it.getString(3), it.getInt(4), it.getLong(5)) }
    private fun activeGame(id: String?): Game? {
        val sql = if (id == null) "SELECT game_id,white_id,black_id,revision,status,state_json FROM lan_games WHERE status='ACTIVE' ORDER BY created_at_ms DESC LIMIT 1" else "SELECT game_id,white_id,black_id,revision,status,state_json FROM lan_games WHERE game_id=?"
        val args: Array<String> = if (id == null) emptyArray() else arrayOf(id)
        return db.rawQuery(sql, args).use { if (!it.moveToFirst()) null else Game(it.getString(0), it.getString(1), it.getString(2), it.getInt(3), it.getString(4), it.getString(5)) }
    }

    private fun authorized(actor: String, input: JSONObject): Boolean {
        if (actor == localPlayerId) return false
        if (input.optString("type") == "challenge.create") {
            return input.optString("accessToken").length >= 32
        }
        if (input.optString("type") == "snapshot") {
            val pendingOffer = db.rawQuery("SELECT 1 FROM lan_challenges WHERE status='PENDING' AND applicant_id=? AND acceptor_id=? LIMIT 1", arrayOf(localPlayerId, actor)).use { it.moveToFirst() }
            if (pendingOffer) return true
        }
        val challengeId = input.optString("challengeId").takeIf(String::isNotBlank)
            ?: input.optString("gameId").takeIf(String::isNotBlank)?.let { gameChallengeId(it) }
            ?: db.rawQuery("SELECT challenge_id FROM lan_challenges WHERE applicant_id=? ORDER BY created_at_ms DESC LIMIT 1", arrayOf(actor)).use { if (it.moveToFirst()) it.getString(0) else null }
            ?: return false
        val row = db.rawQuery("SELECT token_hash,applicant_id,acceptor_id FROM lan_challenges WHERE challenge_id=?", arrayOf(challengeId)).use { if (!it.moveToFirst()) null else Triple(it.getString(0), it.getString(1), it.getString(2)) } ?: return false
        if (row.second == actor && row.first == sha256(input.optString("accessToken"))) return true
        return row.third == actor && row.first == sha256(input.optString("accessToken"))
    }

    private fun gameChallengeId(gameId: String): String? = db.rawQuery("SELECT challenge_id FROM lan_games WHERE game_id=?", arrayOf(gameId)).use { if (it.moveToFirst()) it.getString(0) else null }
    private fun updateChallenge(id: String, status: String, revision: Int) { db.execSQL("UPDATE lan_challenges SET status=?,revision=?,updated_at_ms=? WHERE challenge_id=?", arrayOf<Any?>(status, revision, System.currentTimeMillis(), id)) }

    private fun registerPlayer(id: String, requested: String, allowAssignedGuest: Boolean = false): String {
        val existing = playerName(id)
        val normalized = java.text.Normalizer.normalize(requested, java.text.Normalizer.Form.NFKC).trim()
        val assignedGuest = allowAssignedGuest && Regex("^(guest|게스트)\\d+$", RegexOption.IGNORE_CASE).matches(normalized)
        val requestedDisplay = if (requested.isBlank()) allocateGuest() else if (assignedGuest) normalized else LanNickname.validate(requested).display
        val key = if (requested.isBlank() || assignedGuest) requestedDisplay.lowercase(Locale.ROOT) else LanNickname.validate(requestedDisplay).key
        val duplicate = db.rawQuery("SELECT player_id FROM lan_players WHERE nickname_key=? AND player_id<>? LIMIT 1", arrayOf(key, id)).use { it.moveToFirst() }
        require(!duplicate) { "NICKNAME_IN_USE" }
        if (existing == null) db.execSQL("INSERT INTO lan_players(player_id,nickname_key,nickname_display,created_at_ms) VALUES(?,?,?,?)", arrayOf<Any?>(id, key, requestedDisplay, System.currentTimeMillis()))
        else if (existing != requestedDisplay) db.execSQL("UPDATE lan_players SET nickname_key=?,nickname_display=? WHERE player_id=?", arrayOf(key, requestedDisplay, id))
        if (id == localPlayerId) localNickname = requestedDisplay
        return requestedDisplay
    }

    private fun allocateGuest(): String {
        var index = 1
        while (db.rawQuery("SELECT 1 FROM lan_players WHERE nickname_key=?", arrayOf("guest$index")).use { it.moveToFirst() }) index++
        return "guest$index"
    }
    private fun playerName(id: String): String? = db.rawQuery("SELECT nickname_display FROM lan_players WHERE player_id=?", arrayOf(id)).use { if (it.moveToFirst()) it.getString(0) else null }

    private fun snapshotInside(viewerId: String? = null): JSONObject {
        val challenge = db.rawQuery("SELECT challenge_id,applicant_id,acceptor_id,status,revision,created_at_ms,deadline_ms FROM lan_challenges ORDER BY created_at_ms DESC LIMIT 1", emptyArray()).use { c ->
            if (!c.moveToFirst()) JSONObject.NULL else JSONObject()
                .put("challengeId", c.getString(0)).put("applicantId", c.getString(1)).put("acceptorId", c.getString(2))
                .put("applicantName", playerName(c.getString(1)) ?: "상대").put("acceptorName", playerName(c.getString(2)) ?: localNickname)
                .put("status", c.getString(3)).put("revision", c.getInt(4)).put("createdAtUtcMs", c.getLong(5)).put("deadlineUtcMs", c.getLong(6))
                .put("invitationToken", if (c.getString(3) == "PENDING" && c.getString(1) == localPlayerId && c.getString(2) == viewerId) c.getString(0) else JSONObject.NULL)
        }
        val now = System.currentTimeMillis()
        val game = db.rawQuery("SELECT game_id,challenge_id,white_id,black_id,authority_id,status,revision,state_json,ended_at_ms FROM lan_games WHERE status='ACTIVE' OR (ended_at_ms IS NOT NULL AND ended_at_ms>?) ORDER BY created_at_ms DESC LIMIT 1", arrayOf((now - RESULT_ROOM_MS).toString())).use { c ->
            if (!c.moveToFirst()) JSONObject.NULL else {
                val state = JSONObject(c.getString(7))
                state.put("gameId", c.getString(0)).put("challengeId", c.getString(1)).put("whitePlayerId", c.getString(2)).put("blackPlayerId", c.getString(3))
                    .put("authorityPlayerId", c.getString(4)).put("status", c.getString(5)).put("revision", c.getInt(6))
                    .put("whiteName", playerName(c.getString(2)) ?: "백").put("blackName", playerName(c.getString(3)) ?: "흑")
                val opponentId = listOf(c.getString(2), c.getString(3)).firstOrNull { it != localPlayerId }
                val lastSeen = opponentId?.let { participantLastSeenElapsed[it] }
                if (c.getString(5) == "ACTIVE" && lastSeen != null) {
                    val evaluation = LanRecoveryPolicy.evaluate(SystemClock.elapsedRealtime(), lastSeen, monotonicDeadline ?: Long.MAX_VALUE)
                    state.put("opponentConnected", !evaluation.disconnected)
                        .put("reconnectDeadlineUtcMs", System.currentTimeMillis() + (evaluation.reconnectDeadlineElapsedMs - SystemClock.elapsedRealtime()).coerceAtLeast(0))
                } else {
                    val connected = lastSeen != null && SystemClock.elapsedRealtime() - lastSeen < 30_000L
                    state.put("opponentConnected", if (c.getString(5) == "ACTIVE") true else connected).put("reconnectDeadlineUtcMs", JSONObject.NULL)
                }
                val endAt = if (c.isNull(8)) JSONObject.NULL else c.getLong(8)
                val roomExpiry = if (c.isNull(8)) JSONObject.NULL else c.getLong(8) + RESULT_ROOM_MS
                state.put("endedAtUtcMs", endAt).put("resultRoomExpiresAtUtcMs", roomExpiry)
                val rematch = db.rawQuery("SELECT rematch_id,requester_id,responder_id,status,requested_at_ms,deadline_ms,new_game_id,responded_at_ms FROM lan_rematches WHERE game_id=?", arrayOf(c.getString(0))).use { rem ->
                    if (!rem.moveToFirst()) JSONObject.NULL else JSONObject().put("rematchId", rem.getString(0)).put("requesterId", rem.getString(1)).put("responderId", rem.getString(2))
                        .put("status", rem.getString(3)).put("requestedAtUtcMs", rem.getLong(4)).put("deadlineUtcMs", rem.getLong(5))
                        .put("respondedAtUtcMs", if (rem.isNull(7)) JSONObject.NULL else rem.getLong(7))
                        .put("requestAllowedAtUtcMs", if (rem.isNull(7)) JSONObject.NULL else LanResultChatPolicy.rematchRequestAllowedAt(rem.getLong(7)))
                        .put("newGameId", if (rem.isNull(6)) JSONObject.NULL else rem.getString(6))
                }
                state.put("rematch", rematch)
                val messages = org.json.JSONArray()
                db.rawQuery("SELECT sequence,message_id,sender_id,body,sent_at_ms FROM lan_chat_messages WHERE game_id=? ORDER BY sequence DESC LIMIT 100", arrayOf(c.getString(0))).use { rows ->
                    val list = mutableListOf<JSONObject>()
                    while (rows.moveToNext()) list += JSONObject().put("sequence", rows.getInt(0)).put("messageId", rows.getString(1)).put("senderId", rows.getString(2)).put("senderName", playerName(rows.getString(2)) ?: "참가자").put("body", rows.getString(3)).put("sentAtUtcMs", rows.getLong(4))
                    list.asReversed().forEach(messages::put)
                }
                state.put("chatMessages", messages).put("chatSequence", messages.optJSONObject(messages.length() - 1)?.optInt("sequence", 0) ?: 0)
                state
            }
        }
        return JSONObject().put("localPlayerId", localPlayerId).put("localNickname", localNickname)
            .put("challenge", challenge).put("game", game)
    }

    private fun request(actor: String, id: String): Pair<String, String>? = db.rawQuery("SELECT request_hash,response_json FROM lan_requests WHERE actor_id=? AND request_id=?", arrayOf(actor, id)).use { if (!it.moveToFirst()) null else it.getString(0) to it.getString(1) }
    private fun insertRequest(actor: String, id: String, hash: String, response: JSONObject) { db.execSQL("INSERT INTO lan_requests(actor_id,request_id,request_hash,response_json,created_at_ms) VALUES(?,?,?,?,?)", arrayOf<Any?>(actor, id, hash, response.toString(), System.currentTimeMillis())) }
    private fun requestHash(input: JSONObject): String {
        val fields = arrayOf("type", "actorId", "nickname", "challengeId", "gameId", "expectedRevision", "x", "y", "accessToken", "messageId", "body", "rematchId", "accept")
        val canonical = JSONObject().apply { fields.forEach { key -> if (input.has(key)) put(key, input.get(key)) } }.toString()
        return sha256(canonical)
    }
    private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    private fun success() = JSONObject().put("ok", true)
    private fun failure(code: String, detail: String? = null) = JSONObject().put("ok", false).put("error", code).put("detail", detail ?: code)
    private fun integer(input: JSONObject, key: String, fallback: Int): Int {
        if (!input.has(key)) return fallback
        val value = input.opt(key)
        require(value is Number && value.toDouble().isFinite() && value.toDouble() == value.toInt().toDouble()) { "INVALID_INTEGER:$key" }
        return value.toInt()
    }
    private fun queryLong(sql: String, args: Array<String> = emptyArray()): Long = db.rawQuery(sql, args).use { if (it.moveToFirst()) it.getLong(0) else 0L }
    private fun contentValues(vararg pairs: Pair<String, Any?>) = android.content.ContentValues().apply {
        pairs.forEach { (key, value) -> when (value) { null -> putNull(key); is String -> put(key, value); is Int -> put(key, value); is Long -> put(key, value); else -> put(key, value.toString()) } }
    }
    private inline fun transaction(block: () -> Unit) {
        db.beginTransaction()
        try { block(); db.setTransactionSuccessful() } finally { db.endTransaction() }
    }

    override fun close() = helper.close()

    private data class FinishedGame(val id: String, val challengeId: String, val whiteId: String, val blackId: String, val authorityId: String, val winnerId: String?, val endedAt: Long?)
    private data class AnyGame(val id: String, val whiteId: String, val blackId: String, val status: String)
    private data class Rematch(val gameId: String, val requesterId: String, val responderId: String, val status: String, val deadline: Long)
    private data class ExistingRematch(val id: String, val status: String, val deadline: Long, val respondedAt: Long?)
    private fun finishedGame(id: String): FinishedGame? = db.rawQuery("SELECT game_id,challenge_id,white_id,black_id,authority_id,state_json,ended_at_ms FROM lan_games WHERE game_id=? AND status IN ('FINISHED','ABORTED')", arrayOf(id)).use { c ->
        if (!c.moveToFirst()) null else FinishedGame(c.getString(0), c.getString(1), c.getString(2), c.getString(3), c.getString(4), JSONObject(c.getString(5)).optString("winnerPlayerId").takeIf { it.isNotBlank() && it != "null" }, if (c.isNull(6)) null else c.getLong(6))
    }
    private fun anyGame(id: String): AnyGame? = db.rawQuery("SELECT game_id,white_id,black_id,status FROM lan_games WHERE game_id=?", arrayOf(id)).use { c -> if (!c.moveToFirst()) null else AnyGame(c.getString(0), c.getString(1), c.getString(2), c.getString(3)) }

    private class Helper(context: Context) : SQLiteOpenHelper(context, "danpan-lan.sqlite", null, 3) {
        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL("CREATE TABLE lan_players(player_id TEXT PRIMARY KEY,nickname_key TEXT NOT NULL UNIQUE,nickname_display TEXT NOT NULL,created_at_ms INTEGER NOT NULL)")
            db.execSQL("CREATE TABLE lan_challenges(challenge_id TEXT PRIMARY KEY,applicant_id TEXT NOT NULL,acceptor_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('PENDING','ACCEPTED','DECLINED','CANCELLED','EXPIRED')),revision INTEGER NOT NULL,created_at_ms INTEGER NOT NULL,deadline_ms INTEGER NOT NULL,updated_at_ms INTEGER NOT NULL DEFAULT 0,token_hash TEXT NOT NULL)")
            db.execSQL("CREATE UNIQUE INDEX one_pending_lan_challenge ON lan_challenges(status) WHERE status='PENDING'")
            db.execSQL("CREATE TABLE lan_games(game_id TEXT PRIMARY KEY,challenge_id TEXT NOT NULL,white_id TEXT NOT NULL,black_id TEXT NOT NULL,authority_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('ACTIVE','FINISHED','ABORTED')),revision INTEGER NOT NULL,state_json TEXT NOT NULL,created_at_ms INTEGER NOT NULL,updated_at_ms INTEGER NOT NULL,ended_at_ms INTEGER)")
            db.execSQL("CREATE UNIQUE INDEX one_active_lan_game ON lan_games(status) WHERE status='ACTIVE'")
            db.execSQL("CREATE TABLE lan_moves(game_id TEXT NOT NULL,revision INTEGER NOT NULL,request_id TEXT NOT NULL,player_id TEXT NOT NULL,x INTEGER NOT NULL CHECK(x BETWEEN 0 AND 14),y INTEGER NOT NULL CHECK(y BETWEEN 0 AND 14),color TEXT NOT NULL CHECK(color IN ('BLACK','WHITE')),accepted_at_ms INTEGER NOT NULL,PRIMARY KEY(game_id,revision),UNIQUE(game_id,request_id))")
            db.execSQL("CREATE TABLE lan_requests(actor_id TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,response_json TEXT NOT NULL,created_at_ms INTEGER NOT NULL,PRIMARY KEY(actor_id,request_id))")
            createResultChatTables(db)
        }
        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
            if (oldVersion < 2) {
                db.execSQL("DROP INDEX IF EXISTS one_active_lan_game")
                db.execSQL("ALTER TABLE lan_games RENAME TO lan_games_v1")
                db.execSQL("CREATE TABLE lan_games(game_id TEXT PRIMARY KEY,challenge_id TEXT NOT NULL,white_id TEXT NOT NULL,black_id TEXT NOT NULL,authority_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('ACTIVE','FINISHED','ABORTED')),revision INTEGER NOT NULL,state_json TEXT NOT NULL,created_at_ms INTEGER NOT NULL,updated_at_ms INTEGER NOT NULL,ended_at_ms INTEGER)")
                db.execSQL("INSERT INTO lan_games SELECT * FROM lan_games_v1")
                db.execSQL("DROP TABLE lan_games_v1")
                db.execSQL("CREATE UNIQUE INDEX one_active_lan_game ON lan_games(status) WHERE status='ACTIVE'")
            }
            if (oldVersion < 3) createResultChatTables(db)
        }
        private fun createResultChatTables(db: SQLiteDatabase) {
            db.execSQL("CREATE TABLE lan_rematches(rematch_id TEXT PRIMARY KEY,game_id TEXT NOT NULL UNIQUE,requester_id TEXT NOT NULL,responder_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('PENDING','ACCEPTED','DECLINED','EXPIRED','CANCELLED')),requested_at_ms INTEGER NOT NULL,deadline_ms INTEGER NOT NULL,responded_at_ms INTEGER,new_game_id TEXT)")
            db.execSQL("CREATE TABLE lan_chat_messages(game_id TEXT NOT NULL,sequence INTEGER NOT NULL,message_id TEXT NOT NULL,sender_id TEXT NOT NULL,body TEXT NOT NULL,sent_at_ms INTEGER NOT NULL,PRIMARY KEY(game_id,sequence),UNIQUE(game_id,message_id))")
            db.execSQL("CREATE INDEX lan_chat_recent_window ON lan_chat_messages(game_id,sent_at_ms)")
            db.execSQL("CREATE TABLE lan_chat_ids(game_id TEXT NOT NULL,message_id TEXT NOT NULL,sender_id TEXT NOT NULL,body_hash TEXT NOT NULL,sequence INTEGER NOT NULL,created_at_ms INTEGER NOT NULL,PRIMARY KEY(game_id,message_id))")
        }
    }
    companion object { const val TURN_MS = 60_000L; const val CHALLENGE_MS = 30_000L; const val RESULT_ROOM_MS = LanResultChatPolicy.RESULT_ROOM_MS; const val REMATCH_RESPONSE_MS = LanResultChatPolicy.REMATCH_RESPONSE_MS }
}
