import { Server as HttpServer } from "http";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { setupWebsocket } from "./websocket";
import { routes } from "./routes";
import { env } from "./config/env";

const app = new Hono();
const server = serve(
  {
    fetch: app.fetch,
    port: env.port,
  },
  (info) => console.log(`Listening on http://localhost:${info.port}`)
);

setupWebsocket(server as HttpServer);

app.use("*", cors());

app.route("", routes);
