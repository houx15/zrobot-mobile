/**
 * Camera Context
 * Manages camera device selection and persists the preference
 * Auto-selects USB/external camera if available
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Camera, CameraDevice, useCameraDevices } from 'react-native-vision-camera';
import * as SecureStore from 'expo-secure-store';

const CAMERA_PREFERENCE_KEY = 'selected_camera_id';

interface CameraContextType {
  devices: CameraDevice[];
  selectedDevice: CameraDevice | undefined;
  selectedDeviceId: string | null;
  selectDevice: (deviceId: string) => Promise<void>;
  hasPermission: boolean;
  requestPermission: () => Promise<boolean>;
  isLoading: boolean;
  refreshDevices: () => void;
}

const CameraContext = createContext<CameraContextType | undefined>(undefined);

export const CameraProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const devices = useCameraDevices();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize: check permission and load saved preference
  useEffect(() => {
    initializeCamera();
  }, []);

  // Auto-select USB camera when devices change
  useEffect(() => {
    if (devices.length > 0 && !selectedDeviceId) {
      autoSelectCamera();
    }
  }, [devices, selectedDeviceId]);

  const initializeCamera = async () => {
    setIsLoading(true);
    try {
      // Check permission
      const status = await Camera.getCameraPermissionStatus();
      setHasPermission(status === 'granted');

      // Load saved preference
      const savedId = await SecureStore.getItemAsync(CAMERA_PREFERENCE_KEY);
      if (savedId) {
        setSelectedDeviceId(savedId);
      }
    } catch (e) {
      console.error('[CameraContext] Init error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const autoSelectCamera = async () => {
    // Priority: 1. Saved preference, 2. External/USB camera, 3. Back camera, 4. Any camera
    const savedId = await SecureStore.getItemAsync(CAMERA_PREFERENCE_KEY);

    if (savedId) {
      const savedDevice = devices.find(d => d.id === savedId);
      if (savedDevice) {
        setSelectedDeviceId(savedId);
        return;
      }
    }

    // Look for external/USB camera (position === 'external')
    const externalCamera = devices.find(d => d.position === 'external');
    if (externalCamera) {
      console.log('[CameraContext] Auto-selected USB camera:', externalCamera.name);
      await selectDevice(externalCamera.id);
      return;
    }

    // Fall back to back camera
    const backCamera = devices.find(d => d.position === 'back');
    if (backCamera) {
      setSelectedDeviceId(backCamera.id);
      return;
    }

    // Any available camera
    if (devices.length > 0) {
      setSelectedDeviceId(devices[0].id);
    }
  };

  const selectDevice = useCallback(async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    await SecureStore.setItemAsync(CAMERA_PREFERENCE_KEY, deviceId);
    console.log('[CameraContext] Selected camera:', deviceId);
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const status = await Camera.requestCameraPermission();
    const granted = status === 'granted';
    setHasPermission(granted);
    return granted;
  }, []);

  const refreshDevices = useCallback(() => {
    // Trigger re-render to refresh device list
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 100);
  }, []);

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  return (
    <CameraContext.Provider
      value={{
        devices,
        selectedDevice,
        selectedDeviceId,
        selectDevice,
        hasPermission,
        requestPermission,
        isLoading,
        refreshDevices,
      }}
    >
      {children}
    </CameraContext.Provider>
  );
};

export const useCamera = (): CameraContextType => {
  const context = useContext(CameraContext);
  if (!context) {
    throw new Error('useCamera must be used within a CameraProvider');
  }
  return context;
};

// Helper to get camera type label
export const getCameraLabel = (device: CameraDevice): string => {
  if (device.position === 'external') {
    return `USB: ${device.name || 'External Camera'}`;
  }
  if (device.position === 'front') {
    return `Front: ${device.name || 'Front Camera'}`;
  }
  if (device.position === 'back') {
    return `Back: ${device.name || 'Rear Camera'}`;
  }
  return device.name || 'Unknown Camera';
};
