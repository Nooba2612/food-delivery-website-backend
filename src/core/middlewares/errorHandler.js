const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || "error";

    if (process.env.NODE_ENV === "development") {
        sendErrorDev(err, res);
    } else {
        // Simple production error mapping
        let error = { ...err, message: err.message };

        // Handle specific Sequelize errors
        if (err.name === "SequelizeValidationError") error = handleSequelizeValidationError(err);
        if (err.name === "SequelizeUniqueConstraintError") error = handleSequelizeUniqueError(err);

        sendErrorProd(error, res);
    }
};

const sendErrorDev = (err, res) => {
    res.status(err.statusCode).json({
        success: false,
        status: err.status,
        message: err.message,
        errors: err.errors,
        stack: err.stack,
        error: err,
    });
};

const sendErrorProd = (err, res) => {
    // Operational, trusted error: send message to client
    if (err.isOperational) {
        res.status(err.statusCode).json({
            success: false,
            message: err.message,
            errors: err.errors,
        });
    } 
    // Programming or other unknown error: don't leak error details
    else {
        console.error("ERROR 💥", err);
        res.status(500).json({
            success: false,
            message: "Hệ thống gặp sự cố. Vui lòng thử lại sau.",
        });
    }
};

const handleSequelizeValidationError = (err) => {
    const errors = err.errors.map((el) => ({
        field: el.path,
        message: el.message,
    }));
    const error = new Error("Dữ liệu không hợp lệ");
    error.statusCode = 400;
    error.errors = errors;
    error.isOperational = true;
    return error;
};

const handleSequelizeUniqueError = (err) => {
    const field = err.errors[0].path;
    const message = `Giá trị của ${field} đã tồn tại.`;
    const error = new Error(message);
    error.statusCode = 400;
    error.isOperational = true;
    return error;
};

module.exports = errorHandler;
