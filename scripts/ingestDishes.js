/**
 * ============================================================
 *  REAL DATA INGESTION SCRIPT — ingestDishes.js
 * ============================================================
 *  Mục đích: Lấy dữ liệu THẬT từ bảng MySQL 'Dishes' thông qua
 *  Sequelize, tạo vector embedding từ Gemini và lưu vào Qdrant.
 * ============================================================
 */

require("dotenv").config();
require("@babel/register"); // Cho phép require các file dùng ES6/Babel trong project

// Import models từ file index tập trung để đảm bảo đã load quan hệ (Associations)
const { dishModel: Dish, categoryModel: Category } = require("../src/models/index");
const {
    buildDishEmbeddingText,
    COLLECTION_NAME,
    generateEmbeddingFromText,
    getQdrantClient,
    getDishPointId,
    upsertDishToSemanticIndex,
} = require("../src/modules/Dish/semanticSearch.service");

// ─── Khởi tạo Clients ───────────────────────────────────────
const qdrant = getQdrantClient();

/**
 * Đảm bảo collection Qdrant sẵn sàng
 */
async function ensureCollectionExists(vectorSize) {
    const { collections } = await qdrant.getCollections();
    const existing = collections.find((c) => c.name === COLLECTION_NAME);

    if (existing) {
        const info = await qdrant.getCollection(COLLECTION_NAME);
        const currentSize = info.config?.params?.vectors?.size;
        if (currentSize !== vectorSize) {
            console.log(
                `ℹ️  Collection "${COLLECTION_NAME}" đang có dim ${currentSize}, sẽ tạo lại theo dim ${vectorSize}.`,
            );
            await qdrant.deleteCollection(COLLECTION_NAME);
        } else {
            return;
        }
    }

    await qdrant.createCollection(COLLECTION_NAME, {
        vectors: { size: vectorSize, distance: "Cosine" },
    });
}

/**
 * CHÍNH: Lấy dữ liệu từ MySQL và nạp vào Qdrant
 */
async function ingestRealData() {
    console.log("🚀 Bắt đầu lấy dữ liệu THẬT từ MySQL, tạo embedding Gemini và nạp vào Qdrant...\n");

    try {
        // Bước 1: Query toàn bộ món ăn từ SQL (kèm theo Category để lấy tên danh mục)
        const realDishes = await Dish.findAll({
            include: [{ model: Category, as: "category" }],
            where: { status: "active", available: true },
        });

        if (realDishes.length === 0) {
            console.log("⚠️  Không tìm thấy món ăn nào trong Database!");
            return;
        }

        const sampleVector = await generateEmbeddingFromText(
            buildDishEmbeddingText(realDishes[0]),
        );
        const vectorSize = sampleVector.length;

        console.log(`🧠 Embedding model hiện tại trả về vector dim ${vectorSize}.`);
        await ensureCollectionExists(vectorSize);

        console.log(`📦 Tìm thấy ${realDishes.length} món ăn. Bắt đầu xử lý vector...`);

        const points = [];

        // Bước 2: Duyệt qua dữ liệu thật
        for (let i = 0; i < realDishes.length; i++) {
            const dish = realDishes[i];
            console.log(`[${i + 1}/${realDishes.length}] Đang xử lý: "${dish.name}"...`);

            try {
                await upsertDishToSemanticIndex(dish);
                points.push(getDishPointId(dish));
                await new Promise((r) => setTimeout(r, 200)); // Rate limit
            } catch (err) {
                console.error(`  ✗ Lỗi tại món "${dish.name}": ${err.message}`);
            }
        }

        // Bước 3: Báo cáo kết quả
        if (points.length > 0) {
            console.log(`\n✅ Thành công! Đã nạp ${points.length} món ăn thật vào Qdrant.`);
        }

    } catch (error) {
        console.error("❌ Lỗi hệ thống:", error.message);
    } finally {
        process.exit(0);
    }
}

ingestRealData();
