import React, { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import CameraView from '../components/CameraView';
import Layout from '../components/Layout';

const HomeworkCameraScreen = () => {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(false);

  const onCapture = (uri: string) => {
    // Navigate to Crop Screen with image uri and next destination
    navigation.navigate('Crop', { 
        imageUri: uri, 
        nextScreen: 'HomeworkResults',
        title: '裁剪作业'
    });
  };

  return (
    <Layout onBack={() => navigation.goBack()} title="作业批改">
        <CameraView 
            onCapture={onCapture} 
            overlayText="将作业本放在摄像头下方" 
            buttonText="拍照"
            loading={loading}
        />
    </Layout>
  );
};

export default HomeworkCameraScreen;
