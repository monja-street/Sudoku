// photo.js : 写真から問題を取り込む

const PHOTO_CELL = 56;               // 補正後の1マスのピクセル数
const PHOTO_SIZE = PHOTO_CELL * 9;   // 補正後の盤面サイズ

let photoSrc = null;       // 縮小済みの元画像(canvas)
let photoScale = 1;        // 元画像 → 表示canvas の倍率
let photoCorners = [];     // タップされた四隅（元画像座標）
let ocrWorker = null;
let ocrBusy = false;
let ocrUncertain = [];     // 自信のないマス [{row, col}]

function byId(id) { return document.getElementById(id); }
const nextFrame = () => new Promise(res => requestAnimationFrame(() => setTimeout(res, 0)));

function initPhotoImport() {
    byId("photo-input").addEventListener("change", e => {
        const file = e.target.files[0];
        e.target.value = "";            // 同じ写真を続けて選べるようにする
        if (file) loadPhotoFile(file);
    });
    byId("photo-canvas").addEventListener("pointerdown", onPhotoTap);
    byId("photo-reset").addEventListener("click", resetPhotoCorners);
    byId("photo-cancel").addEventListener("click", closePhotoOverlay);
}

// --- 画像の読み込み ---

function loadPhotoFile(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        photoSrc = document.createElement("canvas");
        photoSrc.width = Math.round(img.width * k);
        photoSrc.height = Math.round(img.height * k);
        photoSrc.getContext("2d").drawImage(img, 0, 0, photoSrc.width, photoSrc.height);
        URL.revokeObjectURL(url);
        openPhotoOverlay();
    };
    img.onerror = () => {
        URL.revokeObjectURL(url);
        alert("画像を読み込めませんでした。");
    };
    img.src = url;
}

function openPhotoOverlay() {
    const canvas = byId("photo-canvas");
    const maxW = Math.min(window.innerWidth - 20, 500);
    const maxH = window.innerHeight * 0.65;
    photoScale = Math.min(maxW / photoSrc.width, maxH / photoSrc.height);
    canvas.width = Math.round(photoSrc.width * photoScale);
    canvas.height = Math.round(photoSrc.height * photoScale);

    photoCorners = [];
    byId("photo-overlay").style.display = "flex";
    updatePhotoGuide();
    drawPhotoCanvas();
}

function closePhotoOverlay() {
    if (ocrBusy) return;
    byId("photo-overlay").style.display = "none";
    photoCorners = [];
}

function resetPhotoCorners() {
    if (ocrBusy) return;
    photoCorners = [];
    updatePhotoGuide();
    drawPhotoCanvas();
}

function updatePhotoGuide() {
    byId("photo-guide").textContent =
        `盤面の外枠の四隅をタップしてください（${photoCorners.length}/4）`;
}

function drawPhotoCanvas() {
    const canvas = byId("photo-canvas");
    const ctx = canvas.getContext("2d");
    ctx.drawImage(photoSrc, 0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#e74c3c";
    ctx.fillStyle = "#e74c3c";

    if (photoCorners.length >= 2) {
        ctx.beginPath();
        photoCorners.forEach((p, i) => {
            const x = p.x * photoScale, y = p.y * photoScale;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        if (photoCorners.length === 4) ctx.closePath();
        ctx.stroke();
    }
    photoCorners.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x * photoScale, p.y * photoScale, 6, 0, Math.PI * 2);
        ctx.fill();
    });
}

function onPhotoTap(e) {
    if (ocrBusy || photoCorners.length >= 4) return;
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    photoCorners.push({ x: x / photoScale, y: y / photoScale });

    drawPhotoCanvas();
    updatePhotoGuide();
    if (photoCorners.length === 4) runPhotoImport();
}

// --- 四隅の並べ替え・射影変換（斜め撮りの補正） ---

function orderCorners(pts) {
    const bySum = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y));
    const byDiff = [...pts].sort((a, b) => (a.x - a.y) - (b.x - b.y));
    // 左上, 右上, 右下, 左下
    return [bySum[0], byDiff[3], bySum[3], byDiff[0]];
}

function warpToGray(q) {
    const sw = photoSrc.width, sh = photoSrc.height;
    const sd = photoSrc.getContext("2d").getImageData(0, 0, sw, sh).data;
    const sg = new Float32Array(sw * sh);
    for (let i = 0; i < sw * sh; i++) {
        sg[i] = 0.299 * sd[i * 4] + 0.587 * sd[i * 4 + 1] + 0.114 * sd[i * 4 + 2];
    }

    // 単位正方形 → 四角形 の射影変換係数（Heckbert の方法）
    const [p0, p1, p2, p3] = q;
    const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
    const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
    const den = dx1 * dy2 - dx2 * dy1;
    const g = (dx3 * dy2 - dx2 * dy3) / den;
    const h = (dx1 * dy3 - dx3 * dy1) / den;
    const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + h * p3.x, c = p0.x;
    const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + h * p3.y, f = p0.y;

    const N = PHOTO_SIZE;
    const out = new Uint8ClampedArray(N * N);
    for (let y = 0; y < N; y++) {
        const v = (y + 0.5) / N;
        for (let x = 0; x < N; x++) {
            const u = (x + 0.5) / N;
            const w = g * u + h * v + 1;
            const sx = Math.min(Math.max((a * u + b * v + c) / w, 0), sw - 1.001);
            const sy = Math.min(Math.max((d * u + e * v + f) / w, 0), sh - 1.001);
            const x0 = Math.floor(sx), y0 = Math.floor(sy);
            const fx = sx - x0, fy = sy - y0;
            const i = y0 * sw + x0;
            out[y * N + x] =
                sg[i] * (1 - fx) * (1 - fy) + sg[i + 1] * fx * (1 - fy) +
                sg[i + sw] * (1 - fx) * fy + sg[i + sw + 1] * fx * fy;
        }
    }
    return out;
}

