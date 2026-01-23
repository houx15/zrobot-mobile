import React, { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import CameraView from '../components/CameraView';
import Layout from '../components/Layout';

const QuestionCameraScreen = () => {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(false);

  const onCapture = (uri: string) => {
    navigation.navigate('Crop', { 
        imageUri: uri, 
        nextScreen: 'QuestionSolution',
        title: '裁剪题目'
    });
  };

  return (
    <Layout onBack={() => navigation.goBack()} title="题目答疑">
        <CameraView 
            onCapture={onCapture} 
            overlayText="将题目放在摄像头下方" 
            buttonText="拍照"
            loading={loading}
        />
    </Layout>
  );
};

export default QuestionCameraScreen;
