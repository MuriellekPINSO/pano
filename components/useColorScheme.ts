import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * Thème courant, garanti indexable dans Colors.
 *
 * Depuis React Native 0.86 (SDK 57), useColorScheme() ne renvoie plus jamais
 * null : son type est 'light' | 'dark' | 'unspecified'. Les `?? 'dark'` des
 * appelants sont donc devenus inopérants, et Colors['unspecified'] vaudrait
 * undefined — plantage au premier accès à .tint.
 *
 * On rabat 'unspecified' sur 'dark', conformément à userInterfaceStyle: "dark"
 * déclaré dans app.json.
 */
export function useColorScheme(): 'light' | 'dark' {
  return useRNColorScheme() === 'light' ? 'light' : 'dark';
}
