import React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, Platform, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  className?: string;
}

const Layout: React.FC<LayoutProps> = ({ children, title, onBack, rightAction, className = '' }) => {
  const navigation = useNavigation();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView className={`flex-1 bg-[#F5F7FA] ${className}`}>
      <StatusBar barStyle="dark-content" />
      {(title || onBack) && (
        <View className="h-[72px] px-8 flex-row items-center justify-between bg-white/50 border-b border-gray-200/50 z-10">
          <View className="flex-1 items-start">
            {onBack && (
              <TouchableOpacity 
                onPress={handleBack}
                className="flex-row items-center space-x-2"
              >
                <ArrowLeft size={24} color="#4B5563" />
                <Text className="text-lg font-medium text-gray-600">返回</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <View className="flex-1 items-center">
            {title && <Text className="text-xl font-bold text-gray-800">{title}</Text>}
          </View>

          <View className="flex-1 items-end">
            {rightAction}
          </View>
        </View>
      )}
      
      <View className="flex-1">
        {children}
      </View>
    </SafeAreaView>
  );
};

export default Layout;
