const { Op } = require("sequelize");
const dishModel = require("./models/dishModel");

/**
 * Retrieves all dishes from the database.
 * @returns {Promise<Array>} A Promise resolving to an array of all dishes.
 */
const getAllDish = async () => {
  try {
    return await dishModel.findAll();
  } catch (error) {
    console.error(error);
  }
};

/**
 * Searches for dishes matching a specific name pattern (partial match).
 * @param {string} name - The search term to match against dish names.
 * @returns {Promise<Array>} A Promise resolving to an array of matching dishes.
 * @throws {Error} If the database query fails.
 */
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

/**
 * Retrieves a single dish by its unique ID, fetching only specified attributes.
 * @param {string} dish_id - The unique identifier of the dish.
 * @param {Array<string>} attributes - Array of column names to retrieve.
 * @returns {Promise<Object|null>} A Promise resolving to the dish object or null.
 */
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

/**
 * Retrieves a plain JavaScript object of a dish by its ID.
 * @param {string} dishId - The unique identifier of the dish.
 * @param {Array<string>} attributes - Array of column names to retrieve.
 * @param {Object} [options={}] - Additional Sequelize query options.
 * @returns {Promise<Object|null>} A Promise resolving to the plain dish object or null.
 */
const getDishPlainById = async (dishId, attributes, options = {}) => {
  const dish = await dishModel.findOne({
    ...options,
    attributes,
    where: { dish_id: dishId },
  });
  return dish ? dish.get({ plain: true }) : null;
};

/**
 * Retrieves an array of plain JavaScript dish objects by their IDs.
 * @param {Array<string>} dishIds - Array of unique dish identifiers.
 * @param {Array<string>} attributes - Array of column names to retrieve.
 * @param {Object} [options={}] - Additional Sequelize query options.
 * @returns {Promise<Array>} A Promise resolving to an array of plain dish objects.
 */
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

/**
 * Decrements the stock quantity of a specific dish safely.
 * @param {string} dishId - The unique identifier of the dish.
 * @param {number} quantity - The amount to decrement the stock by.
 * @param {Object} [transaction=null] - Optional Sequelize transaction.
 * @returns {Promise<void>}
 */
const decrementDishStock = async (dishId, quantity, transaction = null) => {
  await dishModel.decrement("stock", {
    by: quantity,
    where: { dish_id: dishId },
    transaction,
  });
};

/**
 * Finds a dish by its primary key.
 * @param {string} dishId - The primary key of the dish.
 * @param {Object} [options={}] - Sequelize query options.
 * @returns {Promise<Object|null>} A Promise resolving to the dish model instance.
 */
const findDishById = async (dishId, options = {}) => {
  return dishModel.findByPk(dishId, options);
};

/**
 * Finds a single dish record matching the provided conditions.
 * @param {Object} where - Sequelize where clause object.
 * @param {Object} [options={}] - Additional Sequelize query options.
 * @returns {Promise<Object|null>} A Promise resolving to the dish model instance.
 */
const findDishRecord = async (where, options = {}) => {
  return dishModel.findOne({
    ...options,
    where,
  });
};

/**
 * Finds and counts all dishes matching the provided options (useful for pagination).
 * @param {Object} [options={}] - Sequelize query options including where, limit, offset.
 * @returns {Promise<{rows: Array, count: number}>} A Promise resolving to the results and total count.
 */
const findAndCountDishes = async (options = {}) => {
  return dishModel.findAndCountAll(options);
};

/**
 * Finds all dishes matching the provided options.
 * @param {Object} [options={}] - Sequelize query options.
 * @returns {Promise<Array>} A Promise resolving to an array of dish model instances.
 */
const findAllDishes = async (options = {}) => {
  return dishModel.findAll(options);
};

/**
 * Counts the number of dishes matching the provided options.
 * @param {Object} [options={}] - Sequelize query options.
 * @returns {Promise<number>} A Promise resolving to the count of dishes.
 */
const countDishes = async (options = {}) => {
  return dishModel.count(options);
};

/**
 * Updates the average rating and review count for a dish.
 * @param {string} dishId - The unique identifier of the dish.
 * @param {number} ratingAvg - The new average rating.
 * @param {number} ratingCount - The new total number of ratings.
 * @param {Object} [transaction=null] - Optional Sequelize transaction.
 * @returns {Promise<Array>} A Promise resolving to the update result.
 */
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

/**
 * Creates a new dish record in the database.
 * @param {Object} data - The dish data to insert.
 * @returns {Promise<Object>} A Promise resolving to the newly created dish instance.
 * @throws {Error} If creation fails.
 */
const createDish = async (data) => {
  try {
    return await dishModel.create(data);
  } catch (error) {
    console.error("Create dish failed:", error);
    throw error;
  }
};

/**
 * Updates an existing dish record.
 * @param {string} dish_id - The unique identifier of the dish to update.
 * @param {Object} data - The data fields to update.
 * @returns {Promise<Object|null>} A Promise resolving to the updated dish, or null if not found.
 * @throws {Error} If update fails.
 */
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

/**
 * Deletes a dish from the database.
 * @param {string} dish_id - The unique identifier of the dish to delete.
 * @returns {Promise<boolean|null>} A Promise resolving to true if deleted, null if not found.
 * @throws {Error} If deletion fails.
 */
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
