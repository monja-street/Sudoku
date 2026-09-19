let CELL_SIZE = 50;
const GRID_SIZE = 9;
const HEADER_HEIGHT = 45;

let board = [];
let answerBoard = [];
let fixed = [];
let memo = [];

let selectedRow = -1;
let selectedCol = -1;
let memoMode = false;

let gameStartTime = 0;
let clearTime = null;
let hintCount = 0;

const MAX_MISTAKES = 3;
let mistakes = 0;
// let gameOver = false;
let isNewBestTime = false;

let solutionCount = 0;
let historyStack = [];

const DIFFICULTIES = {
    easy:   { label: "EASY", removeCount: 38 },
    normal: { label: "NORMAL", removeCount: 48 },
    hard:   { label: "HARD", removeCount: 54 }
};
let difficulty = "normal";

// 変更後 (OS標準フォントを指定):
const MAIN_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

function setup() {
    // スマホ画面幅から左右余白（計20px）を引いた幅でマス目を計算
    let targetWidth = min(windowWidth - 20, 500); // PC用の最大幅は500pxに制限
    
    // スマホ（横幅が狭い端末）では画面幅いっぱいにフィットさせる
    if (windowWidth < 500) {
        targetWidth = windowWidth - 20;
    }

    CELL_SIZE = targetWidth / GRID_SIZE;

    let canvas = createCanvas(
        GRID_SIZE * CELL_SIZE,
        GRID_SIZE * CELL_SIZE + HEADER_HEIGHT
    );
    
    canvas.parent("canvas-container");
    newGame();
}

function windowResized() {
    let targetWidth = min(windowWidth - 20, 500);
    if (windowWidth < 500) {
        targetWidth = windowWidth - 20;
    }
    CELL_SIZE = targetWidth / GRID_SIZE;
    resizeCanvas(GRID_SIZE * CELL_SIZE, GRID_SIZE * CELL_SIZE + HEADER_HEIGHT);
}

function newGame() {
    initializeBoard();
    solve();
    answerBoard = copyBoard(board);

    removeCells(DIFFICULTIES[difficulty].removeCount);
    initializeFixed();
    initializeMemo();

    hintCount = 0;
    mistakes = 0;
    gameOver = false;
    selectedRow = -1;
    selectedCol = -1;
    memoMode = false;
    historyStack = [];

    gameStartTime = millis();
    clearTime = null;

    updateMemoButtonUI();
    updateDifficultyUI();
}

function draw() {
    // 盤面エリアのスタイリッシュな微グラデーション背景
    drawBoardBackground();

    checkGameClear();
    drawHighlight();
    drawGrid();
    drawNumbers();

    if (gameOver) {
        drawGameOverMessage();
    } else if (clearTime !== null) {
        drawGameClearMessage();
    }

    drawStatus();
}

// -------------------------------------------------------------------
// 背景・描画デザイン
// -------------------------------------------------------------------

function drawBoardBackground() {
    // ヘッダー下の盤面背景
    noStroke();
    fill(250, 252, 255);
    rect(0, HEADER_HEIGHT, width, height - HEADER_HEIGHT);
}

function drawGrid() {
    for (let i = 0; i <= GRID_SIZE; i++) {
        if (i % 3 === 0) {
            strokeWeight(2.5);
            stroke(44, 62, 80); // ダークスレート
        } else {
            strokeWeight(1);
            stroke(218, 225, 233); // 薄いソフトグレー
        }

        // 横線
        line(0, HEADER_HEIGHT + i * CELL_SIZE, width, HEADER_HEIGHT + i * CELL_SIZE);
        // 縦線
        line(i * CELL_SIZE, HEADER_HEIGHT, i * CELL_SIZE, height);
    }
}

