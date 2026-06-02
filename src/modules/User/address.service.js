const addressModel = require("./models/addressModel");
const authUserService = require("@modules/Auth/user.service");
const { sequelize } = require("@core/config/sequelize");
const { v4: uuidv4 } = require("uuid");

const AddressService = {
  getAddressesByUserId: async (userId) => {
    try {
      const addresses = await addressModel.findAll({
        where: { userId: userId },
        order: [
          ["is_default", "DESC"],
          ["created_at", "DESC"],
        ],
      });
      return addresses;
    } catch (error) {
      throw error;
    }
  },

  getDefaultAddress: async (userId) => {
    try {
      const address = await addressModel.findOne({
        where: {
          userId: userId,
          isDefault: true,
        },
      });
      return address;
    } catch (error) {
      throw error;
    }
  },

  getAddressByIdForUser: async (userId, addressId, transaction = null) => {
    return addressModel.findOne({
      where: { addressId, userId },
      transaction,
    });
  },

  createAddress: async (userId, data) => {
    const t = await sequelize.transaction();
    try {
      const user = await authUserService.getUserById(userId, { transaction: t });
      if (!user) {
        throw new Error("User not found");
      }

      const normalize = (val) =>
        (val || "").toString().trim().replace(/\s+/g, " ");

      const street = normalize(data.street);
      const ward = normalize(data.ward);
      const city = normalize(data.city);
      const label = data.label || "Home";

      if (!street || !ward || !city) {
        throw new Error(
          "Address fields (street, ward, city) are required and cannot be empty",
        );
      }
      if (street.length > 255)
        throw new Error("Street address must be ≤ 255 characters");
      if (ward.length > 100) throw new Error("Ward must be ≤ 100 characters");
      if (city.length > 100) throw new Error("City must be ≤ 100 characters");

      const existingDefault = await addressModel.findOne({
        where: { userId, isDefault: true },
        transaction: t,
      });

      const isDefault = !existingDefault;

      console.log(
        `📌 [createAddress] existingDefault: ${existingDefault?.addressId || "NONE"}, newIsDefault: ${isDefault}`,
      );

      const addressId = uuidv4();
      const newAddress = await addressModel.create(
        { addressId, userId, street, ward, city, label, isDefault },
        { transaction: t },
      );

      await t.commit();
      return newAddress;
    } catch (error) {
      if (t) await t.rollback();
      console.error("CREATE ADDRESS TRANSACTION FAILED:", error);
      throw error;
    }
  },

  updateAddress: async (addressId, userId, updateData) => {
    try {
      const address = await addressModel.findOne({
        where: { addressId, userId },
      });
      if (!address) {
        throw new Error("Address not found");
      }

      if (updateData.isDefault || updateData.is_default) {
        await AddressService.setDefaultAddress(userId, addressId);
      }

      await address.update(updateData);
      return address;
    } catch (error) {
      throw error;
    }
  },

  deleteAddress: async (addressId, userId) => {
    return sequelize.transaction(async (t) => {
      const address = await addressModel.findOne({
        where: { addressId, userId },
        transaction: t,
      });

      if (!address) {
        throw new Error("Address not found");
      }

      const wasDefault = address.isDefault;

      await address.destroy({ transaction: t });

      if (wasDefault) {
        const nextAddress = await addressModel.findOne({
          where: { userId },
          order: [["created_at", "DESC"]],
          transaction: t,
        });

        if (nextAddress) {
          nextAddress.isDefault = true;
          await nextAddress.save({ transaction: t });
          console.log(
            `♻️ [deleteAddress] Auto-promoted ${nextAddress.addressId} to default`,
          );
        }
      }

      return true;
    });
  },

  setDefaultAddress: async (userId, addressId) => {
    return sequelize.transaction(async (t) => {
      console.log(
        `📌 [setDefaultAddress] START: userId=${userId}, addressId=${addressId}`,
      );

      if (!addressId || addressId === "undefined") {
        throw new Error("Invalid addressId");
      }

      const user = await authUserService.getUserById(userId, { transaction: t });
      if (!user) {
        throw new Error("User not found");
      }

      const address = await addressModel.findOne({
        where: { addressId, userId },
        transaction: t,
      });

      if (!address) {
        throw new Error("Address not found");
      }

      await addressModel.update(
        { isDefault: false },
        { where: { userId }, transaction: t },
      );

      const [affectedRows] = await addressModel.update(
        { isDefault: true },
        { where: { addressId, userId }, transaction: t },
      );

      console.log(`✅ [setDefaultAddress] DONE: affectedRows=${affectedRows}`);

      if (affectedRows !== 1) {
        throw new Error("Failed to set default address");
      }

    });
  },
};

module.exports = AddressService;
