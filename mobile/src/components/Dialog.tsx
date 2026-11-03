// Styled confirm / alert dialogs from the design, replacing the system Alert.
//   const dialog = useDialog();
//   if (await dialog.confirm({ title: 'Delete "Ramen"?', confirmTitle: 'Delete', tone: 'red' })) …
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, floatShadow, fonts, radius, space, type } from './theme';
import { Button } from './ui';

type Tone = 'primary' | 'red';

interface DialogOptions {
  title: string;
  message?: string;
  /** A part of `message` (e.g. an amount) set in the money face. */
  highlight?: string;
  /** Omit for a single-button alert. */
  cancelTitle?: string;
  confirmTitle?: string;
  tone?: Tone;
}

interface DialogApi {
  confirm(options: DialogOptions): Promise<boolean>;
  alert(title: string, message?: string): Promise<void>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<DialogOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const close = useCallback((result: boolean) => {
    setCurrent(null);
    resolver.current?.(result);
    resolver.current = null;
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      confirm: (options) =>
        new Promise<boolean>((resolve) => {
          resolver.current?.(false);
          resolver.current = resolve;
          setCurrent({ cancelTitle: 'Cancel', confirmTitle: 'OK', tone: 'primary', ...options });
        }),
      alert: (title, message) =>
        new Promise<void>((resolve) => {
          resolver.current?.(false);
          resolver.current = () => resolve();
          setCurrent({ title, message, confirmTitle: 'OK', cancelTitle: undefined, tone: 'primary' });
        }),
    }),
    [],
  );

  return (
    <DialogContext.Provider value={api}>
      {children}
      <Modal visible={current != null} transparent animationType="fade" onRequestClose={() => close(false)} statusBarTranslucent>
        <Pressable style={styles.scrim} onPress={() => (current?.cancelTitle ? close(false) : undefined)} accessible={false}>
          {current ? (
            <View style={styles.alert} accessibilityViewIsModal onStartShouldSetResponder={() => true}>
              <Text style={styles.title} accessibilityRole="header">
                {current.title}
              </Text>
              {current.message ? <Message text={current.message} highlight={current.highlight} /> : null}
              <View style={styles.buttons}>
                {current.cancelTitle ? (
                  <Button title={current.cancelTitle} variant="secondary" size="sm" onPress={() => close(false)} style={{ flex: 1 }} />
                ) : null}
                <Button
                  title={current.confirmTitle ?? 'OK'}
                  variant={current.tone === 'red' ? 'danger' : 'primary'}
                  size="sm"
                  onPress={() => close(true)}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </DialogContext.Provider>
  );
}

function Message({ text, highlight }: { text: string; highlight?: string }) {
  const at = highlight ? text.indexOf(highlight) : -1;
  if (!highlight || at < 0) return <Text style={styles.message}>{text}</Text>;
  return (
    <Text style={styles.message}>
      {text.slice(0, at)}
      <Text style={styles.highlight}>{highlight}</Text>
      {text.slice(at + highlight.length)}
    </Text>
  );
}

export function useDialog(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) throw new Error('useDialog must be used inside <DialogProvider>');
  return api;
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: space.l },
  alert: {
    width: 300,
    maxWidth: '100%',
    backgroundColor: colors.bg,
    borderRadius: radius.sheet,
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 18,
    gap: space.xs,
    ...floatShadow,
  },
  title: { ...type.headline, fontSize: 18, lineHeight: 23, color: colors.ink },
  message: { ...type.subhead, lineHeight: 21, color: colors.ink2 },
  highlight: { fontFamily: fonts.moneyBold, color: colors.ink },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 14 },
});
