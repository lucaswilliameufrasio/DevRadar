const socketio = require('socket.io');
const parseStringAsArray = require('./utils/parseStringAsArray');
const calculateDistance = require('./utils/calculateDistance');

let io;
const connections = [];

exports.setupWebsocket = (server) => {
    io = socketio(server);

    io.on('connection', socket => {
        const { latitude, longitude, techs } = socket.handshake.query;

        connections.push({
            id: socket.id,
            coordinates: {
                latitude: Number(latitude),
                longitude: Number(longitude)
            },
            techs: parseStringAsArray(techs),
        })
    });

};

//some() retorna true, caso uma das condições seja verdadeira. 
//O método includes() determina se um array contém um determinado elemento, retornando true ou false apropriadamente. ~MDN web docs

exports.findConnections = (coordinates, techs) => {
    return connections.filter(connection => {
        return calculateDistance(coordinates, connection.coordinates) < 10
            && connection.techs.some(item => techs.includes(item))
    });
};

exports.sendMessage = (to, message, data) => {
    to.forEach(connection => {
        console.debug('Sending message to connection', connection, message, data)
        io.to(connection.id).emit(message, data);
    });
};