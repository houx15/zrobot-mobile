import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Bot, User, Mic, CheckCircle, Volume2 } from 'lucide-react-native';
import Layout from '../components/Layout';
import { BoardRenderer } from '../components/BoardRenderer';
import { MathRichTextBlock, hasMathDelimiters } from '../components/MathRichTextBlock';
import { conversationService, questionService } from '../services/api';
import { useConversation } from '../hooks/useConversation';

const QuestionSolutionScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { imageUrl, questionData, questionHistoryId } = route.params || {};

  // Conversation setup state
  const [wsInfo, setWsInfo] = useState<{ conversationId: number; wsToken: string } | null>(null);
  const [isCreating, setIsCreating] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);
  const [resolvedQuestionHistoryId, setResolvedQuestionHistoryId] = useState<number | null>(
    questionHistoryId || questionData?.id || null
  );
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | undefined>(imageUrl || questionData?.question_image_url);
  const [resolvedQuestionText, setResolvedQuestionText] = useState<string | undefined>(questionData?.question_text);
  const creatingRef = useRef(false);
  const createSeqRef = useRef(0);

  // Create conversation on mount
  useEffect(() => {
    const createConversation = async () => {
      let seq = 0;
      try {
        if (creatingRef.current) {
          return;
        }
        creatingRef.current = true;
        createSeqRef.current += 1;
        seq = createSeqRef.current;
        setIsCreating(true);
        setCreateError(null);

        let finalQuestionHistoryId = resolvedQuestionHistoryId || questionHistoryId || questionData?.id || null;
        let finalImageUrl = resolvedImageUrl || imageUrl;
        let finalQuestionText = resolvedQuestionText || questionData?.question_text;

        // If we came from "题目答疑" (camera flow), submit solving first to get question text + history id.
        if (!finalQuestionHistoryId && imageUrl) {
          const solvingRes = await questionService.submitSolving(imageUrl);
          if (solvingRes.code === 0) {
            finalQuestionHistoryId = solvingRes.data.question_history_id;
            finalImageUrl = solvingRes.data.image_url || imageUrl;
            finalQuestionText = solvingRes.data.question_text;
            setResolvedQuestionHistoryId(finalQuestionHistoryId);
            setResolvedImageUrl(finalImageUrl);
            setResolvedQuestionText(finalQuestionText);
          } else {
            if (seq === createSeqRef.current) {
              setCreateError(solvingRes.message || '解题提交失败');
            }
            return;
          }
        }

        if (!finalQuestionHistoryId) {
          if (seq === createSeqRef.current) {
            setCreateError('缺少题目记录，请重新进入');
          }
          return;
        }

        const response = await conversationService.create('solving', finalQuestionHistoryId);

        if (response.code === 0) {
          if (seq === createSeqRef.current) {
            setWsInfo({
              conversationId: response.data.conversation_id,
              wsToken: response.data.token,
            });
          }
        } else {
          if (seq === createSeqRef.current) {
            setCreateError(response.message || 'Failed to create conversation');
          }
        }
      } catch (e: any) {
        console.error('[QuestionSolution] Create conversation error:', e);
        if (seq === createSeqRef.current) {
          setCreateError(e.message || 'Failed to create conversation');
        }
      } finally {
        if (seq === createSeqRef.current) {
          setIsCreating(false);
          creatingRef.current = false;
        }
      }
    };

    if (wsInfo?.conversationId && wsInfo.wsToken) {
      return;
    }
    createConversation();
  }, [questionHistoryId, resolvedQuestionHistoryId, imageUrl, wsInfo, questionData, resolvedImageUrl, resolvedQuestionText]);

  // Render loading state
  if (isCreating) {
    return (
      <Layout onBack={() => navigation.navigate('Home')} title="题目答疑">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text className="text-gray-500 mt-4">正在连接AI老师...</Text>
        </View>
      </Layout>
    );
  }

  // Render error state
  if (createError || !wsInfo?.conversationId || !wsInfo.wsToken) {
    return (
      <Layout onBack={() => navigation.navigate('Home')} title="题目答疑">
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-red-500 text-lg mb-4">{createError || '连接失败'}</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Home')}
            className="bg-blue-500 px-6 py-3 rounded-xl"
          >
            <Text className="text-white font-bold">返回首页</Text>
          </TouchableOpacity>
        </View>
      </Layout>
    );
  }

  // Render main content with conversation
  return (
    <QuestionSolutionContent
      conversationId={wsInfo.conversationId}
      wsToken={wsInfo.wsToken}
      imageUrl={resolvedImageUrl}
      questionData={questionData}
      questionText={resolvedQuestionText}
    />
  );
};

