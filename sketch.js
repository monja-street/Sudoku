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
let gameOver = false; // ★ 宣言を有効化
let isNewBestTime = false;

let solutionCount = 0;
let historyStack = [];

const DIFFICULTIES = {
    easy:   { label: "EASY", removeCount: 38 },
    normal: { label: "NORMAL", removeCount: 48 },
    hard:   { label: "HARD", removeCount: 54 }
};
let difficulty = "normal";

// --- リプレイ関連の変数 ---
let recordMode = true;       
let isRecording = false;      
let actionLogs = [];          

let isReplaying = false;     
let isPaused = false;        
let replayIndex = 0;          
let replayTimer = null;       
const REPLAY_SPEED = 400; 

const MAIN_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

function setup() {
    let targetWidth = min(windowWidth - 20, 500); 
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
    stopReplay();

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

    // 記録状態の自動セットと初期ログ作成
    isRecording = recordMode; // 記録コードが ON なら自動的に記録スタート
    actionLogs = []; // 古いログをリセット

    if (isRecording) {
        // ニューゲームを押さなくても、初回起動時からこの初期盤面データが記録される
        actionLogs.push({
            time: 0,
            type: "init",
            board: copyBoard(board),
            solution: copyBoard(answerBoard), // 正解データを保持！
            fixed: copyBoard(fixed)
        });
    }

    updateMemoButtonUI();
    updateDifficultyUI();
    updateRecordButtonUI();
    updateReplayUI();
}

// --- リプレイ制御関数群 ---

function toggleReplay() {
    if (!actionLogs || actionLogs.length <= 1) {
        alert("再生できる記録がありません。「記録: OFF」ボタンを押して「記録: ON」にしてからプレイを開始してください。");
        return;
    }

    if (!isReplaying) {
        startReplay();
    } else if (isPaused) {
        resumeReplay();
    } else {
        pauseReplay();
    }
}

function startReplay() {
    stopReplayTimer(); 
    isReplaying = true;
    isPaused = false;
    replayIndex = 0;

    // クリア表示を一時的に解除して再生アニメーションを見せる
    clearTime = null;

    // 盤面を初期状態にリセット
    applyStateAtStep(0);

    replayTimer = setInterval(() => {
        stepForward();
    }, REPLAY_SPEED);

    updateReplayUI();
}

function pauseReplay() {
    stopReplayTimer();
    isPaused = true;
    updateReplayUI();
}

function resumeReplay() {
    stopReplayTimer();
    isPaused = false;
    replayTimer = setInterval(() => {
        stepForward();
    }, REPLAY_SPEED);
    updateReplayUI();
}

function stopReplay() {
    stopReplayTimer();
    isReplaying = false; // ★　リプレイ状態を解除
    isPaused = false;
    // replayIndex のリセットは行わず、そのままプレイを続行できるようにする。
    updateReplayUI();
}

function stopReplayTimer() {
    if (replayTimer) {
        clearInterval(replayTimer);
        replayTimer = null;
    }
}

function stepForward() {
    if (!isReplaying) {
        if (!actionLogs || actionLogs.length <= 1) return;
        isReplaying = true;
        isPaused = true;
        replayIndex = 0;
        clearTime = null; // クリア表示を解除
        applyStateAtStep(0);
        updateReplayUI();
        return; 
    }

    // ボタン操作時もクリア画面を一時解除
    clearTime = null;

    if (replayIndex < actionLogs.length - 1) {
        replayIndex++;
        let log = actionLogs[replayIndex];
        applyLogStep(log);
    } else {
        // 最後のステップまで再生完了したら一時停止
        pauseReplay();

        // もし最後のマスまで正しく埋まっていればクリアメッセージを再表示
        if (isGameClear()) {
            clearTime = millis();
        }
    }
    updateReplayUI();
}

function stepBackward() {
    // クリア後に押された場合、リプレイモードを立ち上げて１つ前の状態に戻す
    if (!isReplaying) {
        if (!actionLogs || actionLogs.length <= 1) return;
        isReplaying = true;
        isPaused = true;
        replayIndex = actionLogs.length - 1; // 最終手からスタート
    }

    if (replayIndex <= 0) return;

    // クリア画面を解除して盤面を見せる
    clearTime = null;
    
    replayIndex--;
    applyStateAtStep(replayIndex);
    updateReplayUI();
}

