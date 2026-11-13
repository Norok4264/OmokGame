package kr.danpan.omok

import org.json.JSONException
import org.json.JSONObject
import java.util.UUID

internal object LanProtocol {
    const val SERVICE_TYPE = "_danpan-omok._tcp."
    const val VERSION = "danpan-lan-v5"
    const val SERVICE_PROTOCOL_VERSION = "5"
    const val MAX_LINE_CHARS = 16_384

    data class Ping(val requestId: String, val sentAtEpochMs: Long)
    data class Pong(val requestId: String, val serverTimeEpochMs: Long)

    fun newPing(): Ping = Ping(UUID.randomUUID().toString(), System.currentTimeMillis())

    fun encodePing(ping: Ping): String = JSONObject()
        .put("protocol", VERSION)
        .put("type", "ping")
        .put("requestId", ping.requestId)
        .put("sentAtEpochMs", ping.sentAtEpochMs)
        .toString()

    fun encodePong(ping: Ping): String = JSONObject()
        .put("protocol", VERSION)
        .put("type", "pong")
        .put("requestId", ping.requestId)
        .put("serverTimeEpochMs", System.currentTimeMillis())
        .toString()

    @Throws(JSONException::class)
    fun decodePong(line: String): Pong {
        require(line.length <= MAX_LINE_CHARS) { "응답이 허용 크기를 넘었습니다." }
        val json = JSONObject(line)
        require(json.getString("protocol") == VERSION) { "상대 앱 프로토콜 버전이 다릅니다." }
        require(json.getString("type") == "pong") { "예상하지 않은 응답입니다." }
        val requestId = json.getString("requestId")
        require(requestId.length in 1..64) { "요청 식별자가 잘못되었습니다." }
        return Pong(requestId, json.getLong("serverTimeEpochMs"))
    }
}
