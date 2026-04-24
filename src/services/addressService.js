const { addressModel, userModel } = require("@models");
const { sequelize } = require("@config/sequelize");
const { v4: uuidv4 } = require("uuid");

const AddressService = {
  // Get all addresses for user
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

  // Get default address
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

  // Create new address
  createAddress: async (userId, data) => {
    const t = await sequelize.transaction();
    try {
      // 1. Lock user row to prevent race conditions
      await userModel.findByPk(userId, { 
        lock: t.LOCK.UPDATE, 
        transaction: t 
      });

      // 2. Normalize & validate input
      const normalize = (val) => (val || "").toString().trim().replace(/\s+/g, ' ');

      const street = normalize(data.street);
      const ward = normalize(data.ward);
      const city = normalize(data.city);
      const label = data.label || 'Home';

      if (!street || !ward || !city) {
        throw new Error("Address fields (street, ward, city) are required and cannot be empty");
      }
      if (street.length > 255) throw new Error("Street address must be ≤ 255 characters");
      if (ward.length > 100) throw new Error("Ward must be ≤ 100 characters");
      if (city.length > 100) throw new Error("City must be ≤ 100 characters");

      // 3. Determine isDefault: ONLY true if this is the user's FIRST address
      const existingDefault = await addressModel.findOne({
        where: { userId, isDefault: true },
        transaction: t
      });

      const isDefault = !existingDefault; // true only when no default exists

      console.log(`📌 [createAddress] existingDefault: ${existingDefault?.addressId || 'NONE'}, newIsDefault: ${isDefault}`);

      // 4. Create address (NEVER reset existing defaults)
      const addressId = uuidv4();
      const newAddress = await addressModel.create(
        { addressId, userId, street, ward, city, label, isDefault },
        { transaction: t }
      );

      await t.commit();
      return newAddress;
    } catch (error) {
      if (t) await t.rollback();
      console.error("CREATE ADDRESS TRANSACTION FAILED:", error);
      throw error;
    }
  },

  // Update address
  updateAddress: async (addressId, userId, updateData) => {
    try {
      // Verify address belongs to user
      const address = await addressModel.findOne({
        where: { addressId, userId },
      });
      if (!address) {
        throw new Error("Address not found");
      }

      // Handle default change
      if (updateData.isDefault || updateData.is_default) {
        await AddressService.setDefaultAddress(userId, addressId);
      }

      await address.update(updateData);
      return address;
    } catch (error) {
      throw error;
    }
  },

  // Delete address
  deleteAddress: async (addressId, userId) => {
    return sequelize.transaction(async (t) => {
      // 1. Find address to check if it's default
      const address = await addressModel.findOne({
        where: { addressId, userId },
        transaction: t
      });

      if (!address) {
        throw new Error("Address not found");
      }

      const wasDefault = address.isDefault;

      // 2. Delete
      await address.destroy({ transaction: t });

      // 3. If deleted was default, pick a new one
      if (wasDefault) {
        const nextAddress = await addressModel.findOne({
          where: { userId },
          order: [["created_at", "DESC"]],
          transaction: t
        });

        if (nextAddress) {
          nextAddress.isDefault = true;
          await nextAddress.save({ transaction: t });
          console.log(`♻️ [deleteAddress] Auto-promoted ${nextAddress.addressId} to default`);
        }
      }

      return true;
    });
  },

  // Set default address (guarantees exactly one default)
  setDefaultAddress: async (userId, addressId) => {
    return sequelize.transaction(async (t) => {
      console.log(`📌 [setDefaultAddress] START: userId=${userId}, addressId=${addressId}`);

      // 1. Validate
      if (!addressId || addressId === "undefined") {
        throw new Error("Invalid addressId");
      }

      // 2. Lock user row
      await userModel.findByPk(userId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      // 3. Verify address exists and belongs to user
      const address = await addressModel.findOne({
        where: { addressId, userId },
        transaction: t,
      });

      if (!address) {
        throw new Error("Address not found");
      }

      // 4. Reset ALL user addresses to false
      await addressModel.update(
        { isDefault: false },
        { where: { userId }, transaction: t }
      );

      // 5. Set selected address to true
      const [affectedRows] = await addressModel.update(
        { isDefault: true },
        { where: { addressId, userId }, transaction: t }
      );

      console.log(`✅ [setDefaultAddress] DONE: affectedRows=${affectedRows}`);

      if (affectedRows !== 1) {
        throw new Error("Failed to set default address");
      }

      // Transaction auto-commits here
    });
  },
};

module.exports = AddressService;
