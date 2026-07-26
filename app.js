import { GestureRecognizer, FilesetResolver } from "./vision_bundle.js";

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const container = document.getElementById("container");

const bufferCanvas = document.createElement("canvas");
const bufferCtx = bufferCanvas.getContext("2d", { willReadFrequently: true });

let gestureRecognizer;
let lastVideoTime = -1;

// ---------------------------------------------------------------------
// EFFECT IMPLEMENTATIONS (unchanged from before)
// ---------------------------------------------------------------------

function processRGBGlitch(imageData, w, h, t) {
  const orig = imageData.data.slice();
  const data = imageData.data;
  const seed = Math.floor(t / 120);
  const shift = Math.max(1, Math.floor(w * 0.06));

  for (let row = 0; row < h; row++) {
    const n = Math.abs(Math.sin(row * 12.9898 + seed * 78.233)) % 1;
    const tear = n < 0.18 ? Math.floor((n * 2 - 1) * w * 0.25) : 0;

    for (let col = 0; col < w; col++) {
      const dst = (row * w + col) * 4;
      const rCol = ((col - shift + tear) % w + w) % w;
      const bCol = ((col + shift + tear) % w + w) % w;
      const rSrc = (row * w + rCol) * 4;
      const bSrc = (row * w + bCol) * 4;

      data[dst]     = orig[rSrc];
      data[dst + 1] = orig[(row * w + col) * 4 + 1];
      data[dst + 2] = orig[bSrc + 2];
      data[dst + 3] = 255;
    }
  }
}

function processPixelSort(imageData, w, h) {
  const orig = imageData.data.slice();
  const data = imageData.data;

  for (let row = 0; row < h; row++) {
    const indices = new Array(w);
    for (let col = 0; col < w; col++) indices[col] = col;

    const ascending = row % 2 === 0;
    indices.sort((a, b) => {
      const ia = (row * w + a) * 4;
      const ib = (row * w + b) * 4;
      const brightA = orig[ia] + orig[ia + 1] + orig[ia + 2];
      const brightB = orig[ib] + orig[ib + 1] + orig[ib + 2];
      return ascending ? brightA - brightB : brightB - brightA;
    });

    for (let col = 0; col < w; col++) {
      const srcCol = indices[col];
      const srcIdx = (row * w + srcCol) * 4;
      const dstIdx = (row * w + col) * 4;
      data[dstIdx]     = orig[srcIdx];
      data[dstIdx + 1] = orig[srcIdx + 1];
      data[dstIdx + 2] = orig[srcIdx + 2];
      data[dstIdx + 3] = 255;
    }
  }
}

const THERMAL_LUT = (() => {
  const lut = [];
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let r, g, b;
    if (v < 0.25) {
      const k = v / 0.25;
      r = 0; g = 0; b = Math.round(255 * k);
    } else if (v < 0.5) {
      const k = (v - 0.25) / 0.25;
      r = 0; g = Math.round(255 * k); b = Math.round(255 * (1 - k));
    } else if (v < 0.75) {
      const k = (v - 0.5) / 0.25;
      r = Math.round(255 * k); g = 255; b = 0;
    } else {
      const k = (v - 0.75) / 0.25;
      r = 255; g = Math.round(255 * (1 - k)); b = 0;
    }
    lut.push([r, g, b]);
  }
  return lut;
})();

function processThermal(imageData) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    const [r, g, b] = THERMAL_LUT[lum];
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
}

function processVHS(imageData, w, h) {
  const orig = imageData.data.slice();
  const data = imageData.data;
  const shift = 2;

  for (let row = 0; row < h; row++) {
    const darken = row % 3 === 0 ? 0.55 : 1;
    for (let col = 0; col < w; col++) {
      const dst = (row * w + col) * 4;
      const rCol = ((col - shift) % w + w) % w;
      const bCol = ((col + shift) % w + w) % w;
      const rSrc = (row * w + rCol) * 4;
      const bSrc = (row * w + bCol) * 4;

      data[dst]     = orig[rSrc] * darken;
      data[dst + 1] = orig[(row * w + col) * 4 + 1] * darken;
      data[dst + 2] = orig[bSrc + 2] * darken;
      data[dst + 3] = 255;
    }
  }
}

function processStatic(imageData) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (Math.random() < 0.35) {
      const v = Math.random() * 255;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
}

const FILTER_PRESETS = [
  { name: "Invert Neon",     type: "css",   css: "invert(1) saturate(2.2) contrast(1.3)" },
  { name: "RGB Glitch",      type: "pixel", scale: 0.5,  process: processRGBGlitch },
  { name: "Pixel Sort Melt", type: "pixel", scale: 0.35, process: processPixelSort },
  { name: "Mosaic Shatter",  type: "pixel", scale: 0.09, process: null },
  { name: "Thermal Vision",  type: "pixel", scale: 0.5,  process: processThermal },
  { name: "VHS Scanlines",   type: "pixel", scale: 0.6,  process: processVHS },
  { name: "Static Storm",    type: "pixel", scale: 0.5,  process: processStatic },
  { name: "Zoom Warp",       type: "composite" }
];

