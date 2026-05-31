const OpenAI = require("openai");
const { Op } = require("sequelize");
const { retryAsync } = require("@core/utils/retry");

const dishService = require("@modules/Dish/dish.service");
const categoryService = require("@modules/Dish/category.service");
const {
  isSemanticSearchEnabled,
  searchDishIdsBySemanticQuery,
  deriveDishMetadata,
} = require("@modules/Dish/semanticSearch.service");
const {
  buildMemorySummary,
  buildRetrievalContext,
  recordAssistantTurn,
  recordUserTurn,
} = require("./memoryEngine");
const { createChatQueryResolver } = require("./chatQueryResolver");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const openai = new OpenAI({
  apiKey: process.env.FREELLMAPI_API_KEY || GEMINI_API_KEY || "dummy-key",
  baseURL:
    process.env.FREELLMAPI_BASE_URL ||
    "https://generativelanguage.googleapis.com/v1beta/openai",
});

const CHAT_MODEL =
  process.env.FREELLMAPI_MODEL || "gemini-2.5-flash";
const BACKEND_URL = process.env.BASE_URL || "http://localhost:5678";
const CHAT_DEBUG_TRACE = String(process.env.CHAT_DEBUG_TRACE || "").toLowerCase() === "true";
const CHAT_COMPLETION_TIMEOUT_MS = Number(
  process.env.FREELLMAPI_TIMEOUT_MS || 60000,
);
const CHAT_MAX_TOKENS = Number(process.env.FREELLMAPI_MAX_TOKENS || 1000);
const CHAT_RETRIES = Number(process.env.FREELLMAPI_RETRIES || 2);
const TOP_K_RESULTS = 6;
const CANDIDATE_POOL_SIZE = 12;
const SLIDING_WINDOW_SIZE = 5;
const SEMANTIC_WEIGHT = 0.55;
const KEYWORD_WEIGHT = 0.3;
const POPULARITY_WEIGHT = 0.1;
const QUALITY_WEIGHT = 0.05;