// --- 2値化・マスの切り出し ---

function otsuThreshold(gray) {
    const hist = new Array(256).fill(0);
    for (const v of gray) hist[v]++;
    const total = gray.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];

    let sumB = 0, wB = 0, best = 0, thr = 128;
    for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (wB === 0) continue;
        const wF = total - wB;
        if (wF === 0) break;
        sumB += t * hist[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const between = wB * wF * (mB - mF) * (mB - mF);
        if (between > best) { best = between; thr = t; }
    }
    return thr;
}

// 数字があるマスだけ、OCR用の白黒画像(canvas)を返す。空白なら null
function extractCellCanvas(gray, thr, r, c) {
    const P = PHOTO_CELL;
    const m = Math.round(P * 0.14);   // 枠線を避けるための余白
    const w = P - 2 * m;
    const x0 = c * P + m, y0 = r * P + m;

    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, dark = 0;
    for (let y = 0; y < w; y++) {
        for (let x = 0; x < w; x++) {
            if (gray[(y0 + y) * PHOTO_SIZE + x0 + x] < thr) {
                dark++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (dark < w * w * 0.02 || (maxY - minY + 1) < w * 0.3) return null;

    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    const tmp = document.createElement("canvas");
    tmp.width = bw; tmp.height = bh;
    const tctx = tmp.getContext("2d");
    const img = tctx.createImageData(bw, bh);
    for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
            const v = gray[(y0 + minY + y) * PHOTO_SIZE + x0 + minX + x] < thr ? 0 : 255;
            const i = (y * bw + x) * 4;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
            img.data[i + 3] = 255;
        }
    }
    tctx.putImageData(img, 0, 0);

    // 数字を中央に配置し、周囲に白い余白をつける
    const S = 96, T = 56;
    const out = document.createElement("canvas");
    out.width = S; out.height = S;
    const octx = out.getContext("2d");
    octx.fillStyle = "#fff";
    octx.fillRect(0, 0, S, S);
    const k = T / Math.max(bw, bh);
    octx.drawImage(tmp, (S - bw * k) / 2, (S - bh * k) / 2, bw * k, bh * k);
    return out;
}

// --- 取り込みの本体 ---

async function runPhotoImport() {
    ocrBusy = true;
    const guide = byId("photo-guide");
    try {
        guide.textContent = "盤面を切り出し中…";
        await nextFrame();

        const gray = warpToGray(orderCorners(photoCorners));
        const thr = otsuThreshold(gray);

        const cells = [];
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cv = extractCellCanvas(gray, thr, r, c);
                if (cv) cells.push({ r, c, cv });
            }
        }

        guide.textContent = "文字認識の準備中…（初回は少し時間がかかります）";
        await nextFrame();
        if (!ocrWorker) {
            ocrWorker = await Tesseract.createWorker("eng");
            await ocrWorker.setParameters({
                tessedit_char_whitelist: "123456789",
                tessedit_pageseg_mode: "10"   // 1文字として認識
            });
        }

        const result = Array.from({ length: 9 }, () => Array(9).fill(0));
        const uncertain = [];
        for (let i = 0; i < cells.length; i++) {
            guide.textContent = `認識中… ${i + 1}/${cells.length}`;
            const { r, c, cv } = cells[i];
            const { data } = await ocrWorker.recognize(cv);
            const m = data.text.match(/[1-9]/);
            if (m) {
                result[r][c] = Number(m[0]);
                if (data.confidence < 60) uncertain.push({ row: r, col: c });
            } else {
                uncertain.push({ row: r, col: c });   // 暗い部分はあるが読めなかったマス
            }
        }

        ocrBusy = false;
        closePhotoOverlay();
        applyPhotoResult(result, uncertain, cells.length);
    } catch (e) {
        console.error(e);
        ocrBusy = false;
        alert("読み取りに失敗しました。通信状況を確認して、もう一度お試しください。");
        resetPhotoCorners();
    }
}

function applyPhotoResult(result, uncertain, count) {
    if (!isEditMode) toggleEditMode();   // 問題入力モードに入る（盤面は初期化される）

    board = result;
    selectedRow = -1;
    selectedCol = -1;
    ocrUncertain = uncertain;

    clearHintState();
    setHintMessage(
        `写真から${count}マスを読み取りました。\n` +
        `オレンジ枠は自信のないマスです。間違いを直してから「編集完了（解く）」を押してください。`
    );
}

// 自信のないマスをオレンジ枠で表示（sketch.js の draw() から呼ぶ）
function drawOcrUncertain() {
    if (!isEditMode || ocrUncertain.length === 0) return;
    push();
    noFill();
    stroke(230, 126, 34);
    strokeWeight(2.5);
    for (const u of ocrUncertain) {
        rect(u.col * CELL_SIZE + 2, HEADER_HEIGHT + u.row * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4);
    }
    pop();
}

function clearOcrUncertainAt(row, col) {
    ocrUncertain = ocrUncertain.filter(u => !(u.row === row && u.col === col));
}

initPhotoImport();