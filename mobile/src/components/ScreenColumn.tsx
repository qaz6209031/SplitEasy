// Every page sits in one centred column, clear of side insets (iPhone Duo's cover display puts the
// status bar and camera on the side). On a regular iPhone this is the full width, so nothing moves.
import { createContext, useContext, type ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider, useSafeAreaFrame, useSafeAreaInsets, type Metrics } from 'react-native-safe-area-context';

import { colors } from './theme';

/** Widest a page's content gets; wider windows (iPhone Duo open, Split View) centre it. */
const MAX_COLUMN = 640;
/** From this width a page that can show two panes (the groups list and a group) does; the panes then fill it. */
const SPLIT_MIN = 800;

type Bleed = { left: number; right: number };
const BleedContext = createContext<Bleed>({ left: 0, right: 0 });
const SplitContext = createContext(false);

/**
 * How far the column sits in from the screen's own edges. A surface that should run edge to edge
 * (the amount keypad's tray) uses it as negative margin, and as padding to keep its content in line.
 */
export function useColumnBleed(): Bleed {
  return useContext(BleedContext);
}

/** True when the page has room for two panes side by side (only pages that opted in with `split`). */
export function useSplitView(): boolean {
  return useContext(SplitContext);
}

export function ScreenColumn({ children, split = false }: { children: ReactNode; split?: boolean }) {
  // The screen measures its own insets rather than the window's: a form sheet on Duo's open display
  // never reaches the status bar at the side, while a full-height sheet on the cover display does.
  const initial: Metrics = { insets: useSafeAreaInsets(), frame: useSafeAreaFrame() };
  return (
    <SafeAreaProvider initialMetrics={initial} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Column split={split}>{children}</Column>
    </SafeAreaProvider>
  );
}

function Column({ children, split }: { children: ReactNode; split: boolean }) {
  const insets = useSafeAreaInsets();
  const { width } = useSafeAreaFrame();
  const available = width - insets.left - insets.right;
  const twoPanes = split && available >= SPLIT_MIN;
  const gap = twoPanes ? 0 : Math.max(0, (available - MAX_COLUMN) / 2);
  const bleed = { left: insets.left + gap, right: insets.right + gap };
  // The column clears the side insets itself, so pages get a provider without them; SafeAreaView
  // reads the nearest provider's insets and would otherwise pad the sides a second time.
  const inner: Metrics = { insets: { ...insets, left: 0, right: 0 }, frame: { x: 0, y: 0, width: width - bleed.left - bleed.right, height: 0 } };
  return (
    <View style={{ flex: 1, paddingLeft: bleed.left, paddingRight: bleed.right }}>
      <BleedContext.Provider value={bleed}>
        <SplitContext.Provider value={twoPanes}>
          <SafeAreaProvider initialMetrics={inner} style={{ flex: 1 }}>
            {children}
          </SafeAreaProvider>
        </SplitContext.Provider>
      </BleedContext.Provider>
    </View>
  );
}
