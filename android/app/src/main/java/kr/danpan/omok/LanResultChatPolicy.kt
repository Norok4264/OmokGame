package kr.danpan.omok

/** Pure result/chat boundary rules; persistence and network remain in their own layers. */
internal object LanResultChatPolicy {
    const val RESULT_ROOM_MS = 300_000L
    const val REMATCH_RESPONSE_MS = 30_000L
    const val REMATCH_COOLDOWN_MS = 10_000L
    const val CHAT_WINDOW_MS = 5_000L
    const val CHAT_MAX_IN_WINDOW = 5
    const val CHAT_MAX_CODE_POINTS = 200

    fun rematchDeadline(nowMs: Long, endedAtMs: Long): Long? {
        val roomExpiry = endedAtMs + RESULT_ROOM_MS
        if (nowMs >= roomExpiry) return null
        return minOf(nowMs + REMATCH_RESPONSE_MS, roomExpiry)
    }

    fun rematchRequestAllowedAt(resolvedAtMs: Long): Long = resolvedAtMs + REMATCH_COOLDOWN_MS

    fun isValidChatBody(body: String): Boolean =
        body == body.trim() && body.codePointCount(0, body.length) in 1..CHAT_MAX_CODE_POINTS

    fun isInChatWindow(sentAtMs: Long, nowMs: Long): Boolean =
        sentAtMs > nowMs - CHAT_WINDOW_MS && sentAtMs <= nowMs

    fun canSendChat(recentMessageCount: Int): Boolean = recentMessageCount < CHAT_MAX_IN_WINDOW
}
