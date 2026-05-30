const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const cors = require("cors");
const compression = require("compression");
const session = require("express-session");
const helmet = require("helmet");
const passport = require("passport");
const {
  usePassportLocalStrategy,
  usePassportGoogleStrategy,
  usePassportFacebookStrategy,
  setupPassportSerialization,
} = require("@modules/Auth/passport.config");

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:1234",
  "http://localhost:1235",
];
const publicDir = path.join(process.cwd(), "src", "public");

const useMiddlewares = (app) => {
  app.use(express.static(publicDir));
  app.use(morgan("dev"));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(
    session({
      secret: process.env.SESSION_SECRET_KEY,
      resave: false,
      saveUninitialized: true,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: Number.parseInt(process.env.COOKIE_MAX_AGE_1H),
        sameSite: "Lax",
        path: "/",
      },
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept",
      ],
    }),
  );
  app.use(compression());
  app.use(helmet());
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(passport.authenticate("session"));
  usePassportLocalStrategy(passport);
  usePassportGoogleStrategy(passport);
  usePassportFacebookStrategy(passport);
  setupPassportSerialization(passport);
};

module.exports = useMiddlewares;
