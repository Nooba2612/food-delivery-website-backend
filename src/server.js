require("dotenv").config();
const express = require("express");
const swaggerUi = require("swagger-ui-express");
const swaggerSpecs = require("@config/swagger");

const routes = require("@routes/index");
const useMiddlewares = require("@middlewares/index");
const { connectToDatabase } = require("@config/sequelize");

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

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Requested resource not found",
        path: req.path,
        method: req.method,
        receivedUrl: `${req.method} ${req.path}`,
    });
});

// Store io instance globally for services to access
app.set("io", null);

// connect to the database
connectToDatabase();

module.exports = app;
