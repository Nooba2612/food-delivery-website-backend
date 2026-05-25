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

app.use(express.json());

// using middlewares
useMiddlewares(app);

// Swagger UI
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpecs, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  }),
);

// routing
routes(app);

// Global Error Handler
const errorHandler = require("@core/middlewares/errorHandler");
app.use(errorHandler);

// Store io instance globally for services to access
app.set("io", null);

const appReady = (async () => {
  await connectToDatabase();
  await sequelize.sync();
  registerChatSocketListeners();
})();

app.set("appReady", appReady);

module.exports = app;
