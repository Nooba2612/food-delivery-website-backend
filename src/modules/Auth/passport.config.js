const LocalStrategy = require("passport-local").Strategy;
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const { v4: uuidv4 } = require("uuid");

const {
  compareHashedData,
  hashData,
} = require("@core/helpers/validationHelper");
const {
  getUserByPhoneNumber,
  toPlainUser,
} = require("@modules/Auth/user.service");
const userModel = require("./models/userModel");

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
          const countryCode =
            req.body.countryCode ||
            (req.body.country && req.body.country.countryCode);

          const user = await getUserByPhoneNumber(countryCode, phone);
          if (!user) {
            return cb(null, false, { message: "Incorrect phone number." });
          }

          const isValidPassword = await compareHashedData(
            password,
            user.password,
          );
          if (!isValidPassword) {
            return cb(null, false, { message: "Incorrect password." });
          }

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

  if (
    googleClientID &&
    googleClientSecret &&
    !googleClientID.includes("dummy") &&
    !googleClientSecret.includes("dummy")
  ) {
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
            const { sub, name, picture, email } = profile._json;

            const [user] = await userModel.findOrCreate({
              where: { userId: sub },
              defaults: {
                userId: sub,
                fullname: name,
                username: name,
                email,
                avatarPath: picture,
                typeLogin: "Google",
                password: "*",
                countryCode: "*",
                phoneNumber: uuidv4().substring(0, 20),
              },
            });

            return cb(null, toPlainUser(user));
          } catch (error) {
            return cb(error);
          }
        },
      ),
    );
  }
};

const usePassportFacebookStrategy = (passport) => {
  const facebookClientID = process.env.FACEBOOK_APP_ID;
  const facebookClientSecret = process.env.FACEBOOK_APP_SECRET_ID;
  const facebookRedirectUrl = process.env.FACEBOOK_REDIRECT_LOGIN;

  if (
    facebookClientID &&
    facebookClientSecret &&
    !facebookClientID.includes("dummy") &&
    !facebookClientSecret.includes("dummy")
  ) {
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
            const { id, name, picture, email } = profile._json;
            const hashedEmail = await hashData(email);

            const [user] = await userModel.findOrCreate({
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

            return cb(null, toPlainUser(user));
          } catch (error) {
            return cb(error);
          }
        },
      ),
    );
  }
};

const setupPassportSerialization = (passport) => {
  passport.serializeUser((user, done) => {
    const id =
      user.userId || user.user_id || user.id || (user._json && user._json.sub);
    done(null, id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      if (id && typeof id === "object" && (id.userId || id.user_id)) {
        return done(null, toPlainUser(id));
      }

      const user = await userModel.findByPk(id);
      done(null, toPlainUser(user));
    } catch (error) {
      done(error);
    }
  });
};

module.exports = {
  setupPassportSerialization,
  usePassportFacebookStrategy,
  usePassportGoogleStrategy,
  usePassportLocalStrategy,
};
