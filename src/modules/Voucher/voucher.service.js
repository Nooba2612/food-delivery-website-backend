const voucherModel = require("./models/voucherModel");
const { Op } = require("sequelize");

const getVoucher = async (voucherCode) => {
  return await voucherModel.findOne({
    where: { code: voucherCode },
  });
};

const getActiveVoucherByCode = async (voucherCode, transaction = null) => {
  return voucherModel.findOne({
    where: {
      code: voucherCode,
      valid_from: { [Op.lte]: new Date() },
      valid_to: { [Op.gte]: new Date() },
      number_of_uses: { [Op.gt]: 0 },
    },
    transaction,
  });
};

const decrementVoucherUsage = async (voucher, transaction = null) => {
  if (!voucher) return;
  await voucher.decrement("number_of_uses", { by: 1, transaction });
};

module.exports = {
  decrementVoucherUsage,
  getActiveVoucherByCode,
  getVoucher,
};
