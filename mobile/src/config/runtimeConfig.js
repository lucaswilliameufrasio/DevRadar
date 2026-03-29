import { Platform } from 'react-native';

export const runtimeConfig = {
  apiBaseUrl: Platform.OS === 'ios' ? 'http://localhost:9988/v1' : 'http://10.0.2.2:9988/v1',
};
