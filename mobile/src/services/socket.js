import { Platform } from 'react-native';
import socketio from 'socket.io-client';

// adjust this before deploying
const socket = socketio(Platform.OS === 'ios' ? 'http://localhost:7777' : 'http://10.0.2.2:7777', {
    autoConnect: false,
});

function subscribeToNewDevs(subscribeFunction) {
    try {
        socket.on('new-dev', subscribeFunction);
        console.log('Listening to new devs')
    } catch (error) {
        console.error('Failed to subscribe to receive new registered developers', error)
    }
}


function connect(latitude, longitude, techs) {
    try {
        console.debug('Connecting to socket', techs)
        socket.io.opts.query = {
            latitude,
            longitude,
            techs,
        };

        socket.connect();

        console.log('Connected to socket')
    } catch (error) {
        console.error('Failed to connect to socket', error)
    }
}

function disconnect() {
    try {
        socket.disconnect();
    } catch (error) {
        console.error('Failed to disconnect from socket', error)
    }
}

export {
    connect,
    disconnect,
    subscribeToNewDevs
};