function applyStateAtStep(targetIndex) {
    let initLog = actionLogs[0];
    if (initLog && initLog.type === "init") {
        board = copyBoard(initLog.board);

        if (initLog.solution) {
            answerBoard = copyBoard(initLog.solution);
        }

        fixed = board.map(row => row.map(val => val !== 0));
        initializeMemo();
    }

    for (let i = 1; i <= targetIndex; i++) {
        applyLogStep(actionLogs[i]);
    }
}

function applyLogStep(log) {
    if (!log) return;

    selectedRow = log.row !== undefined ? log.row : -1;
    selectedCol = log.col !== undefined ? log.col : -1;

    if (log.type === "setNumber") {
        board[log.row][log.col] = log.val;
        fixed[log.row][log.col] = false;

        if (log.val !== 0) {
            if (memo && memo[log.row]) memo[log.row][log.col] = [];
            removeRelatedMemos(log.row, log.col, log.val);
        }
    } else if (log.type === "toggleMemo") {
        if (memo && memo[log.row]) {
            let currentMemo = memo[log.row][log.col];
            let index = currentMemo.indexOf(log.val);
            if (index === -1) currentMemo.push(log.val);
            else currentMemo.splice(index, 1);
        }
    } else if (log.type === "hint") {
        board[log.row][log.col] = log.val;
        fixed[log.row][log.col] = false;
        if (memo && memo[log.row]) memo[log.row][log.col] = [];
        removeRelatedMemos(log.row, log.col, log.val);
    }
}

// ★ 4. HTML要素IDの不一致を修正 (`replay-status`)
function updateReplayUI() {
    let btnPlay = document.getElementById("btn-replay-play");
    let btnStatus = document.getElementById("replay-status");

    if (btnPlay) {
        if (!isReplaying) {
            btnPlay.textContent = "再生";
            btnPlay.classList.remove("active");
        } else if (isPaused) {
            btnPlay.textContent = "再開";
            btnPlay.classList.add("active");
        } else {
            btnPlay.textContent = "一時停止";
            btnPlay.classList.add("active");
        }
    }

    if (btnStatus) {
        if (actionLogs && actionLogs.length > 1) {
            btnStatus.textContent = `${replayIndex}/${actionLogs.length - 1}`;
        } else {
            btnStatus.textContent = "0/0";
        }
    }
}

function logAction(actionType, detail = {}) {
    // クリア後やゲームオーバー後、またはリプレイ中は新しい操作を記録しない
    if (!isRecording || gameOver || clearTime !== null || isReplaying) return;
    
    // もしリプレイ等で過去のステップに戻った状態から新しい操作をした場合、
    // 現在のステップより先のログを削除して新しい分岐として記録する
    if (replayIndex < actionLogs.length -1) {
        actionLogs = actionLogs.slice(0, replayIndex + 1);
    }
    
    
    let elapsedTime = millis() - gameStartTime;
    actionLogs.push({
        time: elapsedTime,
        type: actionType,
        ...detail
    });

    // 最新のステップ位置に更新
    replayIndex = actionLogs.length - 1;
    updateReplayUI();
}