function drawHighlight() {
    if (selectedRow === -1 || selectedCol === -1) return;

    noStroke();

    // 選択された行・列・3x3ブロックのみを優しくハイライト
    fill(235, 243, 253);
    rect(0, HEADER_HEIGHT + selectedRow * CELL_SIZE, width, CELL_SIZE);
    rect(selectedCol * CELL_SIZE, HEADER_HEIGHT, CELL_SIZE, GRID_SIZE * CELL_SIZE);

    let startRow = floor(selectedRow / 3) * 3;
    let startCol = floor(selectedCol / 3) * 3;
    rect(startCol * CELL_SIZE, HEADER_HEIGHT + startRow * CELL_SIZE, CELL_SIZE * 3, CELL_SIZE * 3);

    // 選択中のセル本体のみを強調
    fill(160, 201, 255);
    rect(selectedCol * CELL_SIZE, HEADER_HEIGHT + selectedRow * CELL_SIZE, CELL_SIZE, CELL_SIZE);
}

function drawNumbers() {
    textAlign(CENTER, CENTER);
    textFont(MAIN_FONT);

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            let num = board[r][c];
            let x = c * CELL_SIZE + CELL_SIZE / 2;
            let y = HEADER_HEIGHT + r * CELL_SIZE + CELL_SIZE / 2;

            if (num !== 0) {
                noStroke();
                if (isError(r, c)) {
                    // エラー時のソフトな赤い背景バッジ
                    fill(255, 230, 230);
                    ellipse(x, y, CELL_SIZE * 0.75);

                    fill(231, 76, 60); // 鮮やかなエラートーン
                    textSize(CELL_SIZE * 0.55);
                    textStyle(BOLD);
                } else if (fixed[r][c]) {
                    fill(44, 62, 80); // 初期数字：深く高級感のあるダークネイビー
                    textSize(CELL_SIZE * 0.55);
                    textStyle(BOLD);
                } else {
                    fill(41, 128, 185); // 入力数字：クリアなロイヤルブルー
                    textSize(CELL_SIZE * 0.52);
                    textStyle(NORMAL);
                }

                text(num, x, y + 1); // 垂直方向の調整
            } else {
                drawMemo(r, c);
            }
        }
    }
}

function drawMemo(row, col) {
    let currentMemo = memo[row][col];
    if (currentMemo.length === 0) return;

    push();
    textFont(MAIN_FONT);
    textSize(CELL_SIZE * 0.24);
    textAlign(CENTER, CENTER);
    fill(127, 140, 141);
    textStyle(NORMAL);
    noStroke();

    let x = col * CELL_SIZE;
    let y = HEADER_HEIGHT + row * CELL_SIZE;
    let subSize = CELL_SIZE / 3;

    for (let n of currentMemo) {
        let r = floor((n - 1) / 3);
        let c = (n - 1) % 3;
        text(n, x + c * subSize + subSize / 2, y + r * subSize + subSize / 2);
    }
    pop();
}

function drawStatus() {
    // ヘッダーバーの背景
    noStroke();
    fill(255);
    rect(0, 0, width, HEADER_HEIGHT);
    
    // 下部に区切り線
    stroke(230);
    strokeWeight(1);
    line(0, HEADER_HEIGHT, width, HEADER_HEIGHT);

    textFont(MAIN_FONT);
    textSize(11);
    textStyle(BOLD);
    fill(108, 122, 137);

    let currentBest = getBestTime(difficulty);
    let bestStr = currentBest ? formatTime(currentBest) : "--:--";

    // 左側：MODE のみ
    textAlign(LEFT, CENTER);
    text(`MODE: ${DIFFICULTIES[difficulty].label}`, 10, HEADER_HEIGHT / 2);

    // 右側：ERR | BEST | TIME （BESTのすぐ左にERRを配置）
    textAlign(RIGHT, CENTER);
    text(`ERR: ${mistakes}  |  BEST ${bestStr}  |  TIME ${formatTime(getElapsedSeconds())}`, width - 10, HEADER_HEIGHT / 2);
}

// -------------------------------------------------------------------
// クールなクリア＆ゲームオーバー画面
// -------------------------------------------------------------------

