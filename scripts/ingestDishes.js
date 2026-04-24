/**
 * ============================================================
 *  REAL DATA INGESTION SCRIPT — ingestDishes.js
 * ============================================================
 *  Mục đích: Lấy dữ liệu THẬT từ bảng MySQL 'Dishes' thông qua
 *  Sequelize, tạo vector embedding và lưu vào Qdrant Cloud.
 * ============================================================
 */

require("dotenv").config();
require("@babel/register"); // Cho phép require các file dùng ES6/Babel trong project

const { GoogleGenAI } = require("@google/genai");
const { QdrantClient } = require("@qdrant/js-client-rest");

// Import models từ file index tập trung để đảm bảo đã load quan hệ (Associations)
const { dishModel: Dish, categoryModel: Category } = require("../src/models/index");

// ─── Khởi tạo Clients ───────────────────────────────────────
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const qdrant = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY || undefined,
});

// ─── Hằng số ────────────────────────────────────────────────
const COLLECTION_NAME = "eatsy_dishes";
const EMBEDDING_MODEL = "gemini-embedding-001";
const VECTOR_SIZE = 3072;

/**
 * Tạo embedding từ dữ liệu thật của món ăn
 */
async function generateEmbedding(dish) {
    // Kết hợp các trường semantic quan trọng từ DB
    const textToEmbed =
        `Tên món: ${dish.name}. ` +
        `Thương hiệu: ${dish.brand || "Eatsy"}. ` +
        `Danh mục: ${dish.Category?.category_name || "Món ăn"}. ` +
        `Mô tả: ${dish.description || "Ngon và bổ dưỡng"}. ` +
        `Giá: ${dish.price} VNĐ.`;

    const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: textToEmbed,
    });

    return response.embeddings[0].values;
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
    console.log("🚀 Bắt đầu lấy dữ liệu THẬT từ MySQL và nạp vào Qdrant...\n");

    try {
        await ensureCollectionExists();

        // Bước 1: Query toàn bộ món ăn từ SQL (kèm theo Category để lấy tên danh mục)
        const realDishes = await Dish.findAll({
            include: [{ model: Category, as: 'Category' }],
            where: { status: 'active' } // Chỉ lấy món đang kinh doanh
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
                        category: dish.Category?.category_name || "N/A",
                        description: dish.description,
                        image_url: dish.thumbnail_path,
                        rating: parseFloat(dish.rating_avg),
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
