// sketch.js

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

// --- カスタム入力（編集）モード ---
let isEditMode = false;
let editMessage = "";

// --- ヒント解説表示用 ---
let hintHighlight = null; // { row, col, type, areaType, areaIndex, num }
let hintMessage = "";

let gameStartTime = 0;
let clearTime = null;
let hintCount = 0;

const MAX_MISTAKES = 3;
let mistakes = 0;
let gameOver = false;
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
    clearHintState();
    isEditMode = false;
    editMessage = "";

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

    isRecording = recordMode;
    actionLogs = [];

    if (isRecording) {
        actionLogs.push({
            time: 0,
            type: "init",
            board: copyBoard(board),
            solution: copyBoard(answerBoard),
            fixed: copyBoard(fixed)
        });
    }

    updateEditButtonUI();
    updateMemoButtonUI();
    updateDifficultyUI();
    updateRecordButtonUI();
    updateReplayUI();
    updateNumberButtonsUI();
}

function clearHintState() {
    hintHighlight = null;
    hintMessage = "";
    let el = document.getElementById("hint-message-box");
    if (el) {
        el.style.display = "none";
        el.textContent = "";
    }
}

function setHintMessage(msg) {
    hintMessage = msg;
    let el = document.getElementById("hint-message-box");
    if (el) {
        if (msg) {
            el.style.display = "block";
            el.textContent = msg;
        } else {
            el.style.display = "none";
            el.textContent = "";
        }
    }
}

// --- リプレイ制御関数群 ---

function toggleReplay() {
    if (isEditMode) return;
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

    clearTime = null;

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
    isReplaying = false;
    isPaused = false;
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
        clearTime = null;
        applyStateAtStep(0);
        updateReplayUI();
        return; 
    }

    clearTime = null;

    if (replayIndex < actionLogs.length - 1) {
        replayIndex++;
        let log = actionLogs[replayIndex];
        applyLogStep(log);
    } else {
        pauseReplay();

        if (isGameClear()) {
            clearTime = millis();
        }
    }
    updateReplayUI();
}

function stepBackward() {
    if (!isReplaying) {
        if (!actionLogs || actionLogs.length <= 1) return;
        isReplaying = true;
        isPaused = true;
        replayIndex = actionLogs.length - 1;
    }

    if (replayIndex <= 0) return;

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
    updateNumberButtonsUI();
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
    updateNumberButtonsUI();
}

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
    if (!isRecording || gameOver || clearTime !== null || isReplaying || isEditMode) return;
    
    if (replayIndex < actionLogs.length - 1) {
        actionLogs = actionLogs.slice(0, replayIndex + 1);
    }
    
    let elapsedTime = millis() - gameStartTime;
    actionLogs.push({
        time: elapsedTime,
        type: actionType,
        ...detail
    });

    replayIndex = actionLogs.length - 1;
    updateReplayUI();
}

