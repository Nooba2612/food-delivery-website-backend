const { validationResult } = require("express-validator");
const AppError = require("@core/utils/AppError");

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
    }));

    const error = new AppError("Dữ liệu đầu vào không hợp lệ", 400);
    error.errors = formattedErrors;
    return next(error);
  }
  next();
};

module.exports = validate;
