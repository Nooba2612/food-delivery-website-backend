const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Eatsy Food Delivery API",
      version: "1.0.0",
      description: "API documentation for Eatsy Food Delivery Backend",
      contact: {
        name: "Support",
        email: "support@eatsy.com",
      },
    },
    servers: [
      {
        url: "http://localhost:5678",
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT token for authentication",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              description: "User ID",
            },
            email: {
              type: "string",
              description: "User email",
            },
            phone: {
              type: "string",
              description: "User phone number",
            },
            name: {
              type: "string",
              description: "User name",
            },
            avatar: {
              type: "string",
              description: "User avatar URL",
            },
          },
        },
        Dish: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              description: "Dish ID",
            },
            name: {
              type: "string",
              description: "Dish name",
            },
            description: {
              type: "string",
              description: "Dish description",
            },
            price: {
              type: "number",
              description: "Dish price",
            },
            image: {
              type: "string",
              description: "Dish image URL",
            },
            category_id: {
              type: "integer",
              description: "Category ID",
            },
          },
        },
        Cart: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              description: "Cart ID",
            },
            user_id: {
              type: "integer",
              description: "User ID",
            },
            dish_id: {
              type: "integer",
              description: "Dish ID",
            },
            quantity: {
              type: "integer",
              description: "Quantity",
            },
          },
        },
        Category: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              description: "Category ID",
            },
            name: {
              type: "string",
              description: "Category name",
            },
            image: {
              type: "string",
              description: "Category image URL",
            },
          },
        },
        Address: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              description: "Address ID",
            },
            user_id: {
              type: "integer",
              description: "User ID",
            },
            street: {
              type: "string",
              description: "Street address",
            },
            city: {
              type: "string",
              description: "City",
            },
            state: {
              type: "string",
              description: "State/Province",
            },
            zip_code: {
              type: "string",
              description: "ZIP code",
            },
            is_default: {
              type: "boolean",
              description: "Is default address",
            },
          },
        },
        Voucher: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              description: "Voucher ID",
            },
            code: {
              type: "string",
              description: "Voucher code",
            },
            discount: {
              type: "number",
              description: "Discount percentage or amount",
            },
            valid_from: {
              type: "string",
              format: "date-time",
              description: "Voucher valid from date",
            },
            valid_to: {
              type: "string",
              format: "date-time",
              description: "Voucher valid to date",
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            message: {
              type: "string",
              description: "Error message",
            },
          },
        },
      },
    },
    security: [],
  },
  apis: [
    "./src/modules/Auth/auth.router.js",
    "./src/modules/Dish/dish.router.js",
    "./src/modules/Dish/category.router.js",
    "./src/modules/User/user.router.js",
    "./src/modules/Cart/cart.router.js",
    "./src/modules/Order/order.router.js",
    "./src/modules/Order/vnpay.router.js",
    "./src/routes/voucherRouter.js",
    "./src/routes/upload.js",
    "./src/routes/chatRouter.js",
  ],
};

const specs = swaggerJsdoc(options);

module.exports = specs;
