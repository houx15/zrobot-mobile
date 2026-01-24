import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { FileQuestion, CheckCircle, XCircle, Lightbulb } from 'lucide-react-native';
import Layout from '../components/Layout';
import { BoardRenderer } from '../components/BoardRenderer';
import { questionService } from '../services/api';

const HomeworkDetailScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { id } = route.params;
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => {
    fetchDetail();
  }, []);

  const fetchDetail = async () => {
    try {
        const res = await questionService.getDetail(id);
        setDetail(res.data);
    } catch (e) {
        // Mock
        setDetail({
            id: id,
            question_text: "一元二次方程 (3x-1)²=5x 化简为一般式后，二次项系数为9，其一次项系数为()\nA. 1  B. -1  C. -11  D. 11",
            user_answer: "A",
            correct_answer: "C",
            is_correct: false,
        });
    } finally {
        setLoading(false);
    }
  };

  if (loading) return <Layout><ActivityIndicator /></Layout>;
  if (!detail) return null;

  return (
    <Layout title={`第${detail.question_index || '?'}题详情`} onBack={() => navigation.goBack()}>
        <ScrollView className="flex-1 px-8 py-8">
            <View className="max-w-3xl mx-auto w-full space-y-6">
                
                {/* Question Content */}
                <View className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    <View className="flex-row items-center space-x-2 mb-4">
                        <FileQuestion size={20} color="#6B7280" />
                        <Text className="font-bold text-gray-500">题目内容</Text>
                    </View>
                    <View className="bg-gray-50 p-6 rounded-2xl">
                         <BoardRenderer markup={detail.question_text || ''} title="【题目】" />
                    </View>
                </View>

                <View className="flex-row space-x-6">
                    {/* User Answer */}
                    <View className={`flex-1 p-6 rounded-3xl border-2 ${detail.is_correct ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                         <View className="flex-row items-center space-x-2 mb-2">
                             {detail.is_correct ? (
                                <CheckCircle size={24} color="#22C55E" />
                             ) : (
                                <XCircle size={24} color="#EF4444" />
                             )}
                             <Text className="font-bold text-gray-500">你的答案</Text>
                         </View>
                         <Text className="text-2xl font-bold text-gray-800">{detail.user_answer}</Text>
                    </View>

                    {/* Correct Answer */}
                    <View className="flex-1 bg-white p-6 rounded-3xl border border-gray-200">
                         <View className="flex-row items-center space-x-2 mb-2">
                            <CheckCircle size={24} color="#22C55E" />
                            <Text className="font-bold text-gray-500">正确答案</Text>
                         </View>
                         <Text className="text-2xl font-bold text-green-600">{detail.correct_answer}</Text>
                    </View>
                </View>

                <TouchableOpacity 
                    onPress={() => navigation.navigate('QuestionSolution', { questionData: detail })}
                    className="w-full bg-blue-600 h-[72px] rounded-2xl flex-row items-center justify-center space-x-3 shadow-lg shadow-blue-200 mt-8 active:scale-95"
                >
                    <Lightbulb size={28} color="white" />
                    <Text className="text-white text-2xl font-bold">去答疑</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    </Layout>
  );
};

export default HomeworkDetailScreen;
