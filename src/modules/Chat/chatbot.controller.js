const OpenAI = require("openai");
const { Op } = require("sequelize");

const dishService = require("@modules/Dish/dish.service");
const categoryService = require("@modules/Dish/category.service");
const {
  isSemanticSearchEnabled,
  searchDishIdsBySemanticQuery,
} = require("@modules/Dish/semanticSearch.service");
const {
  buildMemorySummary,
  buildRetrievalContext,
  recordAssistantTurn,
  recordUserTurn,
} = require("./memoryEngine");

const openai = new OpenAI({
  apiKey: process.env.FREELLMAPI_API_KEY,
  baseURL: process.env.FREELLMAPI_BASE_URL || "http://localhost:3001/v1",
});

const CHAT_MODEL =
  process.env.FREELLMAPI_MODEL || "google/gemini-2.5-flash-lite";
const BACKEND_URL = process.env.BASE_URL || "http://localhost:5678";
const TOP_K_RESULTS = 6;
const CANDIDATE_POOL_SIZE = 12;
const SLIDING_WINDOW_SIZE = 5;
const SEMANTIC_WEIGHT = 0.55;
const KEYWORD_WEIGHT = 0.3;
const POPULARITY_WEIGHT = 0.1;
const QUALITY_WEIGHT = 0.05;

