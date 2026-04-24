const { getAllDish, getDishesByName } = require("@services/dishService");
const dishModel = require("@models/dishModel");
const { where, Op } = require("sequelize");
const categoryModel = require("@models/categoryModel");

class dishController {
  async getDishes(req, res) {
    try {
      const { dishModel, categoryModel } = require("@models");
      const { Op } = require("sequelize");
      
      const searchCondition = {};
      const { name, sort, category } = req.query;

      if (name) {
        searchCondition.name = { [Op.like]: `%${name}%` };
      }

      if (category) {
        const categoryRecord = await categoryModel.findOne({
          where: { name: category },
        });
        
        if (!categoryRecord) {
          return res.status(404).json({ 
            success: false, 
            message: "Category not found" 
          });
        }
        searchCondition.category_id = categoryRecord.category_id;
      }

      const dishes = await dishModel.findAll({
        where: searchCondition,
        include: [
          {
            model: categoryModel,
            as: 'category',
            attributes: ['category_id', 'name']
          }
        ],
        order: [["price", sort || "ASC"]],
      });

      if (!dishes || dishes.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: "No dishes found" 
        });
      }

      return res.status(200).json({
        success: true,
        data: dishes
      });
    } catch (error) {
      console.error("Error in getDishes:", error);
      return res.status(500).json({ 
        success: false, 
        error: "Internal server error",
        message: error.message 
      });
    }
  }

  async getDishById(req, res) {
    try {
      const { id } = req.params;

      const dish = await dishModel.findOne({
        where: { dish_id: id },
      });

      if (!dish) {
        return res.status(404).json({
          message: "Dish not found",
        });
      }

      return res.status(200).json(dish);
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }
  async getSimilarDishes(req, res) {
    try {
      const { id } = req.params;

      // 1. Lấy dish hiện tại
      const currentDish = await dishModel.findOne({
        where: { dish_id: id },
      });

      if (!currentDish) {
        return res.status(404).json({
          message: "Dish not found",
        });
      }

      // 2. Lấy các dish cùng category (trừ chính nó)
      const similarDishes = await dishModel.findAll({
        where: {
          category_id: currentDish.category_id,
          dish_id: {
            [Op.ne]: id,
          },
        },
        limit: 8,
      });

      return res.status(200).json(similarDishes);
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }
}

module.exports = new dishController();
