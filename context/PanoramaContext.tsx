import { CapturePosition, generateCapturePositions, PanoramaProject } from '@/constants/CaptureConfig';
import * as FileSystem from 'expo-file-system/legacy';
import React, { createContext, ReactNode, useCallback, useContext, useReducer } from 'react';

// State Type
interface PanoramaState {
    projects: PanoramaProject[];
    currentProject: PanoramaProject | null;
    isCapturing: boolean;
    currentPositionIndex: number;
}

// Action Types
type PanoramaAction =
    | { type: 'CREATE_PROJECT'; payload: PanoramaProject }
    | { type: 'SET_CURRENT_PROJECT'; payload: PanoramaProject | null }
    | { type: 'CAPTURE_PHOTO'; payload: { positionId: number; uri: string } }
    | { type: 'SET_CAPTURING'; payload: boolean }
    | { type: 'SET_CURRENT_POSITION'; payload: number }
    | { type: 'DELETE_PROJECT'; payload: string }
    | { type: 'LOAD_PROJECTS'; payload: PanoramaProject[] }
    | { type: 'SET_PANORAMA_URI'; payload: { projectId: string; uri: string } }
    | { type: 'SET_THUMBNAIL'; payload: { projectId: string; uri: string } };

const initialState: PanoramaState = {
    projects: [],
    currentProject: null,
    isCapturing: false,
    currentPositionIndex: 0,
};

function panoramaReducer(state: PanoramaState, action: PanoramaAction): PanoramaState {
    switch (action.type) {
        case 'CREATE_PROJECT':
            return {
                ...state,
                projects: [action.payload, ...state.projects],
                currentProject: action.payload,
            };
        case 'SET_CURRENT_PROJECT':
            return { ...state, currentProject: action.payload };
        case 'CAPTURE_PHOTO': {
            if (!state.currentProject) return state;
            const updatedPositions = state.currentProject.positions.map((pos) =>
                pos.id === action.payload.positionId
                    ? { ...pos, captured: true, uri: action.payload.uri }
                    : pos
            );
            const capturedCount = updatedPositions.filter((p) => p.captured).length;
            const updatedProject: PanoramaProject = {
                ...state.currentProject,
                positions: updatedPositions,
                capturedPhotos: capturedCount,
                isComplete: capturedCount === state.currentProject.totalPhotos,
                updatedAt: new Date().toISOString(),
            };
            return {
                ...state,
                currentProject: updatedProject,
                projects: state.projects.map((p) =>
                    p.id === updatedProject.id ? updatedProject : p
                ),
            };
        }
        case 'SET_CAPTURING':
            return { ...state, isCapturing: action.payload };
        case 'SET_CURRENT_POSITION':
            return { ...state, currentPositionIndex: action.payload };
        case 'DELETE_PROJECT':
            return {
                ...state,
                projects: state.projects.filter((p) => p.id !== action.payload),
                currentProject:
                    state.currentProject?.id === action.payload ? null : state.currentProject,
            };
        case 'LOAD_PROJECTS':
            return { ...state, projects: action.payload };
        case 'SET_PANORAMA_URI': {
            const updatedProjects = state.projects.map((p) =>
                p.id === action.payload.projectId
                    ? { ...p, panoramaUri: action.payload.uri }
                    : p
            );
            return {
                ...state,
                projects: updatedProjects,
                currentProject:
                    state.currentProject?.id === action.payload.projectId
                        ? { ...state.currentProject, panoramaUri: action.payload.uri }
                        : state.currentProject,
            };
        }
        case 'SET_THUMBNAIL': {
            const updatedProjects = state.projects.map((p) =>
                p.id === action.payload.projectId
                    ? { ...p, thumbnailUri: action.payload.uri }
                    : p
            );
            return {
                ...state,
                projects: updatedProjects,
                currentProject:
                    state.currentProject?.id === action.payload.projectId
                        ? { ...state.currentProject, thumbnailUri: action.payload.uri }
                        : state.currentProject,
            };
        }
        default:
            return state;
    }
}

// Context
interface PanoramaContextType {
    state: PanoramaState;
    createProject: (name: string) => Promise<PanoramaProject>;
    capturePhoto: (positionId: number, uri: string) => void;
    setCurrentProject: (project: PanoramaProject | null) => void;
    setCapturing: (capturing: boolean) => void;
    setCurrentPosition: (index: number) => void;
    deleteProject: (projectId: string) => Promise<void>;
    loadProjects: () => Promise<void>;
    saveProjects: () => Promise<void>;
    getNextUncapturedPosition: () => CapturePosition | null;
    setPanoramaUri: (projectId: string, uri: string) => void;
}

