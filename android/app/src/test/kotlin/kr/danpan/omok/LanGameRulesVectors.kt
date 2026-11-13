package kr.danpan.omok

/** Standalone JVM regression vectors; run with the Kotlin compiler against LanGameRules.kt. */
fun main() {
    fun board() = MutableList(15) { MutableList<String?>(15) { null } }
    fun winsAt(b: List<List<String?>>, x: Int, y: Int, color: String): Boolean {
        val dirs = listOf(1 to 0, 0 to 1, 1 to 1, 1 to -1)
        return dirs.any { (dx, dy) ->
            fun scan(sx: Int, sy: Int, vx: Int, vy: Int): Int {
                var cx = sx + vx; var cy = sy + vy; var n = 0
                while (cx in 0..14 && cy in 0..14 && b[cy][cx] == color) { n++; cx += vx; cy += vy }
                return n
            }
            1 + scan(x, y, dx, dy) + scan(x, y, -dx, -dy) >= 5
        }
    }

    run {
        val b = board(); repeat(4) { b[0][it] = "BLACK" }
        val result = LanGameRules.play(LanGameRules.withPosition(b), 4, 0, "BLACK")
        check(result.resultKind == "WIN" && result.winner == "BLACK") { "horizontal five" }
    }
    run {
        val b = board(); repeat(5) { b[7][it] = "BLACK" }
        check(LanGameRules.play(LanGameRules.withPosition(b), 5, 7, "BLACK").winner == "BLACK") { "overline" }
    }
    listOf(0 to 1, 1 to 0, 1 to 1, 1 to -1).forEachIndexed { index, (dx, dy) ->
        val b = board(); val x0 = if (dx == 0) 3 else if (dx == 1 && dy == -1) 4 else 0
        val y0 = if (dy == -1) 4 else 0
        repeat(4) { i -> b[y0 + dy * i][x0 + dx * i] = "WHITE" }
        val result = LanGameRules.play(LanGameRules.withPosition(b, "WHITE"), x0 + 4 * dx, y0 + 4 * dy, "WHITE")
        check(result.resultKind == "WIN" && result.winner == "WHITE") { "direction $index" }
    }
    run {
        val b = board(); repeat(4) { b[0][it] = "BLACK" }
        check(LanGameRules.play(LanGameRules.withPosition(b), 4, 0, "BLACK").resultKind == "WIN") { "edge five" }
    }
    run {
        val b = board()
        for (y in 0..14) for (x in 0..14) b[y][x] = if ((x + 2 * y) % 5 in 0..1) "BLACK" else "WHITE"
        check((0..14).all { y -> (0..14).all { x -> !winsAt(b, x, y, b[y][x]!!) } }) { "draw fixture must not contain a five" }
        b[14][14] = null
        val result = LanGameRules.play(LanGameRules.withPosition(b, "WHITE"), 14, 14, "WHITE")
        check(result.resultKind == "DRAW" && result.winner == null) { "last-cell draw" }
    }
    run {
        val b = board()
        for (y in 0..14) for (x in 0..14) b[y][x] = if ((x + 2 * y) % 5 in 0..1) "BLACK" else "WHITE"
        repeat(4) { b[14][10 + it] = "BLACK" }
        b[14][14] = null
        check((0..14).all { y -> (0..14).all { x -> b[y][x] == null || !winsAt(b, x, y, b[y][x]!!) } }) { "win fixture has no prior five" }
        val result = LanGameRules.play(LanGameRules.withPosition(b, "BLACK"), 14, 14, "BLACK")
        check(result.resultKind == "WIN" && result.winner == "BLACK") { "last-cell win precedes draw" }
    }
    run {
        val b = board(); b[7][6] = "BLACK"; b[7][8] = "BLACK"
        check(LanGameRules.play(LanGameRules.withPosition(b), 7, 7, "BLACK").status == "ACTIVE") { "free rule permits open three" }
        check(runCatching { LanGameRules.play(LanGameRules.empty(), 7, 7, "WHITE") }.exceptionOrNull()?.message == "WRONG_TURN") { "wrong turn" }
        val occupied = board(); occupied[7][7] = "BLACK"
        check(runCatching { LanGameRules.play(LanGameRules.withPosition(occupied), 7, 7, "BLACK") }.exceptionOrNull()?.message == "OCCUPIED") { "occupied point" }
        check(runCatching { LanGameRules.play(LanGameRules.empty(), -1, 0, "BLACK") }.exceptionOrNull()?.message == "OUT_OF_BOUNDS") { "out of bounds" }
        check(runCatching { LanGameRules.play(LanGameRules.empty(), 15, 1, "BLACK") }.exceptionOrNull()?.message == "OUT_OF_BOUNDS") { "upper bound" }
    }
    println("LAN rule vectors: all cases passed")
}
