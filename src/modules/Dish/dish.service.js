const { Op } = require("sequelize");
const dishModel = require("./models/dishModel");

const getAllDish = async () => {
  try {
    return await dishModel.findAll();
  } catch (error) {
    console.error(error);
  }
};

const getDishesByName = async (name) => {
  try {
    return await dishModel.findAll({
      where: {
        name: {
          [Op.like]: `%${name}%`,
        },
      },
    });
  } catch (error) {
    console.error("Error finding dishes by name:", error);
    throw error;
  }
};

const getDishById = async (dish_id, attributes) => {
  try {
    return await dishModel.findOne({
      attributes: attributes,
      where: { dish_id: dish_id },
    });
  } catch (error) {
    console.log("Get dish failed", error);
  }
};

const getDishPlainById = async (dishId, attributes, options = {}) => {
  const dish = await dishModel.findOne({
    ...options,
    attributes,
    where: { dish_id: dishId },
  });
  return dish ? dish.get({ plain: true }) : null;
};

const getDishesPlainByIds = async (dishIds, attributes, options = {}) => {
  if (!Array.isArray(dishIds) || dishIds.length === 0) {
    return [];
  }

  const dishes = await dishModel.findAll({
    ...options,
    attributes,
    where: {
      dish_id: {
        [Op.in]: dishIds,
      },
    },
  });

  return dishes.map((dish) => dish.get({ plain: true }));
};

const decrementDishStock = async (dishId, quantity, transaction = null) => {
  await dishModel.decrement("stock", {
    by: quantity,
    where: { dish_id: dishId },
    transaction,
  });
};

const findDishById = async (dishId, options = {}) => {
  return dishModel.findByPk(dishId, options);
};

const findDishRecord = async (where, options = {}) => {
  return dishModel.findOne({
    ...options,
    where,
  });
};

const findAndCountDishes = async (options = {}) => {
  return dishModel.findAndCountAll(options);
};

const findAllDishes = async (options = {}) => {
  return dishModel.findAll(options);
};

const countDishes = async (options = {}) => {
  return dishModel.count(options);
};

const updateDishRating = async (
  dishId,
  ratingAvg,
  ratingCount,
  transaction = null,
) => {
  return dishModel.update(
    {
      rating_avg: ratingAvg,
      rating_count: ratingCount,
    },
    {
      where: { dish_id: dishId },
      transaction,
    },
  );
};

const createDish = async (data) => {
  try {
    return await dishModel.create(data);
  } catch (error) {
    console.error("Create dish failed:", error);
    throw error;
  }
};

const updateDish = async (dish_id, data) => {
  try {
    const dish = await dishModel.findByPk(dish_id);
    if (!dish) return null;
    await dish.update(data);
    return dish;
  } catch (error) {
    console.error("Update dish failed:", error);
    throw error;
  }
};

const deleteDish = async (dish_id) => {
  try {
    const dish = await dishModel.findByPk(dish_id);
    if (!dish) return null;
    await dish.destroy();
    return true;
  } catch (error) {
    console.error("Delete dish failed:", error);
    throw error;
  }
};

module.exports = {
  countDishes,
  decrementDishStock,
  findAllDishes,
  findAndCountDishes,
  findDishById,
  findDishRecord,
  getAllDish,
  getDishesByName,
  getDishById,
  getDishPlainById,
  getDishesPlainByIds,
  updateDishRating,
  createDish,
  updateDish,
  deleteDish,
};
