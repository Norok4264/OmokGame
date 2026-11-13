package kr.danpan.omok

import android.test.InstrumentationTestCase
import android.test.RenamingDelegatingContext
import org.json.JSONObject
import java.util.UUID

@Suppress("DEPRECATION")
class LanSessionRegressionTest : InstrumentationTestCase() {
    // Explicit one-off cleanup of non-UUID probe identities from the failed isolation run.
    // Not named test*: never executed by the regression suite.
    fun cleanupLegacyProbe() {
        val path = instrumentation.targetContext.getDatabasePath("danpan-lan.sqlite")
        if (!path.exists()) return
        android.database.sqlite.SQLiteDatabase.openDatabase(path.path, null, 0).use { db ->
            db.beginTransaction()
            try {
                db.execSQL("DELETE FROM lan_games WHERE white_id IN ('a','z') AND black_id IN ('a','z')")
                db.execSQL("DELETE FROM lan_challenges WHERE applicant_id IN ('a','z') AND acceptor_id IN ('a','z')")
                db.execSQL("DELETE FROM lan_requests WHERE actor_id IN ('local','a','z')")
                db.execSQL("DELETE FROM lan_players WHERE player_id IN ('local','a','z')")
                db.setTransactionSuccessful()
            } finally { db.endTransaction() }
        }
    }
    private fun isolatedContext() = object : RenamingDelegatingContext(instrumentation.targetContext, "test-${UUID.randomUUID()}-") {
        override fun getApplicationContext(): android.content.Context = this
    }
    fun testBlankNicknameStartsNewUse() {
        val context = isolatedContext()
        LanGameRepository(context, "local").use { repo ->
            assertEquals("Alice", repo.configureLocal("Alice").getString("localNickname"))
            val guest = repo.configureLocal("").getString("localNickname")
            assertTrue(guest.matches(Regex("guest[0-9]+")))
            assertFalse(guest == "Alice")
        }
        context.databaseList().forEach { context.deleteDatabase(it) }
    }

    fun testBothIdOrdersCanRequestAndRecipientOwnsGame() {
        for ((recipient, applicant) in listOf("a" to "z", "z" to "a")) {
            val context = isolatedContext()
            LanGameRepository(context, recipient).use { repo ->
                repo.configureLocal("Host")
                val create = JSONObject().put("type", "challenge.create").put("actorId", applicant)
                    .put("requestId", UUID.randomUUID().toString()).put("nickname", "GuestUser")
                    .put("accessToken", "0123456789012345678901234567890123456789")
                val response = repo.handle(create)
                assertTrue(response.toString(), response.getBoolean("ok"))
                val replay = repo.handle(create)
                assertEquals(response.getString("challengeId"), replay.getString("challengeId"))
                val accept = JSONObject().put("type", "challenge.accept").put("actorId", recipient)
                    .put("requestId", UUID.randomUUID().toString()).put("challengeId", response.getString("challengeId"))
                    .put("expectedRevision", 0)
                val result = repo.handle(accept, local = true)
                assertTrue(result.toString(), result.getBoolean("ok"))
                val game = result.getJSONObject("snapshot").getJSONObject("game")
                assertEquals(recipient, game.getString("authorityPlayerId"))
                assertEquals(applicant, game.getString("whitePlayerId"))
                assertEquals(recipient, game.getString("blackPlayerId"))
            }
            context.databaseList().forEach { context.deleteDatabase(it) }
        }
    }

    fun testCrossedRequestsChooseExactlyOneRecipient() {
        assertTrue(LanChallengePolicy.acceptIncoming("z", "a", "a", true))
        assertFalse(LanChallengePolicy.acceptIncoming("a", "z", "z", true))
        assertFalse(LanChallengePolicy.acceptIncoming("z", "a", "third", true))
        assertFalse(LanChallengePolicy.acceptIncoming("z", "a", "a", false))
        assertTrue(LanChallengePolicy.acceptIncoming("a", "z", null, false))
        assertTrue(LanChallengePolicy.acceptIncoming("z", "a", null, false))
    }
}
