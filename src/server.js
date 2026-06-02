require('dotenv').config();
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('@core/config/swagger');

require('./models');

const routes = require('./routes');
const useMiddlewares = require('@core/middlewares/index');
const { connectToDatabase, sequelize } = require('@core/config/sequelize');
const {
    registerChatSocketListeners,
} = require('@modules/Chat/socket.listeners');
const paymentService = require('@modules/User/paymentService');

const app = express();
app.set('trust proxy', 1);

app.use(
    express.json({
        verify: (req, res, buf) => {
            if (req.originalUrl.startsWith('/api/sepay/webhook')) {
                req.rawBody = buf;
            }
        },
    }),
);

// using middlewares
useMiddlewares(app);

// Swagger UI
app.use(
    '/api-docs',
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
const errorHandler = require('@core/middlewares/errorHandler');
app.use(errorHandler);

// Store io instance globally for services to access
app.set('io', null);

const appReady = (async () => {
    await connectToDatabase();
    await sequelize.sync();
    registerChatSocketListeners();
})();

appReady.then(() => {
    const intervalMs = 60 * 1000;
    setInterval(() => {
        paymentService.expireStalePendingPayments().catch((error) => {
            console.error('Pending payment cleanup failed:', error);
        });
    }, intervalMs);
});

app.set('appReady', appReady);

module.exports = app;
