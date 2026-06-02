const voucherModel = require("./models/voucherModel");
const { Op } = require("sequelize");

/**
 * Retrieves a voucher by its code without any validation on its status or dates.
 * @param {string} voucherCode - The unique code of the voucher.
 * @returns {Promise<Object|null>} A Promise resolving to the voucher model instance, or null.
 */
const getVoucher = async (voucherCode) => {
  return await voucherModel.findOne({
    where: { code: voucherCode },
  });
};

/**
 * Retrieves an active voucher by its code.
 * Ensures the voucher is currently valid (within dates) and has remaining uses.
 * @param {string} voucherCode - The unique code of the voucher.
 * @param {Object} [transaction=null] - Optional Sequelize transaction.
 * @returns {Promise<Object|null>} A Promise resolving to the active voucher instance, or null.
 */
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

/**
 * Decrements the available number of uses for a given voucher by 1.
 * @param {Object} voucher - The Sequelize voucher model instance.
 * @param {Object} [transaction=null] - Optional Sequelize transaction.
 * @returns {Promise<void>}
 */
const decrementVoucherUsage = async (voucher, transaction = null) => {
  if (!voucher) return;
  await voucher.decrement("number_of_uses", { by: 1, transaction });
};

module.exports = {
  decrementVoucherUsage,
  getActiveVoucherByCode,
  getVoucher,
};