// ---------------------------------------------------------------------
// MODE STATE
// ---------------------------------------------------------------------

// "single" = original per-hand 5-fingertip polygon, fist cycles that hand's effect.
// "dual"   = one shared quad made from thumb+index of both hands, squeeze cycles the effect.
let globalMode = "single";

const NO_HANDS_DEBOUNCE_MS = 400;
let noHandsSince = null;
let modeToggleArmed = false;

const handStates = {
  Left:  { modeIndex: 0, wasFist: false },
  Right: { modeIndex: 0, wasFist: false }
};
const FIST_CONFIDENCE_THRESHOLD = 0.5;

const dualState = { modeIndex: 0, wasSmall: false };
const DUAL_SMALL_AREA_FRACTION = 0.015; // squeeze below this % of frame area
const DUAL_LARGE_AREA_FRACTION = 0.06;  // expand above this % of frame area to trigger cycle

// ---------------------------------------------------------------------
// SETUP
// ---------------------------------------------------------------------

async function init() {
  const vision = await FilesetResolver.forVisionTasks("./wasm");

  gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "./gesture_recognizer.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numHands: 2
  });

  await startCamera();
  requestAnimationFrame(renderLoop);
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 } }
  });
  video.srcObject = stream;

  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      video.play();

      // Size everything to whatever resolution the camera actually gave us,
      // rather than assuming it matched the ideal request exactly.
      const w = video.videoWidth;
      const h = video.videoHeight;

      canvas.width = w;
      canvas.height = h;

      container.style.width = `${w}px`;
      container.style.height = `${h}px`;
      video.style.width = `${w}px`;
      video.style.height = `${h}px`;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      resolve();
    };
  });
}

function renderLoop() {
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const results = gestureRecognizer.recognizeForVideo(video, performance.now());
    draw(results);
  }
  requestAnimationFrame(renderLoop);
}

// ---------------------------------------------------------------------
// GEOMETRY HELPERS
// ---------------------------------------------------------------------

function getBoundingBox(pixelPoints, canvasW, canvasH, padding = 15) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  pixelPoints.forEach((p) => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  });
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(canvasW, maxX + padding);
  maxY = Math.min(canvasH, maxY + padding);
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

// Orders points around their centroid so they form a non-self-crossing
// polygon regardless of which hand/finger contributed which point.
function sortPointsAngularly(points) {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  return points.slice().sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  );
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(area / 2);
}

// ---------------------------------------------------------------------
// SHARED RENDER: clip to a polygon, run the selected effect inside it,
// then draw the outline + fingertip dots. Used by both single and dual mode.
// ---------------------------------------------------------------------

function drawEffectInClip(pixelPoints, preset) {
  const bbox = getBoundingBox(pixelPoints, canvas.width, canvas.height);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y);
  for (let p = 1; p < pixelPoints.length; p++) {
    ctx.lineTo(pixelPoints[p].x, pixelPoints[p].y);
  }
  ctx.closePath();
  ctx.clip();

  if (preset.type === "css") {
    ctx.filter = preset.css;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.filter = "none";
  } else if (preset.type === "pixel") {
    const procW = Math.max(8, Math.floor(bbox.w * preset.scale));
    const procH = Math.max(8, Math.floor(bbox.h * preset.scale));

    bufferCanvas.width = procW;
    bufferCanvas.height = procH;
    bufferCtx.imageSmoothingEnabled = true;
    bufferCtx.drawImage(video, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, procW, procH);

    if (preset.process) {
      const imgData = bufferCtx.getImageData(0, 0, procW, procH);
      preset.process(imgData, procW, procH, performance.now());
      bufferCtx.putImageData(imgData, 0, 0);
    }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bufferCanvas, 0, 0, procW, procH, bbox.x, bbox.y, bbox.w, bbox.h);
    ctx.imageSmoothingEnabled = true;
  } else if (preset.type === "composite") {
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;
    const layers = 6;

    for (let l = 0; l < layers; l++) {
      const zoomFactor = 1 + l * 0.15;
      const srcW = canvas.width / zoomFactor;
      const srcH = canvas.height / zoomFactor;
      const srcX = Math.min(Math.max(cx - srcW / 2, 0), canvas.width - srcW);
      const srcY = Math.min(Math.max(cy - srcH / 2, 0), canvas.height - srcH);

      ctx.globalAlpha = Math.max(0.05, 0.6 - l * 0.08);
      ctx.drawImage(video, srcX, srcY, srcW, srcH, bbox.x, bbox.y, bbox.w, bbox.h);
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y);
  for (let p = 1; p < pixelPoints.length; p++) {
    ctx.lineTo(pixelPoints[p].x, pixelPoints[p].y);
  }
  ctx.closePath();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  pixelPoints.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
    ctx.fill();
  });
}

