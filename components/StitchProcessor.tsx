// Hidden WebView component that performs the stitching
// Renders off-screen, processes the canvas, and returns the result

import { CapturePosition } from '@/constants/CaptureConfig';
import { generateStitchHTML, prepareImagesForStitch, saveBase64Image } from '@/utils/StitchEngine';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

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
    const webViewRef = useRef<WebView>(null);
    const [html, setHtml] = useState<string | null>(null);
    const [status, setStatus] = useState('Préparation des images...');
    const processedRef = useRef(false);

    // Prepare images and generate HTML
    React.useEffect(() => {
        let cancelled = false;

        async function prepare() {
            try {
                setStatus('Lecture des images...');
                onProgress?.('Lecture des images...');

                const preparedPositions = await prepareImagesForStitch(positions);

                if (cancelled) return;

                setStatus('Assemblage en cours...');
                onProgress?.('Assemblage en cours...');

                const stitchHTML = generateStitchHTML(preparedPositions);
                setHtml(stitchHTML);
            } catch (err: any) {
                onError(err.message || 'Failed to prepare images');
            }
        }

        prepare();
        return () => { cancelled = true; };
    }, [positions]);

    const handleMessage = useCallback(async (event: any) => {
        if (processedRef.current) return;

        try {
            const data = JSON.parse(event.nativeEvent.data);

            if (data.type === 'STITCH_COMPLETE') {
                processedRef.current = true;
                setStatus('Sauvegarde du panorama...');
                onProgress?.('Sauvegarde du panorama...');

                const uri = await saveBase64Image(data.dataUrl, projectId);
                onComplete(uri);
            } else if (data.type === 'STITCH_ERROR') {
                onError(data.error);
            }
        } catch (err: any) {
            onError(err.message || 'Stitching failed');
        }
    }, [projectId, onComplete, onError]);

    if (!html) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#6C63FF" />
                <Text style={styles.statusText}>{status}</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ActivityIndicator size="large" color="#6C63FF" />
            <Text style={styles.statusText}>{status}</Text>

            {/* Hidden WebView that does the actual stitching */}
            <WebView
                ref={webViewRef}
                source={{ html }}
                style={styles.hiddenWebView}
                onMessage={handleMessage}
                javaScriptEnabled
                originWhitelist={['*']}
                onError={(e) => onError(e.nativeEvent.description)}
            />
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
    hiddenWebView: {
        width: 1,
        height: 1,
        opacity: 0,
        position: 'absolute',
    },
});
