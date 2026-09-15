/**
 * Learn more about Light and Dark modes:
 * https://docs.expo.io/guides/color-schemes/
 */

import { Text as DefaultText, View as DefaultView } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from './useColorScheme';

type ThemeProps = {
  lightColor?: string;
  darkColor?: string;
};

export type TextProps = ThemeProps & DefaultText['props'];
export type ViewProps = ThemeProps & DefaultView['props'];

/**
 * Clés de Colors dont la valeur est une couleur simple.
 *
 * Colors contient aussi `gradient`, qui est un objet de tableaux : sans ce
 * filtrage, useThemeColor peut renvoyer cet objet, que ni `color` ni
 * `backgroundColor` n'acceptent.
 */
type ThemeColorName = {
  [K in keyof typeof Colors.light & keyof typeof Colors.dark]:
    (typeof Colors.light)[K] extends string ? K : never;
}[keyof typeof Colors.light & keyof typeof Colors.dark];

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: ThemeColorName
): string {
  const theme = useColorScheme();
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName];
  }
}

export function Text(props: TextProps) {
  const { style, lightColor, darkColor, ...otherProps } = props;
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return <DefaultText style={[{ color }, style]} {...otherProps} />;
}

export function View(props: ViewProps) {
  const { style, lightColor, darkColor, ...otherProps } = props;
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');

  return <DefaultView style={[{ backgroundColor }, style]} {...otherProps} />;
}
