// photo.js : 写真から問題を取り込む（v2）

const PHOTO_CELL = 56;               // 補正後の1マスのピクセル数
const PHOTO_SIZE = PHOTO_CELL * 9;   // 補正後の盤面サイズ

let photoSrc = null;       // 縮小済みの元画像(canvas)
let photoScale = 1;        // 元画像 → 表示canvas の倍率
let photoCorners = [];     // 四隅（元画像座標）
let photoDragIdx = -1;     // ドラッグ中の角
let photoDragOff = { dx: 0, dy: 0 };
let ocrWorker = null;
let ocrBusy = false;
let ocrUncertain = [];     // 自信のないマス [{row, col}]

function byId(id) { return document.getElementById(id); }
const nextFrame = () => new Promise(res => requestAnimationFrame(() => setTimeout(res, 0)));

function initPhotoImport() {
    byId("photo-input").addEventListener("change", e => {
        const file = e.target.files[0];
        e.target.value = "";
        if (file) loadPhotoFile(file);
    });

    const canvas = byId("photo-canvas");
    canvas.addEventListener("pointerdown", onPhotoPointerDown);
    canvas.addEventListener("pointermove", onPhotoPointerMove);
    canvas.addEventListener("pointerup", onPhotoPointerUp);
    canvas.addEventListener("pointercancel", onPhotoPointerUp);

    byId("photo-rotate").addEventListener("click", rotatePhoto90);
    byId("photo-reset").addEventListener("click", resetPhotoCorners);
    byId("photo-run").addEventListener("click", runPhotoImport);
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
    const maxH = window.innerHeight * 0.62;
    photoScale = Math.min(maxW / photoSrc.width, maxH / photoSrc.height);
    canvas.width = Math.round(photoSrc.width * photoScale);
    canvas.height = Math.round(photoSrc.height * photoScale);

    photoCorners = [];
    photoDragIdx = -1;
    byId("photo-overlay").style.display = "flex";
    updatePhotoUI();
    drawPhotoCanvas();
}

function closePhotoOverlay() {
    if (ocrBusy) return;
    byId("photo-overlay").style.display = "none";
    photoCorners = [];
    photoDragIdx = -1;
}

function resetPhotoCorners() {
    if (ocrBusy) return;
    photoCorners = [];
    photoDragIdx = -1;
    updatePhotoUI();
    drawPhotoCanvas();
}

