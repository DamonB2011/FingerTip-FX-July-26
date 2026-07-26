# FingerTip-FX-July-26

I built this to see how far I could push real-time hand tracking in a browser using nothing but a webcam and MediaPipe. It tracks your fingertips, draws a live polygon between them, and fills that shape with glitch-art effects that react to your hand gestures. No backend, no API calls after the models are downloaded once - it all just runs on your machine.

## What it actually does

Point your webcam at your hand and it tracks your 5 fingertips (thumb, index, middle, ring, pinky) in real time, connects them into a polygon, and fills that shape with one of 8 effects. Close your fist and it cycles to the next effect. Works with both hands at once, each one running its own effect independently.

There's also a second mode I called Dual Rectangle Mode: take both hands off screen for a second, then bring them back, and it switches to tracking just your thumb + index finger on each hand - 4 points forming a shape between your two hands instead of two separate hand polygons. Squeeze that shape down small then stretch it back out big and it cycles the effect. Take your hands away again to switch back to normal mode.

## The effects

- Invert Neon - full color inversion, saturation cranked up
- RGB Glitch - chromatic aberration with random scanline tearing
- Pixel Sort Melt - sorts pixels by brightness row by row, gives that databending/melting look
- Mosaic Shatter - extreme chunky pixelation
- Thermal Vision - Predator-style false-color heat map
- VHS Scanlines - old tape look, dark scan lines + slight channel shift
- Static Storm - TV static blended into your hand
- Zoom Warp - radial zoom-blur streaking out from your palm

## Built with

- @mediapipe/tasks-vision for hand landmarks + gesture recognition
- Plain JavaScript, no framework - just ES modules
- Canvas 2D for everything, including the pixel-level effects
- npx serve to run it locally

## Getting it running

Clone it, install, then pull in the local assets:

```bash
git clone https://github.com/DamonB2011/FingerTip-FX-July-26.git
cd FingerTip-FX-July-26
npm install
```

MediaPipe's bundle needs to load as a local file to dodge CORS issues, so grab it straight from node_modules:

```bash
cp node_modules/@mediapipe/tasks-vision/vision_bundle.mjs ./vision_bundle.js
cp -r node_modules/@mediapipe/tasks-vision/wasm ./wasm
```

Then grab the gesture model (about 8MB):

```bash
curl -L -o gesture_recognizer.task https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task
```

Fire it up:

```bash
npx serve .
```

Open http://localhost:3000, let it use your camera, and hold your hand up.

## Controls

| Do this | Get this |
|---|---|
| Show a hand (or two) | Each hand gets its own tracked polygon + effect |
| Make a fist | Cycles that hand to the next effect |
| Take both hands off screen, then show one again | Toggles between Single Hand mode and Dual Rectangle mode |
| In Dual mode: pinch both hands, squeeze small, expand big | Cycles the shared effect |

## What's in here

```
FingerTip-FX-July-26/
├── index.html
├── app.js
├── vision_bundle.js       # pulled from node_modules, don't need to commit this
├── wasm/                  # pulled from node_modules, don't need to commit this
├── gesture_recognizer.task
└── package.json
```

I'd .gitignore vision_bundle.js, wasm/, and gesture_recognizer.task - they're downloaded/generated, not actual source code, and the model file alone is 8MB+. Better to just document the setup steps (like above) than bloat the repo with binaries.

## Stuff that's not perfect

- Left/right hand labeling is based on the raw camera feed before it gets mirrored for display, so it can feel backwards from what you'd expect looking at the screen
- Pixel Sort Melt and Static Storm are the heaviest effects - running both at once with two hands might chug a bit depending on your machine
- Camera resolution depends on what your webcam actually supports. It asks for 1280x720 but adapts to whatever it gets back

## Credit

Runs on Google's MediaPipe Gesture Recognizer.
