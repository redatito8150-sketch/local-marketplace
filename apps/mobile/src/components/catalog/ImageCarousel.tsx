import { useState } from "react";
import { FlatList, Modal, Pressable, SafeAreaView, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/theme/ThemeProvider";

export function ImageCarousel({ images, label }: { images: string[]; label: string }) {
  const { width } = useWindowDimensions();
  const { colors, spacing } = useAppTheme();
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const items = images.filter(Boolean);
  if (!items.length) return <View style={{ width, aspectRatio: 0.78, backgroundColor: colors.skeleton }} />;
  const gallery = (fullScreen = false) => (
    <FlatList
      data={items}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      keyExtractor={(item, imageIndex) => `${item}-${imageIndex}`}
      onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
      renderItem={({ item, index: imageIndex }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}, image ${imageIndex + 1} of ${items.length}${fullScreen ? "" : ", open full screen"}`}
          onPress={() => !fullScreen && setExpanded(true)}
          style={{ width, height: fullScreen ? "100%" : undefined }}
        >
          <Image
            source={item}
            alt={`${label}, image ${imageIndex + 1}`}
            contentFit={fullScreen ? "contain" : "cover"}
            style={{ width, height: fullScreen ? "100%" : undefined, aspectRatio: fullScreen ? undefined : 0.78, backgroundColor: colors.skeleton }}
          />
        </Pressable>
      )}
    />
  );
  return (
    <>
      <View>
        {gallery()}
        {items.length > 1 ? <View style={{ position: "absolute", bottom: spacing.sm, alignSelf: "center", flexDirection: "row", gap: spacing.xxs }}>{items.map((_, dot) => <View key={dot} style={{ width: dot === index ? 18 : 6, height: 6, borderRadius: 99, backgroundColor: dot === index ? colors.primary : colors.surfaceRaised }} />)}</View> : null}
      </View>
      <Modal visible={expanded} animationType="fade" onRequestClose={() => setExpanded(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close gallery" onPress={() => setExpanded(false)} style={{ position: "absolute", zIndex: 2, top: spacing.lg, right: spacing.md, padding: spacing.sm, borderRadius: 99, backgroundColor: colors.surfaceRaised }}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
          {gallery(true)}
        </SafeAreaView>
      </Modal>
    </>
  );
}
