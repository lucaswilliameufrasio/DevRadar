import axios from 'axios';
import { Platform } from 'react-native';

const api = axios.create({
    baseURL: Platform.OS === 'ios' ? 'http://localhost:7777' : 'http://10.0.2.2:7777',
})

export default api;