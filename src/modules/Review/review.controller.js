const reviewService = require("./review.service");

const reviewController = {
  // GET /api/dish/:dishId/reviews - Get all reviews for a dish
  getReviewsByDish: async (req, res, next) => {
    try {
      const { dishId } = req.params;
      const reviews = await reviewService.getReviewsByDish(dishId);

      res.status(200).json({
        success: true,
        data: reviews,
      });
    } catch (error) {
      console.error("Error in getReviewsByDish:", error);
      next(error);
    }
  },

  // POST /api/dish/:dishId/reviews - Create a new review
  createReview: async (req, res, next) => {
    try {
      const { dishId } = req.params;
      const userId = req.user.user_id;
      const { points, content } = req.body;

      const review = await reviewService.createReview({
        userId,
        dishId,
        points,
        content,
      });

      res.status(201).json({
        success: true,
        message: "Đánh giá thành công",
        data: review,
      });
    } catch (error) {
      console.error("Error in createReview:", error);
      next(error);
    }
  },

  // PUT /api/reviews/:reviewId - Update a review
  updateReview: async (req, res, next) => {
    try {
      const { reviewId } = req.params;
      const userId = req.user.user_id;
      const { points, content } = req.body;

      const review = await reviewService.updateReview({
        reviewId,
        userId,
        points,
        content,
      });

      res.status(200).json({
        success: true,
        message: "Cập nhật đánh giá thành công",
        data: review,
      });
    } catch (error) {
      console.error("Error in updateReview:", error);
      next(error);
    }
  },

  // DELETE /api/reviews/:reviewId - Delete a review
  deleteReview: async (req, res, next) => {
    try {
      const { reviewId } = req.params;
      const userId = req.user.user_id;

      await reviewService.deleteReview(reviewId, userId);

      res.status(200).json({
        success: true,
        message: "Xóa đánh giá thành công",
      });
    } catch (error) {
      console.error("Error in deleteReview:", error);
      next(error);
    }
  },

  // GET /api/user/reviews - Get all reviews by current user
  getUserReviews: async (req, res, next) => {
    try {
      const userId = req.user.user_id;
      const reviews = await reviewService.getUserReviews(userId);

      res.status(200).json({
        success: true,
        data: reviews,
      });
    } catch (error) {
      console.error("Error in getUserReviews:", error);
      next(error);
    }
  },
};

module.exports = reviewController;
