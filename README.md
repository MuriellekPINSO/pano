# 🌐 Pano — 360° Panorama Capture App

An Expo React Native app for capturing, stitching, and viewing immersive 360° panoramas — inspired by Google Street View and Teleport.

## Features

- 📸 **Guided 360° Capture** — Row-by-row guided capture with gyroscope alignment, auto-capture, and haptic feedback
- 🧩 **Equirectangular Stitching** — Automatic panorama stitching using WebView Canvas
- 🌍 **Immersive 360° Viewer** — WebGL sphere viewer with touch gestures, gyroscope control, and pinch-to-zoom
- 🎨 **Premium Dark UI** — Sleek dark mode design with smooth animations
- 💾 **Project Management** — Save, resume, and manage multiple panorama projects

## Tech Stack

- **Framework**: Expo SDK 54 / React Native
- **Navigation**: Expo Router
- **Camera**: expo-camera
- **Sensors**: expo-sensors (DeviceMotion)
- **Animations**: react-native-reanimated
- **Haptics**: expo-haptics
- **Storage**: expo-file-system

## Getting Started

```bash
# Install dependencies
npm install

# Start the development server
npx expo start
```

## Capture Flow

1. **Horizon** — 8 photos rotating 360°
2. **Up** — 6 photos tilted upward
3. **Down** — 3 photos tilted downward
4. **Ceiling** — 1 photo pointed up

Total: **18 photos** in ~1 minute

## License

MIT
