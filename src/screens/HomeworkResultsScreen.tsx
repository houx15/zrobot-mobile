import React, { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CheckCircle, XCircle, BarChart3, BookOpen, Check, X } from 'lucide-react-native';
import Layout from '../components/Layout';
import { homeworkService } from '../services/api';

const HomeworkResultsScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { imageUrl } = route.params;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchCorrection();
  }, []);

  const fetchCorrection = async () => {
    try {
        const res = await homeworkService.submitCorrection(imageUrl);
        setData(res.data);
    } catch (e) {
        console.error(e);
        // Mock data
        setData({
            total_questions: 8,
            correct_count: 6,
            wrong_count: 2,
            results: Array.from({ length: 8 }).map((_, i) => ({
                question_index: i,
                question_detail_id: 1000 + i,
                is_correct: i !== 2 && i !== 6,
                question_bbox: [10, 10 + i * 10, 90, 10 + i * 10, 90, 20 + i * 10, 10, 20 + i * 10]
            }))
        });
    } finally {
        setLoading(false);
    }
  };

  if (loading) {
      return (
          <Layout title="批改结果" onBack={() => navigation.navigate('Home')}>
              <View className="flex-1 items-center justify-center">
                  <ActivityIndicator size="large" color="#2563EB" />
                  <Text className="mt-4 text-gray-500">正在智能批改中...</Text>
              </View>
          </Layout>
      );
  }

  if (!data) return null;

  return (
    <Layout title="批改结果" onBack={() => navigation.navigate('Home')}>
      <View className="flex-1 flex-row">
         {/* Left: Image */}
         <View className="w-1/2 bg-gray-900 justify-center items-center relative overflow-hidden">
             <Image 
                source={{ uri: imageUrl }} 
                className="w-full h-full" 
                resizeMode="contain" 
             />
             {/* Overlays would go here based on bbox coordinates */}
             {/* For demo, just showing image */}
             <View className="absolute bottom-6 left-6 bg-black/50 px-4 py-2 rounded-full">
                <Text className="text-white text-sm">原图批改预览</Text>
             </View>
         </View>

         {/* Right: Analysis */}
         <View className="w-1/2 bg-[#F5F7FA] border-l border-gray-200">
             <ScrollView contentContainerStyle={{ padding: 32 }}>
                
                {/* Summary Card */}
                <View className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 mb-8">
                    <View className="flex-row items-center mb-6 space-x-2">
                        <View>
                            <BarChart3 color="#2563EB" size={24} />
                        </View>
                        <Text className="text-xl font-bold text-gray-800">批改摘要</Text>
                    </View>

                    <View className="flex-row justify-between items-center mb-6">
                        <View className="items-center">
                            <Text className="text-gray-400 text-sm">总题数</Text>
                            <Text className="text-2xl font-bold">{data.total_questions}</Text>
                        </View>
                        <View className="items-center">
                            <Text className="text-gray-400 text-sm">正确</Text>
                            <View className="flex-row items-center space-x-1">
                                <Text className="text-2xl font-bold text-green-500">{data.correct_count}</Text>
                                <Check size={20} color="#22C55E" />
                            </View>
                        </View>
                        <View className="items-center">
                            <Text className="text-gray-400 text-sm">错误</Text>
                            <View className="flex-row items-center space-x-1">
                                <Text className="text-2xl font-bold text-red-500">{data.wrong_count}</Text>
                                <X size={20} color="#EF4444" />
                            </View>
                        </View>
                        <View className="items-center">
                            <Text className="text-gray-400 text-sm">正确率</Text>
                            <Text className="text-3xl font-bold text-blue-600">
                                {Math.round((data.correct_count / data.total_questions) * 100)}%
                            </Text>
                        </View>
                    </View>

                    <View className="bg-gray-50 p-4 rounded-xl">
                        <View className="flex-row items-center space-x-2 mb-2">
                             <View>
                                <BookOpen size={16} color="#6B7280" />
                             </View>
                             <Text className="text-gray-500 text-sm">本次考察知识点</Text>
                        </View>
                        <View className="flex-row flex-wrap gap-2">
                            <View className="px-3 py-1 bg-blue-50 rounded-lg">
                                <Text className="text-blue-600 text-sm font-medium">一元二次方程</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Grid */}
                <View className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
                    <Text className="text-gray-500 mb-6 font-medium text-lg">题目列表</Text>
                    <View className="flex-row flex-wrap gap-4">
                        {data.results.map((q: any) => (
                            <TouchableOpacity 
                                key={q.question_index}
                                onPress={() => navigation.navigate('HomeworkDetail', { id: q.question_detail_id })}
                                className={`
                                    w-16 h-16 rounded-2xl items-center justify-center shadow-md
                                    ${q.is_correct ? 'bg-[#52C41A]' : 'bg-[#F5222D]'}
                                `}
                            >
                                <Text className="text-white text-xl font-bold">{q.question_index + 1}</Text>
                                <View className="mt-1">
                                    {q.is_correct ? <CheckCircle size={16} color="white" /> : <XCircle size={16} color="white" />}
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <Text className="text-center text-gray-400 mt-8 text-sm">点击题号查看详细解析</Text>
                </View>

             </ScrollView>
         </View>
      </View>
    </Layout>
  );
};

export default HomeworkResultsScreen;

    
