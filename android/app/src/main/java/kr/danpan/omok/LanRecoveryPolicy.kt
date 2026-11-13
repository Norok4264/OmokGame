package kr.danpan.omok

/** Pure monotonic-clock policy for a participant heartbeat and the active turn clock. */
internal object LanRecoveryPolicy {
    const val HEARTBEAT_INTERVAL_MS = 15_000L
    const val DISCONNECT_AFTER_MS = 30_000L
    const val RECONNECT_GRACE_MS = 60_000L

    enum class End { TIMEOUT, DISCONNECT }

    data class Evaluation(
        val disconnected: Boolean,
        val reconnectDeadlineElapsedMs: Long,
        val terminal: End?,
    )

    fun evaluate(nowElapsedMs: Long, lastHeartbeatElapsedMs: Long, turnDeadlineElapsedMs: Long): Evaluation {
        val disconnectedAt = lastHeartbeatElapsedMs + DISCONNECT_AFTER_MS
        val reconnectDeadline = disconnectedAt + RECONNECT_GRACE_MS
        val disconnected = nowElapsedMs >= disconnectedAt
        val due = buildList {
            if (nowElapsedMs >= turnDeadlineElapsedMs) add(turnDeadlineElapsedMs to End.TIMEOUT)
            if (disconnected && nowElapsedMs >= reconnectDeadline) add(reconnectDeadline to End.DISCONNECT)
        }
        // At an equal timestamp the turn deadline wins, as required by the game policy.
        val terminal = due.minWithOrNull(compareBy<Pair<Long, End>> { it.first }.thenBy { if (it.second == End.TIMEOUT) 0 else 1 })?.second
        return Evaluation(disconnected, reconnectDeadline, terminal)
    }
}
