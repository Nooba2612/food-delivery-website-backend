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
} = require("@config/passport");


const useMiddlewares = (app) => {
    app.use(express.static(path.join(__dirname, "public")));
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
                httpOnly: true, // prevent Javascript accession
                maxAge: Number.parseInt(process.env.COOKIE_MAX_AGE_1H),
                sameSite: "Lax", // prevent CSRF attack
                path: "/",
            },
        }),
    );
    app.use(
        cors({
            origin: true, 
            credentials: true,
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
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
};

module.exports = useMiddlewares;
