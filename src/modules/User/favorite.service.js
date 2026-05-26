const { getRedisClient, isRedisEnabled } = require("@core/config/redis");
const AppError = require("@core/utils/AppError");
const dishService = require("@modules/Dish/dish.service");
const categoryService = require("@modules/Dish/category.service");

const FAVORITES_KEY_PREFIX = "favorites:user:";
const FAVORITES_TTL_SECONDS = parseInt(
  process.env.REDIS_FAVORITES_TTL_SECONDS || "604800",
  10,
);

function getFavoritesKey(userId) {
  return `${FAVORITES_KEY_PREFIX}${userId}`;
}

async function ensureRedisReady() {
  if (!isRedisEnabled()) {
    throw new AppError("Redis chưa được cấu hình", 503);
  }

  try {
    return await getRedisClient();
  } catch (error) {
    throw new AppError(
      `Không thể kết nối Redis: ${error.message || "Unknown error"}`,
      503,
    );
  }
}

async function attachCategoriesToDishes(dishes) {
  const categoryIds = [
    ...new Set(dishes.map((dish) => dish.category_id).filter(Boolean)),
  ];

  const categories = await Promise.all(
    categoryIds.map((categoryId) => categoryService.getCategoryById(categoryId)),
  );

  const categoryMap = new Map(
    categories.filter(Boolean).map((category) => [
      category.category_id,
      {
        category_id: category.category_id,
        name: category.name,
      },
    ]),
  );

  return dishes.map((dish) => ({
    ...dish,
    category: dish.category_id ? categoryMap.get(dish.category_id) || null : null,
  }));
}

async function ensureDishExists(dishId) {
  const dish = await dishService.findDishById(dishId);
  if (!dish) {
    throw new AppError("Không tìm thấy món ăn", 404);
  }

  return dish.get({ plain: true });
}

async function addFavoriteDish(userId, dishId) {
  const client = await ensureRedisReady();
  const dish = await ensureDishExists(dishId);
  const key = getFavoritesKey(userId);

  await client.zAdd(key, [
    {
      score: Date.now(),
      value: dishId,
    },
  ]);

  await client.expire(key, FAVORITES_TTL_SECONDS);

  return {
    dish_id: dishId,
    expires_in_seconds: FAVORITES_TTL_SECONDS,
    dish,
  };
}

async function removeFavoriteDish(userId, dishId) {
  const client = await ensureRedisReady();
  const removedCount = await client.zRem(getFavoritesKey(userId), dishId);

  return {
    dish_id: dishId,
    removed: removedCount > 0,
  };
}

async function getFavoriteDishIds(userId) {
  const client = await ensureRedisReady();
  return client.zRange(getFavoritesKey(userId), 0, -1, { REV: true });
}

async function isFavoriteDish(userId, dishId) {
  const client = await ensureRedisReady();
  const score = await client.zScore(getFavoritesKey(userId), dishId);
  return score !== null;
}

async function getFavoriteDishes(userId) {
  const dishIds = await getFavoriteDishIds(userId);
  if (dishIds.length === 0) {
    return {
      total: 0,
      items: [],
    };
  }

  const dishes = await dishService.getDishesPlainByIds(dishIds);
  const dishMap = new Map(dishes.map((dish) => [dish.dish_id, dish]));
  const orderedDishes = dishIds.map((dishId) => dishMap.get(dishId)).filter(Boolean);
  const items = await attachCategoriesToDishes(orderedDishes);

  return {
    total: items.length,
    items,
  };
}

module.exports = {
  addFavoriteDish,
  getFavoriteDishes,
  getFavoriteDishIds,
  isFavoriteDish,
  removeFavoriteDish,
};
