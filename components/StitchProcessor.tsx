// Composant qui délègue l'assemblage du panorama au backend FastAPI
// (remplace l'ancien pipeline WebView côté client)

import { CapturePosition } from '@/constants/CaptureConfig';
import { checkBackendHealth, stitchOnBackend } from '@/utils/BackendStitcher';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

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
    const [status, setStatus] = useState('Préparation des images...');
    const processedRef = useRef(false);

    useEffect(() => {
        let cancelled = false;

        async function process() {
            if (processedRef.current) return;
            processedRef.current = true;

            try {
                setStatus('Vérification du serveur...');
                onProgress?.('Vérification du serveur...');

                const isHealthy = await checkBackendHealth();
                if (!isHealthy) {
                    throw new Error(
                        "Le serveur d'assemblage est injoignable. Vérifiez que le backend FastAPI est démarré et que BACKEND_URL pointe vers la bonne adresse."
                    );
                }

                if (cancelled) return;

                const panoramaUri = await stitchOnBackend(positions, projectId, (message) => {
                    if (!cancelled) {
                        setStatus(message);
                        onProgress?.(message);
                    }
                });

                if (cancelled) return;

                if (!panoramaUri) {
                    throw new Error("Le serveur n'a retourné aucun panorama.");
                }

                onComplete(panoramaUri);
            } catch (err: any) {
                if (!cancelled) {
                    onError(err.message || "Échec de l'assemblage sur le serveur");
                }
            }
        }

        process();
        return () => {
            cancelled = true;
        };
    }, [positions, projectId]);

    return (
        <View style={styles.container}>
            <ActivityIndicator size="large" color="#6C63FF" />
            <Text style={styles.statusText}>{status}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        gap: 12,
    },
    statusText: {
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: 14,
        fontWeight: '500',
    },
});
