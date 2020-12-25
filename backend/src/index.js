require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");

const routes = require("./routes");
const { setupWebsocket } = require("./websocket");
const env = require("./config/env");

const app = express();
const server = http.Server(app);

setupWebsocket(server);

app.use(cors());
app.use(express.json());

app.use(routes);

mongoose
  .connect(env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
  })
  .then(() => {
    server.listen(env.PORT, () => console.log(`Listening on http://localhost:${env.PORT}`));
  })
  .catch((error) => {
    console.error(error);
  });
