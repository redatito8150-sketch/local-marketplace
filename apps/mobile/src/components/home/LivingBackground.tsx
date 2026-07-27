import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

const backgroundSource = require("../../../assets/images/mahaly-pyramids-background.png");

function startLoop(
  value: Animated.Value,
  duration: number,
  delay = 0,
  reverse = true,
) {
  value.setValue(0);
  const animation = Animated.loop(
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(value, {
        toValue: 1,
        duration,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      reverse
        ? Animated.timing(value, {
            toValue: 0,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          })
        : Animated.timing(value, {
            toValue: 0,
            duration: 1,
            useNativeDriver: true,
          }),
    ]),
  );
  animation.start();
  return animation;
}

export function LivingBackground() {
  const { width, height } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);
  const drift = useRef(new Animated.Value(0)).current;
  const boat = useRef(new Animated.Value(0)).current;
  const breeze = useRef(new Animated.Value(0)).current;
  const ripple = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      [drift, boat, breeze, ripple].forEach((value) => value.stopAnimation());
      return;
    }

    const animations = [
      startLoop(drift, 9000),
      startLoop(boat, 3200, 350),
      startLoop(breeze, 2100),
      startLoop(ripple, 4200, 200, false),
    ];
    return () => animations.forEach((animation) => animation.stop());
  }, [boat, breeze, drift, reduceMotion, ripple]);

  const imageFrame = { width: width + 16, height: height + 24, left: -8, top: -12 };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.imageLayer,
          imageFrame,
          {
            transform: [
              { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1.015, 1.028] }) },
              { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) },
              { translateX: breeze.interpolate({ inputRange: [0, 1], outputRange: [-1.5, 2.5] }) },
              { rotate: breeze.interpolate({ inputRange: [0, 1], outputRange: ["-0.08deg", "0.08deg"] }) },
            ],
          },
        ]}
      >
        <Image
          source={backgroundSource}
          alt=""
          accessibilityIgnoresInvertColors
          contentFit="cover"
          contentPosition="top center"
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <View style={[styles.water, { top: height * 0.225, height: height * 0.2 }]}>
        {[0.08, 0.29, 0.52, 0.75].map((position, index) => (
          <Animated.View
            key={position}
            style={[
              styles.ripple,
              {
                top: `${position * 100}%`,
                left: index % 2 ? "29%" : "43%",
                width: index % 2 ? "58%" : "45%",
                opacity: ripple.interpolate({
                  inputRange: [0, 0.45, 1],
                  outputRange: [0.06, 0.22 - index * 0.025, 0.04],
                }),
                transform: [
                  { translateX: ripple.interpolate({ inputRange: [0, 1], outputRange: [-12, 18] }) },
                  { scaleX: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1.15] }) },
                ],
              },
            ]}
          />
        ))}

        <Animated.View
          style={[
            styles.wake,
            {
              right: width * 0.09,
              top: 3,
              transform: [
                { translateX: boat.interpolate({ inputRange: [0, 1], outputRange: [2, -8] }) },
                { scaleX: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.3] }) },
                { rotate: "-8deg" },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.wake,
            {
              right: width * 0.065,
              top: 10,
              width: 44,
              opacity: 0.34,
              transform: [
                { translateX: boat.interpolate({ inputRange: [0, 1], outputRange: [4, -12] }) },
                { scaleX: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.45] }) },
                { rotate: "-13deg" },
              ],
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  imageLayer: {
    position: "absolute",
  },
  water: {
    position: "absolute",
    left: 0,
    right: 0,
    overflow: "hidden",
  },
  ripple: {
    position: "absolute",
    height: 1.5,
    borderRadius: 999,
    backgroundColor: "rgba(110,105,100,0.42)",
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
  wake: {
    position: "absolute",
    width: 62,
    height: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.32)",
  },
});
