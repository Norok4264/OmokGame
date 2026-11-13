package kr.danpan.omok

/** Pure Kotlin free-rule Gomoku engine shared by the LAN authority and its rule-vector runner. */
internal object LanGameRules {
    const val SIZE = 15
    data class State(
        val board: List<List<String?>>,
        val nextColor: String?,
        val status: String,
        val resultKind: String? = null,
        val winner: String? = null,
        val lastX: Int? = null,
        val lastY: Int? = null,
    )
    private val directions = arrayOf(1 to 0, 0 to 1, 1 to 1, 1 to -1)

    fun empty(): State = State(List(SIZE) { List<String?>(SIZE) { null } }, "BLACK", "ACTIVE")

    fun play(state: State, x: Int, y: Int, color: String): State {
        require(state.status == "ACTIVE" && state.nextColor != null) { "GAME_FINISHED" }
        require(x in 0 until SIZE && y in 0 until SIZE) { "OUT_OF_BOUNDS" }
        require(color == "BLACK" || color == "WHITE") { "INVALID_COLOR" }
        require(state.nextColor == color) { "WRONG_TURN" }
        require(state.board[y][x] == null) { "OCCUPIED" }
        val board = state.board.map { it.toMutableList() }.toMutableList()
        board[y][x] = color
        val win = directions.any { (dx, dy) -> 1 + count(board, x, y, dx, dy, color) + count(board, x, y, -dx, -dy, color) >= 5 }
        val full = board.all { row -> row.all { it != null } }
        return State(
            board = board.map { it.toList() },
            nextColor = if (win || full) null else if (color == "BLACK") "WHITE" else "BLACK",
            status = if (win || full) "FINISHED" else "ACTIVE",
            resultKind = when { win -> "WIN"; full -> "DRAW"; else -> null },
            winner = if (win) color else null,
            lastX = x,
            lastY = y,
        )
    }

    fun withPosition(board: List<List<String?>>, nextColor: String = "BLACK"): State {
        require(board.size == SIZE && board.all { it.size == SIZE }) { "INVALID_BOARD" }
        return State(board.map { it.toList() }, nextColor, "ACTIVE")
    }

    private fun count(board: List<List<String?>>, x: Int, y: Int, dx: Int, dy: Int, color: String): Int {
        var cx = x + dx
        var cy = y + dy
        var found = 0
        while (cx in 0 until SIZE && cy in 0 until SIZE && board[cy][cx] == color) {
            found++
            cx += dx
            cy += dy
        }
        return found
    }
}
