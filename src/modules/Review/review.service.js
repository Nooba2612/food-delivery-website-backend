const reviewModel = require("./models/reviewModel");
const { v4: uuidv4 } = require("uuid");
const { sequelize } = require("@core/config/sequelize");
const AppError = require("@core/utils/AppError");
const authUserService = require("@modules/Auth/user.service");
const dishService = require("@modules/Dish/dish.service");

const DISH_REVIEW_ATTRIBUTES = ["dish_id", "name", "thumbnail_path"];

/**
 * Formats a raw review object by appending detailed user information.
 * @param {Object} review - The raw review model instance or plain object.
 * @returns {Promise<Object>} A Promise resolving to the formatted review object.
 */
const formatReviewWithUser = async (review) => {
  const plainReview =
    typeof review.get === "function" ? review.get({ plain: true }) : review;
  const user = await authUserService.getUserById(plainReview.user_id);

  return {
    review_id: plainReview.review_id,
    user: {
      user_id: user?.user_id,
      fullname: user?.fullname,
      username: user?.username,
      avatar: user?.avatarPath || user?.avatar_path || null,
    },
    points: Number(plainReview.points),
    content: plainReview.content,
    created_at: plainReview.created_at,
    updated_at: plainReview.updated_at,
  };
};

const reviewService = {
  /**
   * Retrieves all reviews associated with a specific dish.
   * @param {string} dishId - The unique identifier of the dish.
   * @returns {Promise<Array>} A Promise resolving to an array of formatted review objects.
   */
  getReviewsByDish: async (dishId) => {
    const reviews = await reviewModel.findAll({
      where: { dish_id: dishId },
      order: [["created_at", "DESC"]],
    });

    return Promise.all(reviews.map(formatReviewWithUser));
  },

  /**
   * Creates a new review for a dish.
   * Ensures the user hasn't already reviewed the dish and valid data is provided.
   * @param {Object} params - The review creation parameters.
   * @param {string} params.userId - The unique identifier of the user creating the review.
   * @param {string} params.dishId - The unique identifier of the dish being reviewed.
   * @param {number} params.points - The rating points (0-5).
   * @param {string} params.content - The text content of the review.
   * @returns {Promise<Object>} A Promise resolving to the created and formatted review object.
   * @throws {AppError} If validation fails or the user has already reviewed the dish.
   */
  createReview: async ({ userId, dishId, points, content }) => {
    const t = await sequelize.transaction();

    try {
      if (!points || points < 0 || points > 5) {
        throw new AppError("Điểm đánh giá phải từ 0 đến 5", 400);
      }
      if (!content || content.trim().length === 0) {
        throw new AppError("Nội dung đánh giá không được để trống", 400);
      }

      const dish = await dishService.getDishPlainById(dishId, ["dish_id"], {
        transaction: t,
      });
      if (!dish) {
        throw new AppError("Món ăn không tồn tại", 404);
      }

      const existingReview = await reviewModel.findOne({
        where: { user_id: userId, dish_id: dishId },
        transaction: t,
      });
      if (existingReview) {
        throw new AppError("Bạn đã đánh giá món ăn này rồi", 400);
      }

      const reviewId = uuidv4();
      await reviewModel.create(
        {
          review_id: reviewId,
          user_id: userId,
          dish_id: dishId,
          points: Number(points),
          content: content.trim(),
          created_at: new Date(),
          updated_at: new Date(),
        },
        { transaction: t },
      );

      await updateDishRating(dishId, t);
      await t.commit();

      const review = await reviewModel.findByPk(reviewId);
      return formatReviewWithUser(review);
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  /**
   * Updates an existing review.
   * Verifies that the user attempting the update is the original author.
   * @param {Object} params - The review update parameters.
   * @param {string} params.reviewId - The unique identifier of the review to update.
   * @param {string} params.userId - The unique identifier of the user attempting the update.
   * @param {number} [params.points] - The new rating points (optional).
   * @param {string} [params.content] - The new text content (optional).
   * @returns {Promise<Object>} A Promise resolving to the updated and formatted review object.
   * @throws {AppError} If the review is not found or the user is unauthorized.
   */
  updateReview: async ({ reviewId, userId, points, content }) => {
    const t = await sequelize.transaction();

    try {
      if (points && (points < 0 || points > 5)) {
        throw new AppError("Điểm đánh giá phải từ 0 đến 5", 400);
      }

      const review = await reviewModel.findByPk(reviewId, { transaction: t });
      if (!review) {
        throw new AppError("Đánh giá không tồn tại", 404);
      }
      if (review.user_id !== userId) {
        throw new AppError("Bạn không có quyền chỉnh sửa đánh giá này", 403);
      }

      const updateData = { updated_at: new Date() };
      if (points !== undefined) updateData.points = Number(points);
      if (content !== undefined && content.trim().length > 0) {
        updateData.content = content.trim();
      }

      await review.update(updateData, { transaction: t });
      if (points !== undefined) {
        await updateDishRating(review.dish_id, t);
      }

      await t.commit();
      const updatedReview = await reviewModel.findByPk(reviewId);
      return formatReviewWithUser(updatedReview);
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  /**
   * Deletes a specific review.
   * Verifies that the user attempting the deletion is the original author.
   * @param {string} reviewId - The unique identifier of the review to delete.
   * @param {string} userId - The unique identifier of the user attempting the deletion.
   * @returns {Promise<void>}
   * @throws {AppError} If the review is not found or the user is unauthorized.
   */
  deleteReview: async (reviewId, userId) => {
    const t = await sequelize.transaction();

    try {
      const review = await reviewModel.findByPk(reviewId, { transaction: t });
      if (!review) {
        throw new AppError("Đánh giá không tồn tại", 404);
      }
      if (review.user_id !== userId) {
        throw new AppError("Bạn không có quyền xóa đánh giá này", 403);
      }

      const dishId = review.dish_id;
      await review.destroy({ transaction: t });
      await updateDishRating(dishId, t);
      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  /**
   * Retrieves all reviews created by a specific user.
   * Appends dish details to each review.
   * @param {string} userId - The unique identifier of the user.
   * @returns {Promise<Array>} A Promise resolving to an array of formatted review objects with dish details.
   */
  getUserReviews: async (userId) => {
    const reviews = await reviewModel.findAll({
      where: { user_id: userId },
      order: [["created_at", "DESC"]],
    });

    const dishIds = reviews.map((review) => review.dish_id);
    const dishes = await dishService.getDishesPlainByIds(
      dishIds,
      DISH_REVIEW_ATTRIBUTES,
    );
    const dishMap = new Map(dishes.map((dish) => [dish.dish_id, dish]));

    return reviews.map((review) => {
      const plainReview = review.get({ plain: true });
      const dish = dishMap.get(plainReview.dish_id);
      return {
        review_id: plainReview.review_id,
        dish: {
          dish_id: dish?.dish_id,
          name: dish?.name,
          thumbnail: dish?.thumbnail_path,
        },
        points: Number(plainReview.points),
        content: plainReview.content,
        created_at: plainReview.created_at,
        updated_at: plainReview.updated_at,
      };
    });
  },
};

/**
 * Calculates and updates the average rating and total review count for a dish.
 * @param {string} dishId - The unique identifier of the dish.
 * @param {Object} transaction - The Sequelize transaction object.
 * @returns {Promise<void>}
 */
const updateDishRating = async (dishId, transaction) => {
  const reviews = await reviewModel.findAll({
    where: { dish_id: dishId },
    attributes: ["points"],
    transaction,
  });

  const ratingCount = reviews.length;
  const ratingAvg =
    ratingCount > 0
      ? reviews.reduce((sum, review) => sum + Number(review.points), 0) /
        ratingCount
      : 0;

  await dishService.updateDishRating(
    dishId,
    ratingAvg.toFixed(1),
    ratingCount,
    transaction,
  );
};

module.exports = reviewService;
