/**
 * ============================================================================
 *  BACKEND STITCHER — Intégration avec l'API FastAPI
 * ============================================================================
 * 
 * Remplace le stitching client-side (WebView) par un appel REST au backend Python.
 * Le backend utilise OpenCV pour un stitching de meilleure qualité.
 * 
 * Avantages :
 *   - Meilleur qualité (cv2.Stitcher + SIFT)
 *   - Plus rapide (C++ sous le capot)
 *   - Offdecharge la RAM du téléphone
 *   - Meilleur support panorama 360° complet
 * 
 * Configuration :
 *   BACKEND_URL : URL de l'API FastAPI (ex: https://pano-api.onrender.com)
 * ============================================================================
 */

import { File as FsFile } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { CapturePosition } from '@/constants/CaptureConfig';

// ✅ À CONFIGURER : Votre URL backend
// En développement : http://192.168.1.X:8000 (IP locale)
// En production : https://pano-api-xxxxx.onrender.com
export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://192.168.1.100:8000';

// Timeout pour les uploads (ms) — 5 min par défaut
const UPLOAD_TIMEOUT = 5 * 60 * 1000;

/**
 * Vérifie la disponibilité du backend
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    return response.ok;
  } catch (error) {
    console.warn('Backend health check failed:', error);
    return false;
  }
}

/**
 * Met en forme le champ `detail` d'une erreur FastAPI.
 *
 * FastAPI renvoie deux formes différentes :
 *   - HTTPException(422, "message")  -> detail = "message" (chaîne)
 *   - erreur de validation de requête -> detail = [{ loc, msg, ... }] (tableau)
 *
 * Interpoler le tableau directement produisait « [object Object] », ce qui
 * masquait le vrai message.
 */
function formatBackendDetail(detail: unknown): string | undefined {
  if (!detail) return undefined;
  if (typeof detail === 'string') return detail;

  if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      if (typeof item === 'string') return item;
      const loc = Array.isArray(item?.loc) ? item.loc.join('.') : undefined;
      const msg = item?.msg ?? JSON.stringify(item);
      return loc ? `${loc} : ${msg}` : String(msg);
    });
    return parts.join(' | ');
  }

  return JSON.stringify(detail);
}

/**
 * Upload les photos capturées au backend et lance le stitching
 *
 * @param positions - Positions capturées (avec URIs)
 * @param projectId - ID du projet (pour le nommage)
 * @param onProgress - Callback pour les mises à jour de progression
 * @returns URL du panorama généré (ou undefined si erreur)
 */