function draw() {
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

function drawBoardBackground() {
    noStroke();
    fill(250, 252, 255);
    rect(0, HEADER_HEIGHT, width, height - HEADER_HEIGHT);
}

function drawGrid() {
    for (let i = 0; i <= GRID_SIZE; i++) {
        if (i % 3 === 0) {
            strokeWeight(2.5);
            stroke(44, 62, 80); 
        } else {
            strokeWeight(1);
            stroke(218, 225, 233); 
        }

        line(0, HEADER_HEIGHT + i * CELL_SIZE, width, HEADER_HEIGHT + i * CELL_SIZE);
        line(i * CELL_SIZE, HEADER_HEIGHT, i * CELL_SIZE, height);
    }
}

function drawHighlight() {
    if (selectedRow === -1 || selectedCol === -1) return;

    noStroke();
    fill(235, 243, 253);
    rect(0, HEADER_HEIGHT + selectedRow * CELL_SIZE, width, CELL_SIZE);
    rect(selectedCol * CELL_SIZE, HEADER_HEIGHT, CELL_SIZE, GRID_SIZE * CELL_SIZE);

    let startRow = floor(selectedRow / 3) * 3;
    let startCol = floor(selectedCol / 3) * 3;
    rect(startCol * CELL_SIZE, HEADER_HEIGHT + startRow * CELL_SIZE, CELL_SIZE * 3, CELL_SIZE * 3);

    fill(160, 201, 255);
    rect(selectedCol * CELL_SIZE, HEADER_HEIGHT + selectedRow * CELL_SIZE, CELL_SIZE, CELL_SIZE);
}

// ★ 3. 描画関数の変数名・座標計算を完全修正

function drawNumbers() {
    push();
    textFont(MAIN_FONT);
    textStyle(NORMAL); // ★ 最初に全体を「NORMAL(太くない方)」に強制固定
    textAlign(CENTER, CENTER);

    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            let val = board[r][c];
            if (val === 0) {
                drawMemo(r, c);
                continue; 
            }

            let x = c * CELL_SIZE + CELL_SIZE / 2;
            let y = HEADER_HEIGHT + r * CELL_SIZE + CELL_SIZE / 2;

            if (fixed[r][c]) {
                // 初期数字（黒色）
                fill(30, 39, 46);
                textSize(CELL_SIZE * 0.58);
                textStyle(NORMAL); // ★ 太字を解除
                text(val, x, y);
            } else {
                let isCorrect = (answerBoard && val === answerBoard[r][c]);

                if (isCorrect) {
                    // 正解入力（青色）
                    fill(41, 128, 185);
                    textSize(CELL_SIZE * 0.58);
                    textStyle(NORMAL); // ★ 太字を解除
                    text(val, x, y);
                } else {
                    // 誤入力（赤色）
                    fill(231, 76, 60, 40);
                    noStroke();
                    ellipse(x, y, CELL_SIZE * 0.75);

                    fill(231, 76, 60);
                    textSize(CELL_SIZE * 0.58);
                    textStyle(NORMAL); // ★ エラー時も太くないフォントに揃える
                    text(val, x, y);
                }
            }
        }
    }
    pop();
}

function drawMemo(row, col) {
    let currentMemo = memo[row][col];
    if (!currentMemo || currentMemo.length === 0) return;

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
    noStroke();
    fill(255);
    rect(0, 0, width, HEADER_HEIGHT);
    
    stroke(230);
    strokeWeight(1);
    line(0, HEADER_HEIGHT, width, HEADER_HEIGHT);

    textFont(MAIN_FONT);
    textSize(11);
    textStyle(BOLD);
    fill(108, 122, 137);

    let currentBest = getBestTime();
    let bestStr = currentBest ? formatTime(currentBest) : "--:--";

    textAlign(LEFT, CENTER);
    text(`MODE: ${DIFFICULTIES[difficulty].label}`, 10, HEADER_HEIGHT / 2);

    textAlign(RIGHT, CENTER);
    text(`ERR: ${mistakes}  |  BEST ${bestStr}  |  TIME ${formatTime(getElapsedSeconds())}`, width - 10, HEADER_HEIGHT / 2);
}

