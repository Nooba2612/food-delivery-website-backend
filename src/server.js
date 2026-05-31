require("dotenv").config();
const express = require("express");
const swaggerUi = require("swagger-ui-express");
const swaggerSpecs = require("@core/config/swagger");

require("./models");

const routes = require("./routes");
const useMiddlewares = require("@core/middlewares/index");
const {
  connectToDatabase,
  sequelize,
} = require("@core/config/sequelize");
const { registerChatSocketListeners } = require("@modules/Chat/socket.listeners");

const app = express();
app.set("trust proxy", 1);

app.use(express.json());

useMiddlewares(app);

app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpecs, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  }),
);

routes(app);

const errorHandler = require("@core/middlewares/errorHandler");
app.use(errorHandler);

app.set("io", null);

const appReady = (async () => {
  await connectToDatabase();
  await sequelize.sync();
  registerChatSocketListeners();
})();

app.set("appReady", appReady);

module.exports = app;