// Separate component for the main content (needs conversation hook)
interface ContentProps {
  conversationId: number;
  wsToken: string;
  imageUrl?: string;
  questionData?: any;
  questionText?: string;
}

const QuestionSolutionContent = ({ conversationId, wsToken, imageUrl, questionData, questionText }: ContentProps) => {
  const navigation = useNavigation<any>();

  // Use conversation hook
  const {
    state,
    boardMarkup,
    disconnect,
  } = useConversation({
    conversationId,
    wsToken,
    autoConnect: true,
    initialImageUrl: imageUrl,
    onError: useCallback((error: string) => {
      console.error('[QuestionSolution] Conversation error:', error);
    }, []),
  });

  const { status, aiText, aiFullText, userText, userFullText, closeReason } = state;

  // Handle complete - end conversation and go home
  const handleComplete = useCallback(async () => {
    try {
      await disconnect('complete');
      await conversationService.end(conversationId);
    } catch (e) {
      console.error('[QuestionSolution] End conversation error:', e);
    }
    navigation.navigate('Home');
  }, [conversationId, disconnect, navigation]);

  // Handle back
  const handleBack = useCallback(async () => {
    try {
      await disconnect('back');
      await conversationService.end(conversationId);
    } catch (e) {
      console.error('[QuestionSolution] End conversation error:', e);
    }
    navigation.navigate('Home');
  }, [conversationId, disconnect, navigation]);

  // Get status display info
  const getStatusInfo = () => {
    switch (status) {
      case 'listening':
        return { text: '正在听你说话...', color: '#22C55E' };
      case 'processing':
        return { text: '正在思考...', color: '#F59E0B' };
      case 'speaking':
        return { text: '正在为你解析...', color: '#3B82F6' };
      default:
        return { text: '有问题请开口问我', color: '#9CA3AF' };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <Layout onBack={handleBack} title="题目答疑">
      {/* Close Reason Banner */}
      {closeReason && (
        <View className="bg-amber-500 px-6 py-4">
          <Text className="text-white text-center font-medium">{closeReason}</Text>
          <View className="mt-2 flex-row justify-center space-x-3">
            <TouchableOpacity
              onPress={handleBack}
              className="bg-white/20 px-4 py-2 rounded-full"
            >
              <Text className="text-white font-bold">返回首页</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                await disconnect('banner_restart');
                await conversationService.end(conversationId);
                navigation.replace('QuestionSolution', { imageUrl });
              }}
              className="bg-white/20 px-4 py-2 rounded-full"
            >
              <Text className="text-white font-bold">重新开启对话</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View className="flex-1 flex-row p-6 space-x-6">
        {/* Left: Source */}
        <View className="w-5/12 bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <ScrollView contentContainerStyle={{ padding: 24 }}>
            <Text className="text-gray-500 font-bold mb-4">原题</Text>
            {imageUrl && (
              <View className="mb-6 rounded-xl overflow-hidden border border-gray-100 h-64">
                <Image
                  source={{ uri: imageUrl }}
                  className="w-full h-full"
                  resizeMode="contain"
                />
              </View>
            )}
            <View>
              <Text className="text-sm text-gray-400 mb-2">题目内容</Text>
              {questionText || questionData?.question_text ? (
                hasMathDelimiters(questionText || questionData.question_text) ? (
                  <MathRichTextBlock
                    text={questionText || questionData.question_text}
                    textColor="#1F2937"
                    fontSize={18}
                    lineHeight={28}
                  />
                ) : (
                  <Text className="text-xl font-medium text-gray-800 leading-relaxed">
                    {questionText || questionData.question_text}
                  </Text>
                )
              ) : (
                <Text className="text-xl font-medium text-gray-800 leading-relaxed">
                  正在识别图片中的题目内容...
                </Text>
              )}
            </View>
          </ScrollView>
        </View>

        {/* Right: Board */}
        <View className="w-7/12 flex-col bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          {/* AI Header */}
          <View className="p-4 flex-row items-start space-x-4 bg-gray-50/30 border-b border-gray-100">
            <View className="w-14 h-14 bg-blue-100 rounded-full items-center justify-center border-2 border-white shadow-sm">
              <Bot size={32} color="#2563EB" />
              {status === 'speaking' && (
                <View className="absolute -bottom-1 -right-1 bg-blue-500 w-5 h-5 rounded-full border-2 border-white items-center justify-center">
                  <Volume2 size={10} color="white" />
                </View>
              )}
            </View>
            <View className="bg-blue-50 p-4 rounded-2xl rounded-tl-none border border-blue-100 flex-1">
              <Text className="font-medium text-lg" style={{ color: statusInfo.color }}>
                {aiFullText || aiText || (status === 'processing' ? '（思考中）' : statusInfo.text)}
              </Text>
            </View>
          </View>

          {/* Board Area */}
          <ScrollView
            className="flex-1 bg-[#fffdf5] m-4 rounded-2xl border-2 border-orange-100"
            contentContainerStyle={{ padding: 24 }}
          >
            <Text className="text-gray-400 absolute top-4 right-4 text-xs">
              板书区
            </Text>

            {/* Render board content from segments */}
            {boardMarkup ? (
              <BoardRenderer markup={boardMarkup} title="【解题思路】" />
            ) : (
              <View className="items-center justify-center py-12">
                <Text className="text-gray-300 text-lg">
                  {status === 'processing' ? '正在思考...' : '板书内容将显示在这里'}
                </Text>
              </View>
            )}

            {/* Streaming indicator */}
            {status === 'speaking' && (
              <View
                style={{
                  marginTop: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 20,
                    backgroundColor: '#F97316',
                    marginRight: 4,
                  }}
                />
                <Text style={{ color: '#9CA3AF', fontSize: 14 }}>
                  正在书写...
                </Text>
              </View>
            )}
          </ScrollView>

          {/* User Footer */}
          <View className="p-4 flex-row items-center space-x-4 bg-gray-50/30 border-t border-gray-100 justify-end">
            <View className="bg-gray-100 p-4 rounded-2xl rounded-tr-none border border-gray-200 flex-1 items-end">
              <Text className="font-medium text-gray-700">
                {userFullText || userText || '你可以随时提问哦'}
              </Text>
            </View>
            <View className="w-14 h-14 bg-gray-200 rounded-full items-center justify-center border-2 border-white shadow-sm">
              <User size={28} color="#6B7280" />
              {status === 'listening' && (
                <View className="absolute -bottom-1 -right-1 bg-green-500 w-5 h-5 rounded-full border-2 border-white items-center justify-center">
                  <Mic size={10} color="white" />
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      <View className="px-6 pb-6 pt-2">
        <TouchableOpacity
          onPress={handleComplete}
          className="w-full h-[72px] rounded-2xl bg-blue-600 items-center justify-center flex-row space-x-3 shadow-lg active:scale-95"
        >
          <CheckCircle size={28} color="white" />
          <Text className="text-white text-2xl font-bold">完成答疑</Text>
        </TouchableOpacity>
      </View>
    </Layout>
  );
};

export default QuestionSolutionScreen;