function drawGameClearMessage() {
    // 透明感あるすりガラス風オーバーレイ
    fill(255, 255, 255, 235);
    noStroke();
    rect(0, 0, width, height);

    textFont(MAIN_FONT);
    textAlign(CENTER, CENTER);

    // タイトルロゴ演出
    textSize(32);
    textStyle(BOLD);
    fill(39, 174, 96); // クリーンなエメラルドグリーン
    text("VICTORY!", width / 2, height / 2 - 45);

    // サブタイトル
    textSize(18);
    fill(52, 73, 94);
    textStyle(NORMAL);
    text(`CLEAR TIME : ${formatTime(getElapsedSeconds())}`, width / 2, height / 2 + 5);

    textSize(14);
    if (hintCount > 0) {
        fill(127, 140, 141);
        text("( Hints Used - No Record )", width / 2, height / 2 + 38);
    } else if (isNewBestTime) {
        fill(230, 126, 34);
        textStyle(BOLD);
        text("★ NEW BEST RECORD! ★", width / 2, height / 2 + 38);
    } else {
        let bestTime = getBestTime();
        fill(127, 140, 141);
        text(`BEST RECORD : ${formatTime(bestTime)}`, width / 2, height / 2 + 38);
    }
}

function drawGameOverMessage() {
    fill(255, 255, 255, 235);
    noStroke();
    rect(0, 0, width, height);

    textFont(MAIN_FONT);
    textAlign(CENTER, CENTER);

    textSize(34);
    textStyle(BOLD);
    fill(231, 76, 60);
    text("GAME OVER", width / 2, height / 2 - 25);

    textSize(14);
    textStyle(NORMAL);
    fill(127, 140, 141);
    text("Press 'New Game' to try again", width / 2, height / 2 + 20);
}

// -------------------------------------------------------------------
// ロジック・履歴・UIハンドラー (変更なし)
// -------------------------------------------------------------------

function saveState() {
    historyStack.push({
        board: copyBoard(board),
        memo: memo.map(row => row.map(arr => [...arr])),
        mistakes: mistakes
    });
}

function undo() {
    if (historyStack.length === 0 || gameOver || clearTime !== null) return;
    let previous = historyStack.pop();
    board = previous.board;
    memo = previous.memo;
    // mistakes = previous.mistakes;
}

function setNumber(number) {
    if (gameOver || clearTime !== null || selectedRow === -1 || selectedCol === -1) return;
    
    // 初期からある黒文字のマスは書き換え不可
    if (fixed[selectedRow][selectedCol]) return;

    saveState();

    // 数字をセット（0なら消去）
    board[selectedRow][selectedCol] = number;

    if (number !== 0) {
        memo[selectedRow][selectedCol] = [];
        removeRelatedMemos(selectedRow, selectedCol, number);

        // 間違えた数字を入力したときのみミスをカウント
        if (isError(selectedRow, selectedCol)) {
            mistakes++;
            // if (mistakes >= MAX_MISTAKES) {
            //     gameOver = true;
            // }
        }
    }
}

function toggleMemo(number) {
    if (selectedRow === -1 || selectedCol === -1 || fixed[selectedRow][selectedCol]) return;

    saveState();
    let currentMemo = memo[selectedRow][selectedCol];
    let index = currentMemo.indexOf(number);

    if (index === -1) {
        currentMemo.push(number);
    } else {
        currentMemo.splice(index, 1);
    }
}

function handleNumberInput(num) {
    let numericValue = Number(num);
    if (memoMode) {
        toggleMemo(numericValue);
    } else {
        setNumber(numericValue);
    }
}

function handleErase() { setNumber(0); }

function handleMemoToggle() {
    memoMode = !memoMode;
    updateMemoButtonUI();
}

function updateMemoButtonUI() {
    let btn = document.getElementById("btn-memo");
    if (!btn) return;

    if (memoMode) {
        btn.textContent = "メモ: ON";
        btn.classList.add("active");
    } else {
        btn.textContent = "メモ: OFF";
        btn.classList.remove("active");
    }
}

