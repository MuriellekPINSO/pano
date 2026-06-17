const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 1. Read Geometry.ts to get PROJECTION_JS content
const geometryContent = fs.readFileSync(path.join(__dirname, '../utils/Geometry.ts'), 'utf8');
const projectionJsMatch = geometryContent.match(/export const PROJECTION_JS = `([\s\S]*?)`;/);
if (!projectionJsMatch) {
  console.error('Could not find PROJECTION_JS in Geometry.ts!');
  process.exit(1);
}
const PROJECTION_JS = projectionJsMatch[1];

// 2. Read StitchEngine.ts
let stitchEngineContent = fs.readFileSync(path.join(__dirname, '../utils/StitchEngine.ts'), 'utf8');

// Extract generateStitchHTML function body
const startFuncIndex = stitchEngineContent.indexOf('export function generateStitchHTML');
if (startFuncIndex === -1) {
  console.error('Could not find generateStitchHTML in StitchEngine.ts!');
  process.exit(1);
}

// Find matching closing brace for the function
let braceCount = 0;
let funcBody = '';
let foundStart = false;

for (let i = startFuncIndex; i < stitchEngineContent.length; i++) {
  const char = stitchEngineContent[i];
  if (char === '{') {
    braceCount++;
    foundStart = true;
  } else if (char === '}') {
    braceCount--;
  }
  
  if (foundStart) {
    funcBody += char;
    if (braceCount === 0) {
      break;
    }
  }
}

// Replace TS imports and template interpolation in the function body
let jsFunctionStr = `
function generateStitchHTML(positions) {
  const CAPTURE_CONFIG = {
    CAMERA_HFOV: 65,
    CAMERA_VFOV: 50
  };
  const EQUIRECT_WIDTH = 2048;
  const EQUIRECT_HEIGHT = 1024;
  const PROJECTION_JS = \`${PROJECTION_JS}\`;
  
  ` + funcBody.substring(1, funcBody.length - 1) + `
}
`;

// Clean up TypeScript/syntax markers inside the function string
jsFunctionStr = jsFunctionStr.replace(/pos\.uri!/g, 'pos.uri');
jsFunctionStr = jsFunctionStr.replace(/\$\{EQUIRECT_WIDTH\}/g, '2048');
jsFunctionStr = jsFunctionStr.replace(/\$\{EQUIRECT_HEIGHT\}/g, '1024');
jsFunctionStr = jsFunctionStr.replace(/\$\{CAPTURE_CONFIG\.CAMERA_HFOV\}/g, '65');
jsFunctionStr = jsFunctionStr.replace(/\$\{CAPTURE_CONFIG\.CAMERA_VFOV\}/g, '50');
jsFunctionStr = jsFunctionStr.replace(/\$\{JSON\.stringify\(imageData\)\}/g, 'JSON.stringify(imageData)');
jsFunctionStr = jsFunctionStr.replace(/\$\{PROJECTION_JS\}/g, 'worldToCameraFunctionPlaceholder');

// Replace the placeholder with actual code concatenation
jsFunctionStr = jsFunctionStr.replace('worldToCameraFunctionPlaceholder', '\` + PROJECTION_JS + \`');

// Define mock data
const mockPositions = [
  { id: 0, row: 0, col: 0, yaw: 0, pitch: 0, captured: true, uri: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', roll: 0 },
  { id: 1, row: 0, col: 1, yaw: 40, pitch: 0, captured: true, uri: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', roll: 0 },
  { id: 2, row: 0, col: 2, yaw: 80, pitch: 0, captured: true, uri: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', roll: 0 }
];

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

  class Image {
    constructor() {
      setTimeout(() => {
        if (this.onload) this.onload();
      }, 10);
    }
  }

  const console = global.console;
  const setTimeout = global.setTimeout;
`;

// Compile and run
const fullCode = jsFunctionStr + `
const html = generateStitchHTML(${JSON.stringify(mockPositions)});
const scriptMatch = html.match(/<script>([\\s\\S]*?)<\\/script>/);
const jsCode = scriptMatch[1];
const runCode = \`${mockDOM}\` + "\\n" + jsCode;
eval(runCode);
`;

console.log('Executing test...');
try {
  vm.runInNewContext(fullCode, {
    console,
    Float32Array,
    Float64Array,
    Uint8ClampedArray,
    Math,
    Promise,
    JSON,
    setTimeout
  });
} catch (e) {
  console.error('Crash detected in StitchEngine WebView JS:', e);
  process.exit(1);
}
console.log('Test execution finished.');
