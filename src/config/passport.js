const LocalStrategy = require("passport-local").Strategy;
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const { v4: uuidv4 } = require("uuid");

const { compareHashedData, hashData } = require("@helpers/validationHelper");
const { getUserByPhoneNumber } = require("@services/userService");
const { userModel } = require("@models/index");

const usePassportLocalStrategy = (passport) => {
    passport.use(
        new LocalStrategy(
            {
                usernameField: "phone",
                passwordField: "password",
                passReqToCallback: true,
            },
            async (req, phone, password, cb) => {
                try {
                    const countryCode = req.body.countryCode || (req.body.country && req.body.country.countryCode);
                    console.log("🚀  phone:", phone);

                    // get user from database
                    const user = await getUserByPhoneNumber(countryCode, phone);
                    if (!user) {
                        return cb(null, false, { message: "Incorrect phone number." });
                    }

                    // check password
                    const isValidPassword = await compareHashedData(password, user.password);
                    if (!isValidPassword) {
                        return cb(null, false, { message: "Incorrect password." });
                    }

                    // Return user object if authentication is successful
                    return cb(null, user);
                } catch (err) {
                    return cb(err);
                }
            },
        ),
    );
};

const usePassportGoogleStrategy = (passport) => {
    const googleClientID = process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET_ID;
    const googleRedirectUrl = process.env.GOOGLE_REDIRECT_LOGIN;

    passport.use(
        new GoogleStrategy(
            {
                clientID: googleClientID,
                clientSecret: googleClientSecret,
                callbackURL: googleRedirectUrl,
                passReqToCallback: true,
            },
            async (req, accessToken, refreshToken, profile, cb) => {
                try {
                    console.log("\n\nProfile: ", profile._json);

                    const { sub, name, picture, email } = profile._json;

                    // save user in database
                    const [user, created] = await userModel.findOrCreate({
                        where: { userId: sub },
                        defaults: {
                            userId: sub,
                            fullname: name,
                            username: name,
                            email: email,
                            avatarPath: picture,
                            typeLogin: "Google",
                            password: "*",
                            countryCode: "*",
                            phoneNumber: uuidv4().substring(0, 20),
                        },
                    });

                    if (created) {
                        console.log("\n\nNew user created: ", user);
                    } else {
                        console.log("\n\nUser found: ", user);
                    }
                    return cb(null, user);
                } catch (error) {
                    return cb(error);
                }
            },
        ),
    );
};

const usePassportFacebookStrategy = (passport) => {
    const facebookClientID = process.env.FACEBOOK_APP_ID;
    const facebookClientSecret = process.env.FACEBOOK_APP_SECRET_ID;
    const facebookRedirectUrl = process.env.FACEBOOK_REDIRECT_LOGIN;

    passport.use(
        new FacebookStrategy(
            {
                clientID: facebookClientID,
                clientSecret: facebookClientSecret,
                callbackURL: facebookRedirectUrl,
                profileFields: ["id", "displayName", "photos", "email"],
                enableProof: true,
                passReqToCallback: true,
            },
            async (req, accessToken, refreshToken, profile, cb) => {
                try {
                    console.log("\n\nProfile: ", profile._json);
                    const { id, name, picture, email } = profile._json;

                    const hashedEmail = await hashData(email);

                    // save user in database
                    const [user, created] = await userModel.findOrCreate({
                        where: { userId: id },
                        defaults: {
                            userId: id,
                            fullname: name,
                            username: name,
                            email: hashedEmail,
                            avatarPath: picture.data.url,
                            typeLogin: "Facebook",
                            password: "*",
                            countryCode: "*",
                            phoneNumber: uuidv4().substring(0, 20),
                        },
                    });

                    if (created) {
                        console.log("\n\nNew user created: ", user);
                    } else {
                        console.log("\n\nUser found: ", user);
                    }
                    return cb(null, user);
                } catch (error) {
                    return cb(error);
                }
            },
        ),
    );
};

const setupPassportSerialization = (passport) => {
    passport.serializeUser((user, done) => {
        const id = user.userId || user.user_id || user.id || (user._json && user._json.sub);
        done(null, id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            // If id is already a full user object (from some previous weird serialization), just fix it
            if (id && typeof id === 'object' && (id.userId || id.user_id)) {
                if (!id.user_id) id.user_id = id.userId;
                return done(null, id);
            }

            const user = await userModel.findByPk(id);
            if (user) {
                const plainUser = user.get({ plain: true });
                plainUser.user_id = plainUser.userId;
                done(null, plainUser);
            } else {
                done(null, null);
            }
        } catch (error) {
            done(error);
        }
    });
};

module.exports = {
    usePassportLocalStrategy,
    usePassportGoogleStrategy,
    usePassportFacebookStrategy,
    setupPassportSerialization
};