function mousePressed() {
    // 盤面外のタップは無視
    if (mouseX < 0 || mouseX > width || mouseY < HEADER_HEIGHT || mouseY > height) return;

    let c = floor(mouseX / CELL_SIZE);
    let r = floor((mouseY - HEADER_HEIGHT) / CELL_SIZE);

    if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
        selectedRow = r;
        selectedCol = c;
    }
}


function keyPressed() {
    if (key === 'e' || key === 'E') { difficulty = "easy"; newGame(); return; }
    if (key === 'd' || key === 'D') { difficulty = "normal"; newGame(); return; }
    if (key === 'h' || key === 'H') { difficulty = "hard"; newGame(); return; }

    if (key === 'z' || key === 'Z' || key === 'u' || key === 'U') { undo(); return; }
    if (key === 'm' || key === 'M') { handleMemoToggle(); return; }
    if (key === 'g' || key === 'G') { giveHint(); return; }
    if (key === 'n' || key === 'N') { newGame(); return; }

    if (keyCode === LEFT_ARROW) moveSelection(0, -1);
    if (keyCode === RIGHT_ARROW) moveSelection(0, 1);
    if (keyCode === UP_ARROW) moveSelection(-1, 0);
    if (keyCode === DOWN_ARROW) moveSelection(1, 0);

    if (key >= '1' && key <= '9') handleNumberInput(Number(key));
    if (keyCode === DELETE || keyCode === BACKSPACE) handleErase();
}

function moveSelection(rowOffset, colOffset) {
    if (selectedRow === -1 || selectedCol === -1) {
        selectedRow = 0;
        selectedCol = 0;
        return;
    }
    selectedRow = constrain(selectedRow + rowOffset, 0, GRID_SIZE - 1);
    selectedCol = constrain(selectedCol + colOffset, 0, GRID_SIZE - 1);
}

function initializeBoard() { board = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0)); }
function initializeFixed() { fixed = board.map(row => row.map(val => val !== 0)); }
function initializeMemo() { memo = Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => [])); }
function copyBoard(source) { return source.map(row => [...row]); }

function isError(row, col) {
    let number = board[row][col];
    return number !== 0 && number !== answerBoard[row][col];
}

function isGameClear() {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (board[r][c] === 0 || isError(r, c)) return false;
        }
    }
    return true;
}

function checkGameClear() {
    if (!gameOver && clearTime === null && isGameClear()) {
        clearTime = millis();
        isNewBestTime = saveBestTime();
    }
}

function giveHint() {
    if (gameOver || clearTime !== null) return;
    let emptyCells = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (!fixed[r][c] && (board[r][c] === 0 || isError(r, c))) {
                emptyCells.push({ row: r, col: c });
            }
        }
    }
    if (emptyCells.length === 0) return;

    saveState();
    let cell = random(emptyCells);
    board[cell.row][cell.col] = answerBoard[cell.row][cell.col];
    fixed[cell.row][cell.col] = true;
    memo[cell.row][cell.col] = [];
    removeRelatedMemos(cell.row, cell.col, board[cell.row][cell.col]);
    hintCount++;
}

function removeRelatedMemos(row, col, number) {
    for (let i = 0; i < GRID_SIZE; i++) {
        removeMemoNumber(row, i, number);
        removeMemoNumber(i, col, number);
    }
    let startRow = floor(row / 3) * 3;
    let startCol = floor(col / 3) * 3;
    for (let r = startRow; r < startRow + 3; r++) {
        for (let c = startCol; c < startCol + 3; c++) {
            removeMemoNumber(r, c, number);
        }
    }
}

function removeMemoNumber(row, col, number) {
    let index = memo[row][col].indexOf(number);
    if (index !== -1) {
        memo[row][col].splice(index, 1);
    }
}

