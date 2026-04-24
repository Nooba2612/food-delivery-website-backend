/**
 * ============================================================
 *  CHATBOT CONTROLLER — chatbotController.js  (Gemini @google/genai)
 * ============================================================
 *
 *  SDK: @google/genai (mới — API v1)
 *  Endpoint: POST /api/chat
 *
 *  Luồng RAG:
 *  [1] Nhận { message, chatHistory } từ Frontend
 *  [2] Embed câu hỏi → ai.models.embedContent() → vector 768 dims
 *  [3] Query Qdrant → top 3 món liên quan (Retrieval)
 *  [4] Build System Instruction + context (Augmentation)
 *  [5] Sliding Window: giữ 5 tin nhắn cuối
 *  [6] Convert history sang Gemini format (role "model", parts[])
 *  [7] ai.chats.create() + sendMessage() (Generation)
 *  [8] Trả về reply
 *
 *  Sự khác biệt SDK cũ vs mới:
 *   Cũ: new GoogleGenerativeAI(key) → genAI.getGenerativeModel()
 *   Mới: new GoogleGenAI({apiKey}) → ai.models / ai.chats
 * ============================================================
 */

const { GoogleGenAI } = require("@google/genai");
const { QdrantClient } = require("@qdrant/js-client-rest");

// ─── Khởi tạo singleton clients ──────────────────────────────
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const qdrant = new QdrantClient({
    url: process.env.QDRANT_URL || "http://localhost:6333",
    apiKey: process.env.QDRANT_API_KEY || undefined,
});

// ─── Hằng số ─────────────────────────────────────────────────
const COLLECTION_NAME = "eatsy_dishes";
const EMBEDDING_MODEL = "gemini-embedding-001";  // 3072 dims — Đang sử dụng ổn định
const CHAT_MODEL = "gemini-2.5-flash";     // Gemini 2.0 Flash-Lite (Model chuẩn)
const BACKEND_URL = "http://localhost:5678";    // URL server để lấy ảnh
const TOP_K_RESULTS = 3;                         // gemini-embedding-001 = 3072 dims
const SLIDING_WINDOW_SIZE = 5;

// ─── [STEP 2] Tạo vector từ câu hỏi ─────────────────────────
/**
 * @param {string} text
 * @returns {number[]} vector 768 chiều
 */
async function embedQuery(text) {
    // SDK mới: ai.models.embedContent()
    const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
    });
    return response.embeddings[0].values;
}

// ─── [STEP 3] Truy xuất từ Qdrant ────────────────────────────
/**
 * @param {number[]} queryVector
 * @returns {Object[]} payload của top K món ăn
 */
async function retrieveRelevantDishes(queryVector) {
    const searchResult = await qdrant.search(COLLECTION_NAME, {
        vector: queryVector,
        limit: TOP_K_RESULTS,
        with_payload: true,
        score_threshold: 0.3,
    });
    return searchResult.map((hit) => hit.payload);
}

// ─── [STEP 4] Build System Instruction ───────────────────────
/**
 * System instruction trong @google/genai được truyền qua
 * config khi tạo chat session (không nằm trong history).
 *
 * @param {Object[]} dishes
 * @returns {string}
 */
function buildSystemInstruction(dishes) {
    const dishContext =
        dishes.length > 0
            ? dishes
                .map((dish, i) => {
                    const price = dish.price
                        ? Number(dish.price).toLocaleString("vi-VN") + "đ"
                        : "Liên hệ";
                    // Gắn URL đầy đủ cho ảnh
                    const fullImageUrl = dish.image_url?.startsWith("http")
                        ? dish.image_url
                        : `${BACKEND_URL}${dish.image_url}`;

                    return (
                        `[Món ${i + 1}]\n` +
                        `- Tên: ${dish.name || "N/A"}\n` +
                        `- Giá: ${price}\n` +
                        `- Danh mục: ${dish.category || "N/A"}\n` +
                        `- Nhà hàng: ${dish.restaurant || "N/A"}\n` +
                        `- Đánh giá: ${dish.rating || "N/A"}/5 ⭐\n` +
                        `- Mô tả: ${dish.description || "N/A"}\n` +
                        `- Hình ảnh: ${fullImageUrl}`
                    );
                })
                .join("\n\n")
            : "Không tìm thấy món ăn liên quan.";

    return `Bạn là **EatsyBot** — trợ lý AI tư vấn đặt đồ ăn của Eatsy Food Delivery.

## LUẬT LỆ BẮT BUỘC:
1. CHỈ tư vấn các món trong phần "DỮ LIỆU MÓN ĂN" bên dưới.
2. KHÔNG bịa đặt món ăn không có trong danh sách.
3. Từ chối lịch sự nếu câu hỏi ngoài chủ đề ẩm thực.
4. Nếu không có món phù hợp, thành thật thông báo.
5. Luôn nêu đúng tên, giá, nhà hàng khi giới thiệu.

## PHONG CÁCH: Thân thiện, tiếng Việt tự nhiên, nhiệt tình.

## ĐỊNH DẠNG HIỂN THỊ ĐẶC BIỆT (QUAN TRỌNG):
- Nếu bạn giới thiệu một món ăn cụ thể từ danh sách trên và thấy nó rất phù hợp, hãy kết thúc câu trả lời bằng thẻ JSON sau (mỗi thẻ một dòng riêng, có thể gửi nhiều thẻ nếu giới thiệu nhiều món):
  [DISH_CARD: {"id": "dish_id", "name": "Tên món", "price": 1000, "image": "URL", "rating": 5}]

## DỮ LIỆU MÓN ĂN:
${dishContext}`;
}

