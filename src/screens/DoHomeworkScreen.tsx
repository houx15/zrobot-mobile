import React, { useRef, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NotebookPen, CheckCircle, Clock } from 'lucide-react-native';
import Layout from '../components/Layout';
import { studyService } from '../services/api';

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const DoHomeworkScreen = () => {
  const navigation = useNavigation<any>();
  const startTimeRef = useRef<number>(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);

  // Timer display
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Submit study record (only if duration >= 60 seconds)
  const submitStudyRecord = async (abstract: string) => {
    const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
    if (duration < 60) return; // Skip if less than 60 seconds

    try {
      await studyService.record('homework', duration, abstract);
      // Reset timer after successful submission
      startTimeRef.current = Date.now();
      setElapsedTime(0);
    } catch (e) {
      console.error('Failed to submit study record:', e);
    }
  };

  // Handle complete - go to homework camera
  const handleComplete = async () => {
    await submitStudyRecord('写作业完成');
    navigation.navigate('HomeworkCamera');
  };

  // Handle back - return to home
  const handleBack = async () => {
    const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);

    if (duration >= 60) {
      // If studied for more than 1 minute, confirm before leaving
      Alert.alert(
        '确认退出',
        `你已经学习了 ${formatTime(duration)}，确定要退出吗？`,
        [
          { text: '继续学习', style: 'cancel' },
          {
            text: '退出',
            style: 'destructive',
            onPress: async () => {
              await submitStudyRecord('写作业中途退出');
              navigation.navigate('Home');
            }
          }
        ]
      );
    } else {
      // Less than 60 seconds, just go back without submitting
      navigation.navigate('Home');
    }
  };

  return (
    <Layout onBack={handleBack} title="专心写作业">
        <View className="flex-1 items-center justify-center pb-10">
            {/* Timer Display */}
            <View className="absolute top-4 right-8 flex-row items-center space-x-2 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100">
                <Clock size={20} color="#F97316" />
                <Text className="text-xl font-bold text-orange-500">{formatTime(elapsedTime)}</Text>
            </View>

            <View className="relative mb-12">
                 <View className="w-[300px] h-[300px] bg-orange-100 rounded-full items-center justify-center">
                     <NotebookPen size={120} color="#F97316" />
                 </View>
                 <View className="absolute -right-4 -top-4 bg-white px-6 py-3 rounded-2xl shadow-lg border border-gray-100">
                     <Text className="text-2xl font-bold text-orange-500">加油！</Text>
                 </View>
            </View>

            <Text className="text-2xl font-bold text-gray-700 mb-2">正在专注模式...</Text>
            <Text className="text-gray-400 mb-12">遇到不会的题目先跳过，最后再来问我哦</Text>

            <TouchableOpacity
                onPress={handleComplete}
                className="w-[280px] h-[80px] bg-orange-400 rounded-full flex-row items-center justify-center space-x-3 shadow-lg shadow-orange-200 active:scale-95"
            >
                <CheckCircle size={36} color="white" />
                <Text className="text-white text-3xl font-bold">我完成啦</Text>
            </TouchableOpacity>
        </View>
    </Layout>
  );
};

export default DoHomeworkScreen;