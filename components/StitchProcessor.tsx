/**
 * ============================================================================
 *  STITCH PROCESSOR — Utilise le backend FastAPI pour l'assemblage
 * ============================================================================
 * 
 * Remplace le stitching client-side (WebView) par un appel au backend Python.
 * Beaucoup plus rapide, meilleure qualité, supporte mieux les panoramas 360°.
 */

import { CapturePosition } from '@/constants/CaptureConfig';
import { checkBackendHealth, stitchOnBackend, BACKEND_URL } from '@/utils/BackendStitcher';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';

interface StitchProcessorProps {
  positions: CapturePosition[];
  projectId: string;
  onComplete: (panoramaUri: string) => void;
  onError: (error: string) => void;
  onProgress?: (message: string) => void;
}

export default function StitchProcessor({
  positions,
  projectId,
  onComplete,
  onError,
  onProgress,
}: StitchProcessorProps) {
  const [status, setStatus] = useState('Vérification du serveur...');
  const [backendAvailable, setBackendAvailable] = useState(false);
  const processedRef = useRef(false);

  // Vérifier la disponibilité du backend au montage
  useEffect(() => {
    async function checkBackend() {
      try {
        const isHealthy = await checkBackendHealth();
        setBackendAvailable(isHealthy);
        
        if (!isHealthy) {
          setStatus('⚠️ Serveur indisponible');
          onError(`Backend non accessible : ${BACKEND_URL}`);
          return;
        }

        setStatus('Préparation des images...');
        await startStitching();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus(`Erreur : ${message}`);
        onError(message);
      }
    }

    checkBackend();
  }, []);

  const startStitching = useCallback(async () => {
    if (processedRef.current) return;
    processedRef.current = true;

    try {
      const handleProgress = (msg: string) => {
        setStatus(msg);
        onProgress?.(msg);
      };

      handleProgress('Upload des images au serveur...');

      const panoramaUri = await stitchOnBackend(
        positions,
        projectId,
        handleProgress,
      );

      if (!panoramaUri) {
        throw new Error('Pas de panorama retourné');
      }

      handleProgress('Panorama assemblé avec succès !');
      onComplete(panoramaUri);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Stitching error:', message);
      setStatus(`❌ Erreur : ${message}`);
      onError(message);
    }
  }, [positions, projectId, onComplete, onError, onProgress]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#6C63FF" />
      <Text style={styles.statusText}>{status}</Text>

      {!backendAvailable && (
        <View style={styles.warningBox}>
          <MaterialIcons name="warning" size={20} color="#F59E0B" />
          <Text style={styles.warningText}>
            Le serveur backend n'est pas disponible.{'\n'}
            Vérifiez la connexion ou lancez le serveur localement.
          </Text>
          <Text style={styles.backenUrlText}>
            {BACKEND_URL}
          </Text>
        </View>
      )}

      {backendAvailable && (
        <View style={styles.infoBox}>
          <MaterialIcons name="cloud-upload" size={18} color="#6C63FF" />
          <Text style={styles.infoText}>
            Assemblage en cours sur le serveur...
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 16,
    flex: 1,
  },
  statusText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  warningBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    gap: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  warningText: {
    color: '#F59E0B',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  backenUrlText: {
    color: 'rgba(245, 158, 11, 0.6)',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 8,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.2)',
    gap: 10,
    alignItems: 'center',
  },
  infoText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    fontWeight: '500',
  },
});
