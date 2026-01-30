import './global.css';

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { CameraProvider } from './src/contexts/CameraContext';
import { navigationRef } from './src/services/navigation';
import LoginScreen from './src/screens/LoginScreen';
import BindScreen from './src/screens/BindScreen';
import HomeScreen from './src/screens/HomeScreen';
import DoHomeworkScreen from './src/screens/DoHomeworkScreen';
import HomeworkCameraScreen from './src/screens/HomeworkCameraScreen';
import HomeworkResultsScreen from './src/screens/HomeworkResultsScreen';
import HomeworkDetailScreen from './src/screens/HomeworkDetailScreen';
import QuestionCameraScreen from './src/screens/QuestionCameraScreen';
import QuestionSolutionScreen from './src/screens/QuestionSolutionScreen';
import AITeacherScreen from './src/screens/AITeacherScreen';
import CropScreen from './src/screens/CropScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <CameraProvider>
      <SafeAreaProvider>
        <NavigationContainer ref={navigationRef}>
          <StatusBar style="dark" />
          <Stack.Navigator
              initialRouteName="Login"
              screenOptions={{
                  headerShown: false,
                  cardStyle: { backgroundColor: '#F5F7FA' }
              }}
          >
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Bind" component={BindScreen} />
            <Stack.Screen name="Home" component={HomeScreen} />

            <Stack.Screen name="DoHomework" component={DoHomeworkScreen} />

            <Stack.Screen name="HomeworkCamera" component={HomeworkCameraScreen} />
            <Stack.Screen name="HomeworkResults" component={HomeworkResultsScreen} />
            <Stack.Screen name="HomeworkDetail" component={HomeworkDetailScreen} />

            <Stack.Screen name="QuestionCamera" component={QuestionCameraScreen} />
            <Stack.Screen name="QuestionSolution" component={QuestionSolutionScreen} />

            <Stack.Screen name="AITeacher" component={AITeacherScreen} />

            <Stack.Screen name="Crop" component={CropScreen} options={{ presentation: 'modal' }} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </CameraProvider>
  );
}