async function attachCategoriesToDishes(dishes) {
  const plainDishes = dishes.map((dish) =>
    dish?.get ? dish.get({ plain: true }) : dish,
  );
  const categoryIds = [
    ...new Set(plainDishes.map((dish) => dish.category_id).filter(Boolean)),
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

  return plainDishes.map((dish) => ({
    ...dish,
    category: dish.category_id ? categoryMap.get(dish.category_id) || null : null,
  }));
}

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

async function retrieveRelevantDishes(retrievalQuery) {
  const [semanticResult, keywordResult] = await Promise.all([
    retrieveSemanticDishes(retrievalQuery),
    retrieveKeywordDishes(retrievalQuery),
  ]);

  const rankedDishes = rankDishCandidates({
    keywords: extractKeywords(retrievalQuery),
    keywordDishes: keywordResult.dishes,
    semanticDishes: semanticResult.dishes,
    semanticMatches: semanticResult.matches,
  });

  if (rankedDishes.length > 0) {
    return {
      dishes: rankedDishes,
      retrievalMode:
        semanticResult.matches.length > 0 && keywordResult.dishes.length > 0
          ? "hybrid_rerank"
          : semanticResult.matches.length > 0
            ? "semantic_rerank"
            : "keyword_rerank",
    };
  }

  return {
    dishes: [],
    retrievalMode: semanticResult.error ? "keyword_fallback_empty" : "no_match",
  };
}

async function retrieveSemanticDishes(message) {
  if (!isSemanticSearchEnabled()) {
    return {
      dishes: [],
      matches: [],
      error: null,
    };
  }

  try {
    const semanticMatches = await searchDishIdsBySemanticQuery(
      message,
      CANDIDATE_POOL_SIZE,
    );
    if (semanticMatches.length === 0) {
      return {
        dishes: [],
        matches: [],
        error: null,
      };
    }

    const dishIds = semanticMatches.map((match) => match.dishId);
    const dishes = await dishService.findAllDishes({
      where: {
        dish_id: { [Op.in]: dishIds },
        status: "active",
        available: true,
      },
    });
    const dishesWithCategory = await attachCategoriesToDishes(dishes);

    const dishMap = new Map(
      dishesWithCategory.map((dish) => {
        return [dish.dish_id, dish];
      }),
    );

    return {
      dishes: dishIds.map((dishId) => dishMap.get(dishId)).filter(Boolean),
      matches: semanticMatches,
      error: null,
    };
  } catch (error) {
    console.warn(
      "[ChatbotController] Semantic retrieval failed, fallback to keyword search:",
      error.message,
    );
    return {
      dishes: [],
      matches: [],
      error,
    };
  }
}

async function retrieveKeywordDishes(message) {
  const keywords = extractKeywords(message);

  if (keywords.length === 0) {
    const dishes = await dishService.findAllDishes({
      where: { status: "active", available: true },
      order: [["sold_count", "DESC"]],
      limit: CANDIDATE_POOL_SIZE,
    });

    return { dishes: await attachCategoriesToDishes(dishes), keywords };
  }

  const likeConditions = keywords.flatMap((keyword) => [
    { name: { [Op.like]: `%${keyword}%` } },
    { description: { [Op.like]: `%${keyword}%` } },
    { brand: { [Op.like]: `%${keyword}%` } },
  ]);

  const dishes = await dishService.findAllDishes({
    where: {
      status: "active",
      available: true,
      [Op.or]: likeConditions,
    },
    order: [["sold_count", "DESC"]],
    limit: CANDIDATE_POOL_SIZE,
  });

  return { dishes: await attachCategoriesToDishes(dishes), keywords };
}

function normalizeScore(value, min, max) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (max <= min) {
    return value > 0 ? 1 : 0;
  }

  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function clampScore(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function buildSearchableText(dish) {
  const plainDish = dish.get ? dish.get({ plain: true }) : dish;
  const tagText = Array.isArray(plainDish.tags) ? plainDish.tags.join(" ") : "";

  return [
    plainDish.name,
    plainDish.brand,
    plainDish.description,
    plainDish.category?.name,
    tagText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function computeKeywordScore(dish, keywords) {
  if (!keywords.length) {
    return 0.35;
  }

  const text = buildSearchableText(dish);
  let weightedHits = 0;

  for (const keyword of keywords) {
    const occurrences = text.split(keyword.toLowerCase()).length - 1;
    weightedHits += Math.min(occurrences, 3);
  }

  const maxPossibleHits = keywords.length * 3;
  return clampScore(weightedHits / maxPossibleHits);
}

function computePopularityScore(dish) {
  const plainDish = dish.get ? dish.get({ plain: true }) : dish;
  const soldCount = Number(plainDish.sold_count || 0);
  const featuredBoost = plainDish.is_featured ? 0.15 : 0;
  return clampScore(Math.log10(soldCount + 1) / 4 + featuredBoost);
}

function computeQualityScore(dish) {
  const plainDish = dish.get ? dish.get({ plain: true }) : dish;
  const rating = Number(plainDish.rating_avg || 0) / 5;
  const ratingCountBoost = Math.min(
    Number(plainDish.rating_count || 0) / 50,
    0.2,
  );
  return clampScore(rating * 0.8 + ratingCountBoost);
}

function rankDishCandidates({
  semanticDishes,
  semanticMatches,
  keywordDishes,
  keywords,
}) {
  const semanticMap = new Map(
    semanticMatches.map((match) => [match.dishId, Number(match.score || 0)]),
  );
  const allDishes = [...semanticDishes, ...keywordDishes];
  const uniqueDishMap = new Map();

  for (const dish of allDishes) {
    const plainDish = dish.get ? dish.get({ plain: true }) : dish;
    if (!uniqueDishMap.has(plainDish.dish_id)) {
      uniqueDishMap.set(plainDish.dish_id, dish);
    }
  }

  const uniqueDishes = Array.from(uniqueDishMap.values());
  const semanticScores = uniqueDishes.map((dish) => {
    const plainDish = dish.get ? dish.get({ plain: true }) : dish;
    return semanticMap.get(plainDish.dish_id) || 0;
  });

  const maxSemanticScore = Math.max(...semanticScores, 0);
  const minSemanticScore = Math.min(...semanticScores, 0);

  return uniqueDishes
    .map((dish) => {
      const plainDish = dish.get ? dish.get({ plain: true }) : dish;
      const rawSemanticScore = semanticMap.get(plainDish.dish_id) || 0;
      const semanticScore = normalizeScore(
        rawSemanticScore,
        minSemanticScore,
        maxSemanticScore,
      );
      const keywordScore = computeKeywordScore(dish, keywords);
      const popularityScore = computePopularityScore(dish);
      const qualityScore = computeQualityScore(dish);

      const finalScore =
        semanticScore * SEMANTIC_WEIGHT +
        keywordScore * KEYWORD_WEIGHT +
        popularityScore * POPULARITY_WEIGHT +
        qualityScore * QUALITY_WEIGHT;

      return {
        dish,
        finalScore,
        semanticScore,
        keywordScore,
        popularityScore,
        qualityScore,
      };
    })
    .sort((left, right) => {
      if (right.finalScore !== left.finalScore) {
        return right.finalScore - left.finalScore;
      }

      if (right.semanticScore !== left.semanticScore) {
        return right.semanticScore - left.semanticScore;
      }

      return right.keywordScore - left.keywordScore;
    })
    .slice(0, TOP_K_RESULTS)
    .map((entry) => entry.dish);
}

function buildSystemInstruction(dishes) {
  const dishContext =
    dishes.length > 0
      ? dishes
          .map((dish, index) => {
            const plainDish = dish.get ? dish.get({ plain: true }) : dish;
            const price = plainDish.price
              ? Number(plainDish.price).toLocaleString("vi-VN") + "đ"
              : "Liên hệ";
            const imagePath =
              plainDish.thumbnail_path || plainDish.image_url || "";
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
          })
          .join("\n\n")
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

function buildMemoryAwareSystemInstruction(dishes, memorySummary) {
  const baseInstruction = buildSystemInstruction(dishes);

  if (!memorySummary) {
    return baseInstruction;
  }

  return `${baseInstruction}

Ngữ cảnh bộ nhớ hội thoại:
${memorySummary}

Khi người dùng hỏi tiếp kiểu tham chiếu ("món đó", "món đầu", "loại trên"), hãy ưu tiên hiểu theo ngữ cảnh bộ nhớ ở trên.`;
}

function buildDishCardPayload(dish) {
  const plainDish = dish.get ? dish.get({ plain: true }) : dish;
  const imagePath = plainDish.thumbnail_path || plainDish.image_url || "";
  const imageUrl = imagePath.startsWith("http")
    ? imagePath
    : `${BACKEND_URL}${imagePath}`;

  return {
    id: plainDish.dish_id,
    name: plainDish.name || "Món ăn",
    price: Number(plainDish.price || 0),
    image: imageUrl,
    rating: Number(plainDish.rating_avg || 0),
  };
}

function buildFallbackDishCards(dishes) {
  return dishes.slice(0, 3).map(buildDishCardPayload);
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
    const { message, chatHistory = [], sessionId = "" } = req.body;

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
    recordUserTurn(sessionId, userMessage);
    const memoryContext = buildRetrievalContext({
      sessionId,
      message: userMessage,
      chatHistory,
    });
    const { dishes: relevantDishes, retrievalMode } =
      await retrieveRelevantDishes(memoryContext.retrievalQuery);
    const memorySummary = buildMemorySummary(sessionId);
    const systemInstruction = buildMemoryAwareSystemInstruction(
      relevantDishes,
      memorySummary,
    );
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
    const fallbackCards = buildFallbackDishCards(relevantDishes);
    recordAssistantTurn(sessionId, aiReply || "", fallbackCards);

    return res.status(200).json({
      success: true,
      data: {
        reply:
          aiReply || "Mình chưa tạo được câu trả lời. Bạn thử hỏi lại nhé.",
        cards: fallbackCards,
        meta: {
          dishes_retrieved: relevantDishes.length,
          history_window: history.length,
          model: CHAT_MODEL,
          provider: "freellmapi",
          semantic_enabled: isSemanticSearchEnabled(),
          retrieval_mode: retrievalMode,
          retrieval_query: memoryContext.retrievalQuery,
          memory_summary: memorySummary,
          session_id: sessionId || null,
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
        message:
          "FreeLLMAPI đang chạm giới hạn quota hoặc rate limit. Vui lòng thử lại sau.",
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
