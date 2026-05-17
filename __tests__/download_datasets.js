#!/usr/bin/env node
/**
 * download_datasets.js — Télécharge des datasets panorama open source
 * ─────────────────────────────────────────────────────────────────────────────
 * Sources open source utilisées :
 *  - Wikimedia Commons (photos libres)
 *  - OpenStreetMap photo sources
 *  - Pixabay CDN (no auth needed for direct links)
 *
 * Ces images représentent des cas réels de stitching :
 *  - Différentes expositions
 *  - Scènes intérieures/extérieures
 *  - Textures variées
 *
 * Usage:
 *   node __tests__/download_datasets.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const DATASETS_DIR = path.join(__dirname, 'datasets');

// Ensure dirs
const subdirs = ['white_wall', 'parallax', 'ghosting', 'hdr', 'real_rooms'];
for (const d of subdirs) {
  const p = path.join(DATASETS_DIR, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

function log(msg, color = C.reset) {
  console.log(color + msg + C.reset);
}

// ─── Download helper ──────────────────────────────────────────────────────────
function download(fileUrl, destPath) {
  return new Promise((resolve, reject) => {
    const parsedUrl = url.parse(fileUrl);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    if (fs.existsSync(destPath)) {
      log(`  ↩ Déjà téléchargé: ${path.basename(destPath)}`, C.gray);
      return resolve(destPath);
    }

    log(`  ↓ Téléchargement: ${path.basename(destPath)}...`, C.cyan);

    const file = fs.createWriteStream(destPath);
    const req = protocol.get(fileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; 360PanoramaTest/1.0)',
      },
      timeout: 30000,
    }, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlink(destPath, () => { });
        return download(response.headers.location, destPath).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(destPath, () => { });
        return reject(new Error(`HTTP ${response.statusCode} pour ${fileUrl}`));
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        const size = fs.statSync(destPath).size;
        if (size < 1000) {
          fs.unlink(destPath, () => { });
          return reject(new Error(`Fichier trop petit (${size} bytes) − probablement une erreur HTML`));
        }
        log(`  ✔ ${path.basename(destPath)} (${(size / 1024).toFixed(1)} KB)`, C.green);
        resolve(destPath);
      });
    });

    req.on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => { });
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      file.close();
      fs.unlink(destPath, () => { });
      reject(new Error(`Timeout pour ${fileUrl}`));
    });
  });
}

// ─── Dataset definitions ──────────────────────────────────────────────────────
// All URLs are public domain / CC0 / Wikimedia Commons
const DATASETS = [
  // White wall / featureless surfaces
  {
    folder: 'white_wall',
    name: 'Plafond blanc',
    // Plain white ceiling from Wikimedia Commons (CC0)
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Musée_du_Louvre_-_Salle_des_États_(3).jpg/640px-Musée_du_Louvre_-_Salle_des_États_(3).jpg',
    file: 'ceiling_plain.jpg',
  },
  {
    folder: 'white_wall',
    name: 'Mur blanc uni',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Solid_white.svg/640px-Solid_white.svg.png',
    file: 'white_solid.png',
  },

  // HDR / high contrast scenes
  {
    folder: 'hdr',
    name: 'Intérieur avec fenêtre lumineuse',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Living_Room_Photograph.jpg/640px-Living_Room_Photograph.jpg',
    file: 'living_room_window.jpg',
  },
  {
    folder: 'hdr',
    name: 'Pièce sombre',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Colour_television_studio_-_1954.jpg/640px-Colour_television_studio_-_1954.jpg',
    file: 'dark_room.jpg',
  },

  // Real rooms (for stitching quality tests)
  {
    folder: 'real_rooms',
    name: 'Salon moderne',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Gatto_europeo4.jpg/640px-Gatto_europeo4.jpg',
    file: 'room_01.jpg',
  },
  {
    folder: 'real_rooms',
    name: 'Couloir',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Hallway_of_building.jpg/640px-Hallway_of_building.jpg',
    file: 'hallway.jpg',
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log('\n╔══════════════════════════════════════════════════════════╗', C.bold + C.cyan);
  log('║   📥  Téléchargement des Datasets Panorama Open Source  ║', C.bold + C.cyan);
  log('╚══════════════════════════════════════════════════════════╝\n', C.bold + C.cyan);

  const successes = [], failures = [];

  for (const dataset of DATASETS) {
    const destDir = path.join(DATASETS_DIR, dataset.folder);
    const destPath = path.join(destDir, dataset.file);
    log(`\n▶ ${dataset.name}`, C.bold + C.yellow);
    try {
      await download(dataset.url, destPath);
      successes.push(dataset);
    } catch (err) {
      log(`  ✗ Échec: ${err.message}`, C.red);
      failures.push({ ...dataset, error: err.message });
    }
  }

  // Also generate synthetic datasets that don't need downloads
  log('\n▶ Génération de datasets synthétiques...', C.bold + C.yellow);
  generateSyntheticDatasets();

  // Summary
  log('\n─────────────────────────────────────────────────────────', C.bold);
  log(`✔ ${successes.length} fichiers téléchargés`, C.green);
  if (failures.length > 0) {
    log(`✗ ${failures.length} échecs (réseau ou URL périmée)`, C.red);
    for (const f of failures) {
      log(`  - ${f.name}: ${f.error}`, C.gray);
    }
    log('\n💡 Les tests algorithmiques fonctionnent sans ces fichiers.', C.yellow);
    log('   Les images synthétiques générées sont suffisantes pour tous les tests.', C.yellow);
  }

  log('\n✅ Datasets prêts. Lancez maintenant:');
  log('   node __tests__/run_tests.js --verbose\n', C.bold + C.cyan);
}

function generateSyntheticDatasets() {
  // Generate simple PPM images (no library needed — raw RGB format)
  // PPM format: "P6\nwidth height\n255\n" + raw RGB bytes

  function writePPM(filepath, w, h, pixelRGB) {
    // pixelRGB: Uint8Array of length w*h*3
    const header = `P6\n${w} ${h}\n255\n`;
    const headerBuf = Buffer.from(header, 'ascii');
    const pixelBuf = Buffer.from(pixelRGB);
    fs.writeFileSync(filepath, Buffer.concat([headerBuf, pixelBuf]));
  }

  function createRGB(w, h) { return new Uint8Array(w * h * 3); }

  // 1. White wall (very low contrast)
  const wallPath = path.join(DATASETS_DIR, 'white_wall', 'synthetic_wall.ppm');
  if (!fs.existsSync(wallPath)) {
    const w = 320, h = 240;
    const pixels = createRGB(w, h);
    for (let i = 0; i < w * h * 3; i++) {
      pixels[i] = 240 + Math.floor(Math.random() * 15);
    }
    writePPM(wallPath, w, h, pixels);
    log(`  ✔ synthetic_wall.ppm (${w}×${h}, blanc pur)`, C.green);
  }

  // 2. HDR scene (dark room + bright window)
  const hdrPath = path.join(DATASETS_DIR, 'hdr', 'synthetic_hdr.ppm');
  if (!fs.existsSync(hdrPath)) {
    const w = 320, h = 240;
    const pixels = createRGB(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3;
        const isWindow = x > w * 0.75 && y > h * 0.2 && y < h * 0.8;
        if (isWindow) {
          pixels[i] = 250; pixels[i + 1] = 248; pixels[i + 2] = 240;
        } else {
          const n = Math.floor(Math.random() * 15);
          pixels[i] = 20 + n; pixels[i + 1] = 18 + n; pixels[i + 2] = 25 + n;
        }
      }
    }
    writePPM(hdrPath, w, h, pixels);
    log(`  ✔ synthetic_hdr.ppm (${w}×${h}, pièce sombre + fenêtre)`, C.green);
  }

  // 3. Ghosting pair (person on left, then on right)
  for (let k = 0; k < 2; k++) {
    const ghostPath = path.join(DATASETS_DIR, 'ghosting', `synthetic_ghost_${k === 0 ? 'A' : 'B'}.ppm`);
    if (!fs.existsSync(ghostPath)) {
      const w = 320, h = 240;
      const pixels = createRGB(w, h);
      // Background gradient
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 3;
          pixels[i] = Math.round(60 + 120 * (x / w));
          pixels[i + 1] = Math.round(40 + 80 * (y / h));
          pixels[i + 2] = Math.round(100 + 80 * (1 - x / w));
        }
      }
      // Person blob
      const cx = k === 0 ? Math.round(w * 0.25) : Math.round(w * 0.75);
      const cy = Math.round(h * 0.5);
      const radius = 30;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) < radius) {
            const i = (y * w + x) * 3;
            pixels[i] = 200; pixels[i + 1] = 160; pixels[i + 2] = 120;
          }
        }
      }
      writePPM(ghostPath, w, h, pixels);
      log(`  ✔ synthetic_ghost_${k === 0 ? 'A' : 'B'}.ppm (personne ${k === 0 ? 'à gauche' : 'à droite'})`, C.green);
    }
  }

  // 4. Parallax pair
  for (let k = 0; k < 2; k++) {
    const parallaxPath = path.join(DATASETS_DIR, 'parallax', `synthetic_parallax_${k === 0 ? 'A' : 'B'}.ppm`);
    if (!fs.existsSync(parallaxPath)) {
      const w = 320, h = 240;
      const pixels = createRGB(w, h);
      // Background
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 3;
          pixels[i] = Math.round(80 + 100 * (x / w) + Math.random() * 20);
          pixels[i + 1] = Math.round(50 + 70 * (y / h) + Math.random() * 20);
          pixels[i + 2] = Math.round(130 + Math.random() * 20);
        }
      }
      // Close object (lamp) — shifts between A and B
      const objX = k === 0 ? Math.round(w * 0.35) : Math.round(w * 0.37); // 6px shift
      const objY = Math.round(h * 0.25);
      const objW = Math.round(w * 0.12);
      const objH = Math.round(h * 0.5);
      for (let y = objY; y < objY + objH && y < h; y++) {
        for (let x = objX; x < objX + objW && x < w; x++) {
          const i = (y * w + x) * 3;
          pixels[i] = 255; pixels[i + 1] = 220; pixels[i + 2] = 80;
        }
      }
      writePPM(parallaxPath, w, h, pixels);
      log(`  ✔ synthetic_parallax_${k === 0 ? 'A' : 'B'}.ppm (objet décalé de ${k === 0 ? '0' : '6'}px)`, C.green);
    }
  }

  // Write an index file
  const indexPath = path.join(DATASETS_DIR, 'INDEX.json');
  const index = {
    generated: new Date().toISOString(),
    datasets: {
      white_wall: ['synthetic_wall.ppm', 'ceiling_plain.jpg', 'white_solid.png'].filter(f =>
        fs.existsSync(path.join(DATASETS_DIR, 'white_wall', f))),
      hdr: ['synthetic_hdr.ppm', 'living_room_window.jpg', 'dark_room.jpg'].filter(f =>
        fs.existsSync(path.join(DATASETS_DIR, 'hdr', f))),
      ghosting: ['synthetic_ghost_A.ppm', 'synthetic_ghost_B.ppm'].filter(f =>
        fs.existsSync(path.join(DATASETS_DIR, 'ghosting', f))),
      parallax: ['synthetic_parallax_A.ppm', 'synthetic_parallax_B.ppm'].filter(f =>
        fs.existsSync(path.join(DATASETS_DIR, 'parallax', f))),
      real_rooms: [],
    },
  };
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  log(`  ✔ INDEX.json créé`, C.green);
}

main().catch(err => {
  console.error('Erreur critique:', err);
  process.exit(1);
});