function draw() {
    drawBoardBackground();

    if (!isEditMode) {
        checkGameClear();
    }

    drawHighlight();
    drawGrid();
    drawNumbers();

    if (isEditMode) {
        // 問題入力モード用のヘッダー表示
    } else if (gameOver) {
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
    noStroke();

    // --- A. ヒントのロジック・エリアハイライト表示 ---
    if (hintHighlight && !isEditMode) {
        if (hintHighlight.type === "naked") {
            // 裸の単一: マス自体をピンクで目立たせる
            fill(255, 182, 193, 180);
            rect(hintHighlight.col * CELL_SIZE, HEADER_HEIGHT + hintHighlight.row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        } else if (hintHighlight.type === "hidden") {
            // 隠れた単一: 関連エリア（行/列/ブロック）を薄い緑で、対象マスを濃い緑で
            fill(200, 247, 197, 130);
            if (hintHighlight.areaType === "row") {
                rect(0, HEADER_HEIGHT + hintHighlight.areaIndex * CELL_SIZE, width, CELL_SIZE);
            } else if (hintHighlight.areaType === "col") {
                rect(hintHighlight.areaIndex * CELL_SIZE, HEADER_HEIGHT, CELL_SIZE, GRID_SIZE * CELL_SIZE);
            } else if (hintHighlight.areaType === "block") {
                let br = floor(hintHighlight.areaIndex / 3) * 3;
                let bc = (hintHighlight.areaIndex % 3) * 3;
                rect(bc * CELL_SIZE, HEADER_HEIGHT + br * CELL_SIZE, CELL_SIZE * 3, CELL_SIZE * 3);
            }
            // 注目マス
            fill(120, 220, 120, 200);
            rect(hintHighlight.col * CELL_SIZE, HEADER_HEIGHT + hintHighlight.row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        } else if (hintHighlight.type === "direct") {
            // 直近の正解指示
            fill(173, 216, 230, 180);
            rect(hintHighlight.col * CELL_SIZE, HEADER_HEIGHT + hintHighlight.row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
    }

    if (selectedRow === -1 || selectedCol === -1) return;

    // --- B. 通常の選択マスハイライト ---
    // 編集モード時またはヒントハイライトがない場合
    if (isEditMode || !hintHighlight) {
        fill(235, 243, 253);
        rect(0, HEADER_HEIGHT + selectedRow * CELL_SIZE, width, CELL_SIZE);
        rect(selectedCol * CELL_SIZE, HEADER_HEIGHT, CELL_SIZE, GRID_SIZE * CELL_SIZE);

        let startRow = floor(selectedRow / 3) * 3;
        let startCol = floor(selectedCol / 3) * 3;
        rect(startCol * CELL_SIZE, HEADER_HEIGHT + startRow * CELL_SIZE, CELL_SIZE * 3, CELL_SIZE * 3);

        let targetNum = board[selectedRow][selectedCol];
        if (targetNum !== 0) {
            fill(254, 240, 138, 200);
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    if (board[r][c] === targetNum) {
                        rect(c * CELL_SIZE, HEADER_HEIGHT + r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                    }
                }
            }
        }
    }

    // 選択中のマス自体
    fill(160, 201, 255, 180);
    rect(selectedCol * CELL_SIZE, HEADER_HEIGHT + selectedRow * CELL_SIZE, CELL_SIZE, CELL_SIZE);
}

function drawNumbers() {
    push();
    textFont(MAIN_FONT);
    textStyle(NORMAL);
    textAlign(CENTER, CENTER);

    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            let val = board[r][c];
            if (val === 0) {
                if (!isEditMode) drawMemo(r, c);
                continue; 
            }

            let x = c * CELL_SIZE + CELL_SIZE / 2;
            let y = HEADER_HEIGHT + r * CELL_SIZE + CELL_SIZE / 2;

            if (isEditMode) {
                // 編集モード中はすべて濃い色で表示
                fill(44, 62, 80);
                textSize(CELL_SIZE * 0.58);
                textStyle(BOLD);
                text(val, x, y);
            } else if (fixed[r][c]) {
                fill(30, 39, 46);
                textSize(CELL_SIZE * 0.58);
                textStyle(NORMAL);
                text(val, x, y);
            } else {
                let isCorrect = (answerBoard && val === answerBoard[r][c]);

                if (isCorrect) {
                    fill(41, 128, 185);
                    textSize(CELL_SIZE * 0.58);
                    textStyle(NORMAL);
                    text(val, x, y);
                } else {
                    fill(231, 76, 60, 40);
                    noStroke();
                    ellipse(x, y, CELL_SIZE * 0.75);

                    fill(231, 76, 60);
                    textSize(CELL_SIZE * 0.58);
                    textStyle(NORMAL);
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

    if (isEditMode) {
        textAlign(CENTER, CENTER);
        textSize(13);
        textStyle(BOLD);
        fill(230, 126, 34);
        text("【問題入力モード】数字を配置してください", width / 2, HEADER_HEIGHT / 2);
    } else {
        textSize(11);
        textStyle(BOLD);
        fill(108, 122, 137);

        let currentBest = getBestTime();
        let bestStr = currentBest ? formatTime(currentBest) : "--:--";

        textAlign(LEFT, CENTER);
        text(`MODE: ${DIFFICULTIES[difficulty] ? DIFFICULTIES[difficulty].label : "CUSTOM"}`, 10, HEADER_HEIGHT / 2);

        textAlign(RIGHT, CENTER);
        text(`ERR: ${mistakes}  |  BEST ${bestStr}  |  TIME ${formatTime(getElapsedSeconds())}`, width - 10, HEADER_HEIGHT / 2);
    }
}

function drawGameClearMessage() {
    fill(255, 255, 255, 235);
    noStroke();
    rect(0, 0, width, height);

    textFont(MAIN_FONT);
    textAlign(CENTER, CENTER);
   
    textSize(32);
    textStyle(BOLD);
    fill(39, 174, 96);
    text("VICTORY!", width / 2, height / 2 - 55);

    textSize(18);
    fill(52, 73, 94);
    textStyle(NORMAL);
    text(`CLEAR TIME : ${formatTime(getElapsedSeconds())}`, width / 2, height / 2 + 10);

    textSize(15);
    fill(231, 76, 60);
    textStyle(BOLD);
    text(`MISTAKES : ${mistakes}`, width / 2, height / 2 + 65);

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
    if (historyStack.length === 0 || gameOver || clearTime !== null || isEditMode) return;

    let previous = historyStack.pop();
    board = previous.board;
    memo = previous.memo;
    updateNumberButtonsUI();
}

function setNumber(number) {
    if (selectedRow === -1 || selectedCol === -1) return;   

    clearHintState();

    if (isEditMode) {
        // 問題入力モード時: 自由に数字を上書き・配置
        board[selectedRow][selectedCol] = number;
        return;
    }

    if (gameOver || clearTime !== null || fixed[selectedRow][selectedCol]) return;

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

    updateNumberButtonsUI();
}

function toggleMemo(number) {
    if (isEditMode || selectedRow === -1 || selectedCol === -1 || fixed[selectedRow][selectedCol]) return;

    clearHintState();

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
    if (memoMode && !isEditMode) {
        toggleMemo(numericValue);
    } else {
        setNumber(numericValue);
    }
}

function handleErase() { setNumber(0); }

function handleMemoToggle() {
    if (isEditMode) return;
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

function updateNumberButtonsUI() {
    let counts = Array(10).fill(0);
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            let val = board[r][c];
            if (val >= 1 && val <= 9 && !isError(r, c)) {
                counts[val]++;
            }
        }
    }

    for (let i = 1; i <= 9; i++) {
        let btn = document.getElementById(`btn-num-${i}`);
        if (btn) {
            if (counts[i] >= 9 && !isEditMode) {
                btn.classList.add("completed");
            } else {
                btn.classList.remove("completed");
            }
        }
    }
}

// --- 問題入力（カスタム編集）モード関連 ---

function toggleEditMode() {
    if (!isEditMode) {
        // 編集モード開始
        stopReplay();
        clearHintState();
        isEditMode = true;
        initializeBoard();
        initializeFixed();
        initializeMemo();
        selectedRow = -1;
        selectedCol = -1;
    } else {
        // 編集完了の試み（検証）
        finishEditMode();
    }
    updateEditButtonUI();
}

function cancelEditMode() {
    isEditMode = false;
    newGame();
}

function finishEditMode() {
    // 1. 重複チェック（初期配置で数独のルール違反がないか）
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            let num = board[r][c];
            if (num !== 0) {
                board[r][c] = 0;
                if (!isValidMove(r, c, num)) {
                    board[r][c] = num;
                    alert("初期盤面に重複（同じ行・列・ブロックに同じ数字）があるため、解けません。修正してください。");
                    return;
                }
                board[r][c] = num;
            }
        }
    }

    // 2. 解の数をカウント（唯一解か確認）
    solutionCount = 0;
    countSolutions();

    if (solutionCount === 0) {
        alert("この問題には解が存在しません。入力を見直してください。");
        return;
    } else if (solutionCount > 1) {
        alert("この問題には複数の解（答え）が存在します。数字を追加するか問題を確認してください。");
        return;
    }

    // 唯一解が存在する ➔ 正式にカスタム問題としてスタート
    answerBoard = copyBoard(board);
    solve(); // answerBoardに解答を格納
    let tempAns = copyBoard(board);

    // バックアップした初期問題の復元
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (tempAns[r][c] !== 0) {
                board[r][c] = answerBoard[r][c]; 
            }
        }
    }
    
    // 正解盤面の決定
    answerBoard = tempAns;

    // 初期数字を固定
    initializeFixed();
    initializeMemo();

    isEditMode = false;
    gameStartTime = millis();
    clearTime = null;
    mistakes = 0;
    gameOver = false;
    hintCount = 0;
    historyStack = [];
    actionLogs = [];

    updateEditButtonUI();
    updateNumberButtonsUI();
}

function updateEditButtonUI() {
    let btnEdit = document.getElementById("btn-edit");
    let cancelContainer = document.getElementById("edit-cancel-container");

    if (btnEdit) {
        if (isEditMode) {
            btnEdit.textContent = "編集完了（解く）";
            btnEdit.classList.add("active-rec");
            if (cancelContainer) cancelContainer.style.display = "inline-block";
        } else {
            btnEdit.textContent = "問題入力";
            btnEdit.classList.remove("active-rec");
            if (cancelContainer) cancelContainer.style.display = "none";
        }
    }
}

// --- ロジック解説付きヒント機能 ---

function giveHint() {
    if (gameOver || clearTime !== null || isEditMode) return;

    clearHintState();

    // 1. 【裸の単一 (Naked Single)】を探す
    // マスの周囲に8種類の数字が存在し、入れる数字が1つに確定しているマス
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (board[r][c] === 0) {
                let candidates = getCandidates(r, c);
                if (candidates.length === 1) {
                    let val = candidates[0];
                    hintHighlight = { row: r, col: c, type: "naked", num: val };
                    selectedRow = r;
                    selectedCol = c;
                    setHintMessage(`【ヒント: 裸の単一】\n行・列・ブロックの数字から、このマスには「${val}」しか入りません。`);
                    return;
                }
            }
        }
    }

    // 2. 【隠れた単一 (Hidden Single)】を探す
    // 行・列・ブロックの中で、特定の数字が入れる場所が1つしかないマス
    for (let num = 1; num <= 9; num++) {
        // 行ごとのチェック
        for (let r = 0; r < 9; r++) {
            let possibleCols = [];
            for (let c = 0; c < 9; c++) {
                if (board[r][c] === 0 && isValidMove(r, c, num)) {
                    possibleCols.push(c);
                }
            }
            if (possibleCols.length === 1) {
                let c = possibleCols[0];
                hintHighlight = { row: r, col: c, type: "hidden", areaType: "row", areaIndex: r, num: num };
                selectedRow = r;
                selectedCol = c;
                setHintMessage(`【ヒント: 隠れた単一】\n第${r + 1}行の中で数字「${num}」が入れるのはこのマスだけです。`);
                return;
            }
        }

        // 列ごとのチェック
        for (let c = 0; c < 9; c++) {
            let possibleRows = [];
            for (let r = 0; r < 9; r++) {
                if (board[r][c] === 0 && isValidMove(r, c, num)) {
                    possibleRows.push(r);
                }
            }
            if (possibleRows.length === 1) {
                let r = possibleRows[0];
                hintHighlight = { row: r, col: c, type: "hidden", areaType: "col", areaIndex: c, num: num };
                selectedRow = r;
                selectedCol = c;
                setHintMessage(`【ヒント: 隠れた単一】\n第${c + 1}列の中で数字「${num}」が入れるのはこのマスだけです。`);
                return;
            }
        }

        // 3x3ブロックごとのチェック
        for (let b = 0; b < 9; b++) {
            let startRow = floor(b / 3) * 3;
            let startCol = (b % 3) * 3;
            let possibleCells = [];
            for (let r = startRow; r < startRow + 3; r++) {
                for (let c = startCol; c < startCol + 3; c++) {
                    if (board[r][c] === 0 && isValidMove(r, c, num)) {
                        possibleCells.push({ r, c });
                    }
                }
            }
            if (possibleCells.length === 1) {
                let { r, c } = possibleCells[0];
                hintHighlight = { row: r, col: c, type: "hidden", areaType: "block", areaIndex: b, num: num };
                selectedRow = r;
                selectedCol = c;
                setHintMessage(`【ヒント: 隠れた単一】\nこの3x3エリアの中で数字「${num}」が入れるのはこのマスだけです。`);
                return;
            }
        }
    }

    // 3. 上記の基本テクニックで見つからない場合（またはミスしているマスがある場合）：直接正解の1マスを教える
    let emptyCells = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (!fixed[r][c] && (board[r][c] === 0 || isError(r, c))) {
                emptyCells.push({ row: r, col: c });
            }
        }
    }
    if (emptyCells.length === 0) return;

    let cell = random(emptyCells);
    let val = answerBoard[cell.row][cell.col];

    hintHighlight = { row: cell.row, col: cell.col, type: "direct", num: val };
    selectedRow = cell.row;
    selectedCol = cell.col;
    setHintMessage(`【ヒント】\nこのマスの正解は「${val}」です。`);
}

function getCandidates(row, col) {
    let list = [];
    for (let n = 1; n <= 9; n++) {
        if (isValidMove(row, col, n)) {
            list.push(n);
        }
    }
    return list;
}

function mousePressed() {
    if (mouseX < 0 || mouseX > width || mouseY < HEADER_HEIGHT || mouseY > height) return;

    let c = floor(mouseX / CELL_SIZE);
    let r = floor((mouseY - HEADER_HEIGHT) / CELL_SIZE);

    if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
        selectedRow = r;
        selectedCol = c;
        clearHintState();
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
    if (!gameOver && clearTime === null && !isReplaying && isGameClear()) {
        clearTime = millis();
        isNewBestTime = saveBestTime();
    }
}

function handleRecordToggle() {
    if (isEditMode) return;
    recordMode = !recordMode;
    isRecording = recordMode;

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