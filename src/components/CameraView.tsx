/**
 * CameraView Component
 * Uses react-native-vision-camera for full device control including USB cameras
 */

import React, { useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Dimensions, StyleSheet } from 'react-native';
import { Camera, PhotoFile } from 'react-native-vision-camera';
import { Camera as CameraIcon, RotateCcw } from 'lucide-react-native';
import { useCamera } from '../contexts/CameraContext';

interface CameraViewProps {
  onCapture: (uri: string) => void;
  overlayText: string;
  buttonText: string;
  loading?: boolean;
}

const CameraView: React.FC<CameraViewProps> = ({ onCapture, overlayText, buttonText, loading }) => {
  const cameraRef = useRef<Camera>(null);
  const {
    devices,
    selectedDevice,
    selectDevice,
    hasPermission,
    requestPermission,
    isLoading,
  } = useCamera();
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const frameWidth = screenWidth * 0.7;
  const frameHeight = screenHeight * 0.6;
  const frameLeft = (screenWidth - frameWidth) / 2;
  const frameTop = (screenHeight - frameHeight) / 2;

  // Switch to next camera in the list
  const toggleCamera = useCallback(() => {
    if (devices.length <= 1 || !selectedDevice) return;

    const currentIndex = devices.findIndex(d => d.id === selectedDevice.id);
    const nextIndex = (currentIndex + 1) % devices.length;
    selectDevice(devices[nextIndex].id);
  }, [devices, selectedDevice, selectDevice]);

  const takePicture = async () => {
    if (!cameraRef.current || loading) return;

    try {
      const photo: PhotoFile = await cameraRef.current.takePhoto({
        qualityPrioritization: 'balanced',
      });
      onCapture(`file://${photo.path}`);
    } catch (e) {
      console.error('[CameraView] Take picture error:', e);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="white" />
        <Text className="text-white mt-4">正在加载摄像头...</Text>
      </View>
    );
  }

  // Permission not granted
  if (!hasPermission) {
    return (
      <View className="flex-1 bg-black items-center justify-center p-8">
        <Text className="text-white text-center text-lg mb-4">需要摄像头权限</Text>
        <TouchableOpacity
          onPress={requestPermission}
          className="bg-blue-500 px-6 py-3 rounded-xl"
        >
          <Text className="text-white font-bold">授权摄像头</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // No camera available
  if (!selectedDevice) {
    return (
      <View className="flex-1 bg-black items-center justify-center p-8">
        <Text className="text-white text-center text-lg mb-2">未检测到摄像头</Text>
        <Text className="text-gray-400 text-center">请在设置中选择摄像头或连接USB摄像头</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black relative">
      <Camera
        ref={cameraRef}
        style={{ flex: 1 }}
        device={selectedDevice}
        isActive={true}
        photo={true}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top Overlay (camera name) */}
        <View style={styles.topCenter}>
          <View className="bg-black/30 px-4 py-1 rounded-full mt-2">
            <Text className="text-white/70 text-sm">
              {selectedDevice.position === 'external' ? 'USB: ' : ''}
              {selectedDevice.name || '摄像头'}
            </Text>
          </View>
        </View>

        {/* Viewfinder Frame */}
        <View
          className="absolute border-2 border-white/50 rounded-3xl items-center justify-center"
          style={{ width: frameWidth, height: frameHeight, left: frameLeft, top: frameTop }}
        >
          <View className="w-full h-[1px] bg-white/20 absolute top-1/2" />
          <View className="h-full w-[1px] bg-white/20 absolute left-1/2" />
        </View>

        {/* Bottom Controls */}
        <View style={styles.bottom}>
          <View className="items-center mb-4">
            <View className="bg-black/40 px-6 py-2 rounded-full">
              <Text className="text-white text-lg">{overlayText}</Text>
            </View>
          </View>
          <View className="w-full flex-row items-center">
          <View className="flex-1 items-center">
            {devices.length > 1 && (
              <TouchableOpacity
                onPress={toggleCamera}
                className="p-4 bg-white/20 rounded-full"
              >
                <RotateCcw color="white" size={24} />
              </TouchableOpacity>
            )}
          </View>

          <View className="flex-1 items-center">
            <TouchableOpacity
              onPress={takePicture}
              disabled={loading}
              className={`
                h-[80px] px-12 rounded-full shadow-lg flex-row items-center space-x-4
                ${loading ? 'bg-gray-500' : 'bg-blue-600'}
              `}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <CameraIcon color="white" size={32} />
                  <Text className="text-white text-2xl font-bold ml-2">{buttonText}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View className="flex-1 items-center">
            {/* Keep column for symmetry */}
            <View className="w-12 h-12" />
          </View>
          </View>
        </View>
      </View>
    </View>
  );
};

export default CameraView;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  topCenter: {
    position: 'absolute',
    top: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
});