function getElapsedSeconds() {
    let endTime = clearTime === null ? millis() : clearTime;
    return floor((endTime - gameStartTime) / 1000);
}

function formatTime(seconds) {
    let minutes = floor(seconds / 60);
    let remainingSeconds = seconds % 60;
    return nf(minutes, 2) + ":" + nf(remainingSeconds, 2);
}

function getBestTimeKey() { return `sudoku-best-time-${difficulty}`; }
function getBestTime() {
    let value = localStorage.getItem(getBestTimeKey());
    return value === null ? null : Number(value);
}

function saveBestTime() {
    if (hintCount > 0) return false;
    let currentTime = getElapsedSeconds();
    let bestTime = getBestTime();
    if (bestTime === null || currentTime < bestTime) {
        localStorage.setItem(getBestTimeKey(), String(currentTime));
        return true;
    }
    return false;
}

function solve() {
    let cell = findEmptyCell();
    if (!cell) return true;
    let numbers = getRandomNumbers();
    for (let num of numbers) {
        if (isValidMove(cell.row, cell.col, num)) {
            board[cell.row][cell.col] = num;
            if (solve()) return true;
            board[cell.row][cell.col] = 0;
        }
    }
    return false;
}

function countSolutions() {
    if (solutionCount >= 2) return;
    let cell = findEmptyCell();
    if (!cell) { solutionCount++; return; }
    for (let num = 1; num <= 9; num++) {
        if (isValidMove(cell.row, cell.col, num)) {
            board[cell.row][cell.col] = num;
            countSolutions();
            board[cell.row][cell.col] = 0;
        }
    }
}

function removeOneCell() {
    let row, col;
    do {
        row = floor(random(GRID_SIZE));
        col = floor(random(GRID_SIZE));
    } while (board[row][col] === 0);

    let backup = board[row][col];
    board[row][col] = 0;
    solutionCount = 0;
    countSolutions();

    if (solutionCount !== 1) {
        board[row][col] = backup;
        return false;
    }
    return true;
}

function removeCells(targetRemoveCount) {
    let failedCount = 0;
    let removedCount = 0;
    while (removedCount < targetRemoveCount && failedCount < 100) {
        if (removeOneCell()) {
            failedCount = 0;
            removedCount++;
        } else {
            failedCount++;
        }
    }
}

function findEmptyCell() {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (board[r][c] === 0) return { row: r, col: c };
        }
    }
    return null;
}

function isValidMove(row, col, number) {
    for (let c = 0; c < GRID_SIZE; c++) {
        if (board[row][c] === number && c !== col) return false;
    }
    for (let r = 0; r < GRID_SIZE; r++) {
        if (board[r][col] === number && r !== row) return false;
    }
    let startRow = floor(row / 3) * 3;
    let startCol = floor(col / 3) * 3;
    for (let r = startRow; r < startRow + 3; r++) {
        for (let c = startCol; c < startCol + 3; c++) {
            if (board[r][c] === number && !(r === row && c === col)) return false;
        }
    }
    return true;
}

function getRandomNumbers() {
    let numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    shuffle(numbers, true);
    return numbers;
}

// 難易度を変更して新しいゲームを開始する関数
function setDifficulty(newDiff) {
    if (DIFFICULTIES[newDiff]) {
        difficulty = newDiff;
        newGame();
        updateDifficultyUI();
    }
}

// 選択中の難易度ボタンの見た目を更新する関数
function updateDifficultyUI() {
    let diffs = ["easy", "normal", "hard"];
    diffs.forEach(d => {
        let btn = document.getElementById(`btn-${d}`);
        if (btn) {
            if (d === difficulty) {
                btn.classList.add("active"); // 選択中スタイルの適用
            } else {
                btn.classList.remove("active");
            }
        }
    });
}

// setup または newGame 内で UI 初期化を呼び出すため、newGame の最後に追記
// (既存の newGame 関数の一番下に以下の一行を追加してください)
// updateDifficultyUI();