const PanoramaContext = createContext<PanoramaContextType | undefined>(undefined);

const PROJECTS_DIR = `${FileSystem.documentDirectory}panorama_projects/`;
const PROJECTS_INDEX = `${FileSystem.documentDirectory}projects_index.json`;

export function PanoramaProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(panoramaReducer, initialState);

    const ensureDirectoryExists = useCallback(async () => {
        const dirInfo = await FileSystem.getInfoAsync(PROJECTS_DIR);
        if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(PROJECTS_DIR, { intermediates: true });
        }
    }, []);

    const saveProjects = useCallback(async () => {
        try {
            await ensureDirectoryExists();
            await FileSystem.writeAsStringAsync(
                PROJECTS_INDEX,
                JSON.stringify(state.projects)
            );
        } catch (error) {
            console.error('Error saving projects:', error);
        }
    }, [state.projects, ensureDirectoryExists]);

    const loadProjects = useCallback(async () => {
        try {
            await ensureDirectoryExists();
            const fileInfo = await FileSystem.getInfoAsync(PROJECTS_INDEX);
            if (fileInfo.exists) {
                const data = await FileSystem.readAsStringAsync(PROJECTS_INDEX);
                const projects = JSON.parse(data) as PanoramaProject[];
                dispatch({ type: 'LOAD_PROJECTS', payload: projects });
            }
        } catch (error) {
            console.error('Error loading projects:', error);
        }
    }, [ensureDirectoryExists]);

    const createProject = useCallback(async (name: string): Promise<PanoramaProject> => {
        await ensureDirectoryExists();
        const id = `pano_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const projectDir = `${PROJECTS_DIR}${id}/`;
        await FileSystem.makeDirectoryAsync(projectDir, { intermediates: true });

        const positions = generateCapturePositions();
        const project: PanoramaProject = {
            id,
            name,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            positions,
            isComplete: false,
            totalPhotos: positions.length,
            capturedPhotos: 0,
        };

        dispatch({ type: 'CREATE_PROJECT', payload: project });
        return project;
    }, [ensureDirectoryExists]);

    const capturePhoto = useCallback((positionId: number, uri: string) => {
        dispatch({ type: 'CAPTURE_PHOTO', payload: { positionId, uri } });
    }, []);

    const setCurrentProject = useCallback((project: PanoramaProject | null) => {
        dispatch({ type: 'SET_CURRENT_PROJECT', payload: project });
    }, []);

    const setCapturing = useCallback((capturing: boolean) => {
        dispatch({ type: 'SET_CAPTURING', payload: capturing });
    }, []);

    const setCurrentPosition = useCallback((index: number) => {
        dispatch({ type: 'SET_CURRENT_POSITION', payload: index });
    }, []);

    const deleteProject = useCallback(async (projectId: string) => {
        try {
            const projectDir = `${PROJECTS_DIR}${projectId}/`;
            const dirInfo = await FileSystem.getInfoAsync(projectDir);
            if (dirInfo.exists) {
                await FileSystem.deleteAsync(projectDir, { idempotent: true });
            }
            dispatch({ type: 'DELETE_PROJECT', payload: projectId });
        } catch (error) {
            console.error('Error deleting project:', error);
        }
    }, []);

    const getNextUncapturedPosition = useCallback((): CapturePosition | null => {
        if (!state.currentProject) return null;

        // Smart ordering: horizon first (easiest), then top, bottom, zenith
        const rowOrder = [0, 1, 2, 3];

        for (const row of rowOrder) {
            const uncaptured = state.currentProject.positions.find(
                (p) => !p.captured && p.row === row
            );
            if (uncaptured) return uncaptured;
        }

        // Fallback: any uncaptured
        return state.currentProject.positions.find((p) => !p.captured) || null;
    }, [state.currentProject]);

    const setPanoramaUri = useCallback((projectId: string, uri: string) => {
        dispatch({ type: 'SET_PANORAMA_URI', payload: { projectId, uri } });
    }, []);

    return (
        <PanoramaContext.Provider
            value={{
                state,
                createProject,
                capturePhoto,
                setCurrentProject,
                setCapturing,
                setCurrentPosition,
                deleteProject,
                loadProjects,
                saveProjects,
                getNextUncapturedPosition,
                setPanoramaUri,
            }}
        >
            {children}
        </PanoramaContext.Provider>
    );
}

export function usePanorama() {
    const context = useContext(PanoramaContext);
    if (context === undefined) {
        throw new Error('usePanorama must be used within a PanoramaProvider');
    }
    return context;
}