// 写真を時計回りに90°回転（雑誌を横向きにして撮った場合など）
function rotatePhoto90() {
    if (ocrBusy) return;
    const rot = document.createElement("canvas");
    rot.width = photoSrc.height;
    rot.height = photoSrc.width;
    const ctx = rot.getContext("2d");
    ctx.translate(rot.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(photoSrc, 0, 0);
    photoSrc = rot;
    openPhotoOverlay();
}

function updatePhotoUI(msg) {
    const n = photoCorners.length;
    byId("photo-guide").textContent = msg ||
        (n < 4
            ? `盤面の外枠の四隅をタップ（${n}/4）\n押したまま動かして微調整できます`
            : "角をドラッグして位置を合わせ、「認識開始」を押してください");
    byId("photo-guide").style.whiteSpace = "pre-line";
    byId("photo-run").disabled = (n < 4) || ocrBusy;
}

// --- 四隅の指定（タップ＆ドラッグ、拡大鏡つき） ---

function photoPointFromEvent(e) {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
        sx: (e.clientX - rect.left) * (canvas.width / rect.width),
        sy: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
}

function onPhotoPointerDown(e) {
    if (ocrBusy) return;
    e.preventDefault();
    const { sx, sy } = photoPointFromEvent(e);

    // 近くに既存の角があれば、それをドラッグ
    let idx = -1, bestD = 30;
    photoCorners.forEach((p, i) => {
        const d = Math.hypot(p.x * photoScale - sx, p.y * photoScale - sy);
        if (d < bestD) { bestD = d; idx = i; }
    });

    if (idx === -1) {
        if (photoCorners.length >= 4) return;
        photoCorners.push({ x: sx / photoScale, y: sy / photoScale });
        idx = photoCorners.length - 1;
        photoDragOff = { dx: 0, dy: 0 };
    } else {
        const p = photoCorners[idx];
        photoDragOff = { dx: p.x * photoScale - sx, dy: p.y * photoScale - sy };
    }

    photoDragIdx = idx;
    e.currentTarget.setPointerCapture(e.pointerId);
    updatePhotoUI();
    drawPhotoCanvas();
}

function onPhotoPointerMove(e) {
    if (photoDragIdx < 0) return;
    const canvas = e.currentTarget;
    const { sx, sy } = photoPointFromEvent(e);
    const x = Math.min(Math.max(sx + photoDragOff.dx, 0), canvas.width);
    const y = Math.min(Math.max(sy + photoDragOff.dy, 0), canvas.height);
    photoCorners[photoDragIdx] = { x: x / photoScale, y: y / photoScale };
    drawPhotoCanvas();
}

function onPhotoPointerUp() {
    photoDragIdx = -1;
    drawPhotoCanvas();
}

function drawPhotoCanvas() {
    const canvas = byId("photo-canvas");
    const ctx = canvas.getContext("2d");
    ctx.drawImage(photoSrc, 0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#e74c3c";
    ctx.fillStyle = "#e74c3c";

    if (photoCorners.length === 4) {
        const q = orderCorners(photoCorners);
        ctx.beginPath();
        q.forEach((p, i) => {
            const x = p.x * photoScale, y = p.y * photoScale;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
    }
    photoCorners.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x * photoScale, p.y * photoScale, 5, 0, Math.PI * 2);
        ctx.fill();
    });

    if (photoDragIdx >= 0) drawLoupe(ctx, photoCorners[photoDragIdx]);
}

// 指で隠れない位置に、ドラッグ中の角の拡大図を表示
function drawLoupe(ctx, p) {
    const R = 50, Z = 3;
    const cx = p.x * photoScale, cy = p.y * photoScale;
    const lx = Math.min(Math.max(cx, R + 4), ctx.canvas.width - R - 4);
    let ly = cy - R - 50;
    if (ly < R + 4) ly = cy + R + 50;
    ly = Math.min(Math.max(ly, R + 4), ctx.canvas.height - R - 4);

    const k = photoScale * Z;
    ctx.save();
    ctx.beginPath();
    ctx.arc(lx, ly, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#fff";
    ctx.fillRect(lx - R, ly - R, 2 * R, 2 * R);
    ctx.drawImage(photoSrc, p.x - R / k, p.y - R / k, 2 * R / k, 2 * R / k,
                  lx - R, ly - R, 2 * R, 2 * R);
    ctx.restore();

    ctx.strokeStyle = "#e74c3c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(lx, ly, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(lx - 10, ly); ctx.lineTo(lx + 10, ly);
    ctx.moveTo(lx, ly - 10); ctx.lineTo(lx, ly + 10);
    ctx.stroke();
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

// --- 適応的2値化（影・照明ムラに強い） ---
// 戻り値: 1=暗い(文字/線), 0=明るい
function binarize(gray) {
    const N = PHOTO_SIZE, W = N + 1;
    const integral = new Float64Array(W * W);
    for (let y = 0; y < N; y++) {
        let rowSum = 0;
        for (let x = 0; x < N; x++) {
            rowSum += gray[y * N + x];
            integral[(y + 1) * W + (x + 1)] = integral[y * W + (x + 1)] + rowSum;
        }
    }

    const half = Math.round(PHOTO_CELL * 0.6);
    const bin = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) {
        const y1 = Math.max(0, y - half), y2 = Math.min(N, y + half + 1);
        for (let x = 0; x < N; x++) {
            const x1 = Math.max(0, x - half), x2 = Math.min(N, x + half + 1);
            const sum = integral[y2 * W + x2] - integral[y1 * W + x2]
                      - integral[y2 * W + x1] + integral[y1 * W + x1];
            const mean = sum / ((x2 - x1) * (y2 - y1));
            bin[y * N + x] = gray[y * N + x] < mean * 0.82 ? 1 : 0;
        }
    }
    return bin;
}

// --- マスから数字の領域を探す（枠線の残りは無視） ---

function findDigitBox(bin, r, c) {
    const P = PHOTO_CELL;
    const m = Math.round(P * 0.06);
    const w = P - 2 * m;
    const x0 = c * P + m, y0 = r * P + m;

    const visited = new Uint8Array(w * w);
    const comps = [];

    for (let sy = 0; sy < w; sy++) {
        for (let sx = 0; sx < w; sx++) {
            if (!bin[(y0 + sy) * PHOTO_SIZE + x0 + sx] || visited[sy * w + sx]) continue;

            const stack = [sy * w + sx];
            visited[sy * w + sx] = 1;
            let area = 0, minX = sx, maxX = sx, minY = sy, maxY = sy, touches = false;

            while (stack.length) {
                const p = stack.pop();
                const y = (p / w) | 0, x = p % w;
                area++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                if (x === 0 || y === 0 || x === w - 1 || y === w - 1) touches = true;

                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = x + dx, ny = y + dy;
                        if (nx < 0 || ny < 0 || nx >= w || ny >= w) continue;
                        const ni = ny * w + nx;
                        if (visited[ni] || !bin[(y0 + ny) * PHOTO_SIZE + x0 + nx]) continue;
                        visited[ni] = 1;
                        stack.push(ni);
                    }
                }
            }
            comps.push({ area, minX, maxX, minY, maxY, touches });
        }
    }

    // 枠に触れている塊（=枠線の残り）と、ごく小さいノイズを除外
    const good = comps.filter(k => !k.touches && k.area >= 10);
    if (good.length === 0) return null;

    const maxArea = Math.max(...good.map(k => k.area));
    const keep = good.filter(k => k.area >= maxArea * 0.15);

    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
    for (const k of keep) {
        minX = Math.min(minX, k.minX); maxX = Math.max(maxX, k.maxX);
        minY = Math.min(minY, k.minY); maxY = Math.max(maxY, k.maxY);
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (bh < w * 0.3) return null;   // 小さすぎる＝数字ではない

    return { x: x0 + minX, y: y0 + minY, bw, bh };
}

// OCR用の白黒画像を作る（数字を中央に配置、周囲に白い余白）
function makeCellCanvas(bin, box) {
    const { x, y, bw, bh } = box;
    const tmp = document.createElement("canvas");
    tmp.width = bw; tmp.height = bh;
    const tctx = tmp.getContext("2d");
    const img = tctx.createImageData(bw, bh);
    for (let yy = 0; yy < bh; yy++) {
        for (let xx = 0; xx < bw; xx++) {
            const v = bin[(y + yy) * PHOTO_SIZE + x + xx] ? 0 : 255;
            const i = (yy * bw + xx) * 4;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
            img.data[i + 3] = 255;
        }
    }
    tctx.putImageData(img, 0, 0);

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

// --- OCR（自信が低いときは少し回転させて再認識） ---

function rotateCanvas(cv, deg) {
    const out = document.createElement("canvas");
    out.width = cv.width; out.height = cv.height;
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate(deg * Math.PI / 180);
    ctx.drawImage(cv, -cv.width / 2, -cv.height / 2);
    return out;
}

async function recognizeDigit(cv) {
    let best = { digit: 0, conf: -1 };
    for (const deg of [0, -6, 6]) {
        const src = deg === 0 ? cv : rotateCanvas(cv, deg);
        const { data } = await ocrWorker.recognize(src);
        const m = data.text.match(/[1-9]/);
        if (m && data.confidence > best.conf) {
            best = { digit: Number(m[0]), conf: data.confidence };
        }
        if (best.conf >= 80) break;   // 十分な自信があれば再認識しない
    }
    return best;
}

// --- 取り込みの本体 ---

async function runPhotoImport() {
    if (ocrBusy || photoCorners.length !== 4) return;
    ocrBusy = true;
    updatePhotoUI("盤面を切り出し中…");

    try {
        await nextFrame();
        const gray = warpToGray(orderCorners(photoCorners));
        const bin = binarize(gray);

        const cells = [];
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const box = findDigitBox(bin, r, c);
                if (box) cells.push({ r, c, cv: makeCellCanvas(bin, box) });
            }
        }

        updatePhotoUI("文字認識の準備中…（初回は少し時間がかかります）");
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
            updatePhotoUI(`認識中… ${i + 1}/${cells.length}`);
            const { r, c, cv } = cells[i];
            const { digit, conf } = await recognizeDigit(cv);
            if (digit) {
                result[r][c] = digit;
                if (conf < 60) uncertain.push({ row: r, col: c });
            } else {
                uncertain.push({ row: r, col: c });
            }
        }

        ocrBusy = false;
        closePhotoOverlay();
        applyPhotoResult(result, uncertain, cells.length);
    } catch (e) {
        console.error(e);
        ocrBusy = false;
        updatePhotoUI();
        alert("読み取りに失敗しました。通信状況を確認して、もう一度お試しください。");
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