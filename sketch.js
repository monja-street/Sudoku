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
let accumulatedTime = 0; // 中断前までの累積経過時間（秒）
let clearTime = null;
let hintCount = 0;

const MAX_MISTAKES = 3;
let mistakes = 0;
let gameOver = false;
let isNewBestTime = false;

let solutionCount = 0;
let historyStack = [];

const DIFFICULTIES = {
    easy:    { label: "EASY", removeCount: 38 },
    normal: { label: "NORMAL", removeCount: 48 },
    hard:   { label: "HARD", removeCount: 54 }
};
let difficulty = "normal";

const MAIN_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const SAVE_KEY = "sudoku_saved_game_state";

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

    // 保存されているゲームがあれば復元、なければ新規ゲーム
    if (!loadGameState()) {
        newGame();
    }
}

function windowResized() {
    let targetWidth = min(windowWidth - 20, 500);
    if (windowWidth < 500) {
        targetWidth = windowWidth - 20;
    }
    CELL_SIZE = targetWidth / GRID_SIZE;
    resizeCanvas(GRID_SIZE * CELL_SIZE, GRID_SIZE * CELL_SIZE + HEADER_HEIGHT);
}

// --- セーブ & ロード機能 ---

function saveGameState() {
    // 編集モード中、ゲームオーバー、クリア済みは途中状態を保存しない
    if (isEditMode || gameOver || clearTime !== null) return;

    let currentElapsed = getElapsedSeconds();

    let state = {
        board: board,
        answerBoard: answerBoard,
        fixed: fixed,
        memo: memo,
        difficulty: difficulty,
        accumulatedTime: currentElapsed,
        mistakes: mistakes,
        hintCount: hintCount,
        historyStack: historyStack
    };

    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

function loadGameState() {
    let saved = localStorage.getItem(SAVE_KEY);
    if (!saved) return false;

    try {
        let state = JSON.parse(saved);

        board = state.board;
        answerBoard = state.answerBoard;
        fixed = state.fixed;
        memo = state.memo;
        difficulty = state.difficulty || "normal";
        accumulatedTime = state.accumulatedTime || 0;
        mistakes = state.mistakes || 0;
        hintCount = state.hintCount || 0;
        historyStack = state.historyStack || [];

        gameStartTime = millis();
        clearTime = null;
        gameOver = false;

        updateEditButtonUI();
        updateMemoButtonUI();
        updateDifficultyUI();
        updateNumberButtonsUI();

        return true;
    } catch (e) {
        console.error("保存データの読み込みに失敗しました", e);
        clearSavedGameState();
        return false;
    }
}

function clearSavedGameState() {
    localStorage.removeItem(SAVE_KEY);
}

function newGame() {
    clearSavedGameState();
    hideResultPanel();
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

    accumulatedTime = 0;
    gameStartTime = millis();
    clearTime = null;

    updateEditButtonUI();
    updateMemoButtonUI();
    updateDifficultyUI();
    updateNumberButtonsUI();

    saveGameState();
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

function draw() {
    drawBoardBackground();

    if (!isEditMode) {
        checkGameClear();
    }

    drawHighlight();
    drawGrid();
    drawNumbers();
    drawOcrUncertain();

    if (isEditMode) {
        // 問題入力モード用のヘッダー表示
    } else if (gameOver) {
        drawGameOverMessage();
    } 
    // クリア時は盤面を隠さず、下のパネルに表示する。

    drawStatus();
}

function drawBoardBackground() {
    noStroke();
    fill(250, 252, 255); // 背景を薄い青色に設定
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
            fill(255, 182, 139, 180);
            rect(hintHighlight.col * CELL_SIZE, HEADER_HEIGHT + hintHighlight.row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        } else if (hintHighlight.type === "hidden") {
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
            fill(120, 220, 120, 200);
            rect(hintHighlight.col * CELL_SIZE, HEADER_HEIGHT + hintHighlight.row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        } else if (hintHighlight.type === "direct") {
            fill(173, 216, 230, 180);
            rect(hintHighlight.col * CELL_SIZE, HEADER_HEIGHT + hintHighlight.row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
    }

    if (selectedRow === -1 || selectedCol === -1) return;

    // --- B. 通常の選択マスハイライト ---
    if (isEditMode || !hintHighlight) {
        fill(235, 243, 253);
        rect(0, HEADER_HEIGHT + selectedRow * CELL_SIZE, width, CELL_SIZE);
        rect(selectedCol * CELL_SIZE, HEADER_HEIGHT, CELL_SIZE, GRID_SIZE * CELL_SIZE);

        let startRow = floor(selectedRow / 3) * 3;
        let startCol = floor(selectedCol / 3) * 3;
        rect(startCol * CELL_SIZE, HEADER_HEIGHT + startRow * CELL_SIZE, CELL_SIZE * 3, CELL_SIZE * 3);

        let targetNum = board[selectedRow][selectedCol];

        if (targetNum !== 0) {
            fill(254, 240, 138, 220);
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    if (board[r][c] === targetNum) {
                        rect(c * CELL_SIZE, HEADER_HEIGHT + r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                    }
                }
            }

            // 間違っている数字が入っている場合のみ赤枠、それ以外は濃い青枠
            if (!isEditMode && isError(selectedRow, selectedCol)) {
                stroke(231, 76, 60);
            } else {
                stroke(41, 128, 185);
            }

            strokeWeight(3);
            noFill();
            rect(
                selectedCol * CELL_SIZE + 1.5,
                HEADER_HEIGHT + selectedRow * CELL_SIZE + 1.5,
                CELL_SIZE - 3,
                CELL_SIZE - 3
            );
            noStroke();
        } else {
            fill(160, 201, 255, 180);
            rect(selectedCol * CELL_SIZE, HEADER_HEIGHT + selectedRow * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
    }
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

function showResultPanel() {
    let el = document.getElementById("result-panel");
    if (!el) return;

    let noteHtml = "";
    if (hintCount > 0) {
        noteHtml = `<div class="result-note">( Hints Used - No Record )</div>`;
    } else if (isNewBestTime) {
        noteHtml = `<div class="result-row result-best">★ NEW BEST RECORD! ★</div>`;
    } else {
        let best = getBestTime();
        noteHtml = `<div class="result-row">BEST RECORD : ${best !== null ? formatTime(best) : "--:--"}</div>`;
    }

    el.innerHTML =
        `<div class="result-title">VICTORY!</div>` +
        `<div class="result-row">MODE : ${DIFFICULTIES[difficulty] ? DIFFICULTIES[difficulty].label : "CUSTOM"}</div>` +
        `<div class="result-row">CLEAR TIME : ${formatTime(getElapsedSeconds())}</div>` +
        `<div class="result-row result-mistakes">MISTAKES : ${mistakes}</div>` +
        noteHtml;
    el.style.display = "block";
}

function checkGameClear() {
    if (!gameOver && clearTime === null && isGameClear()) {
        clearTime = millis();
        isNewBestTime = saveBestTime();
        clearSavedGameState();
        selectedRow = -1;   // 選択ハイライトを消して、きれいな最終盤面にする
        selectedCol = -1;
        clearHintState();
        showResultPanel();
    }
}

function hideResultPanel() {
    let el = document.getElementById("result-panel");
    if (el) {
        el.style.display = "none";
        el.innerHTML = "";
    }
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
    saveGameState();
}

function setNumber(number) {
    if (selectedRow === -1 || selectedCol === -1) return;

    clearHintState();

    if (isEditMode) {
        board[selectedRow][selectedCol] = number;
        clearOcrUncertainAt(selectedRow, selectedCol);
        return;
    }

    if (gameOver || clearTime !== null || fixed[selectedRow][selectedCol]) return;

    saveState();

    board[selectedRow][selectedCol] = number;

    if (number !== 0) {
        memo[selectedRow][selectedCol] = [];
        removeRelatedMemos(selectedRow, selectedCol, number);

        if (isError(selectedRow, selectedCol)) {
            mistakes++;
            /*
            if (mistakes >= MAX_MISTAKES) {
                gameOver = true;
                clearSavedGameState();
            }
            */
        }
    }

    updateNumberButtonsUI();
    saveGameState();
}

function toggleMemo(number) {
    if (isEditMode || selectedRow === -1 || selectedCol === -1 || fixed[selectedRow][selectedCol]) return;

    clearHintState();

    saveState();

    let currentMemo = memo[selectedRow][selectedCol];
    let index = currentMemo.indexOf(number);
    if (index === -1) {
        currentMemo.push(number);
    } else {
        currentMemo.splice(index, 1);
    }
    saveGameState();
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
        clearHintState();
        hideResultPanel();
        ocrUncertain = [];
        isEditMode = true;
        initializeBoard();
        initializeFixed();
        initializeMemo();
        selectedRow = -1;
        selectedCol = -1;
    } else {
        finishEditMode();
    }
    updateEditButtonUI();
}

function cancelEditMode() {
    isEditMode = false;
    newGame();
}

function finishEditMode() {
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

    solutionCount = 0;
    countSolutions();

    if (solutionCount === 0) {
        alert("この問題には解が存在しません。入力を見直してください。");
        return;
    } else if (solutionCount > 1) {
        alert("この問題には複数の解（答え）が存在します。数字を追加するか問題を確認してください。");
        return;
    }

    answerBoard = copyBoard(board);
    solve();
    let tempAns = copyBoard(board);

    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (tempAns[r][c] !== 0) {
                board[r][c] = answerBoard[r][c];
            }
        }
    }

    answerBoard = tempAns;

    initializeFixed();
    initializeMemo();

    isEditMode = false;
    accumulatedTime = 0;
    gameStartTime = millis();
    clearTime = null;
    mistakes = 0;
    gameOver = false;
    hintCount = 0;
    historyStack = [];

    updateEditButtonUI();
    updateNumberButtonsUI();
    saveGameState();
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
    hintCount++;

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
                    saveGameState();
                    return;
                }
            }
        }
    }

    for (let num = 1; num <= 9; num++) {
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
                saveGameState();
                return;
            }
        }

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
                saveGameState();
                return;
            }
        }

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
                saveGameState();
                return;
            }
        }
    }

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
    saveGameState();
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
    if (key === 'e' || key === 'E') { requestDifficulty("easy"); return; }
    if (key === 'd' || key === 'D') { requestDifficulty("normal"); return; }
    if (key === 'h' || key === 'H') { requestDifficulty("hard"); return; }

    if (key === 'z' || key === 'Z' || key === 'u' || key === 'U') { undo(); return; }
    if (key === 'm' || key === 'M') { handleMemoToggle(); return; }
    if (key === 'g' || key === 'G') { giveHint(); return; }
    if (key === 'n' || key === 'N') { requestNewGame(); return; }

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
    if (clearTime !== null) {
        return floor((clearTime - gameStartTime) / 1000) + accumulatedTime;
    }
    let currentSessionSeconds = floor((millis() - gameStartTime) / 1000);
    return currentSessionSeconds + accumulatedTime;
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

