const { getProfile, updateProfile, changePassword, findUser } = require("@services/userService");
const { uploadToS3 } = require("@config/multer");
const {
    getAddressesByUserId,
    createAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
} = require("@services/addressService");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/AppError");

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

    // GET /profile - Get user profile with addresses
    getProfile = async (req, res) => {
        try {
            const userId = req.user?.user_id;
            
            // ✅ DEBUG LOGS
            console.log("Fetching profile for user:", userId);
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

    // PUT /profile - Update profile (name, phone, avatar)
    updateProfile = async (req, res) => {
        try {
            const userId = req.user.user_id;
            let avatarUrl = null;

            // Upload avatar to S3 if provided
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

            // Prepare update data with S3 URL
            const updateData = {
                ...req.body,
                ...(avatarUrl && { avatar_path: avatarUrl }),
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

    // PUT /password - Change password
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

    // GET /addresses - Get all addresses
    getAddresses = async (req, res) => {
        try {
            const userId = req.user.user_id;
            const addresses = await getAddressesByUserId(userId);
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

    // POST /addresses - Add new address
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

    // PUT /addresses/:id - Update address
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

    // DELETE /addresses/:id - Delete address
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

    // GET /addresses/:id/default - Set default address
    setDefaultAddress = async (req, res) => {
        try {
            const userId = req.user.user_id;
            const { id } = req.params;
            await setDefaultAddress(userId, id);
            res.json({
                success: true,
                message: "Default address updated successfully",
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message || "Failed to set default address",
            });
        }
    };

    // GET /orders - Get user order history
    getOrders = async (req, res) => {
        try {
            const userId = req.user.user_id;
            const orders = await require("@services/orderService").getUserOrders(userId);
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

    // POST /orders/:id/reorder - Add items from a past order to cart
    reorder = async (req, res) => {
        try {
            const userId = req.user.user_id;
            const { id } = req.params;
            const OrderService = require("@services/orderService");
            const result = await OrderService.reorder(userId, id);
            
            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message || "Failed to reorder items",
            });
        }
    };

    // POST /orders - Place a new order
    placeOrder = catchAsync(async (req, res, next) => {
        const userId = req.user.user_id;
        const orderData = req.body;

        const result = await require("@services/orderService").createOrder(userId, orderData);
        res.status(201).json({
            success: true,
            data: result,
        });
    });

    // GET /orders/:id - Get single order details
    getOrderDetails = catchAsync(async (req, res, next) => {
        const userId = req.user.user_id;
        const { id } = req.params;
        const result = await require("@services/orderService").getOrderById(userId, id);
        res.json({
            success: true,
            data: result,
        });
    });
}

module.exports = new UserController();
