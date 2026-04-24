const { reviewModel, userModel, dishModel } = require("@models");
const { v4: uuidv4 } = require("uuid");
const AppError = require("../utils/AppError");

const reviewService = {
    // Lấy tất cả reviews của món ăn
    getReviewsByDish: async (dishId) => {
        try {
            const reviews = await reviewModel.findAll({
                where: { dish_id: dishId },
                include: [
                    {
                        model: userModel,
                        as: "user",
                        attributes: ["userId", "fullname", "avatarPath"],
                    },
                ],
                order: [["created_at", "DESC"]],
            });

            return reviews.map((review) => {
                const plainReview = review.get({ plain: true });
                return {
                    review_id: plainReview.review_id,
                    user: {
                        user_id: plainReview.user?.userId,
                        fullname: plainReview.user?.fullname || "Người dùng",
                        avatar: plainReview.user?.avatarPath,
                    },
                    points: Number(plainReview.points),
                    content: plainReview.content,
                    created_at: plainReview.created_at,
                    updated_at: plainReview.updated_at,
                };
            });
        } catch (error) {
            console.error("Error fetching reviews by dish:", error);
            throw error;
        }
    },

    // Tạo review mới
    createReview: async ({ userId, dishId, points, content }) => {
        const { sequelize } = require("@config/sequelize");
        const t = await sequelize.transaction();

        try {
            // Validate input
            if (!points || points < 0 || points > 5) {
                throw new AppError("Điểm đánh giá phải từ 0 đến 5", 400);
            }

            if (!content || content.trim().length === 0) {
                throw new AppError("Nội dung đánh giá không được để trống", 400);
            }

            // Kiểm tra món ăn có tồn tại không
            const dish = await dishModel.findByPk(dishId, { transaction: t });
            if (!dish) {
                throw new AppError("Món ăn không tồn tại", 404);
            }

            // Kiểm tra user đã review món này chưa
            const existingReview = await reviewModel.findOne({
                where: {
                    user_id: userId,
                    dish_id: dishId,
                },
                transaction: t,
            });

            if (existingReview) {
                throw new AppError("Bạn đã đánh giá món ăn này rồi", 400);
            }

            // Tạo review mới
            const reviewId = uuidv4();
            const review = await reviewModel.create(
                {
                    review_id: reviewId,
                    user_id: userId,
                    dish_id: dishId,
                    points: Number(points),
                    content: content.trim(),
                    created_at: new Date(),
                    updated_at: new Date(),
                },
                { transaction: t }
            );

            // Cập nhật rating của món ăn
            await updateDishRating(dishId, t);

            await t.commit();

            // Lấy review với thông tin user
            const reviewWithUser = await reviewModel.findByPk(reviewId, {
                include: [
                    {
                        model: userModel,
                        as: "user",
                        attributes: ["userId", "fullname", "avatarPath"],
                    },
                ],
            });

            const plainReview = reviewWithUser.get({ plain: true });
            return {
                review_id: plainReview.review_id,
                user: {
                    user_id: plainReview.user?.userId,
                    fullname: plainReview.user?.fullname || "Người dùng",
                    avatar: plainReview.user?.avatarPath,
                },
                points: Number(plainReview.points),
                content: plainReview.content,
                created_at: plainReview.created_at,
                updated_at: plainReview.updated_at,
            };
        } catch (error) {
            await t.rollback();
            console.error("Error creating review:", error);
            throw error;
        }
    },

    // Cập nhật review
    updateReview: async ({ reviewId, userId, points, content }) => {
        const { sequelize } = require("@config/sequelize");
        const t = await sequelize.transaction();

        try {
            // Validate input
            if (points && (points < 0 || points > 5)) {
                throw new AppError("Điểm đánh giá phải từ 0 đến 5", 400);
            }

            // Tìm review
            const review = await reviewModel.findByPk(reviewId, { transaction: t });
            if (!review) {
                throw new AppError("Đánh giá không tồn tại", 404);
            }

            // Kiểm tra quyền sở hữu
            if (review.user_id !== userId) {
                throw new AppError("Bạn không có quyền chỉnh sửa đánh giá này", 403);
            }

            // Cập nhật review
            const updateData = {
                updated_at: new Date(),
            };

            if (points !== undefined) {
                updateData.points = Number(points);
            }

            if (content !== undefined && content.trim().length > 0) {
                updateData.content = content.trim();
            }

            await review.update(updateData, { transaction: t });

            // Cập nhật rating của món ăn nếu points thay đổi
            if (points !== undefined) {
                await updateDishRating(review.dish_id, t);
            }

            await t.commit();

            // Lấy review với thông tin user
            const reviewWithUser = await reviewModel.findByPk(reviewId, {
                include: [
                    {
                        model: userModel,
                        as: "user",
                        attributes: ["userId", "fullname", "avatarPath"],
                    },
                ],
            });

            const plainReview = reviewWithUser.get({ plain: true });
            return {
                review_id: plainReview.review_id,
                user: {
                    user_id: plainReview.user?.userId,
                    fullname: plainReview.user?.fullname || "Người dùng",
                    avatar: plainReview.user?.avatarPath,
                },
                points: Number(plainReview.points),
                content: plainReview.content,
                created_at: plainReview.created_at,
                updated_at: plainReview.updated_at,
            };
        } catch (error) {
            await t.rollback();
            console.error("Error updating review:", error);
            throw error;
        }
    },

    // Xóa review
    deleteReview: async (reviewId, userId) => {
        const { sequelize } = require("@config/sequelize");
        const t = await sequelize.transaction();

        try {
            // Tìm review
            const review = await reviewModel.findByPk(reviewId, { transaction: t });
            if (!review) {
                throw new AppError("Đánh giá không tồn tại", 404);
            }

            // Kiểm tra quyền sở hữu
            if (review.user_id !== userId) {
                throw new AppError("Bạn không có quyền xóa đánh giá này", 403);
            }

            const dishId = review.dish_id;

            // Xóa review
            await review.destroy({ transaction: t });

            // Cập nhật rating của món ăn
            await updateDishRating(dishId, t);

            await t.commit();
        } catch (error) {
            await t.rollback();
            console.error("Error deleting review:", error);
            throw error;
        }
    },

    // Lấy tất cả reviews của user
    getUserReviews: async (userId) => {
        try {
            const reviews = await reviewModel.findAll({
                where: { user_id: userId },
                include: [
                    {
                        model: dishModel,
                        as: "dish",
                        attributes: ["dish_id", "name", "thumbnail_path"],
                    },
                ],
                order: [["created_at", "DESC"]],
            });

            return reviews.map((review) => {
                const plainReview = review.get({ plain: true });
                return {
                    review_id: plainReview.review_id,
                    dish: {
                        dish_id: plainReview.dish?.dish_id,
                        name: plainReview.dish?.name,
                        thumbnail: plainReview.dish?.thumbnail_path,
                    },
                    points: Number(plainReview.points),
                    content: plainReview.content,
                    created_at: plainReview.created_at,
                    updated_at: plainReview.updated_at,
                };
            });
        } catch (error) {
            console.error("Error fetching user reviews:", error);
            throw error;
        }
    },
};

// Helper function: Cập nhật rating của món ăn
const updateDishRating = async (dishId, transaction) => {
    try {
        // Tính toán rating trung bình và số lượng reviews
        const reviews = await reviewModel.findAll({
            where: { dish_id: dishId },
            attributes: ["points"],
            transaction,
        });

        const ratingCount = reviews.length;
        const ratingAvg = ratingCount > 0
            ? reviews.reduce((sum, r) => sum + Number(r.points), 0) / ratingCount
            : 0;

        // Cập nhật dish
        await dishModel.update(
            {
                rating_avg: ratingAvg.toFixed(1),
                rating_count: ratingCount,
            },
            {
                where: { dish_id: dishId },
                transaction,
            }
        );
    } catch (error) {
        console.error("Error updating dish rating:", error);
        throw error;
    }
};

module.exports = reviewService;
