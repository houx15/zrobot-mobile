import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { GraduationCap, Smartphone, Lock, Check } from 'lucide-react-native';
import Layout from '../components/Layout';
import { authService } from '../services/api';

const LoginScreen = () => {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(true);

  // Check existing auth and load saved credentials on mount
  useEffect(() => {
    checkAuthAndLoadCredentials();
  }, []);

  const checkAuthAndLoadCredentials = async () => {
    try {
      // First check if user is already logged in with valid token
      const authStatus = await authService.checkAuthStatus();
      if (authStatus.isLoggedIn) {
        // User has valid token, navigate directly
        if (authStatus.isBound) {
          navigation.replace('Home');
        } else {
          navigation.replace('Bind');
        }
        return;
      }

      // Not logged in, load saved credentials for auto-fill
      const savedCredentials = await authService.getSavedCredentials();
      if (savedCredentials) {
        setPhone(savedCredentials.phone);
        setPassword(savedCredentials.password);
      }
    } catch (e) {
      console.error('[LoginScreen] Auth check error:', e);
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleLogin = async () => {
    if (!agreed) {
        Alert.alert('提示', '请先阅读并同意用户协议');
        return;
    }
    if (!phone || !password) {
        Alert.alert('提示', '请输入手机号和密码');
        return;
    }
    setLoading(true);
    try {
        // In a real device, get actual ID
        const deviceId = 'tablet_mock_001';
        const res = await authService.login(phone, password, deviceId);

        // Save credentials for next time
        await authService.saveCredentials(phone, password);

        if (res.is_bindded) {
            navigation.replace('Home');
        } else {
            navigation.replace('Bind');
        }
    } catch (error: any) {
        Alert.alert('登录失败', error.message || '未知错误');
    } finally {
        setLoading(false);
    }
  };

  // Show loading while checking auth status
  if (checkingAuth) {
    return (
      <Layout className="items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#2563EB" />
        <Text className="text-gray-500 mt-4">正在检查登录状态...</Text>
      </Layout>
    );
  }

  return (
    <Layout className="items-center justify-center bg-white">
      <View className="flex-col items-center" style={{ width: '100%', paddingHorizontal: 80, marginTop: 60 }}>
        <View className="h-24 w-24 bg-blue-100 rounded-3xl items-center justify-center mb-6">
          <GraduationCap size={48} color="#2563EB" />
        </View>
        <Text className="text-3xl font-bold text-gray-800 mb-2">Z.Robot 伴学机器人</Text>
        <Text className="text-gray-500 mb-10 text-lg">你的专属AI学习伙伴</Text>

        <View style={{ width: 500, alignItems: 'center' }}>
          <View
            className="bg-gray-50 rounded-2xl border border-gray-200 flex-row items-center mb-4"
            style={{ width: '100%', paddingHorizontal: 24, paddingVertical: 20 }}
          >
            <View className="mr-4">
                <Smartphone size={28} color="#9CA3AF" />
            </View>
            <TextInput
                placeholder="请输入手机号"
                className="flex-1 text-lg"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholderTextColor="#9CA3AF"
            />
          </View>

          <View
            className="bg-gray-50 rounded-2xl border border-gray-200 flex-row items-center justify-between"
            style={{ width: '100%', paddingHorizontal: 24, paddingVertical: 20 }}
          >
            <View className="flex-row items-center flex-1">
                <View className="mr-4">
                    <Lock size={28} color="#9CA3AF" />
                </View>
                <TextInput
                    placeholder="验证码"
                    className="flex-1 text-lg"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    placeholderTextColor="#9CA3AF"
                />
            </View>
            <TouchableOpacity className="ml-4">
                <Text className="text-blue-500 font-medium text-base">获取验证码</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            className="bg-blue-600 rounded-2xl items-center justify-center shadow-lg shadow-blue-200 active:scale-95"
            style={{ width: '100%', height: 64, marginTop: 40 }}
          >
            {loading ? <ActivityIndicator color="white" /> : <Text className="text-white text-xl font-bold">登 录</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            className="flex-row items-center justify-center"
            style={{ width: '100%', marginTop: 24 }}
            onPress={() => setAgreed(!agreed)}
          >
            <View className={`w-5 h-5 border-2 border-gray-300 rounded mr-2 items-center justify-center ${agreed ? 'bg-blue-500 border-blue-500' : ''}`}>
                {agreed && <Check size={12} color="white" />}
            </View>
            <Text className="text-base text-gray-400">已阅读并同意《用户协议》</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Layout>
  );
};

export default LoginScreen;
