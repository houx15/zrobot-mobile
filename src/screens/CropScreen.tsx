import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Image, TouchableOpacity, ActivityIndicator, Text, PanResponder, PixelRatio } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImageManipulator from 'expo-image-manipulator';
import { uploadService } from '../services/api';

const CropScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { imageUri, nextScreen, title } = route.params;
  const [loading, setLoading] = useState(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const cropStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const cropRectRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const MIN_CROP_SIZE = 80;

  useEffect(() => {
    Image.getSize(
      imageUri,
      (width, height) => setImageSize({ width, height }),
      () => setImageSize(null)
    );
  }, [imageUri]);

  const imageBounds = useMemo(() => {
    if (!imageSize || !containerSize) return null;
    const scale = Math.min(containerSize.width / imageSize.width, containerSize.height / imageSize.height);
    const displayWidth = imageSize.width * scale;
    const displayHeight = imageSize.height * scale;
    const x = (containerSize.width - displayWidth) / 2;
    const y = (containerSize.height - displayHeight) / 2;
    return { x, y, width: displayWidth, height: displayHeight, scale };
  }, [imageSize, containerSize]);

  useEffect(() => {
    if (!imageBounds) return;
    if (cropRect) return;
    const width = Math.max(MIN_CROP_SIZE, imageBounds.width * 0.8);
    const height = Math.max(MIN_CROP_SIZE, imageBounds.height * 0.6);
    const x = imageBounds.x + (imageBounds.width - width) / 2;
    const y = imageBounds.y + (imageBounds.height - height) / 2;
    setCropRect({ x, y, width, height });
  }, [imageBounds, cropRect]);

  // Keep ref in sync with state
  useEffect(() => {
    cropRectRef.current = cropRect;
  }, [cropRect]);

  const clampCrop = useCallback(
    (next: { x: number; y: number; width: number; height: number }) => {
      if (!imageBounds) return next;
      const width = Math.min(Math.max(next.width, MIN_CROP_SIZE), imageBounds.width);
      const height = Math.min(Math.max(next.height, MIN_CROP_SIZE), imageBounds.height);
      const maxX = imageBounds.x + imageBounds.width - width;
      const maxY = imageBounds.y + imageBounds.height - height;
      return {
        x: Math.min(Math.max(next.x, imageBounds.x), maxX),
        y: Math.min(Math.max(next.y, imageBounds.y), maxY),
        width,
        height,
      };
    },
    [imageBounds]
  );

  const moveResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: () => {
          cropStartRef.current = cropRectRef.current;
        },
        onPanResponderMove: (_evt, gesture) => {
          if (!cropStartRef.current || !imageBounds) return;
          const next = {
            x: cropStartRef.current.x + gesture.dx,
            y: cropStartRef.current.y + gesture.dy,
            width: cropStartRef.current.width,
            height: cropStartRef.current.height,
          };
          setCropRect(clampCrop(next));
        },
        onPanResponderRelease: () => {
          cropStartRef.current = null;
        },
      }),
    [imageBounds, clampCrop]
  );

  const resizeResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: () => {
          resizeStartRef.current = cropRectRef.current;
        },
        onPanResponderMove: (_evt, gesture) => {
          if (!resizeStartRef.current || !imageBounds) return;
          const next = {
            x: resizeStartRef.current.x,
            y: resizeStartRef.current.y,
            width: resizeStartRef.current.width + gesture.dx,
            height: resizeStartRef.current.height + gesture.dy,
          };
          setCropRect(clampCrop(next));
        },
        onPanResponderRelease: () => {
          resizeStartRef.current = null;
        },
      }),
    [imageBounds, clampCrop]
  );

  const handleConfirm = async () => {
    setLoading(true);
    let manipulatedUri = imageUri;
    try {
        let actions: ImageManipulator.Action[] = [];
        if (imageBounds && imageSize && cropRect) {
          const pixelRatio = PixelRatio.get();
          const resizedWidth = Math.max(1, Math.round(imageBounds.width * pixelRatio));
          const resizedHeight = Math.max(1, Math.round(imageBounds.height * pixelRatio));
          const cropX = Math.max(0, Math.round((cropRect.x - imageBounds.x) * pixelRatio));
          const cropY = Math.max(0, Math.round((cropRect.y - imageBounds.y) * pixelRatio));
          const cropW = Math.max(1, Math.round(cropRect.width * pixelRatio));
          const cropH = Math.max(1, Math.round(cropRect.height * pixelRatio));
          const clampedCropX = Math.min(cropX, Math.max(0, resizedWidth - 1));
          const clampedCropY = Math.min(cropY, Math.max(0, resizedHeight - 1));
          const clampedCropW = Math.min(cropW, resizedWidth - clampedCropX);
          const clampedCropH = Math.min(cropH, resizedHeight - clampedCropY);

          actions = [
            { resize: { width: resizedWidth } },
            { crop: { originX: clampedCropX, originY: clampedCropY, width: clampedCropW, height: clampedCropH } },
          ];
        }
        actions.push({ resize: { width: 1080 } });

        const manipulated = await ImageManipulator.manipulateAsync(
          imageUri,
          actions,
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );
        manipulatedUri = manipulated.uri;

        const fileUrl = await uploadService.uploadFile(manipulated.uri, 'image');
        navigation.navigate(nextScreen, { imageUrl: fileUrl });
    } catch (e) {
        console.error(e);
        navigation.navigate(nextScreen, { imageUrl: manipulatedUri, isLocal: true });
    } finally {
        setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-black relative">
       {/* Header */}
       <View className="h-[72px] px-8 flex-row items-center justify-between bg-black/50 z-20 top-0 absolute w-full">
            <Text className="text-xl font-bold text-white">{title || '裁剪图片'}</Text>
            <TouchableOpacity onPress={() => navigation.goBack()}>
                <Text className="text-gray-300 text-lg">重拍</Text>
            </TouchableOpacity>
       </View>

       {/* Image Area */}
       <View className="flex-1 items-center justify-center">
            <View
              className="w-full h-[70%] items-center justify-center"
              onLayout={(event) => {
                const { width: w, height: h } = event.nativeEvent.layout;
                setContainerSize({ width: w, height: h });
              }}
              style={{ position: 'relative' }}
              pointerEvents="box-none"
            >
              <Image
                source={{ uri: imageUri }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
                onLoad={(event) => {
                  const { width: w, height: h } = event.nativeEvent.source;
                  if (w && h) {
                    setImageSize({ width: w, height: h });
                  }
                }}
                pointerEvents="none"
              />
              {cropRect && (
                <>
                  {/* Crop frame - for moving */}
                  <View
                    style={{
                      position: 'absolute',
                      left: cropRect.x,
                      top: cropRect.y,
                      width: cropRect.width,
                      height: cropRect.height,
                      borderWidth: 2,
                      borderColor: 'white',
                    }}
                    collapsable={false}
                    {...moveResponder.panHandlers}
                  >
                    {/* Grid */}
                    <View className="flex-1 border-r border-white/30 w-1/3 absolute h-full left-1/3" pointerEvents="none" />
                    <View className="flex-1 border-r border-white/30 w-1/3 absolute h-full left-2/3" pointerEvents="none" />
                    <View className="flex-1 border-b border-white/30 h-1/3 absolute w-full top-1/3" pointerEvents="none" />
                    <View className="flex-1 border-b border-white/30 h-1/3 absolute w-full top-2/3" pointerEvents="none" />
                  </View>
                  {/* Resize Handle - separate sibling so it can capture touches independently */}
                  <View
                    style={{
                      position: 'absolute',
                      left: cropRect.x + cropRect.width - 16,
                      top: cropRect.y + cropRect.height - 16,
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: '#3B82F6',
                    }}
                    hitSlop={{ top: 16, left: 16, right: 16, bottom: 16 }}
                    collapsable={false}
                    {...resizeResponder.panHandlers}
                  />
                </>
              )}
            </View>
            {__DEV__ && cropRect && imageBounds && (
              <View className="absolute left-4 bottom-4 bg-black/60 px-3 py-2 rounded-lg">
                <Text className="text-white text-xs">
                  rect {Math.round(cropRect.x)},{Math.round(cropRect.y)} {Math.round(cropRect.width)}x{Math.round(cropRect.height)}
                </Text>
                <Text className="text-white text-xs">
                  bounds {Math.round(imageBounds.x)},{Math.round(imageBounds.y)} {Math.round(imageBounds.width)}x{Math.round(imageBounds.height)}
                </Text>
              </View>
            )}
            <Text className="absolute bottom-32 text-white/50">拖动边框移动，拖动右下角调整范围</Text>
       </View>

       {/* Footer */}
       <View className="h-[100px] bg-black/80 justify-center items-center pb-4 absolute bottom-0 w-full">
            <TouchableOpacity 
                onPress={handleConfirm}
                disabled={loading}
                className="h-[60px] px-16 bg-blue-600 rounded-full justify-center items-center"
            >
                {loading ? <ActivityIndicator color="white" /> : <Text className="text-white text-xl font-bold">确认裁剪</Text>}
            </TouchableOpacity>
       </View>
    </View>
  );
};

export default CropScreen;
