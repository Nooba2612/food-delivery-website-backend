const jwt = require("jsonwebtoken");
const { getUserRecordById } = require("@modules/Auth/user.service");

const authMiddleware = async (req, res, next) => {
    const jwtSecretKey = process.env.JWT_SECRET_KEY;

    let token = req.headers.authorization?.startsWith("Bearer ") 
        ? req.headers.authorization.split(" ")[1] 
        : null;
    
    if (!token && req.cookies) {
        token = req.cookies.token;
    }

    if (!token) {
        return res.status(401).json({ success: false, message: "Unauthorized: No token provided" });
    }

    try {
        const decoded = jwt.verify(token, jwtSecretKey);
        
        const dbUser = await getUserRecordById(decoded.user_id);
        if (!dbUser) {
            return res.status(401).json({ success: false, message: "User not found" });
        }

        const tokenVersionInDb = dbUser.tokenVersion || 0;
        const tokenVersionInJwt = decoded.tokenVersion || 0;

     
        if (dbUser.role === 'Admin' && tokenVersionInJwt !== tokenVersionInDb) {
            console.log(`SESSION EXPIRED: Token version mismatch for admin ${decoded.user_id}`);
            return res.status(401).json({ success: false, message: "Session expired. You logged in on another device." });
        }

        req.user = {
            id: decoded.user_id, 
            user_id: decoded.user_id,
            username: decoded.username,
            role: decoded.role
        };
        next();
    } catch (err) {
        console.log("JWT VERIFY ERROR:", err.message);
        return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }
};

const authAdminMiddleware = async (req, res, next) => {
    const jwtSecretKey = process.env.JWT_SECRET_KEY;
    
    let token = req.headers.authorization?.startsWith("Bearer ") 
        ? req.headers.authorization.split(" ")[1] 
        : null;
    
    if (!token && req.cookies) {
        token = req.cookies.token;
    }

    if (!token) {
        return res.status(401).json({ success: false, message: "Unauthorized failed: No token provided" });
    }

    try {
        const decoded = jwt.verify(token, jwtSecretKey);
        
        const dbUser = await getUserRecordById(decoded.user_id);
        if (!dbUser) {
            return res.status(401).json({ success: false, message: "User not found" });
        }

        const tokenVersionInDb = dbUser.tokenVersion || 0;
        const tokenVersionInJwt = decoded.tokenVersion || 0;

        if (tokenVersionInJwt !== tokenVersionInDb) {
            console.log(`ADMIN SESSION EXPIRED: Token version mismatch for user ${decoded.user_id}`);
            return res.status(401).json({ success: false, message: "Session expired. You logged in on another device." });
        }

        req.user = {
            id: decoded.user_id,
            user_id: decoded.user_id,
            username: decoded.username,
            role: decoded.role
        };
        next();
    } catch (err) {
        console.log("JWT VERIFY ERROR:", err.message);
        return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }
};

module.exports = { authMiddleware, authAdminMiddleware };
