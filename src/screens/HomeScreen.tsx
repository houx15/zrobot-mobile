import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LogOut, Settings, Pencil, Camera, ClipboardCheck, Bot, CheckCircle, RefreshCw, Usb } from 'lucide-react-native';
import Layout from '../components/Layout';
import { authService } from '../services/api';
import { useCamera, getCameraLabel } from '../contexts/CameraContext';

const HomeScreen = () => {
  const navigation = useNavigation<any>();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const {
    devices,
    selectedDevice,
    selectedDeviceId,
    selectDevice,
    hasPermission,
    requestPermission,
    isLoading,
    refreshDevices,
  } = useCamera();

  const handleLogout = async () => {
    await authService.logout();
    setShowLogoutModal(false);
    navigation.replace('Login');
  };

  const navTo = async (screen: string) => {
    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) {
        Alert.alert('需要权限', '请允许访问摄像头以使用此功能');
        return;
      }
    }
    if (!selectedDevice) {
      Alert.alert('未选择摄像头', '请在设置中选择一个摄像头');
      setShowSettingsModal(true);
      return;
    }
    navigation.navigate(screen);
  };

  const handleSelectCamera = async (deviceId: string) => {
    await selectDevice(deviceId);
  };

  const handleOpenSettings = async () => {
    if (!hasPermission) {
      await requestPermission();
    }
    setShowSettingsModal(true);
  };

  return (
    <Layout>
      {/* Top Bar */}
      <View className="absolute top-0 w-full p-6 flex-row justify-end space-x-6 z-10">
        <TouchableOpacity
          onPress={handleOpenSettings}
          className="p-3 bg-white/80 rounded-full shadow-sm"
        >
          <Settings color="#4B5563" size={28} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowLogoutModal(true)}
          className="p-3 bg-white/80 rounded-full shadow-sm"
        >
          <LogOut color="#4B5563" size={28} />
        </TouchableOpacity>
      </View>

      {/* Main Content - Grid */}
      <View className="flex-1 items-center justify-center px-8 flex-row">

        {/* Card 0: Do Homework */}
        <TouchableOpacity
          onPress={() => navigation.navigate('DoHomework')}
          className="w-[220px] h-[200px] bg-[#FA8C16] rounded-[24px] shadow-xl shadow-orange-200 items-center justify-center active:scale-95 mx-3"
        >
          <View className="mb-4">
            <Pencil size={48} color="white" />
          </View>
          <Text className="text-2xl font-bold tracking-wide text-white mt-4">写作业</Text>
        </TouchableOpacity>

        {/* Card 1: Question Answering */}
        <TouchableOpacity
          onPress={() => navTo('QuestionCamera')}
          className="w-[220px] h-[200px] bg-[#4A90D9] rounded-[24px] shadow-xl shadow-blue-200 items-center justify-center active:scale-95 mx-3"
        >
          <View className="mb-4">
            <Camera size={48} color="white" />
          </View>
          <Text className="text-2xl font-bold tracking-wide text-white mt-4">题目答疑</Text>
        </TouchableOpacity>

        {/* Card 2: Homework Correction */}
        <TouchableOpacity
          onPress={() => navTo('HomeworkCamera')}
          className="w-[220px] h-[200px] bg-[#52C41A] rounded-[24px] shadow-xl shadow-green-200 items-center justify-center active:scale-95 mx-3"
        >
          <View className="mb-4">
            <ClipboardCheck size={48} color="white" />
          </View>
          <Text className="text-2xl font-bold tracking-wide text-white mt-4">作业批改</Text>
        </TouchableOpacity>

        {/* Card 3: AI Teacher */}
        <TouchableOpacity
          onPress={() => navigation.navigate('AITeacher')}
          className="w-[220px] h-[200px] bg-[#722ED1] rounded-[24px] shadow-xl shadow-purple-200 items-center justify-center active:scale-95 mx-3"
        >
          <View className="mb-4">
            <Bot size={48} color="white" />
          </View>
          <Text className="text-2xl font-bold tracking-wide text-white mt-4">AI 老师</Text>
        </TouchableOpacity>
      </View>

      {/* Logout Modal */}
      <Modal transparent visible={showLogoutModal} animationType="fade">
        <View className="flex-1 bg-black/40 items-center justify-center">
          <View className="bg-white w-[400px] rounded-3xl p-8 shadow-2xl items-center">
            <View className="w-20 h-20 bg-red-100 rounded-full items-center justify-center mb-6">
              <LogOut color="#EF4444" size={40} />
            </View>
            <Text className="text-2xl font-bold text-gray-800 mb-2">退出登录</Text>
            <Text className="text-gray-500 mb-8 text-lg">真的要退出当前账号吗？</Text>

            <View className="flex-row w-full space-x-4">
              <TouchableOpacity
                onPress={() => setShowLogoutModal(false)}
                className="flex-1 py-4 rounded-xl bg-gray-100 items-center"
              >
                <Text className="font-bold text-gray-600">取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleLogout}
                className="flex-1 py-4 rounded-xl bg-red-500 items-center shadow-lg shadow-red-200"
              >
                <Text className="font-bold text-white">退出</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Settings Modal with Camera Selection */}
      <Modal transparent visible={showSettingsModal} animationType="fade">
        <View className="flex-1 bg-black/40 items-center justify-center">
          <View className="bg-white w-[550px] rounded-3xl p-8 shadow-2xl max-h-[80%]">
            {/* Header */}
            <View className="flex-row items-center justify-between mb-6">
              <View className="flex-row items-center space-x-3">
                <View className="p-3 bg-gray-100 rounded-full">
                  <Settings color="#374151" size={28} />
                </View>
                <Text className="text-2xl font-bold text-gray-800 ml-3">设置</Text>
              </View>
              <TouchableOpacity
                onPress={refreshDevices}
                className="p-2 bg-gray-100 rounded-full"
              >
                <RefreshCw color="#6B7280" size={20} />
              </TouchableOpacity>
            </View>

            {/* Camera Selection */}
            <View className="mb-6">
              <Text className="text-lg font-semibold text-gray-700 mb-3">选择摄像头</Text>

              {isLoading ? (
                <View className="py-8 items-center">
                  <ActivityIndicator size="large" color="#3B82F6" />
                  <Text className="text-gray-500 mt-2">正在加载摄像头...</Text>
                </View>
              ) : !hasPermission ? (
                <View className="py-6 items-center bg-yellow-50 rounded-xl">
                  <Text className="text-yellow-700 mb-3">需要摄像头权限才能查看设备列表</Text>
                  <TouchableOpacity
                    onPress={requestPermission}
                    className="px-6 py-2 bg-yellow-500 rounded-lg"
                  >
                    <Text className="text-white font-bold">授权摄像头</Text>
                  </TouchableOpacity>
                </View>
              ) : devices.length === 0 ? (
                <View className="py-6 items-center bg-gray-50 rounded-xl">
                  <Text className="text-gray-500">未检测到摄像头</Text>
                  <Text className="text-gray-400 text-sm mt-1">请确保设备已连接</Text>
                </View>
              ) : (
                <ScrollView className="max-h-[300px]">
                  {devices.map((device) => {
                    const isSelected = device.id === selectedDeviceId;
                    const isExternal = device.position === 'external';

                    return (
                      <TouchableOpacity
                        key={device.id}
                        onPress={() => handleSelectCamera(device.id)}
                        className={`flex-row items-center p-4 rounded-xl mb-2 border-2 ${
                          isSelected
                            ? 'bg-blue-50 border-blue-500'
                            : 'bg-gray-50 border-transparent'
                        }`}
                      >
                        {/* Icon */}
                        <View className={`w-12 h-12 rounded-full items-center justify-center mr-4 ${
                          isExternal ? 'bg-green-100' : 'bg-gray-200'
                        }`}>
                          {isExternal ? (
                            <Usb color="#22C55E" size={24} />
                          ) : (
                            <Camera color="#6B7280" size={24} />
                          )}
                        </View>

                        {/* Info */}
                        <View className="flex-1">
                          <Text className={`font-semibold ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                            {getCameraLabel(device)}
                          </Text>
                          <Text className="text-gray-500 text-sm">
                            {device.position === 'external' ? 'USB/外接摄像头' :
                             device.position === 'front' ? '前置摄像头' :
                             device.position === 'back' ? '后置摄像头' : '其他'}
                          </Text>
                        </View>

                        {/* Selected indicator */}
                        {isSelected && (
                          <View className="w-8 h-8 bg-blue-500 rounded-full items-center justify-center">
                            <CheckCircle color="white" size={20} />
                          </View>
                        )}

                        {/* USB badge */}
                        {isExternal && !isSelected && (
                          <View className="px-2 py-1 bg-green-100 rounded-full">
                            <Text className="text-green-700 text-xs font-bold">USB</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {/* Current Selection Info */}
            {selectedDevice && (
              <View className="mb-6 p-4 bg-blue-50 rounded-xl">
                <Text className="text-blue-800 font-medium">
                  当前选择: {getCameraLabel(selectedDevice)}
                </Text>
                {selectedDevice.position === 'external' && (
                  <Text className="text-blue-600 text-sm mt-1">
                    已自动选择USB摄像头
                  </Text>
                )}
              </View>
            )}

            {/* Close Button */}
            <TouchableOpacity
              onPress={() => setShowSettingsModal(false)}
              className="py-4 rounded-xl bg-blue-600 items-center"
            >
              <Text className="font-bold text-white text-lg">完成</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Layout>
  );
};

export default HomeScreen;
