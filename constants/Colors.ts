// Teleport 360 Color System
const tintColorLight = '#6C63FF';
const tintColorDark = '#8B83FF';

export default {
  light: {
    text: '#1A1A2E',
    textSecondary: '#6B7280',
    background: '#F8F9FE',
    cardBackground: '#FFFFFF',
    tint: tintColorLight,
    tabIconDefault: '#9CA3AF',
    tabIconSelected: tintColorLight,
    border: '#E5E7EB',
    accent: '#FF6B6B',
    success: '#10B981',
    warning: '#F59E0B',
    gradient: {
      primary: ['#6C63FF', '#8B83FF', '#A78BFA'],
      secondary: ['#FF6B6B', '#FF8E8E', '#FFA8A8'],
      dark: ['#1A1A2E', '#16213E', '#0F3460'],
      capture: ['#6C63FF', '#4338CA'],
    },
  },
  dark: {
    text: '#F9FAFB',
    textSecondary: '#9CA3AF',
    background: '#0F0F1A',
    cardBackground: '#1A1A2E',
    tint: tintColorDark,
    tabIconDefault: '#6B7280',
    tabIconSelected: tintColorDark,
    border: '#2D2D44',
    accent: '#FF6B6B',
    success: '#10B981',
    warning: '#F59E0B',
    gradient: {
      primary: ['#6C63FF', '#8B83FF', '#A78BFA'],
      secondary: ['#FF6B6B', '#FF8E8E', '#FFA8A8'],
      dark: ['#0F0F1A', '#1A1A2E', '#16213E'],
      capture: ['#6C63FF', '#4338CA'],
    },
  },
};
