import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Phone, Bot, Volume2, User, Mic, BookOpen, Pencil } from 'lucide-react-native';
import Layout from '../components/Layout';
import { BoardRenderer } from '../components/BoardRenderer';
import { conversationService } from '../services/api';
import { useConversation } from '../hooks/useConversation';

const AITeacherScreen = () => {
  const navigation = useNavigation<any>();
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [wsToken, setWsToken] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const createConversation = async () => {
      try {
        setIsCreating(true);
        setCreateError(null);
        const response = await conversationService.create('chat');
        if (response.code === 0) {
          setConversationId(response.data.conversation_id);
          setWsToken(response.data.token);
        } else {
          setCreateError(response.message || 'Failed to create conversation');
        }
      } catch (e: any) {
        console.error('[AITeacher] Create conversation error:', e);
        setCreateError(e.message || 'Failed to create conversation');
      } finally {
        setIsCreating(false);
      }
    };

    createConversation();
  }, []);

  const handleEnd = useCallback(async () => {
    if (!conversationId) {
      navigation.navigate('Home');
      return;
    }
    try {
      await conversationService.end(conversationId);
    } catch (e) {
      console.error('[AITeacher] End conversation error:', e);
    }
    navigation.navigate('Home');
  }, [conversationId, navigation]);

  if (isCreating) {
    return (
      <Layout>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text className="text-gray-500 mt-4">正在连接AI老师...</Text>
        </View>
      </Layout>
    );
  }

  if (createError || !conversationId || !wsToken) {
    return (
      <Layout>
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

  return (
    <AITeacherContent
      conversationId={conversationId}
      wsToken={wsToken}
      onEnd={handleEnd}
    />
  );
};

interface ContentProps {
  conversationId: number;
  wsToken: string;
  onEnd: () => void;
}

const AITeacherContent = ({ conversationId, wsToken, onEnd }: ContentProps) => {
  const navigation = useNavigation<any>();
  const {
    state,
    boardMarkup,
    disconnect,
  } = useConversation({
    conversationId,
    wsToken,
    autoConnect: true,
    onError: useCallback((error: string) => {
      console.error('[AITeacher] Conversation error:', error);
    }, []),
  });

  const { status, aiText, aiFullText, userText, userFullText, closeReason } = state;

  return (
    <Layout className="bg-[#F5F7FA]">
        <View className="flex-1 p-6 space-y-6">

            {/* Close Reason Banner */}
            {closeReason && (
                <View className="absolute top-0 left-0 right-0 z-30 bg-amber-500 px-6 py-4">
                    <Text className="text-white text-center font-medium">{closeReason}</Text>
                    <View className="mt-2 flex-row justify-center space-x-3">
                        <TouchableOpacity
                            onPress={onEnd}
                            className="bg-white/20 px-4 py-2 rounded-full"
                        >
                            <Text className="text-white font-bold">返回首页</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={async () => {
                              await disconnect('banner_restart');
                              navigation.replace('AITeacher');
                            }}
                            className="bg-white/20 px-4 py-2 rounded-full"
                        >
                            <Text className="text-white font-bold">重新开启对话</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Top Right: End Call */}
            <View className="absolute top-6 right-6 z-20">
                <TouchableOpacity
                    onPress={async () => {
                      await disconnect('user_end');
                      onEnd();
                    }}
                    className="flex-row items-center space-x-2 bg-red-100 px-6 py-3 rounded-full border border-red-200"
                >
                    <Phone color="#EF4444" size={20} fill="#EF4444" />
                    <Text className="text-red-600 font-bold">结束通话</Text>
                </TouchableOpacity>
            </View>

            {/* Header: AI Avatar */}
            <View className="flex-row items-start space-x-4 px-4 pt-2 mt-12">
                <View>
                    <View className="w-20 h-20 bg-blue-600 rounded-full items-center justify-center shadow-lg border-4 border-white z-10">
                        <Bot size={48} color="white" />
                    </View>
                    {status === 'speaking' && (
                        <View className="absolute inset-0 bg-blue-400 rounded-full opacity-20 scale-150" />
                    )}
                </View>

                <View className="bg-white p-6 rounded-3xl rounded-tl-none shadow-sm border border-gray-100 flex-1">
                    <View className="flex-row items-center space-x-2 mb-2">
                        <Text className="font-bold text-blue-600">小智老师</Text>
                        {status === 'speaking' && <Volume2 size={16} color="#60A5FA" />}
                    </View>
                    <Text className="text-xl text-gray-800 font-medium leading-relaxed">
                        {aiFullText || aiText || (status === 'processing' ? '（思考中）' : '你好同学！我是小智老师，有什么想问的吗？')}
                    </Text>
                </View>
            </View>

            {/* Board */}
            <View className="flex-1 bg-white rounded-3xl shadow-sm border border-gray-200 m-2 overflow-hidden">
                <View className="h-12 bg-gray-50 border-b border-gray-100 flex-row items-center px-6 space-x-2">
                    <View className="w-3 h-3 rounded-full bg-red-400" />
                    <View className="w-3 h-3 rounded-full bg-yellow-400" />
                    <View className="w-3 h-3 rounded-full bg-green-400" />
                    <View className="flex-1 items-end">
                        <View className="flex-row items-center space-x-1">
                             <Pencil size={14} color="#9CA3AF" />
                             <Text className="text-gray-400 text-sm">互动板书</Text>
                        </View>
                    </View>
                </View>

                <ScrollView className="flex-1 bg-[#fffdf5]" contentContainerStyle={{ padding: 24 }}>
                    {boardMarkup ? (
                        <BoardRenderer markup={boardMarkup} title="【互动板书】" />
                    ) : (
                        <View className="items-center justify-center flex-1" style={{ paddingVertical: 60 }}>
                            <BookOpen size={64} color="#E5E7EB" />
                            <Text className="text-gray-300 text-lg mt-4">等待老师板书...</Text>
                        </View>
                    )}

                    {status === 'speaking' && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                            <View style={{ width: 6, height: 16, backgroundColor: '#F59E0B', marginRight: 6 }} />
                            <Text style={{ color: '#9CA3AF', fontSize: 14 }}>正在书写...</Text>
                        </View>
                    )}
                </ScrollView>
            </View>

            {/* Footer: User */}
            <View className="flex-row justify-end items-end space-x-4 px-4 pb-2">
                 <View className="bg-blue-600 p-5 rounded-3xl rounded-tr-none shadow-lg shadow-blue-100 flex-1">
                     <Text className="text-white text-xl font-medium text-right">
                        {userFullText || userText || '你可以随时提问哦'}
                     </Text>
                 </View>
                 <View>
                    <View className="w-16 h-16 bg-white rounded-full items-center justify-center shadow-md border border-gray-100 z-10">
                        <User size={32} color="#4B5563" />
                    </View>
                    {status === 'listening' && (
                        <View className="absolute -top-2 -right-2 bg-green-500 w-6 h-6 rounded-full border-2 border-white items-center justify-center">
                            <Mic size={12} color="white" />
                        </View>
                    )}
                 </View>
            </View>

        </View>
    </Layout>
  );
};

export default AITeacherScreen;