function drawMirroredLabel(text, canvasX, canvasY, align = "center") {
  ctx.save();
  ctx.scale(-1, 1);
  ctx.font = "bold 16px sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = align;
  ctx.fillText(text, -canvasX, canvasY);
  ctx.restore();
}

// ---------------------------------------------------------------------
// MAIN DRAW
// ---------------------------------------------------------------------

function draw(results) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const handLandmarksList = results.landmarks || [];
  const handednessList = results.handedness || [];
  const gesturesList = results.gestures || [];
  const handCount = handLandmarksList.length;
  const now = performance.now();

  // --- Hands-gone-then-back toggle between single/dual mode ---
  if (handCount === 0) {
    if (noHandsSince === null) noHandsSince = now;
    if (!modeToggleArmed && now - noHandsSince > NO_HANDS_DEBOUNCE_MS) {
      modeToggleArmed = true;
    }
  } else {
    if (modeToggleArmed) {
      globalMode = globalMode === "single" ? "dual" : "single";
      modeToggleArmed = false;
      dualState.wasSmall = false; // reset so switching in doesn't instantly trigger a cycle
    }
    noHandsSince = null;
  }

  if (globalMode === "single") {
    for (let i = 0; i < handCount; i++) {
      const landmarks = handLandmarksList.at(i);
      const handedLabel = handednessList.at(i)?.at(0)?.categoryName || "Right";
      const topGesture = gesturesList.at(i)?.at(0);
      const state = handStates[handedLabel] || handStates.Right;

      const isFist =
        topGesture?.categoryName === "Closed_Fist" &&
        topGesture?.score > FIST_CONFIDENCE_THRESHOLD;

      if (isFist && !state.wasFist) {
        state.modeIndex = (state.modeIndex + 1) % FILTER_PRESETS.length;
      }
      state.wasFist = isFist;

      const tipIndices = [4, 8, 12, 16, 20];
      const pixelPoints = tipIndices.map((idx) => {
        const pt = landmarks.at(idx);
        return { x: pt.x * canvas.width, y: pt.y * canvas.height };
      });

      const preset = FILTER_PRESETS.at(state.modeIndex);
      drawEffectInClip(pixelPoints, preset);

      const centroidX = pixelPoints.reduce((s, p) => s + p.x, 0) / pixelPoints.length;
      const centroidY = pixelPoints.reduce((s, p) => s + p.y, 0) / pixelPoints.length;
      drawMirroredLabel(preset.name, centroidX, centroidY - 20);
    }
  } else {
    // Dual-rectangle mode: needs both hands visible.
    if (handCount === 2) {
      const rawPoints = [];
      handLandmarksList.forEach((landmarks) => {
        const thumb = landmarks.at(4);
        const index = landmarks.at(8);
        rawPoints.push({ x: thumb.x * canvas.width, y: thumb.y * canvas.height });
        rawPoints.push({ x: index.x * canvas.width, y: index.y * canvas.height });
      });

      const orderedPoints = sortPointsAngularly(rawPoints);
      const area = polygonArea(orderedPoints);
      const canvasArea = canvas.width * canvas.height;

      const isSmall = area < canvasArea * DUAL_SMALL_AREA_FRACTION;
      const isLarge = area > canvasArea * DUAL_LARGE_AREA_FRACTION;

      if (isSmall) dualState.wasSmall = true;
      if (dualState.wasSmall && isLarge) {
        dualState.modeIndex = (dualState.modeIndex + 1) % FILTER_PRESETS.length;
        dualState.wasSmall = false;
      }

      const preset = FILTER_PRESETS.at(dualState.modeIndex);
      drawEffectInClip(orderedPoints, preset);

      const centroidX = orderedPoints.reduce((s, p) => s + p.x, 0) / orderedPoints.length;
      const centroidY = orderedPoints.reduce((s, p) => s + p.y, 0) / orderedPoints.length;
      drawMirroredLabel(preset.name, centroidX, centroidY - 20);
    } else {
      drawMirroredLabel("Show both hands for Dual Rectangle Mode", canvas.width / 2, 40);
    }
  }

  // --- HUD: current mode, always visible top area ---
  const hudText = globalMode === "single" ? "MODE: Single Hand" : "MODE: Dual Rectangle";
  drawMirroredLabel(hudText, canvas.width - 20, 24, "right");
}

init();