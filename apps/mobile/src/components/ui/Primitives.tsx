import { PropsWithChildren, ReactNode } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  ViewProps
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppButton } from "./AppButton";
import { AppText } from "./AppText";
import { useAppTheme } from "@/theme/ThemeProvider";

export function Card({ style, ...props }: ViewProps) {
  const { colors, radius, spacing } = useAppTheme();
  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          padding: spacing.md
        },
        style
      ]}
    />
  );
}

export function Divider() {
  const { colors } = useAppTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

export function Badge({ children, tone = "neutral" }: PropsWithChildren<{ tone?: "neutral" | "success" | "warning" }>) {
  const { colors, radius, spacing } = useAppTheme();
  const color = tone === "success" ? colors.success : tone === "warning" ? colors.warning : colors.textMuted;
  return (
    <View style={{ alignSelf: "flex-start", borderRadius: radius.pill, backgroundColor: `${color}1A`, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs }}>
      <AppText variant="caption" style={{ color }}>{children}</AppText>
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.row}>
      <AppText variant="title">{title}</AppText>
      {action}
    </View>
  );
}

export function FilterChip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const { colors, radius, spacing } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? `${colors.primary}14` : colors.surface,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs
      }}
    >
      <AppText variant="label" style={{ color: selected ? colors.primary : colors.text }}>{label}</AppText>
    </Pressable>
  );
}

export function QuantitySelector({ value, onChange, min = 1, max = 99 }: { value: number; onChange: (value: number) => void; min?: number; max?: number }) {
  const { colors, radius, spacing } = useAppTheme();
  return (
    <View style={[styles.quantity, { borderColor: colors.border, borderRadius: radius.md }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Decrease quantity" disabled={value <= min} onPress={() => onChange(Math.max(min, value - 1))} hitSlop={8}>
        <Ionicons name="remove" size={20} color={value <= min ? colors.textMuted : colors.text} />
      </Pressable>
      <AppText variant="label" style={{ paddingHorizontal: spacing.sm }}>{value}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel="Increase quantity" disabled={value >= max} onPress={() => onChange(Math.min(max, value + 1))} hitSlop={8}>
        <Ionicons name="add" size={20} color={value >= max ? colors.textMuted : colors.text} />
      </Pressable>
    </View>
  );
}

export function AppSheet({ visible, title, onClose, children }: PropsWithChildren<{ visible: boolean; title: string; onClose: () => void }>) {
  const { colors, radius, spacing } = useAppTheme();
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surfaceRaised, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg }]} onPress={() => undefined}>
          <SectionHeader title={title} action={<Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose}><Ionicons name="close" size={24} color={colors.text} /></Pressable>} />
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function BottomActionBar({ children }: PropsWithChildren) {
  const { colors, spacing } = useAppTheme();
  return <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surfaceRaised, padding: spacing.md }}>{children}</View>;
}

export function EmptyState({ title, message, actionLabel, onAction }: { title: string; message: string; actionLabel?: string; onAction?: () => void }) {
  const { colors, spacing } = useAppTheme();
  return (
    <View style={[styles.center, { gap: spacing.sm }]}>
      <Ionicons name="sparkles-outline" size={30} color={colors.accent} />
      <AppText variant="title" style={{ textAlign: "center" }}>{title}</AppText>
      <AppText style={{ color: colors.textMuted, textAlign: "center" }}>{message}</AppText>
      {actionLabel && onAction ? <AppButton label={actionLabel} variant="secondary" onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  quantity: { flexDirection: "row", alignItems: "center", borderWidth: 1, padding: 8 },
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: { minHeight: 160, gap: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }
});
