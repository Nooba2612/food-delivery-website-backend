const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
    const jwtSecretKey = process.env.JWT_SECRET_KEY;

    // ✅ Read token from Authorization header ONLY
    const token = req.headers.authorization?.startsWith("Bearer ") 
        ? req.headers.authorization.split(" ")[1] 
        : null;

    // ✅ DEBUG LOGS
    console.log("--- AUTH DEBUG ---");
    console.log("METHOD:", req.method);
    console.log("PATH:", req.path);
    console.log("HEADERS:", req.headers);
    console.log("AUTH HEADER:", req.headers.authorization);

    if (!token) {
        return res.status(401).json({ success: false, message: "Unauthorized: No token provided" });
    }

    jwt.verify(token, jwtSecretKey, (err, decoded) => {
        if (err) {
            console.log("JWT VERIFY ERROR:", err.message);
            return res.status(401).json({ success: false, message: "Invalid or expired token" });
        }

        console.log("DECODED USER:", decoded);

        req.user = {
            id: decoded.user_id, // Added for consistency
            user_id: decoded.user_id,
            username: decoded.username,
            role: decoded.role
        };
        console.log("USER FROM TOKEN:", req.user);
        next();
    });
};

const authAdminMiddleware = (req, res, next) => {
    const jwtSecretKey = process.env.JWT_SECRET_KEY;
    
    // ✅ Read token from Authorization header ONLY
    const token = req.headers.authorization?.startsWith("Bearer ") 
        ? req.headers.authorization.split(" ")[1] 
        : null;

    // ✅ DEBUG LOGS
    console.log("--- AUTH ADMIN DEBUG ---");
    console.log("AUTH HEADER:", req.headers.authorization);

    if (!token) {
        return res.status(401).json({ success: false, message: "Unauthorized failed: No token provided" });
    }

    jwt.verify(token, jwtSecretKey, (err, decoded) => {
        if (err) {
            console.log("JWT VERIFY ERROR:", err.message);
            return res.status(401).json({ success: false, message: "Invalid or expired token" });
        }

        // ✅ DEBUG LOGS
        console.log("DECODED USER:", decoded);

        const { role } = decoded;
        if (role !== "Admin") {
            console.log("ACCESS DENIED: Role is", role);
            return res
                .status(401)
                .json({ success: false, message: "Unauthorized failed: Only admin has the right of access" });
        }

        req.user = {
            id: decoded.user_id, // Added for consistency
            user_id: decoded.user_id,
            username: decoded.username,
            role: decoded.role
        };
        console.log("USER FROM TOKEN:", req.user);
        next();
    });
};

module.exports = { authMiddleware, authAdminMiddleware };
