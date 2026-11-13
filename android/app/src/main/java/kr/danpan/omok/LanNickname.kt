package kr.danpan.omok

import java.text.BreakIterator
import java.text.Normalizer
import java.util.Locale

internal object LanNickname {
    data class Valid(val display: String, val key: String)
    private val reserved = setOf(
        "admin", "administrator", "root", "system", "moderator", "operator", "support",
        "관리자", "운영자", "시스템", "봇", "bot", "문의", "고객센터",
    )

    fun validate(input: String): Valid {
        val display = Normalizer.normalize(input, Normalizer.Form.NFKC).trim()
        val iterator = BreakIterator.getCharacterInstance(Locale.KOREAN).apply { setText(display) }
        var count = 0
        iterator.first()
        while (iterator.next() != BreakIterator.DONE) count++
        require(count in 2..12) { "NICKNAME_LENGTH: 닉네임은 공백을 제외하고 2~12글자여야 합니다." }
        require(Regex("^[\\p{L}\\p{M}\\p{N}_-]+$").matches(display)) {
            "NICKNAME_CHARACTERS: 한글·영문·숫자·밑줄(_)·하이픈(-)만 사용할 수 있습니다."
        }
        val key = display.lowercase(Locale.forLanguageTag("ko-KR"))
        require(key !in reserved && !Regex("^(guest|게스트)\\d*$", RegexOption.IGNORE_CASE).matches(key)) {
            "NICKNAME_RESERVED: 사용할 수 없는 예약 닉네임입니다."
        }
        return Valid(display, key)
    }
}
