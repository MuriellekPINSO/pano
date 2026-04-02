# Pano — Workspace Instructions

Expo React Native app for guided 360° panorama capture, equirectangular stitching, and WebGL viewing. See [README.md](../README.md) for a feature overview.

## Build & Run

```bash
npm install
npx expo start           # interactive (choose platform)
npx expo start --android
npx expo start --ios
npx expo start --web
```

> No test runner is configured. `components/__tests__/` exists but Jest is not set up — do not try to run tests without first adding a `jest.config.js`.

## Architecture

File-based routing via **Expo Router v6**:

```
app/_layout.tsx           → Root: onboarding gate, PanoramaProvider, ThemeProvider, Stack
app/(tabs)/               → Tab bar: Home / Gallery / Settings
app/capture.tsx           → Full-screen modal: camera + gyro-guided capture
app/viewer.tsx            → Full-screen modal: photo grid / stitching / 360° viewer
context/PanoramaContext.tsx → Single source of truth (useReducer + FileSystem persistence)
constants/CaptureConfig.ts  → All grid geometry constants + CapturePosition / PanoramaProject types
utils/StitchEngine.ts       → Generates self-contained stitching HTML (runs inside a hidden WebView)
components/StitchProcessor.tsx → Hidden 1×1 WebView that executes the stitch and postMessages result
components/Sphere360Viewer.tsx → WebGL 360° viewer (gyro + touch + pinch-to-zoom, also a WebView)
```

## Critical Conventions

### `expo-file-system/legacy` — the #1 footgun
Always import from the **legacy** sub-path, not the standard one:
```ts
// ✅
import * as FileSystem from 'expo-file-system/legacy';
// ❌ — runtime error
import * as FileSystem from 'expo-file-system';
```
Affects: `app/_layout.tsx`, `context/PanoramaContext.tsx`, `utils/StitchEngine.ts`, and any new file touching the filesystem.

### Path alias
Use `@/` for all imports — never relative `../../` paths.
```ts
import { usePanorama } from '@/context/PanoramaContext';
import Colors from '@/constants/Colors';
```

### UI language is French
All user-facing strings — `Alert.alert`, `ROW_LABELS`, status texts, loading indicators — must be in **French**. Examples: `'Assemblage...'`, `'Chargement...'`, `'Panorama terminé !'`.

### Manual persistence — `saveProjects()` is never automatic
After any state mutation (capture, delete, stitch), the calling screen **must** explicitly call `saveProjects()` from the context, or changes will be lost on restart.

### Settings screen is a stub
`app/(tabs)/settings.tsx` toggles (`autoCapture`, `hapticFeedback`, etc.) are local `useState` only — they are **not** read by capture logic. Do not assume they affect behavior.

## State Management

`useReducer` in `context/PanoramaContext.tsx`. Use the `usePanorama()` hook everywhere.

Key state: `{ projects, currentProject, isCapturing, currentPositionIndex }`.

`currentProject` can be `null` — always guard before accessing. Actions: `CREATE_PROJECT`, `CAPTURE_PHOTO`, `DELETE_PROJECT`, `SET_PANORAMA_URI`, `SET_THUMBNAIL`, etc.

## Styling

- `StyleSheet.create` everywhere — no Tailwind, no styled-components.
- `expo-linear-gradient` for all backgrounds and cards.
- Colors defined in `constants/Colors.ts` but many components also hardcode hex values (`'#6C63FF'`, `'#0F0F1A'`, `'#1A1A2E'`) — match the surrounding component style when adding new UI.
- **Dark-first**: default fallback is `'dark'`, not `'light'`.
- Primary brand color: `#6C63FF`.

## Camera & Sensors

- Permission via `useCameraPermissions()`.
- `DeviceMotion` is skipped on web — guard with `if (Platform.OS === 'web') return`.
- `initialYaw.current` offsets all subsequent yaw readings so starting orientation = 0°.
- Low-pass filter constant: `SMOOTHING = 0.15`.

## Inline HTML/JS Template Literals

`utils/StitchEngine.ts` and `components/Sphere360Viewer.tsx` contain multi-hundred-line JavaScript programs as TypeScript template strings. When editing:
- Preserve the outer backtick delimiters.
- Escape `${…}` that are **JavaScript** interpolations within the HTML string as `\${…}`; leave **TypeScript** ones unescaped.

## Other Pitfalls

- **`viewer.tsx` auto-stitches** on mount when `project.isComplete && !project.panoramaUri`. Changes to that `useEffect`'s dependencies can trigger unintended stitching.
- **Row order** is `[0,1,2,3]` → Horizon → Haut → Bas → Plafond. The UX flow depends on this order.
- **Thumbnail fallback**: `panoramaUri` → `thumbnailUri` → first captured position URI. Preserve this in new gallery features.
- **`react-native-reanimated` v4** — `react-native-worklets` is a required peer dep; keep them in sync.
