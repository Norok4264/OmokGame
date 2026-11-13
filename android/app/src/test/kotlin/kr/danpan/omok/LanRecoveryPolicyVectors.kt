package kr.danpan.omok

/** Fake-clock vectors runnable with the IDE Kotlin compiler; no Android runtime is implied. */
fun main() {
    val last = 100_000L
    check(LanRecoveryPolicy.HEARTBEAT_INTERVAL_MS == 15_000L)
    check(!LanRecoveryPolicy.evaluate(last + 29_999, last, last + 200_000).disconnected)
    check(LanRecoveryPolicy.evaluate(last + 30_000, last, last + 200_000).disconnected)
    check(LanRecoveryPolicy.evaluate(last + 89_999, last, last + 200_000).terminal == null)
    check(LanRecoveryPolicy.evaluate(last + 90_000, last, last + 200_000).terminal == LanRecoveryPolicy.End.DISCONNECT)
    check(LanRecoveryPolicy.evaluate(last + 90_000, last, last + 90_000).terminal == LanRecoveryPolicy.End.TIMEOUT)
    check(LanRecoveryPolicy.evaluate(last + 150_000, last, last + 80_000).terminal == LanRecoveryPolicy.End.TIMEOUT)
    check(LanRecoveryPolicy.evaluate(last + 150_000, last, last + 120_000).terminal == LanRecoveryPolicy.End.DISCONNECT)
    check(LanRecoveryPolicy.evaluate(last + 100_000, last + 50_000, last + 120_000).terminal == null)
    check(LanRecoveryPolicy.evaluate(last + 100_000, last + 50_000, last + 90_000).terminal == LanRecoveryPolicy.End.TIMEOUT)
    println("LAN recovery fake-clock vectors: all cases passed")
}
