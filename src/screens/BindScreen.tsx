import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { RefreshCcw } from 'lucide-react-native';
import Layout from '../components/Layout';
import { bindService, authService } from '../services/api';

const BindScreen = () => {
  const navigation = useNavigation<any>();
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadQrCode();

    // Poll for status every 3 seconds
    const interval = setInterval(async () => {
        try {
            const status = await bindService.checkStatus();
            if (status.is_bindded) {
                if (pollRef.current) {
                    clearInterval(pollRef.current);
                }
                // Update stored user info with binding status
                await authService.updateBindingStatus(true);
                navigation.replace('Home');
            }
        } catch (e) {
            console.log('Polling error', e);
        }
    }, 3000);
    pollRef.current = interval;

    return () => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
        }
    };
  }, []);

  const loadQrCode = async () => {
      try {
          const res = await bindService.getQRCode();
          setQrCodeUrl(res.data.qrcode_url); 
      } catch (e) {
          console.error(e);
      }
  };

  const skipBind = async () => {
      if (pollRef.current) {
          clearInterval(pollRef.current);
      }
      await authService.updateBindingStatus(false);
      navigation.replace('Home');
  };

  return (
    <Layout className="items-center justify-center bg-white">
      <View className="flex-col items-center" style={{ marginTop: 60 }}>
        <Text className="text-2xl font-bold mb-8">绑定家长账户</Text>
        <View className="w-[280px] h-[280px] border-4 border-gray-100 rounded-3xl p-4 mb-6 items-center justify-center">
            {qrCodeUrl ? (
                <Image 
                    source={{ uri: qrCodeUrl }} 
                    className="w-full h-full opacity-80" 
                    resizeMode="contain"
                />
            ) : (
                <Text className="text-gray-400">加载中...</Text>
            )}
        </View>
        <Text className="text-gray-500 text-lg mb-2">请使用微信扫描二维码绑定</Text>
        <Text className="text-gray-400 text-sm mb-8">二维码有效期：5分钟</Text>
        
        <TouchableOpacity 
            onPress={loadQrCode}
            className="flex-row items-center space-x-2 bg-blue-50 px-6 py-2 rounded-full"
        >
            <RefreshCcw size={20} color="#2563EB" />
            <Text className="text-blue-600 font-medium ml-2">刷新二维码</Text>
        </TouchableOpacity>

        <TouchableOpacity
            onPress={skipBind}
            className="mt-4 px-6 py-2 rounded-full border border-gray-200"
        >
            <Text className="text-gray-500 font-medium">跳过</Text>
        </TouchableOpacity>
      </View>
    </Layout>
  );
};

export default BindScreen;
