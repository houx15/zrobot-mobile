import React, { useState } from 'react';
import { View, Image, TouchableOpacity, Dimensions, ActivityIndicator, Text } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImageManipulator from 'expo-image-manipulator';
import { uploadService } from '../services/api';

const { width } = Dimensions.get('window');

const CropScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { imageUri, nextScreen, title } = route.params;
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
        const manipulated = await ImageManipulator.manipulateAsync(
            imageUri,
            [{ resize: { width: 1080 } }],
            { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );

        const fileUrl = await uploadService.uploadFile(manipulated.uri, 'image');
        navigation.navigate(nextScreen, { imageUrl: fileUrl });
    } catch (e) {
        console.error(e);
        navigation.navigate(nextScreen, { imageUrl: imageUri, isLocal: true });
    } finally {
        setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-black relative">
       {/* Header */}
       <View className="h-[72px] px-8 flex-row items-center justify-between bg-black/50 z-20 top-0 absolute w-full">
            <Text className="text-xl font-bold text-white">{title || '裁剪图片'}</Text>
            <TouchableOpacity onPress={() => navigation.goBack()}>
                <Text className="text-gray-300 text-lg">重拍</Text>
            </TouchableOpacity>
       </View>

       {/* Image Area */}
       <View className="flex-1 justify-center items-center">
            <Image 
                source={{ uri: imageUri }} 
                className="w-full h-[70%]" 
                resizeMode="contain"
            />
            {/* Mock Crop Overlay */}
            <View className="absolute w-[80%] h-[50%] border-2 border-white shadow-2xl">
                 <View className="absolute -bottom-1 -right-1 w-8 h-8 bg-blue-500 rounded-tl-xl" />
                 {/* Grid */}
                 <View className="flex-1 border-r border-white/30 w-1/3 absolute h-full left-1/3" />
                 <View className="flex-1 border-r border-white/30 w-1/3 absolute h-full left-2/3" />
                 <View className="flex-1 border-b border-white/30 h-1/3 absolute w-full top-1/3" />
                 <View className="flex-1 border-b border-white/30 h-1/3 absolute w-full top-2/3" />
            </View>
            <Text className="absolute bottom-32 text-white/50">拖动边框调整范围 (演示模式:固定中心)</Text>
       </View>

       {/* Footer */}
       <View className="h-[100px] bg-black/80 justify-center items-center pb-4 absolute bottom-0 w-full">
            <TouchableOpacity 
                onPress={handleConfirm}
                disabled={loading}
                className="h-[60px] px-16 bg-blue-600 rounded-full justify-center items-center"
            >
                {loading ? <ActivityIndicator color="white" /> : <Text className="text-white text-xl font-bold">确认裁剪</Text>}
            </TouchableOpacity>
       </View>
    </View>
  );
};

export default CropScreen;