export async function stitchOnBackend(
  positions: CapturePosition[],
  projectId: string,
  onProgress?: (message: string) => void,
): Promise<string | undefined> {
  try {
    // Étape 1 : Préparer les photos capturées
    onProgress?.('Préparation des images...');
    
    const capturedPositions = positions.filter(p => p.captured && p.uri);
    if (capturedPositions.length < 2) {
      throw new Error('Au moins 2 photos sont nécessaires pour l\'assemblage.');
    }

    // Étape 2 : Créer FormData avec les images
    onProgress?.('Upload des images...');
    const formData = new FormData();

    // Forme attendue par le multipart d'Expo (SDK 57) : une partie doit être
    // une chaîne, un Blob, ou un objet exposant bytes(). La forme React Native
    // { uri, name, type } — nécessaire jusqu'au SDK 54 — est désormais refusée
    // avec « Unsupported FormDataPart implementation »
    // (cf. expo/src/winter/fetch/convertFormData.ts).
    //
    // Le patch FormData d'Expo transmet tel quel tout objet non-Blob, et le
    // convertisseur lit ensuite `name` pour le filename, `type` pour le
    // content-type, puis appelle bytes(). On fournit donc les trois
    // explicitement plutôt que de déléguer à FsFile.name / FsFile.type :
    //   - `name` porte la position de grille, que le backend relit pour
    //     orienter la photo sur la sphère ;
    //   - `type` est forcé car le backend ignore SILENCIEUSEMENT toute partie
    //     dont le content-type n'est pas image/* (cf. main.py).
    let attached = 0;
    const skipped: string[] = [];

    for (const pos of capturedPositions) {
      if (!pos.uri) continue;

      try {
        const info = await FileSystem.getInfoAsync(pos.uri);
        if (!info.exists) {
          skipped.push(`${pos.id} (fichier absent)`);
          continue;
        }

        // Le roll mesuré au déclenchement voyage dans le NOM du fichier.
        // Le backend conserve les sources d'un job en échec pour rejouer le
        // diagnostic (cf. main.py) : un nom auto-descriptif permet de relancer
        // l'assemblage sur un dossier seul, sans métadonnée annexe.
        // Absent (projets capturés avant cette version) => le backend lit 0.
        const roll = Number.isFinite(pos.roll) ? (pos.roll as number) : 0;
        const filename =
          `pos_${pos.id}_r${pos.row}_c${pos.col}_k${roll.toFixed(1)}.jpg`;
        const source = new FsFile(pos.uri);
        formData.append('files', {
          name: filename,
          type: 'image/jpeg',
          bytes: () => source.bytes(),
        } as any);

        attached += 1;
        onProgress?.(`Upload : ${attached}/${capturedPositions.length}`);
      } catch (err) {
        skipped.push(`${pos.id} (${err instanceof Error ? err.message : String(err)})`);
      }
    }

    // Sans ce garde-fou, une requête vide partait quand même et le backend
    // répondait « files: Field required » — erreur illisible côté app.
    if (attached < 2) {
      throw new Error(
        `Seulement ${attached} photo(s) sur ${capturedPositions.length} ont pu être jointes. ` +
        `Ignorées : ${skipped.join(', ') || 'aucune raison rapportée'}`
      );
    }

    if (skipped.length > 0) {
      console.warn(`${skipped.length} photo(s) ignorée(s) :`, skipped);
    }

    // Étape 3 : Ajouter les paramètres
    formData.append('mode', 'auto'); // ou 'manual' pour plus de détail
    formData.append('output_width', '4096');
    formData.append('output_height', '2048');
    formData.append('blend_mode', 'multiband');

    // Étape 4 : Envoyer au backend
    onProgress?.('Envoi au serveur...');
    
    const response = await fetch(`${BACKEND_URL}/api/stitch`, {
      method: 'POST',
      body: formData,
      headers: {
        Accept: 'application/json',
        // Ne pas définir Content-Type — fetch le fera automatiquement
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        formatBackendDetail(errorData.detail) ||
        `Erreur stitching (${response.status}): ${response.statusText}`
      );
    }

    const result = await response.json();
    
    onProgress?.('Téléchargement du panorama...');

    // Étape 5 : Télécharger le panorama généré
    const panoramaUrl = `${BACKEND_URL}${result.panorama_url}`;
    const panoramaUri = await downloadPanorama(panoramaUrl, projectId);

    onProgress?.('Panorama prêt !');

    // Log la qualité
    if (result.seam_continuity_score !== null) {
      console.log(`📊 Score de continuité : ${result.seam_continuity_score}/1.0`);
    }

    return panoramaUri;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Backend stitching error:', message);
    throw new Error(`Erreur assemblage : ${message}`);
  }
}

/**
 * Télécharge le panorama généré et le sauvegarde localement
 */
async function downloadPanorama(
  panoramaUrl: string,
  projectId: string,
): Promise<string> {
  try {
    const projectDir = `${FileSystem.documentDirectory}panorama_projects/${projectId}/`;
    const filename = `panorama_${projectId}.jpg`;
    const localPath = `${projectDir}${filename}`;

    // S'assurer que le dossier existe
    const dirInfo = await FileSystem.getInfoAsync(projectDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(projectDir, { intermediates: true });
    }

    // Télécharger
    const downloadResult = await FileSystem.downloadAsync(panoramaUrl, localPath);
    
    if (downloadResult.status === 200) {
      console.log(`✅ Panorama sauvegardé : ${localPath}`);
      return localPath;
    } else {
      throw new Error(`Download failed: ${downloadResult.status}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Impossible de télécharger le panorama: ${message}`);
  }
}

/**
 * Génère les assets optimisés (3 résolutions) du panorama
 * Optionnel — pour une intégration WebGL avancée
 */
export async function generateAssetsOnBackend(
  panoramaUri: string,
  projectId: string,
  onProgress?: (message: string) => void,
): Promise<string | undefined> {
  try {
    onProgress?.('Génération des assets...');

    // Lire le panorama
    const base64 = await FileSystem.readAsStringAsync(panoramaUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const blob = new Blob(
      [Uint8Array.from(atob(base64), c => c.charCodeAt(0))],
      { type: 'image/jpeg' }
    );

    const formData = new FormData();
    formData.append('file', blob, `panorama_${projectId}.jpg`);
    formData.append('name', `panorama_${projectId}`);
    formData.append('profiles', 'hq,standard,preview');
    formData.append('formats', 'jpg');

    onProgress?.('Upload panorama...');

    const response = await fetch(`${BACKEND_URL}/api/assets`, {
      method: 'POST',
      body: formData,
      headers: { Accept: 'application/zip' },
    });

    if (!response.ok) {
      throw new Error(`Erreur génération assets (${response.status})`);
    }

    onProgress?.('Téléchargement assets...');

    // Sauvegarder le ZIP
    const blob2 = await response.blob();
    const projectDir = `${FileSystem.documentDirectory}panorama_projects/${projectId}/`;
    const zipPath = `${projectDir}assets.zip`;

    // Implémenter le téléchargement du blob en ZIP
    // (nécessite une lib comme react-native-fs ou expo-file-system)
    // Pour l'instant, juste log
    console.log('Assets ZIP disponible via Blob:', blob2.size);

    return zipPath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('Asset generation error:', message);
    // Ne pas throw — c'est optionnel
    return undefined;
  }
}
