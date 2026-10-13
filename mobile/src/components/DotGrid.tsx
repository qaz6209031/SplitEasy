// Faint dot grid that fades out from the upper middle (sign-in background in the design).
import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Mask, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

export function DotGrid({ centerY = 0.35 }: { centerY?: number }) {
  const { width, height } = useWindowDimensions();
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden>
      <Defs>
        <Pattern id="dots" width={20} height={20} patternUnits="userSpaceOnUse">
          <Circle cx={10} cy={10} r={1} fill="#2A2D35" />
        </Pattern>
        <RadialGradient id="fade" cx="50%" cy={`${centerY * 100}%`} rx="70%" ry="50%">
          <Stop offset="0" stopColor="#fff" stopOpacity={1} />
          <Stop offset="1" stopColor="#fff" stopOpacity={0} />
        </RadialGradient>
        <Mask id="mask">
          <Rect width={width} height={height} fill="url(#fade)" />
        </Mask>
      </Defs>
      <Rect width={width} height={height} fill="url(#dots)" mask="url(#mask)" />
    </Svg>
  );
}