// ─── [STEP 6] Convert lịch sử sang format Gemini ─────────────
/**
 * Frontend: { role: "user"|"assistant", content: "string" }
 * Gemini:   { role: "user"|"model",     parts: [{ text }] }
 *
 * @param {Array} chatHistory
 * @returns {Array} history theo chuẩn Gemini SDK mới
 */
function formatHistoryForGemini(chatHistory) {
    const formatted = [];

    for (const msg of chatHistory) {
        if (!msg.role || !msg.content) continue;

        const role = msg.role === "assistant" ? "model" : "user";

        // Gemini không chấp nhận 2 tin liên tiếp cùng role
        if (formatted.length > 0 && formatted[formatted.length - 1].role === role) {
            continue;
        }

        formatted.push({
            role,
            parts: [{ text: String(msg.content) }],
        });
    }

    return formatted;
}

// ─── Controller chính ─────────────────────────────────────────
/**
 * POST /api/chat
 * Body: { message: string, chatHistory: Array }
 */
const chat = async (req, res) => {
    try {
        const { message, chatHistory = [] } = req.body;

        // ── Validate ──────────────────────────────────────────
        if (!message || typeof message !== "string" || message.trim() === "") {
            return res.status(400).json({
                success: false,
                message: "Trường 'message' là bắt buộc và không được để trống.",
            });
        }

        if (!Array.isArray(chatHistory)) {
            return res.status(400).json({
                success: false,
                message: "Trường 'chatHistory' phải là một mảng.",
            });
        }

        const userMessage = message.trim();

        // ── [STEP 2] Embed câu hỏi ────────────────────────────
        const queryVector = await embedQuery(userMessage);

        // ── [STEP 3] Tìm món ăn liên quan từ Qdrant ──────────
        const relevantDishes = await retrieveRelevantDishes(queryVector);

        // ── [STEP 4] Build System Instruction ─────────────────
        const systemInstruction = buildSystemInstruction(relevantDishes);

        // ── [STEP 5] Sliding Window ───────────────────────────
        const recentHistory = chatHistory.slice(-SLIDING_WINDOW_SIZE);

        // ── [STEP 6] Convert history sang Gemini format ───────
        const geminiHistory = formatHistoryForGemini(recentHistory);

        // ── [STEP 7] Gọi Gemini Chat API ──────────────────────
        // SDK mới: ai.chats.create() thay vì model.startChat()
        const chatSession = ai.chats.create({
            model: CHAT_MODEL,
            config: {
                systemInstruction: systemInstruction,
                maxOutputTokens: 800,
                temperature: 0.7,
            },
            history: geminiHistory,
        });

        // sendMessage trả về response object
        const result = await chatSession.sendMessage({
            message: userMessage,
        });

        const aiReply = result.text;

        // ── [STEP 8] Trả về kết quả ───────────────────────────
        return res.status(200).json({
            success: true,
            data: {
                reply: aiReply,
                meta: {
                    dishes_retrieved: relevantDishes.length,
                    history_window: geminiHistory.length,
                    model: CHAT_MODEL,
                },
            },
        });
    } catch (error) {
        console.error("[ChatbotController] Lỗi:", error.message);

        // Phân loại lỗi API Gemini
        if (error.message?.includes("API_KEY_INVALID") || error.message?.includes("API key not valid")) {
            return res.status(500).json({
                success: false,
                message: "Gemini API Key không hợp lệ. Vui lòng kiểm tra cấu hình.",
            });
        }

        if (error.message?.includes("RESOURCE_EXHAUSTED") || error.status === 429) {
            return res.status(503).json({
                success: false,
                message: "Hệ thống AI đang quá tải. Vui lòng thử lại sau ít giây.",
            });
        }

        if (error.message?.includes("SAFETY") || error.message?.includes("blocked")) {
            return res.status(400).json({
                success: false,
                message: "Tin nhắn không phù hợp. Vui lòng thay đổi nội dung.",
            });
        }

        if (error.message?.includes("ECONNREFUSED") || error.message?.includes("fetch failed")) {
            return res.status(503).json({
                success: false,
                message: "Không thể kết nối Vector Database. Vui lòng thử lại sau.",
            });
        }

        return res.status(500).json({
            success: false,
            message: "Đã có lỗi xảy ra phía máy chủ. Vui lòng thử lại.",
        });
    }
};

module.exports = { chat };
