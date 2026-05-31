require("dotenv").config();

if (
  String(process.env.EMBEDDING_BASE_URL || "").includes("host.docker.internal")
) {
  process.env.EMBEDDING_BASE_URL = String(
    process.env.EMBEDDING_BASE_URL,
  ).replace("host.docker.internal", "127.0.0.1");
  console.log(
    `[Reindex] Override EMBEDDING_BASE_URL for local script: ${process.env.EMBEDDING_BASE_URL}`,
  );
}

const { sequelize } = require("@core/config/sequelize");
const { dishModel, categoryModel } = require("@models/index");
const {
  isSemanticSearchEnabled,
  removeDishFromSemanticIndex,
  upsertDishToSemanticIndex,
} = require("@modules/Dish/semanticSearch.service");

async function run() {
  if (!isSemanticSearchEnabled()) {
    throw new Error(
      "Semantic search chưa được cấu hình. Kiểm tra QDRANT_URL, EMBEDDING_BASE_URL và EMBEDDING_API_KEY.",
    );
  }

  const dishes = await dishModel.findAll({
    include: [
      {
        model: categoryModel,
        as: "category",
        attributes: ["category_id", "name"],
      },
    ],
    order: [["name", "ASC"]],
  });

  let upsertedCount = 0;
  let removedCount = 0;

  for (const dish of dishes) {
    const plainDish = dish.get({ plain: true });
    const dishName = plainDish?.name || plainDish?.dish_id || "N/A";

    if (plainDish?.status === "active" && plainDish?.available) {
      await upsertDishToSemanticIndex(dish);
      upsertedCount += 1;
      console.log(`[Reindex] Upserted: ${dishName}`);
      continue;
    }

    await removeDishFromSemanticIndex(plainDish?.dish_id);
    removedCount += 1;
    console.log(`[Reindex] Removed inactive/unavailable: ${dishName}`);
  }

  console.log(
    `[Reindex] Hoàn tất. Upserted=${upsertedCount}, Removed=${removedCount}, Total=${dishes.length}`,
  );
}

run()
  .catch((error) => {
    console.error("[Reindex] Lỗi:", error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await sequelize.close();
    } catch (_error) {
      // Ignore close errors during script shutdown.
    }
  });
