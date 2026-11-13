package kr.danpan.omok

import org.json.JSONArray
import org.json.JSONObject

/** Adapts the pure rule value to the LAN persistence snapshot JSON. */
internal object LanGameJson {
    fun parse(json: JSONObject): LanGameRules.State {
        val source = json.getJSONArray("board")
        require(source.length() == LanGameRules.SIZE) { "INVALID_BOARD" }
        val board = List(LanGameRules.SIZE) { y ->
            val row = source.getJSONArray(y)
            require(row.length() == LanGameRules.SIZE) { "INVALID_BOARD" }
            List(LanGameRules.SIZE) { x -> if (row.isNull(x)) null else row.getString(x) }
        }
        return LanGameRules.State(
            board = board,
            nextColor = if (json.isNull("nextColor")) null else json.getString("nextColor"),
            status = json.getString("status"),
            resultKind = if (json.isNull("result")) null else json.getJSONObject("result").getString("kind"),
            winner = if (json.isNull("result") || json.getJSONObject("result").isNull("winner")) null else json.getJSONObject("result").getString("winner"),
            lastX = if (json.isNull("lastMove")) null else json.getJSONObject("lastMove").getInt("x"),
            lastY = if (json.isNull("lastMove")) null else json.getJSONObject("lastMove").getInt("y"),
        )
    }

    fun encode(state: LanGameRules.State, base: JSONObject = JSONObject()): JSONObject {
        val board = JSONArray().apply { state.board.forEach { row -> put(JSONArray().apply { row.forEach { put(it ?: JSONObject.NULL) } }) } }
        val result = when (state.resultKind) {
            "WIN" -> JSONObject().put("kind", "WIN").put("winner", state.winner)
            "DRAW" -> JSONObject().put("kind", "DRAW")
            else -> JSONObject.NULL
        }
        val winnerId = when (state.winner) {
            "WHITE" -> base.optString("whitePlayerId").takeIf(String::isNotBlank)
            "BLACK" -> base.optString("blackPlayerId").takeIf(String::isNotBlank)
            else -> null
        }
        return JSONObject(base.toString())
            .put("board", board)
            .put("nextColor", state.nextColor ?: JSONObject.NULL)
            .put("status", state.status)
            .put("result", result)
            .put("lastMove", if (state.lastX == null || state.lastY == null) JSONObject.NULL else JSONObject().put("x", state.lastX).put("y", state.lastY))
            .put("endReason", state.resultKind ?: JSONObject.NULL)
            .put("winnerPlayerId", winnerId ?: JSONObject.NULL)
    }
}
