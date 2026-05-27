import { useRef } from 'react';
import { Animated } from 'react-native';

export const HEADER_HEIGHT = 64;

export function useScrollAware() {
  const lastScrollY = useRef(0);
  const headerTranslate = useRef(new Animated.Value(0)).current;

  const onScroll = useRef((event) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const diff = currentY - lastScrollY.current;

    if (diff > 5 && currentY > HEADER_HEIGHT) {
      Animated.timing(headerTranslate, {
        toValue: -HEADER_HEIGHT,
        duration: 180,
        useNativeDriver: true,
      }).start();
    } else if (diff < -5) {
      Animated.timing(headerTranslate, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    }
    lastScrollY.current = currentY;
  }).current;

  return { onScroll, headerTranslate };
}
