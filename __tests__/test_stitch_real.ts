import { generateStitchHTML } from '../utils/StitchEngine';
import { CapturePosition } from '../constants/CaptureConfig';

// Mock some fake captured positions
const mockPositions: CapturePosition[] = [
  { id: 0, row: 0, col: 0, yaw: 0, pitch: 0, captured: true, uri: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', roll: 0 },
  { id: 1, row: 0, col: 1, yaw: 40, pitch: 0, captured: true, uri: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', roll: 0 },
  { id: 2, row: 0, col: 2, yaw: 80, pitch: 0, captured: true, uri: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', roll: 0 }
];

const html = generateStitchHTML(mockPositions);

// Extract the script tag content from the HTML
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  console.error('Could not find script tag in HTML!');
  process.exit(1);
}

const jsCode = scriptMatch[1];

// We need to mock the DOM context for the script
const mockDOM = `
  const document = {
    getElementById: (id) => {
      if (id === 'canvas' || id === 'tempCanvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: () => {},
            getImageData: (x, y, w, h) => ({
              data: new Uint8ClampedArray(w * h * 4)
            }),
            putImageData: () => {}
          }),
          toDataURL: () => 'data:image/jpeg;base64,mockdata'
        };
      }
      if (id === 'status') {
        return { textContent: '' };
      }
      return null;
    }
  };

  const window = {
    ReactNativeWebView: {
      postMessage: (msg) => {
        console.log('WebView postMessage received:', msg);
      }
    }
  };

  // Mock Image constructor
  class Image {
    constructor() {
      setTimeout(() => {
        if (this.onload) this.onload();
      }, 10);
    }
  }

  // Mock console
  const console = global.console;

  // Mock setTimeout
  const setTimeout = global.setTimeout;
`;

// Combine mock DOM and extracted JS code
const runCode = mockDOM + "\n" + jsCode;

console.log('Running extracted stitch script in VM...');
const vm = require('vm');
try {
  const script = new vm.Script(runCode);
  const context = vm.createContext({
    console: console,
    Float32Array: Float32Array,
    Float64Array: Float64Array,
    Uint8ClampedArray: Uint8ClampedArray,
    Math: Math,
    Promise: Promise,
    JSON: JSON
  });
  script.runInContext(context);
} catch (e) {
  console.error('Crash during script execution:', e);
}
