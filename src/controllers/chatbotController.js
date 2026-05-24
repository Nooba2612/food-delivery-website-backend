const OpenAI = require("openai");
const { Op } = require("sequelize");

const { dishModel, categoryModel } = require("@models");

const openai = new OpenAI({
    apiKey: process.env.FREELLMAPI_API_KEY,
    baseURL: process.env.FREELLMAPI_BASE_URL || "http://localhost:3001/v1",
});

const CHAT_MODEL = process.env.FREELLMAPI_MODEL || "google/gemini-2.5-flash-lite";
const BACKEND_URL = process.env.BASE_URL || "http://localhost:5678";
const TOP_K_RESULTS = 6;
const SLIDING_WINDOW_SIZE = 5;

function extractKeywords(text) {
    return [
        ...new Set(
            String(text || "")
                .toLowerCase()
                .replace(/[^\p{L}\p{N}\s]/gu, " ")
                .split(/\s+/)
                .map((word) => word.trim())
                .filter((word) => word.length >= 2),
        ),
    ].slice(0, 12);
}

async function retrieveRelevantDishes(message) {
    const keywords = extractKeywords(message);

    if (keywords.length === 0) {
        return dishModel.findAll({
            include: [
                {
                    model: categoryModel,
                    as: "category",
                    attributes: ["category_id", "name"],
                },
            ],
            where: { status: "active", available: true },
            order: [["sold_count", "DESC"]],
            limit: TOP_K_RESULTS,
        });
    }

    const likeConditions = keywords.flatMap((keyword) => ([
        { name: { [Op.like]: `%${keyword}%` } },
        { description: { [Op.like]: `%${keyword}%` } },
        { brand: { [Op.like]: `%${keyword}%` } },
        { "$category.name$": { [Op.like]: `%${keyword}%` } },
    ]));

    return dishModel.findAll({
        include: [
            {
                model: categoryModel,
                as: "category",
                attributes: ["category_id", "name"],
            },
        ],
        where: {
            status: "active",
            available: true,
            [Op.or]: likeConditions,
        },
        order: [["sold_count", "DESC"]],
        limit: TOP_K_RESULTS,
        subQuery: false,
    });
}

function buildSystemInstruction(dishes) {
    const dishContext = dishes.length > 0
        ? dishes.map((dish, index) => {
            const plainDish = dish.get ? dish.get({ plain: true }) : dish;
            const price = plainDish.price
                ? Number(plainDish.price).toLocaleString("vi-VN") + "đ"
                : "Liên hệ";
            const imagePath = plainDish.thumbnail_path || plainDish.image_url || "";
            const fullImageUrl = imagePath.startsWith("http")
                ? imagePath
                : `${BACKEND_URL}${imagePath}`;

            return (
                `[Món ${index + 1}]\n` +
                `- ID: ${plainDish.dish_id || "N/A"}\n` +
                `- Tên: ${plainDish.name || "N/A"}\n` +
                `- Giá: ${price}\n` +
                `- Danh mục: ${plainDish.category?.name || "N/A"}\n` +
                `- Thương hiệu: ${plainDish.brand || "Eatsy"}\n` +
                `- Đánh giá: ${plainDish.rating_avg || 0}/5\n` +
                `- Mô tả: ${plainDish.description || "N/A"}\n` +
                `- Hình ảnh: ${fullImageUrl}`
            );
        }).join("\n\n")
        : "Không tìm thấy món ăn liên quan trong cơ sở dữ liệu.";

    return `Bạn là EatsyBot, trợ lý AI tư vấn đặt đồ ăn cho Eatsy Food Delivery.

Quy tắc bắt buộc:
1. Chỉ tư vấn dựa trên dữ liệu món ăn được cung cấp.
2. Không bịa thêm món ăn không có trong danh sách.
3. Nếu không có món phù hợp, nói rõ điều đó và gợi ý người dùng đổi cách hỏi.
4. Trả lời tự nhiên bằng tiếng Việt.
5. Khi giới thiệu món cụ thể, hãy ưu tiên nêu tên, giá, mô tả ngắn.

Định dạng đặc biệt:
- Nếu bạn giới thiệu một món cụ thể, hãy kết thúc bằng đúng dòng:
[DISH_CARD: {"id": "dish_id", "name": "Tên món", "price": 1000, "image": "URL", "rating": 5}]
- Có thể trả nhiều dòng DISH_CARD nếu giới thiệu nhiều món.

Dữ liệu món ăn:
${dishContext}`;
}

function formatHistoryForOpenAI(chatHistory) {
    return chatHistory
        .filter((msg) => msg?.role && msg?.content)
        .slice(-SLIDING_WINDOW_SIZE)
        .map((msg) => ({
            role: msg.role === "assistant" ? "assistant" : "user",
            content: String(msg.content),
        }));
}

const chat = async (req, res) => {
    try {
        const { message, chatHistory = [] } = req.body;

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

        if (!process.env.FREELLMAPI_API_KEY) {
            return res.status(500).json({
                success: false,
                message: "Thiếu cấu hình FREELLMAPI_API_KEY.",
            });
        }

        const userMessage = message.trim();
        const relevantDishes = await retrieveRelevantDishes(userMessage);
        const systemInstruction = buildSystemInstruction(relevantDishes);
        const history = formatHistoryForOpenAI(chatHistory);

        const completion = await openai.chat.completions.create({
            model: CHAT_MODEL,
            temperature: 0.7,
            max_tokens: 800,
            messages: [
                { role: "system", content: systemInstruction },
                ...history,
                { role: "user", content: userMessage },
            ],
        });

        const aiReply = completion.choices?.[0]?.message?.content?.trim();

        return res.status(200).json({
            success: true,
            data: {
                reply: aiReply || "Mình chưa tạo được câu trả lời. Bạn thử hỏi lại nhé.",
                meta: {
                    dishes_retrieved: relevantDishes.length,
                    history_window: history.length,
                    model: CHAT_MODEL,
                    provider: "freellmapi",
                },
            },
        });
    } catch (error) {
        console.error("[ChatbotController] Lỗi:", error);

        if (error.status === 401) {
            return res.status(500).json({
                success: false,
                message: "FreeLLMAPI key không hợp lệ. Vui lòng kiểm tra cấu hình.",
            });
        }

        if (error.status === 429) {
            return res.status(503).json({
                success: false,
                message: "FreeLLMAPI đang chạm giới hạn quota hoặc rate limit. Vui lòng thử lại sau.",
            });
        }

        if (error.code === "ECONNREFUSED" || error.cause?.code === "ECONNREFUSED") {
            return res.status(503).json({
                success: false,
                message: "Không thể kết nối tới FreeLLMAPI server.",
            });
        }

        return res.status(500).json({
            success: false,
            message: "Đã có lỗi xảy ra phía máy chủ. Vui lòng thử lại.",
        });
    }
};

module.exports = { chat };
