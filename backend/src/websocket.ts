import { Server as HttpServer } from "http";

import { Server } from "socket.io";
import { parseStringAsArray } from "./helpers/data-manipulation";
import { getDistanceFromLatLonInKm } from "./helpers/distance";

let io: Server;

export type Connection = {
  id: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  techs: string[];
};

const connections: Connection[] = [];

export function setupWebsocket(server: HttpServer) {
  io = new Server(server);

  io.on("connection", (socket) => {
    const { latitude, longitude, techs } = socket.handshake.query;

    connections.push({
      id: socket.id,
      coordinates: {
        latitude: Number(latitude),
        longitude: Number(longitude),
      },
      techs: parseStringAsArray(
        Array.isArray(techs) ? techs.join(",") : techs ?? ""
      ),
    });
  });
}

export function findConnections(
  coordinates: { latitude: number; longitude: number },
  techs: string[]
) {
  return connections.filter((connection) => {
    return (
      getDistanceFromLatLonInKm(coordinates, connection.coordinates) < 10 &&
      connection.techs.some((item: string) => techs.includes(item))
    );
  });
}

export function sendMessage(to: Connection[], message: string, data: unknown) {
  for (const connection of to) {
    console.debug("Sending message to connection", connection, message, data);
    io.to(connection.id).emit(message, data);
  }
}