function traceChatFlow(stage, payload = {}) {
  if (!CHAT_DEBUG_TRACE) {
    return;
  }

  try {
    console.log(`[ChatTrace] ${stage}: ${JSON.stringify(payload, null, 2)}`);
  } catch (_error) {
    console.log(`[ChatTrace] ${stage}:`, payload);
  }
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const CATEGORY_ENTITY_RULES = [
  {
    key: "drink",
    labels: ["nuoc uong", "do uong", "nuoc ngot", "drink"],
    categoryNames: ["Nước uống"],
    singularLabel: "món đồ uống",
    pluralLabel: "món đồ uống",
  },
  {
    key: "combo",
    labels: ["combo"],
    categoryNames: ["Combos"],
    singularLabel: "combo",
    pluralLabel: "combo",
  },
  {
    key: "pizza",
    labels: ["pizza"],
    categoryNames: ["Pizza"],
    singularLabel: "pizza",
    pluralLabel: "pizza",
  },
  {
    key: "burger",
    labels: ["burger", "whopper", "cheeseburger"],
    categoryNames: ["Burgers"],
    singularLabel: "burger",
    pluralLabel: "burger",
  },
];

function containsWholePhrase(text, phrase) {
  const safePhrase = normalizeText(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${safePhrase}(\\s|$)`, "i").test(normalizeText(text));
}

function findCategoryEntityRule(message) {
  const normalizedMessage = normalizeText(message);
  return (
    CATEGORY_ENTITY_RULES.find((rule) =>
      rule.labels.some((label) => containsWholePhrase(normalizedMessage, label)),
    ) || null
  );
}

function buildDishSearchText(dish) {
  const plainDish = dish?.get ? dish.get({ plain: true }) : dish;
  return normalizeText(
    [
      plainDish?.name,
      plainDish?.description,
      plainDish?.brand,
      plainDish?.category?.name,
      Array.isArray(plainDish?.tags) ? plainDish.tags.join(" ") : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function isBeefDish(dish) {
  const metadata = deriveDishMetadata(dish);
  if (metadata?.has_beef) {
    return true;
  }

  const text = buildDishSearchText(dish);
  return (
    text.includes("thit bo") ||
    text.includes("bo nuong") ||
    text.includes("beef") ||
    text.includes("whopper") ||
    text.includes("cheeseburger")
  );
}

function isChickenDish(dish) {
  const metadata = deriveDishMetadata(dish);
  if (metadata?.has_chicken) {
    return true;
  }

  const text = buildDishSearchText(dish);
  return (
    text.includes("ga") ||
    text.includes("chicken") ||
    text.includes("chic") ||
    text.includes("crispy chicken")
  );
}

function findIngredientEntityRule(message) {
  const normalizedMessage = normalizeText(message);

  if (
    containsWholePhrase(normalizedMessage, "thit bo") ||
    containsWholePhrase(normalizedMessage, "bo") ||
    containsWholePhrase(normalizedMessage, "beef")
  ) {
    return {
      key: "beef",
      labels: ["thit bo", "bo", "beef"],
      displayLabel: "thịt bò",
      matcher: isBeefDish,
    };
  }

  if (
    containsWholePhrase(normalizedMessage, "thit ga") ||
    containsWholePhrase(normalizedMessage, "ga") ||
    containsWholePhrase(normalizedMessage, "chicken")
  ) {
    return {
      key: "chicken",
      labels: ["thit ga", "ga", "chicken"],
      displayLabel: "thịt gà",
      matcher: isChickenDish,
    };
  }

  return null;
}

function isCheapestIntent(message) {
  const normalizedMessage = normalizeText(message);
  return (
    normalizedMessage.includes("re nhat") ||
    normalizedMessage.includes("thap nhat") ||
    normalizedMessage.includes("re tien nhat")
  );
}

function isMostExpensiveIntent(message) {
  const normalizedMessage = normalizeText(message);
  return (
    normalizedMessage.includes("dat nhat") ||
    normalizedMessage.includes("mac nhat") ||
    normalizedMessage.includes("cao nhat") ||
    normalizedMessage.includes("mac tien nhat")
  );
}

function isCountIntent(message) {
  const normalizedMessage = normalizeText(message);
  return (
    normalizedMessage.includes("bao nhieu") ||
    normalizedMessage.includes("co may") ||
    normalizedMessage.includes("so luong") ||
    normalizedMessage.includes("tong so") ||
    normalizedMessage.includes("tong cong")
  );
}

function isGeneralMenuCountIntent(message) {
  const normalizedMessage = normalizeText(message);
  return (
    isCountIntent(message) &&
    (normalizedMessage.includes("menu") ||
      normalizedMessage.includes("quan") ||
      normalizedMessage.includes("tat ca mon") ||
      normalizedMessage.includes("mon an"))
  );
}

function isPurchaseIntent(message) {
  const normalizedMessage = normalizeText(message);
  return (
    normalizedMessage.includes("muon mua") ||
    normalizedMessage.includes("mua") ||
    normalizedMessage.includes("dat mon") ||
    normalizedMessage.includes("them vao gio") ||
    normalizedMessage.includes("chon mon") ||
    normalizedMessage.includes("muon uong") ||
    normalizedMessage.includes("muon an")
  );
}

function isCategoryVerificationIntent(message) {
  const normalizedMessage = normalizeText(message);
  return (
    normalizedMessage.includes("la burger") ||
    normalizedMessage.includes("la pizza") ||
    normalizedMessage.includes("la combo") ||
    normalizedMessage.includes("thuoc danh muc")
  );
}

function hasCheaperPreference(message) {
  const normalizedMessage = normalizeText(message);
  return (
    normalizedMessage.includes("re hon") ||
    normalizedMessage.includes("khong du tien") ||
    normalizedMessage.includes("tiet kiem hon") ||
    normalizedMessage.includes("thap hon")
  );
}

function hasMoreExpensivePreference(message) {
  const normalizedMessage = normalizeText(message);
  return (
    normalizedMessage.includes("dat hon") ||
    normalizedMessage.includes("cao hon") ||
    normalizedMessage.includes("mac hon")
  );
}

function hasContextReference(message) {
  const normalizedMessage = normalizeText(message);
  return (
    normalizedMessage.includes("mon do") ||
    normalizedMessage.includes("cai do") ||
    normalizedMessage.includes("mon nay") ||
    normalizedMessage.includes("cai nay") ||
    normalizedMessage.includes("mon kia") ||
    normalizedMessage.includes("mon khac")
  );
}

function isDrinkIntent(message) {
  return Boolean(
    findCategoryEntityRule(message)?.key === "drink" ||
      containsWholePhrase(message, "nuoc") ||
      containsWholePhrase(message, "do uong"),
  );
}

function isComboIntent(message) {
  return Boolean(findCategoryEntityRule(message)?.key === "combo");
}

function shouldAttachDishCards(message, dishes = []) {
  if (!Array.isArray(dishes) || dishes.length === 0) {
    return false;
  }

  return (
    isPurchaseIntent(message) ||
    hasContextReference(message) ||
    isDrinkIntent(message) ||
    isComboIntent(message) ||
    isCheapestIntent(message) ||
    isMostExpensiveIntent(message) ||
    isCountIntent(message) ||
    Boolean(findCategoryEntityRule(message)) ||
    Boolean(findIngredientEntityRule(message))
  );
}

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

async function retrieveRelevantDishes(retrievalQuery, options = {}) {
  const semanticQuery = options.semanticQuery || retrievalQuery;
  const [semanticResult, keywordResult] = await Promise.all([
    retrieveSemanticDishes(semanticQuery),
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

async function getBeefDishes(limit = CANDIDATE_POOL_SIZE) {
  const dishes = await dishService.findAllDishes({
    where: {
      status: "active",
      available: true,
    },
    order: [["sold_count", "DESC"]],
    limit: Math.max(limit * 3, limit),
  });
  const dishesWithCategory = await attachCategoriesToDishes(dishes);
  return {
    dishes: dishesWithCategory.filter(isBeefDish).slice(0, limit),
    retrievalMode: "beef_verified",
  };
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

function extractDishCardsFromReply(reply) {
  const matches = String(reply || "").match(/\[DISH_CARD:\s*(\{.*?\})\]/g) || [];

  return matches
    .map((match) => {
      const jsonPayload = match.match(/\[DISH_CARD:\s*(\{.*?\})\]/)?.[1];
      if (!jsonPayload) {
        return null;
      }

      try {
        const parsed = JSON.parse(jsonPayload);
        return {
          id: parsed.id || null,
          name: parsed.name || "Món ăn",
          price: Number(parsed.price || 0),
          image: parsed.image || "",
          rating: Number(parsed.rating || 0),
        };
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean);
}

function buildPurchaseReply(card) {
  const normalizedCard = card || {};
  const formattedPrice = Number(normalizedCard.price || 0).toLocaleString(
    "vi-VN",
  );
  return `Bạn muốn mua ${normalizedCard.name || "món này"} phải không? Món này có giá ${formattedPrice}đ.`;
}

const chatQueryResolver = createChatQueryResolver({
  normalizeText,
  findCategoryEntityRule,
  findIngredientEntityRule,
  isCheapestIntent,
  isMostExpensiveIntent,
  isCountIntent,
  isGeneralMenuCountIntent,
  isPurchaseIntent,
  isCategoryVerificationIntent,
  hasCheaperPreference,
  hasMoreExpensivePreference,
  hasContextReference,
  categoryService,
  dishService,
  attachCategoriesToDishes,
  Op,
  maxCandidatePoolSize: CANDIDATE_POOL_SIZE,
  isDrinkIntent,
  isComboIntent,
  getBeefDishes,
  buildDishCardPayload,
  buildFallbackDishCards,
  shouldAttachDishCards,
  recordAssistantTurn,
  isSemanticSearchEnabled,
  retrieveRelevantDishes,
  deriveDishMetadata,
});

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

    if (!process.env.FREELLMAPI_API_KEY && !GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "Thiếu cấu hình GEMINI_API_KEY hoặc FREELLMAPI_API_KEY.",
      });
    }

    const userMessage = message.trim();
    traceChatFlow("request_received", {
      sessionId,
      message: userMessage,
      chatHistoryLength: chatHistory.length,
      recentHistory: chatHistory.slice(-3).map((entry) => ({
        role: entry?.role,
        content: entry?.content,
        dishes: Array.isArray(entry?.dishes)
          ? entry.dishes.map((dish) => dish?.name || dish)
          : [],
      })),
    });

    recordUserTurn(sessionId, userMessage);
    const memoryContext = buildRetrievalContext({
      sessionId,
      message: userMessage,
      chatHistory,
    });
    traceChatFlow("memory_context_built", {
      sessionId,
      retrievalQuery: memoryContext.retrievalQuery,
      semanticQuery: memoryContext.semanticQuery || userMessage,
      rewrittenMessage: memoryContext.rewrittenMessage || userMessage,
      referencedCard: memoryContext.referencedCard
        ? memoryContext.referencedCard.name || memoryContext.referencedCard
        : null,
      memorySummary: memoryContext.memorySummary || "",
    });

    const purchaseTarget = await chatQueryResolver.resolvePurchaseTarget({
      message: userMessage,
      chatHistory,
      memoryContext,
    });
    traceChatFlow("purchase_resolution", {
      sessionId,
      source: purchaseTarget?.source || null,
      needsClarification: Boolean(purchaseTarget?.needsClarification),
      selectedCard: purchaseTarget?.card?.name || null,
      candidates: purchaseTarget?.debug?.candidateNames || [],
    });

    if (purchaseTarget?.needsClarification) {
      recordAssistantTurn(
        sessionId,
        purchaseTarget.reply,
        purchaseTarget.candidates || [],
      );

      traceChatFlow("response_ready", {
        sessionId,
        replyPreview: purchaseTarget.reply.slice(0, 240),
        attachedCards: (purchaseTarget.candidates || []).map((card) => card?.name),
        attachedCardCount: (purchaseTarget.candidates || []).length,
      });

      return res.status(200).json({
        success: true,
        data: {
          reply: purchaseTarget.reply,
          cards: purchaseTarget.candidates || [],
          meta: {
            dishes_retrieved: (purchaseTarget.candidates || []).length,
            history_window: 0,
            model: null,
            provider: "purchase_rule",
            semantic_enabled: isSemanticSearchEnabled(),
            retrieval_mode: purchaseTarget.retrievalMode || "purchase_rule",
            retrieval_query: memoryContext.retrievalQuery,
            memory_summary: buildMemorySummary(sessionId),
            session_id: sessionId || null,
          },
        },
      });
    }

    if (purchaseTarget?.card) {
      const purchaseReply = buildPurchaseReply(purchaseTarget.card);
      const purchaseCards = [purchaseTarget.card];
      recordAssistantTurn(sessionId, purchaseReply, purchaseCards);

      traceChatFlow("response_ready", {
        sessionId,
        replyPreview: purchaseReply,
        attachedCards: purchaseCards.map((card) => card?.name),
        attachedCardCount: purchaseCards.length,
      });

      return res.status(200).json({
        success: true,
        data: {
          reply: purchaseReply,
          cards: purchaseCards,
          meta: {
            dishes_retrieved: purchaseCards.length,
            history_window: 0,
            model: null,
            provider: "purchase_rule",
            semantic_enabled: isSemanticSearchEnabled(),
            retrieval_mode: purchaseTarget.retrievalMode || "purchase_rule",
            retrieval_query: memoryContext.retrievalQuery,
            memory_summary: buildMemorySummary(sessionId),
            session_id: sessionId || null,
          },
        },
      });
    }

    const entityResponse = await chatQueryResolver.buildEntityDrivenResponse(
      userMessage,
      sessionId,
      chatHistory,
    );
    traceChatFlow("entity_response_evaluated", {
      sessionId,
      type: entityResponse?.type || null,
      query: entityResponse?.query || null,
      retrievalMode: entityResponse?.meta?.retrieval_mode || null,
      resolvedDishNames:
        entityResponse?.resolved?.dishes?.map((dish) => dish?.name) || [],
      returnedCards: entityResponse?.cards?.map((card) => card?.name) || [],
    });

    if (
      entityResponse &&
      entityResponse.type !== "purchase" &&
      entityResponse.type !== "category_check"
    ) {
      traceChatFlow("response_ready", {
        sessionId,
        replyPreview: String(entityResponse.reply || "").slice(0, 240),
        attachedCards: (entityResponse.cards || []).map((card) => card?.name),
        attachedCardCount: (entityResponse.cards || []).length,
      });

      return res.status(200).json({
        success: true,
        data: entityResponse,
      });
    }

    const { dishes: relevantDishes, retrievalMode } =
      await retrieveRelevantDishes(memoryContext.retrievalQuery, {
        semanticQuery: memoryContext.semanticQuery || userMessage,
      });
    traceChatFlow("retrieval_completed", {
      sessionId,
      retrievalMode,
      retrievalQuery: memoryContext.retrievalQuery,
      semanticQuery: memoryContext.semanticQuery || userMessage,
      rewrittenMessage: memoryContext.rewrittenMessage || userMessage,
      dishNames: relevantDishes.map((dish) => dish?.name),
      dishCount: relevantDishes.length,
    });
    const memorySummary = buildMemorySummary(sessionId);
    const systemInstruction = buildMemoryAwareSystemInstruction(
      relevantDishes,
      memorySummary,
    );
    const history = formatHistoryForOpenAI(chatHistory);

    const completion = await retryAsync(
      () =>
        openai.chat.completions.create({
          model: CHAT_MODEL,
          temperature: 0.7,
          max_tokens: CHAT_MAX_TOKENS,
          messages: [
            { role: "system", content: systemInstruction },
            ...history,
            { role: "user", content: userMessage },
          ],
        }),
      {
        retries: CHAT_RETRIES,
        baseDelayMs: 1000,
        timeoutMs: CHAT_COMPLETION_TIMEOUT_MS,
        operationName: "generate chatbot completion",
        shouldRetry: (error) => {
          const status = error?.status || error?.response?.status;
          if (typeof status === "number" && status >= 500) {
            return true;
          }

          return (
            error?.code === "ECONNREFUSED" ||
            error?.code === "ECONNRESET" ||
            error?.code === "ETIMEDOUT" ||
            error?.cause?.code === "ECONNREFUSED" ||
            error?.cause?.code === "ECONNRESET" ||
            error?.cause?.code === "ETIMEDOUT"
          );
        },
        onRetry: ({ attempt, delayMs, error }) => {
          console.warn(
            `[Retry] Chatbot completion failed on attempt ${attempt}. Retrying in ${delayMs}ms: ${error.message}`,
          );
        },
      },
    );

    const aiReply = completion.choices?.[0]?.message?.content?.trim();
    traceChatFlow("llm_completion_received", {
      sessionId,
      model: CHAT_MODEL,
      provider: "gemini_openai_compat",
      finishReason: completion?.choices?.[0]?.finish_reason || null,
      usage: completion?.usage || null,
      replyPreview: String(aiReply || "").slice(0, 240),
    });
    const parsedCards = extractDishCardsFromReply(aiReply);
    const responseCards =
      parsedCards.length > 0 ? parsedCards : buildFallbackDishCards(relevantDishes);
    recordAssistantTurn(sessionId, aiReply || "", responseCards);
    traceChatFlow("response_ready", {
      sessionId,
      replyPreview: String(aiReply || "").slice(0, 240),
      attachedCards: responseCards.map((card) => card?.name),
      attachedCardCount: responseCards.length,
    });

    return res.status(200).json({
      success: true,
      data: {
        reply:
          aiReply || "Mình chưa tạo được câu trả lời. Bạn thử hỏi lại nhé.",
        cards: responseCards,
        meta: {
          dishes_retrieved: relevantDishes.length,
          history_window: history.length,
          model: CHAT_MODEL,
          provider: "gemini_openai_compat",
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
        message: "Gemini API key không hợp lệ. Vui lòng kiểm tra cấu hình.",
      });
    }

    if (error.status === 429) {
      return res.status(503).json({
        success: false,
        message:
          "Gemini API đang chạm giới hạn quota hoặc rate limit. Vui lòng thử lại sau.",
      });
    }

    if (error.code === "ECONNREFUSED" || error.cause?.code === "ECONNREFUSED") {
      return res.status(503).json({
        success: false,
        message: "Không thể kết nối tới Gemini OpenAI-compatible endpoint.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Đã có lỗi xảy ra phía máy chủ. Vui lòng thử lại.",
    });
  }
};

module.exports = { chat };
