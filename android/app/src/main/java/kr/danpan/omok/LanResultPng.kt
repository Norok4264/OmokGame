package kr.danpan.omok

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Self-contained result image renderer. Its input is an explicit allow-list; no chat or connection data is accepted. */
internal object LanResultPng {
    fun render(json: String): ByteArray {
        val data = JSONObject(json)
        val board = data.getJSONArray("board")
        require(board.length() == 15) { "최종 보드 행 수가 올바르지 않습니다." }
        val width = 1200
        val height = 1460
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.rgb(255, 241, 230))
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(61, 43, 31); textSize = 48f; typeface = android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.BOLD) }
        canvas.drawText("단판 오목 · 대국 결과", 70f, 100f, paint)
        paint.textSize = 34f
        paint.typeface = android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.NORMAL)
        canvas.drawText("${data.optString("whiteName")} · 백", 70f, 165f, paint)
        canvas.drawText("${data.optString("blackName")} · 흑", 630f, 165f, paint)
        paint.textSize = 38f
        paint.typeface = android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.BOLD)
        canvas.drawText(data.optString("resultTitle", "대국 종료"), 70f, 235f, paint)
        paint.textSize = 28f
        paint.typeface = android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.NORMAL)
        canvas.drawText("종료 사유: ${data.optString("reason")}", 70f, 285f, paint)

        val left = 95f; val top = 345f; val side = 1010f; val step = side / 14f
        val boardPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(221, 170, 119); style = Paint.Style.FILL }
        canvas.drawRoundRect(RectF(left - 35f, top - 35f, left + side + 35f, top + side + 35f), 24f, 24f, boardPaint)
        val grid = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(91, 59, 35); strokeWidth = 3f }
        for (index in 0..14) {
            val offset = index * step
            canvas.drawLine(left + offset, top, left + offset, top + side, grid)
            canvas.drawLine(left, top + offset, left + side, top + offset, grid)
        }
        val star = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(75, 49, 32) }
        for (x in listOf(3, 7, 11)) for (y in listOf(3, 7, 11)) canvas.drawCircle(left + x * step, top + y * step, 8f, star)
        val stone = Paint(Paint.ANTI_ALIAS_FLAG)
        for (y in 0 until 15) {
            val row = board.getJSONArray(y)
            require(row.length() == 15) { "최종 보드 열 수가 올바르지 않습니다." }
            for (x in 0 until 15) {
                val value = row.optString(x, "null")
                if (value == "BLACK" || value == "WHITE") {
                    val cx = left + x * step; val cy = top + y * step
                    stone.color = if (value == "BLACK") Color.rgb(28, 25, 24) else Color.WHITE
                    canvas.drawCircle(cx + 2f, cy + 4f, step * .42f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(75, 49, 31, 18) })
                    canvas.drawCircle(cx, cy, step * .4f, stone)
                    if (data.optJSONObject("winningMove")?.optInt("x", -1) == x && data.optJSONObject("winningMove")?.optInt("y", -1) == y) {
                        val mark = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(196, 69, 48); style = Paint.Style.STROKE; strokeWidth = 7f }
                        canvas.drawCircle(cx, cy, step * .32f, mark)
                    }
                }
            }
        }
        val savedAt = SimpleDateFormat("yyyy-MM-dd HH:mm:ss z", Locale.KOREA).format(Date())
        paint.textSize = 25f
        canvas.drawText("저장 시각: $savedAt", 70f, 1425f, paint)
        val output = ByteArrayOutputStream()
        check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) { "PNG 인코딩에 실패했습니다." }
        bitmap.recycle()
        return output.toByteArray()
    }
}
