const {
  getProfile,
  updateProfile,
  changePassword,
  findUser,
} = require("./user.service");
const {
  addFavoriteDish,
  getFavoriteDishes,
  isFavoriteDish,
  removeFavoriteDish,
} = require("./favorite.service");
const { uploadToS3 } = require("@core/config/multer");
const {
  getAddressesByUserId,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} = require("./address.service");
const catchAsync = require("@core/utils/catchAsync");
const AppError = require("@core/utils/AppError");

class UserController {
  findUser = async (req, res) => {
    try {
      const { query } = req.query;
      if (!query) {
        return res.status(400).json({
          success: false,
          message: "Query parameter is required",
        });
      }

      const users = await findUser(query);
      res.json({
        success: true,
        data: users,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

  getProfile = async (req, res) => {
    try {
      const userId = req.user?.user_id;

      console.log("PROFILE userId:", userId);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User ID missing from request",
        });
      }

      const profile = await getProfile(userId);
      res.json({
        success: true,
        data: profile,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get profile",
      });
    }
  };

  updateProfile = async (req, res) => {
    try {
      const userId = req.user.id; // Using .id as requested
      let avatarUrl = null;

      if (req.file) {
        try {
          avatarUrl = await uploadToS3(req.file, "profiles");
        } catch (error) {
          console.error("Failed to upload profile avatar:", error);
          return res.status(500).json({
            success: false,
            message: `Failed to upload avatar: ${error.message}`,
          });
        }
      }

      const updateData = {
        ...req.body,
        ...(avatarUrl && { avatarPath: avatarUrl }),
      };

      const profile = await updateProfile(userId, updateData);

      res.json({
        success: true,
        message: "Profile updated successfully",
        data: profile,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message || "Failed to update profile",
      });
    }
  };

  changePassword = async (req, res) => {
    try {
      const userId = req.user.user_id;
      const { oldPassword, newPassword } = req.body;

      if (!oldPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: "Old and new password required",
        });
      }

      await changePassword(userId, oldPassword, newPassword);

      res.json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to change password",
      });
    }
  };

  getAddresses = async (req, res) => {
    try {
      const userId = req.user.user_id;
      const addresses = await getAddressesByUserId(userId);
      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
      res.set("Pragma", "no-cache");
      res.json({
        success: true,
        data: addresses,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get addresses",
      });
    }
  };

  addAddress = async (req, res) => {
    try {
      const userId = req.user.user_id;
      const address = await createAddress(userId, req.body);
      res.status(201).json({
        success: true,
        message: "Address added successfully",
        data: address,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message || "Failed to add address",
      });
    }
  };

  updateAddress = async (req, res) => {
    try {
      const userId = req.user.user_id;
      const { id } = req.params;
      const address = await updateAddress(id, userId, req.body);
      res.json({
        success: true,
        message: "Address updated successfully",
        data: address,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message || "Failed to update address",
      });
    }
  };

  deleteAddress = async (req, res) => {
    try {
      const userId = req.user.user_id;
      const { id } = req.params;
      await deleteAddress(id, userId);
      res.json({
        success: true,
        message: "Address deleted successfully",
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message || "Failed to delete address",
      });
    }
  };

  setDefaultAddress = async (req, res) => {
    try {
      const userId = req.user.user_id;
      const { id } = req.params;
      console.log(
        `📌 [Controller] setDefaultAddress called: userId=${userId}, addressId=${id}`,
      );
      await setDefaultAddress(userId, id);
      console.log(`✅ [Controller] setDefaultAddress SUCCESS for ${id}`);
      res.json({
        success: true,
        message: "Default address updated successfully",
      });
    } catch (error) {
      console.error(`❌ [Controller] setDefaultAddress FAILED:`, error.message);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to set default address",
      });
    }
  };

  getOrders = async (req, res) => {
    try {
      const userId = req.user.user_id;
      const orders =
        await require("@modules/Order/order.service").getUserOrders(userId);
      res.json({
        success: true,
        data: orders,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch orders",
      });
    }
  };

  reorder = async (req, res) => {
    try {
      const userId = req.user.user_id;
      const { id } = req.params;
      const OrderService = require("@modules/Order/order.service");
      const result = await OrderService.reorder(userId, id);

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to reorder items",
      });
    }
  };

  placeOrder = catchAsync(async (req, res) => {
    const userId = req.user.user_id;
    const orderData = req.body;

    const result = await require("@modules/Order/order.service").createOrder(
      userId,
      orderData,
    );
    res.status(201).json({
      success: true,
      data: result,
    });
  });

  getOrderDetails = catchAsync(async (req, res) => {
    const userId = req.user.user_id;
    const { id } = req.params;
    const result = await require("@modules/Order/order.service").getOrderById(
      userId,
      id,
    );
    res.json({
      success: true,
      data: result,
    });
  });

  getFavorites = catchAsync(async (req, res) => {
    const userId = req.user.user_id;
    const favorites = await getFavoriteDishes(userId);

    res.json({
      success: true,
      data: favorites,
    });
  });

  addFavorite = catchAsync(async (req, res) => {
    const userId = req.user.user_id;
    const { dish_id: dishId } = req.body;

    if (!dishId) {
      throw new AppError("Thiếu dish_id", 400);
    }

    const result = await addFavoriteDish(userId, dishId);
    res.status(201).json({
      success: true,
      message: "Đã thêm vào món yêu thích tạm thời",
      data: result,
    });
  });

  removeFavorite = catchAsync(async (req, res) => {
    const userId = req.user.user_id;
    const { dishId } = req.params;
    const result = await removeFavoriteDish(userId, dishId);

    res.json({
      success: true,
      message: result.removed
        ? "Đã xóa khỏi món yêu thích tạm thời"
        : "Món này chưa có trong danh sách yêu thích",
      data: result,
    });
  });

  getFavoriteStatus = catchAsync(async (req, res) => {
    const userId = req.user.user_id;
    const { dishId } = req.params;
    const favorite = await isFavoriteDish(userId, dishId);

    res.json({
      success: true,
      data: {
        dish_id: dishId,
        is_favorite: favorite,
      },
    });
  });
}

module.exports = new UserController();