function findEmptyCell() {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (board[r][c] === 0) return { row: r, col: c };
        }
    }
    return null;
}

function isValidMove(row, col, num) {
    for (let i = 0; i < GRID_SIZE; i++) {
        if (board[row][i] === num) return false;
        if (board[i][col] === num) return false;
    }
    let startRow = floor(row / 3) * 3;
    let startCol = floor(col / 3) * 3;
    for (let r = startRow; r < startRow + 3; r++) {
        for (let c = startCol; c < startCol + 3; c++) {
            if (board[r][c] === num) return false;
        }
    }
    return true;
}

function getRandomNumbers() {
    let nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    return shuffle(nums);
}

function removeCells(count) {
    let cells = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            cells.push({ row: r, col: c });
        }
    }
    cells = shuffle(cells);
    for (let i = 0; i < min(count, cells.length); i++) {
        let cell = cells[i];
        board[cell.row][cell.col] = 0;
    }
}

function setDifficulty(diffKey) {
    if (DIFFICULTIES[diffKey]) {
        difficulty = diffKey;
        newGame();
    }
}

function updateDifficultyUI() {
    ["easy", "normal", "hard"].forEach(key => {
        let btn = document.getElementById(`btn-diff-${key}`);
        if (btn) {
            if (key === difficulty) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        }
    });
}

// --- 進行中ゲームの破棄確認 ---

// 盤面に何か操作をしている（数字・メモを入れた）かどうか
function hasProgress() {
    if (isEditMode) {
        // 問題入力中は、数字を1つでも置いていれば進行中とみなす
        return board.some(row => row.some(v => v !== 0));
    }
    if (gameOver || clearTime !== null) return false;
    return historyStack.length > 0;
}

function confirmDiscard() {
    if (!hasProgress()) return true;
    let msg = isEditMode
        ? "入力中の問題は破棄されます。よろしいですか？"
        : "進行中のゲームは破棄されます。よろしいですか？";
    return confirm(msg);
}

function requestNewGame() {
    if (confirmDiscard()) newGame();
}

function requestDifficulty(diffKey) {
    if (confirmDiscard()) setDifficulty(diffKey);
}