function drawGameClearMessage() {
    fill(255, 255, 255, 235);
    noStroke();
    rect(0, 0, width, height);

    textFont(MAIN_FONT);
    textAlign(CENTER, CENTER);
   
    // タイトル
    textSize(32);
    textStyle(BOLD);
    fill(39, 174, 96);
    text("VICTORY!", width / 2, height / 2 - 55);

    // クリアタイム表示
    textSize(18);
    fill(52, 73, 94);
    textStyle(NORMAL);
    text(`CLEAR TIME : ${formatTime(getElapsedSeconds())}`, width / 2, height / 2 + 10);

    // エラー回数（ERR）の追加表示
    textSize(15);
    fill(231, 76, 60); // 赤色アクセント
    textStyle(BOLD);
    text(`MISTAKES : ${mistakes}`, width / 2, height / 2 + 65);

    // ベスト記録 / ヒント使用時のメッセージ
    textSize(13);
    if (hintCount > 0) {
        fill(127, 140, 141);
        text("( Hints Used - No Record )", width / 2, height / 2 + 95);
    } else if (isNewBestTime) {
        fill(230, 126, 34);
        textStyle(BOLD);
        text("★ NEW BEST RECORD! ★", width / 2, height / 2 + 48);
    } else {
        let bestTime = getBestTime();
        fill(127, 140, 141);
        text(`BEST RECORD : ${formatTime(bestTime)}`, width / 2, height / 2 + 48);
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
}

function setNumber(number) {
    if (gameOver || clearTime !== null || selectedRow === -1 || selectedCol === -1) return;   
    if (fixed[selectedRow][selectedCol]) return;

    // ★ ユーザーが操作したらリプレイモードを解除して記録を再開可能にする
    if (isReplaying) {
        stopReplay();
    }

    saveState();

    logAction("setNumber", { row: selectedRow, col: selectedCol, val: number});

    board[selectedRow][selectedCol] = number;

    if (number !== 0) {
        memo[selectedRow][selectedCol] = [];
        removeRelatedMemos(selectedRow, selectedCol, number);

        if (isError(selectedRow, selectedCol)) {
            mistakes++;
        }
    }
}

function toggleMemo(number) {
    if (selectedRow === -1 || selectedCol === -1 || fixed[selectedRow][selectedCol]) return;

    // ユーザが操作したらリプレイモードを解除する
    if (isReplaying) {
        stopReplay();
    }

    saveState();

    logAction("toggleMemo", { row: selectedRow, col: selectedCol, val: number });

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
    if (mouseX < 0 || mouseX > width || mouseY < HEADER_HEIGHT || mouseY > height) return;

    let c = floor(mouseX / CELL_SIZE);
    let r = floor((mouseY - HEADER_HEIGHT) / CELL_SIZE);

    if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
        selectedRow = r;
        selectedCol = c;
    }
}

function keyPressed() {
    if (key === 'e' || key === 'E') { setDifficulty("easy"); return; }
    if (key === 'd' || key === 'D') { setDifficulty("normal"); return; }
    if (key === 'h' || key === 'H') { setDifficulty("hard"); return; }

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
    // リプレイ操作中（isReplaying === true）は自動でクリア判定（オーバーレイ表示）を行わない。
    if (!gameOver && clearTime === null && !isReplaying && isGameClear()) {
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
    let val = answerBoard[cell.row][cell.col];

    logAction("hint", { row: cell.row, col: cell.col, val: val });

    board[cell.row][cell.col] = val;
    fixed[cell.row][cell.col] = true;
    memo[cell.row][cell.col] = [];
    removeRelatedMemos(cell.row, cell.col, val);
    hintCount++;
}

function handleRecordToggle() {
    recordMode = !recordMode;
    isRecording = recordMode

    // 途中で ON に切り替えた場合で、まだログが無い場合は「現在の盤面」を初期ログとして保存
    if (isRecording && actionLogs.length === 0) {
        actionLogs = [{
            time: 0,
            type: "init",
            board: copyBoard(board),
            solution: copyBoard(answerBoard),
            fixed: copyBoard(fixed)
        }];
        replayIndex = 0;
    }

    updateRecordButtonUI();
    updateReplayUI();
}

function updateRecordButtonUI() {
    let btn = document.getElementById("btn-record");
    if (!btn) return;

    if (recordMode) {
        btn.textContent = "記録: ON";
        btn.classList.add("active-rec");
    } else {
        btn.textContent = "記録: OFF";
        btn.classList.remove("active-rec");
    }
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
    if (memo && memo[row] && memo[row][col]) {
        let index = memo[row][col].indexOf(number);
        if (index !== -1) {
            memo[row][col].splice(index, 1);
        }
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

function setDifficulty(newDiff) {
    if (DIFFICULTIES[newDiff]) {
        difficulty = newDiff;
        newGame();
        updateDifficultyUI();
    }
}

function updateDifficultyUI() {
    let diffs = ["easy", "normal", "hard"];
    diffs.forEach(d => {
        let btn = document.getElementById(`btn-${d}`);
        if (btn) {
            if (d === difficulty) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        }
    });
}