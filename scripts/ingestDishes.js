/**
 * ============================================================
 *  REAL DATA INGESTION SCRIPT — ingestDishes.js
 * ============================================================
 *  Mục đích: Lấy dữ liệu THẬT từ bảng MySQL 'Dishes' thông qua
 *  Sequelize, tạo vector embedding local và lưu vào Qdrant.
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
} = require("../src/services/semanticDishSearchService");

// ─── Khởi tạo Clients ───────────────────────────────────────
const qdrant = getQdrantClient();

// ─── Hằng số ────────────────────────────────────────────────
const VECTOR_SIZE = parseInt(process.env.QDRANT_VECTOR_SIZE || "3072", 10);

/**
 * Tạo embedding từ dữ liệu thật của món ăn
 */
async function generateEmbedding(dish) {
    return generateEmbeddingFromText(buildDishEmbeddingText(dish));
}

/**
 * Đảm bảo collection Qdrant sẵn sàng
 */
async function ensureCollectionExists() {
    const { collections } = await qdrant.getCollections();
    const existing = collections.find((c) => c.name === COLLECTION_NAME);

    if (existing) {
        const info = await qdrant.getCollection(COLLECTION_NAME);
        if (info.config?.params?.vectors?.size !== VECTOR_SIZE) {
            await qdrant.deleteCollection(COLLECTION_NAME);
        } else {
            return;
        }
    }

    await qdrant.createCollection(COLLECTION_NAME, {
        vectors: { size: VECTOR_SIZE, distance: "Cosine" },
    });
}

/**
 * CHÍNH: Lấy dữ liệu từ MySQL và nạp vào Qdrant
 */
async function ingestRealData() {
    console.log("🚀 Bắt đầu lấy dữ liệu THẬT từ MySQL, tạo embedding local và nạp vào Qdrant...\n");

    try {
        await ensureCollectionExists();

        // Bước 1: Query toàn bộ món ăn từ SQL (kèm theo Category để lấy tên danh mục)
        const realDishes = await Dish.findAll({
            include: [{ model: Category, as: "category" }],
            where: { status: "active", available: true },
        });

        if (realDishes.length === 0) {
            console.log("⚠️  Không tìm thấy món ăn nào trong Database!");
            return;
        }

        console.log(`📦 Tìm thấy ${realDishes.length} món ăn. Bắt đầu xử lý vector...`);

        const points = [];

        // Bước 2: Duyệt qua dữ liệu thật
        for (let i = 0; i < realDishes.length; i++) {
            const dish = realDishes[i];
            console.log(`[${i + 1}/${realDishes.length}] Đang xử lý: "${dish.name}"...`);

            try {
                const vector = await generateEmbedding(dish);

                // Lưu ý: Qdrant ID cần là uuid hoặc integer.
                // Ở đây tôi dùng dish_id nếu nó là integer hoặc băm nó ra.
                // Nếu dish_id là string (như trong model của bạn), tôi sẽ dùng cơ chế băm/id giả.
                const pointId = i + 1;

                points.push({
                    id: pointId,
                    vector,
                    payload: {
                        dish_id: dish.dish_id,
                        name: dish.name,
                        brand: dish.brand,
                        price: parseFloat(dish.price),
                        category: dish.category?.name || "N/A",
                        description: dish.description,
                        image_url: dish.thumbnail_path,
                        rating: parseFloat(dish.rating_avg || 0),
                    },
                });

                await new Promise((r) => setTimeout(r, 200)); // Rate limit
            } catch (err) {
                console.error(`  ✗ Lỗi tại món "${dish.name}": ${err.message}`);
            }
        }

        // Bước 3: Đẩy lên Qdrant
        if (points.length > 0) {
            await qdrant.upsert(COLLECTION_NAME, { wait: true, points });
            console.log(`\n✅ Thành công! Đã nạp ${points.length} món ăn thật vào Qdrant.`);
        }

    } catch (error) {
        console.error("❌ Lỗi hệ thống:", error.message);
    } finally {
        process.exit(0);
    }
}

ingestRealData();
