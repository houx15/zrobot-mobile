import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Image, ImageBackground, ScrollView, TouchableOpacity, ActivityIndicator, PixelRatio } from 'react-native';
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
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchCorrection();
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  const fetchCorrection = async () => {
    try {
        const res = await homeworkService.submitCorrection(imageUrl);
        setData(res.data);
        if (res.data?.correction_id) {
            startPolling(res.data.correction_id);
        }
        if (res.data?.results?.length) {
            const bboxes = res.data.results
              .map((q: any) => q.question_bbox)
              .filter((bbox: any) => Array.isArray(bbox));
            console.log('[HomeworkResults] question_bbox list:', bboxes);
        }
        if (res.data?.processed_image_url || imageUrl) {
            Image.getSize(
              res.data?.processed_image_url || imageUrl,
              (width, height) => setImageSize({ width, height }),
              () => setImageSize(null)
            );
        }
    } catch (e) {
        console.error(e);
        // Mock data
        setData({
            total_questions: 8,
            correct_count: 6,
            wrong_count: 2,
            processed_image_url: imageUrl,
            results: Array.from({ length: 8 }).map((_, i) => ({
                question_index: i,
                question_detail_id: 1000 + i,
                is_correct: i !== 2 && i !== 6,
                is_finish: i % 5 !== 0,
                question_bbox: [10, 10 + i * 10, 90, 10 + i * 10, 90, 20 + i * 10, 10, 20 + i * 10]
            }))
        });
    } finally {
        setLoading(false);
    }
  };

  const startPolling = (correctionId: number) => {
    // if (pollRef.current) {
    //   clearInterval(pollRef.current);
    // }
    // pollRef.current = setInterval(async () => {
    //   try {
    //     const res = await homeworkService.getCorrectionDetail(correctionId);
    //     if (res.code === 0 && res.data) {
    //       setData(res.data);
    //       const hasPending = (res.data.results || []).some((q: any) => q.is_finish !== true);
    //       if (!hasPending && pollRef.current) {
    //         clearInterval(pollRef.current);
    //         pollRef.current = null;
    //       }
    //     }
    //   } catch (e) {
    //     console.error('[HomeworkResults] polling error:', e);
    //   }
    // }, 2000);
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

  const allResults = data.results || [];
  const finishedResults = allResults.filter((q: any) => q.is_finish === true && typeof q.is_correct === 'boolean');
  const correctCount = finishedResults.filter((q: any) => q.is_correct).length;
  const wrongCount = finishedResults.filter((q: any) => !q.is_correct).length;
  const totalFinished = correctCount + wrongCount;

  return (
    <Layout title="批改结果" onBack={() => navigation.navigate('Home')}>
      <View className="flex-1 flex-row">
         {/* Left: Image */}
         <View
           className="w-1/2 bg-gray-900 justify-center items-center relative overflow-hidden"
           onLayout={(event) => {
             const { width, height } = event.nativeEvent.layout;
             setContainerSize({ width, height });
           }}
         >
             {imageSize && containerSize ? (() => {
               const fitScale = Math.min(
                 containerSize.width / imageSize.width,
                 containerSize.height / imageSize.height
               );
               const displayWidth = imageSize.width * fitScale;
               const displayHeight = imageSize.height * fitScale;
               const imageUri = data.image_url || imageUrl;
               const pixelRatio = PixelRatio.get();
               const imageWidthPx = imageSize.width * pixelRatio;
               const imageHeightPx = imageSize.height * pixelRatio;
               const allBboxes = (data.results || [])
                 .map((q: any) => q.question_bbox)
                 .filter((bbox: any) => Array.isArray(bbox));
               const maxBBoxX = allBboxes.length
                 ? Math.max(...allBboxes.flat().filter((_: any, idx: number) => idx % 2 === 0))
                 : imageWidthPx;
               const maxBBoxY = allBboxes.length
                 ? Math.max(...allBboxes.flat().filter((_: any, idx: number) => idx % 2 === 1))
                 : imageHeightPx;
               const sourceWidth = Math.max(imageWidthPx, maxBBoxX);
               const sourceHeight = Math.max(imageHeightPx, maxBBoxY);
               const bboxScale = Math.min(displayWidth / sourceWidth, displayHeight / sourceHeight);
               const drawnWidth = sourceWidth * bboxScale;
               const drawnHeight = sourceHeight * bboxScale;
               const offsetX = (displayWidth - drawnWidth) / 2;
               const offsetY = (displayHeight - drawnHeight) / 2;

               return (
                 <View style={{ width: displayWidth, height: displayHeight, overflow: 'hidden' }}>
                   <ImageBackground
                     source={{ uri: imageUri }}
                     style={{ width: displayWidth, height: displayHeight, overflow: 'hidden' }}
                     resizeMode="contain"
                     onLoad={(event) => {
                       const { width, height } = event.nativeEvent.source;
                       if (width && height) {
                         setImageSize({ width, height });
                         console.log('[HomeworkResults] imageSize from onLoad:', { width, height });
                       }
                     }}
                   >
                     {data.results
                       .filter((q: any) => q.is_finish === true && typeof q.is_correct === 'boolean' && Array.isArray(q.question_bbox))
                       .map((q: any) => {
                         const bbox = q.question_bbox;
                         const xs = [bbox[0], bbox[2], bbox[4], bbox[6]];
                         const ys = [bbox[1], bbox[3], bbox[5], bbox[7]];
                         const minX = Math.min(...xs);
                         const maxX = Math.max(...xs);
                         const minY = Math.min(...ys);
                         const maxY = Math.max(...ys);
                         const clampedMinX = Math.max(0, Math.min(minX, sourceWidth));
                         const clampedMaxX = Math.max(0, Math.min(maxX, sourceWidth));
                         const clampedMinY = Math.max(0, Math.min(minY, sourceHeight));
                         const clampedMaxY = Math.max(0, Math.min(maxY, sourceHeight));
                         const left = offsetX + clampedMinX * bboxScale;
                         const top = offsetY + clampedMinY * bboxScale;
                         const width = Math.max(0, (clampedMaxX - clampedMinX) * bboxScale);
                         const height = Math.max(0, (clampedMaxY - clampedMinY) * bboxScale);

                         return (
                           <View
                             key={`bbox-${q.question_detail_id}`}
                             style={{
                               position: 'absolute',
                               left,
                               top,
                               width,
                               height,
                               borderWidth: 2,
                               borderColor: q.is_correct ? '#22C55E' : '#EF4444',
                               borderRadius: 6,
                             }}
                           />
                         );
                       })}
                   </ImageBackground>
                 </View>
               );
             })() : (
               <Image
                 source={{ uri: data.processed_image_url || imageUrl }}
                 className="w-full h-full"
                 resizeMode="contain"
               />
             )}
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
                            <Text className="text-gray-400 text-sm">已批改</Text>
                            <Text className="text-2xl font-bold">{totalFinished}</Text>
                        </View>
                        <View className="items-center">
                            <Text className="text-gray-400 text-sm">正确</Text>
                            <View className="flex-row items-center space-x-1">
                                <Text className="text-2xl font-bold text-green-500">{correctCount}</Text>
                                <Check size={20} color="#22C55E" />
                            </View>
                        </View>
                        <View className="items-center">
                            <Text className="text-gray-400 text-sm">错误</Text>
                            <View className="flex-row items-center space-x-1">
                                <Text className="text-2xl font-bold text-red-500">{wrongCount}</Text>
                                <X size={20} color="#EF4444" />
                            </View>
                        </View>
                        <View className="items-center">
                            <Text className="text-gray-400 text-sm">正确率</Text>
                            <Text className="text-3xl font-bold text-blue-600">
                                {totalFinished > 0 ? Math.round((correctCount / totalFinished) * 100) : 0}%
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
                        {allResults.map((q: any) => (
                            <TouchableOpacity 
                                key={q.question_index}
                                onPress={() => {
                                  if (q.is_finish) {
                                    navigation.navigate('HomeworkDetail', { id: q.question_detail_id });
                                  }
                                }}
                                className={`
                                    w-16 h-16 rounded-2xl items-center justify-center shadow-md
                                    ${q.is_finish ? (q.is_correct ? 'bg-[#52C41A]' : 'bg-[#F5222D]') : 'bg-gray-300'}
                                `}
                            >
                                <Text className="text-white text-xl font-bold">{q.question_index + 1}</Text>
                                <View className="mt-1">
                                    {q.is_finish ? (
                                      q.is_correct ? (
                                        <CheckCircle size={16} color="white" />
                                      ) : (
                                        <XCircle size={16} color="white" />
                                      )
                                    ) : (
                                      <Text className="text-white text-[10px]">批改中</Text>
                                    )}
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

    
