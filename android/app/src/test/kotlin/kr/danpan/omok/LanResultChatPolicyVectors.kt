package kr.danpan.omok

/** Standalone, Android-free boundary vectors for result/chat deadline policy. */
fun main() {
    val endedAt = 100_000L
    val roomExpiry = endedAt + LanResultChatPolicy.RESULT_ROOM_MS
    check(LanResultChatPolicy.rematchDeadline(endedAt + 1_000L, endedAt) == endedAt + 31_000L)
    check(LanResultChatPolicy.rematchDeadline(roomExpiry - 10_000L, endedAt) == roomExpiry)
    check(LanResultChatPolicy.rematchDeadline(roomExpiry, endedAt) == null)
    check(LanResultChatPolicy.rematchRequestAllowedAt(endedAt) == endedAt + 10_000L)

    check(!LanResultChatPolicy.isValidChatBody(""))
    check(!LanResultChatPolicy.isValidChatBody("   "))
    check(LanResultChatPolicy.isValidChatBody("가"))
    check(LanResultChatPolicy.isValidChatBody("가".repeat(200)))
    check(!LanResultChatPolicy.isValidChatBody("가".repeat(201)))
    check(LanResultChatPolicy.isValidChatBody("🙂".repeat(200)))
    check(!LanResultChatPolicy.isValidChatBody("🙂".repeat(201)))

    val now = 10_000L
    check(!LanResultChatPolicy.isInChatWindow(now - 5_000L, now))
    check(LanResultChatPolicy.isInChatWindow(now - 4_999L, now))
    check(!LanResultChatPolicy.isInChatWindow(now + 1L, now))
    check(LanResultChatPolicy.canSendChat(4))
    check(!LanResultChatPolicy.canSendChat(5))

    println("LAN result/chat fake-time vectors: all cases passed")
}
