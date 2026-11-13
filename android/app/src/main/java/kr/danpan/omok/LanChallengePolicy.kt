package kr.danpan.omok

/** IDs break crossed-request ties only; the recipient always owns the accepted game. */
internal object LanChallengePolicy {
    fun acceptIncoming(localId: String, actorId: String, outgoingPeer: String?, outgoingLive: Boolean): Boolean =
        outgoingPeer == null || (outgoingPeer == actorId && outgoingLive && actorId < localId)
}
