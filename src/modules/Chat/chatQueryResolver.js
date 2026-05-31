function createChatQueryResolver(deps) {
  const {
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
    maxCandidatePoolSize,
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
  } = deps;

  function parsePriceNumber(rawValue) {
    const normalizedValue = normalizeText(rawValue);
    if (!normalizedValue) {
      return null;
    }

    const digitsOnly = normalizedValue.replace(/[^0-9]/g, "");
    if (!digitsOnly) {
      return null;
    }

    const baseValue = Number(digitsOnly);
    if (!Number.isFinite(baseValue) || baseValue <= 0) {
      return null;
    }

    if (normalizedValue.includes("trieu")) {
      return baseValue * 1000000;
    }

    if (normalizedValue.includes("k") || normalizedValue.includes("nghin")) {
      return baseValue * 1000;
    }

    return baseValue;
  }

  function extractRequestedCount(message) {
    const normalizedMessage = normalizeText(message);
    const matchedNumber =
      normalizedMessage.match(/\b(\d+)\s+(mon|loai|sp|san pham|combo|pizza|burger)\b/) ||
      normalizedMessage.match(/\btop\s+(\d+)\b/);
    const count = Number(matchedNumber?.[1] || 0);
    return Number.isInteger(count) && count > 0 ? count : null;
  }

  function extractOrdinalReferenceIndex(message) {
    const normalizedMessage = normalizeText(message);
    const ordinalMatch =
      normalizedMessage.match(/\b(mon|cai|sp|san pham)\s+thu\s*(\d+)\b/) ||
      normalizedMessage.match(/\b(mon|cai|sp|san pham)\s+so\s*(\d+)\b/) ||
      normalizedMessage.match(/\b(mon|cai|sp|san pham)\s+dau(\s+tien)?\b/) ||
      normalizedMessage.match(/\b(mon|cai)\s+cuoi\b/);

    if (!ordinalMatch) {
      return null;
    }

    if (ordinalMatch[0].includes("dau")) {
      return 0;
    }

    if (ordinalMatch[0].includes("cuoi")) {
      return "last";
    }

    const numericIndex = Number(ordinalMatch[2] || 0);
    return Number.isInteger(numericIndex) && numericIndex > 0
      ? numericIndex - 1
      : null;
  }

  function extractExplicitPriceHints(message) {
    const normalizedMessage = normalizeText(message);
    if (
      normalizedMessage.includes("mieng bo") ||
      normalizedMessage.includes("patty")
    ) {
      return [];
    }
    const matches = normalizedMessage.match(
      /\b\d[\d\s.,]*(?:k|nghin|trieu)?\b/g,
    );

    return [
      ...new Set(
        (matches || [])
          .map((value) => parsePriceNumber(value))
          .filter((value) => Number.isFinite(value) && value > 0),
      ),
    ];
  }

  function extractPriceConstraints(message) {
    const normalizedMessage = normalizeText(message);
    if (
      normalizedMessage.includes("mieng bo") ||
      normalizedMessage.includes("patty")
    ) {
      return {};
    }
    const boundedMatch = normalizedMessage.match(
      /\b(tu|tren|hon|duoi|nho hon|thap hon)\s+([0-9][0-9\s.,]*\s*(k|nghin|trieu)?)\b/g,
    );

    const constraints = {};

    for (const phrase of boundedMatch || []) {
      const normalizedPhrase = normalizeText(phrase);
      const numericPart = phrase.match(
        /([0-9][0-9\s.,]*\s*(k|nghin|trieu)?)/i,
      )?.[1];
      const parsedValue = parsePriceNumber(numericPart);

      if (!Number.isFinite(parsedValue)) {
        continue;
      }

      if (
        normalizedPhrase.includes("duoi") ||
        normalizedPhrase.includes("nho hon") ||
        normalizedPhrase.includes("thap hon")
      ) {
        constraints.maxPrice = parsedValue;
      }

      if (
        normalizedPhrase.includes("tu") ||
        normalizedPhrase.includes("tren") ||
        normalizedPhrase.includes("hon")
      ) {
        constraints.minPrice = parsedValue;
      }
    }

    return constraints;
  }

  function extractBeefPattyCountMin(message) {
    const normalizedMessage = normalizeText(message);
    const explicitCountMatch =
      normalizedMessage.match(/\btu\s+(\d+)\s+mieng\s+bo\b/) ||
      normalizedMessage.match(/\b(\d+)\s+mieng\s+bo\b/) ||
      normalizedMessage.match(/\b(\d+)\s+patty\b/);
    const parsedCount = Number(explicitCountMatch?.[1] || 0);

    if (Number.isInteger(parsedCount) && parsedCount > 0) {
      return parsedCount;
    }

    if (normalizedMessage.includes("triple")) {
      return 3;
    }

    if (normalizedMessage.includes("double")) {
      return 2;
    }

    return null;
  }

  function hasFoodDomainSignal(message, query = {}) {
    const normalizedMessage = normalizeText(message);
    const foodDomainHints = [
      "mon",
      "do an",
      "thuc an",
      "menu",
      "quan",
      "an gi",
      "goi y",
      "gia",
      "re nhat",
      "dat nhat",
      "them vao gio",
      "mua",
      "dat mon",
      "burger",
      "pizza",
      "combo",
      "nuoc",
      "uong",
      "beef",
      "bo",
    ];

    return (
      Boolean(query.categoryRule) ||
      Boolean(query.ingredientRule) ||
      Boolean(query.explicitPrices?.length) ||
      Boolean(
        Number.isFinite(query.priceConstraints?.minPrice) ||
          Number.isFinite(query.priceConstraints?.maxPrice),
      ) ||
      hasContextReference(message) ||
      foodDomainHints.some((hint) => normalizedMessage.includes(hint))
    );
  }

  function hasSelectionVerb(message) {
    const normalizedMessage = normalizeText(message);
    return (
      normalizedMessage.includes("uong") ||
      normalizedMessage.includes("an") ||
      normalizedMessage.includes("chon") ||
      normalizedMessage.includes("lay") ||
      normalizedMessage.includes("doi y") ||
      normalizedMessage.includes("muon")
    );
  }

  function shouldInheritCategoryContext(message, query) {
    const normalizedMessage = normalizeText(message);
    const hasOrdinalReference =
      extractOrdinalReferenceIndex(message) !== null;
    const hasDirectContextReference = hasContextReference(message);
    const followUpScopeHints = [
      "con mon nao",
      "mon khac",
      "loai khac",
      "cai khac",
      "re hon",
      "dat hon",
      "cao hon",
      "thap hon",
      "duoi do",
      "ben tren",
      "o tren",
      "goi y",
    ];

    if (hasDirectContextReference || hasOrdinalReference) {
      return true;
    }

    if (query.intent === "purchase") {
      return true;
    }

    if (query.intent === "compare") {
      return true;
    }

    if (query.intent === "count") {
      return true;
    }

    return followUpScopeHints.some((hint) => normalizedMessage.includes(hint));
  }

  function isReferenceQuestion(message) {
    const normalizedMessage = normalizeText(message);
    const hasReference =
      hasContextReference(message) ||
      extractOrdinalReferenceIndex(message) !== null;
    const asksForExplanation =
      normalizedMessage.includes("la gi") ||
      normalizedMessage.includes("gi vay") ||
      normalizedMessage.includes("gi a") ||
      normalizedMessage.includes("sao") ||
      normalizedMessage.includes("the nao");

    return hasReference && asksForExplanation;
  }

  function isGenericCategoryBrowsingRequest(message, query) {
    const hasOrdinalReference =
      extractOrdinalReferenceIndex(message) !== null;
    const hasDirectContextReference = hasContextReference(message);

    return Boolean(
      (query.categoryRule || query.ingredientRule) &&
        !hasOrdinalReference &&
        !hasDirectContextReference &&
        !query.explicitPrices?.length &&
        !query.wantsCheapest &&
        !query.wantsMostExpensive &&
        !query.wantsCount,
    );
  }

  function detectQueryIntent(message, query) {
    if (isGenericCategoryBrowsingRequest(message, query)) {
      return "list";
    }

    if (query.wantsPurchase) {
      return "purchase";
    }

    if (
      (extractOrdinalReferenceIndex(message) !== null ||
        hasContextReference(message)) &&
      hasSelectionVerb(message) &&
      hasFoodDomainSignal(message, query)
    ) {
      return "purchase";
    }

    if (query.wantsCategoryCheck) {
      return "verify";
    }

    if (query.wantsGeneralMenuCount || query.wantsCount) {
      return "count";
    }

    if (query.wantsCheapest || query.wantsMostExpensive) {
      return "compare";
    }

    return "list";
  }

  function determineQueryScope(query) {
    if (query.wantsGeneralMenuCount) {
      return "all_menu";
    }

    if (query.categoryRule && query.ingredientRule) {
      return "category_with_ingredient";
    }

    if (query.categoryRule) {
      return "category";
    }

    if (query.ingredientRule) {
      return "ingredient";
    }

    return "generic";
  }

  function getLatestContextualCategoryRule(chatHistory = []) {
    const history = Array.isArray(chatHistory) ? chatHistory : [];

    for (let index = history.length - 1; index >= 0; index -= 1) {
      const entry = history[index];
      const content = String(entry?.content || "").trim();
      if (!content) {
        continue;
      }

      const categoryRule = findCategoryEntityRule(content);
      if (categoryRule) {
        return categoryRule;
      }
    }

    return null;
  }

  function applyConversationContext(query, chatHistory = []) {
    if (query.categoryRule || query.ingredientRule) {
      return query;
    }

    if (!hasFoodDomainSignal(query.normalizedMessage, query)) {
      return query;
    }

    if (!shouldInheritCategoryContext(query.normalizedMessage, query)) {
      return query;
    }

    const contextualCategoryRule = getLatestContextualCategoryRule(chatHistory);
    if (!contextualCategoryRule) {
      return query;
    }

    return {
      ...query,
      categoryRule: contextualCategoryRule,
      scope: determineQueryScope({
        ...query,
        categoryRule: contextualCategoryRule,
      }),
      inheritedCategory: true,
    };
  }

  function buildQuerySchema(message, chatHistory = []) {
    const baseQuery = {
      categoryRule: findCategoryEntityRule(message),
      ingredientRule: findIngredientEntityRule(message),
      priceConstraints: extractPriceConstraints(message),
      explicitPrices: extractExplicitPriceHints(message),
      requestedCount: extractRequestedCount(message),
      beefPattyCountMin: extractBeefPattyCountMin(message),
      wantsCheapest: isCheapestIntent(message),
      wantsMostExpensive: isMostExpensiveIntent(message),
      wantsCount: isCountIntent(message),
      wantsGeneralMenuCount: isGeneralMenuCountIntent(message),
      wantsPurchase: isPurchaseIntent(message),
      wantsCategoryCheck: isCategoryVerificationIntent(message),
      wantsReferenceQuestion: isReferenceQuestion(message),
      normalizedMessage: normalizeText(message),
    };

    const query = {
      ...baseQuery,
      intent: detectQueryIntent(message, baseQuery),
      scope: determineQueryScope(baseQuery),
    };

    return applyConversationContext(query, chatHistory);
  }

  function extractQueryEntities(message, chatHistory = []) {
    return buildQuerySchema(message, chatHistory);
  }

  function buildSemanticSearchOptions(message) {
    const filters = {
      available: true,
      status: "active",
    };
    const priceConstraints = extractPriceConstraints(message);

    if (Number.isFinite(priceConstraints.minPrice)) {
      filters.minPrice = priceConstraints.minPrice;
    }

    if (Number.isFinite(priceConstraints.maxPrice)) {
      filters.maxPrice = priceConstraints.maxPrice;
    }

    if (isDrinkIntent(message)) {
      filters.categoryNames = ["Nước uống"];
    } else if (isComboIntent(message)) {
      filters.categoryNames = ["Combos"];
    }

    return { filters };
  }

  async function getCategoryIdsByNames(categoryNames = []) {
    if (!Array.isArray(categoryNames) || categoryNames.length === 0) {
      return [];
    }

    const categories = await categoryService.getAllCategories();
    return categories
      .filter((category) => categoryNames.includes(category?.name))
      .map((category) => category.category_id);
  }

  async function getDishesByCategoryNames(
    categoryNames = [],
    limit = maxCandidatePoolSize,
  ) {
    const categoryIds = await getCategoryIdsByNames(categoryNames);
    if (categoryIds.length === 0) {
      return [];
    }

    const dishes = await dishService.findAllDishes({
      where: {
        category_id: { [Op.in]: categoryIds },
        status: "active",
        available: true,
      },
      order: [
        ["sold_count", "DESC"],
        ["price", "ASC"],
        ["name", "ASC"],
      ],
      limit,
    });

    return attachCategoriesToDishes(dishes);
  }

  function sortDishesByDirection(dishes, direction = "ASC") {
    return [...dishes].sort((left, right) => {
      const leftPlainDish = left?.get ? left.get({ plain: true }) : left;
      const rightPlainDish = right?.get ? right.get({ plain: true }) : right;
      const leftPrice = Number(leftPlainDish?.price || 0);
      const rightPrice = Number(rightPlainDish?.price || 0);

      if (leftPrice !== rightPrice) {
        return direction === "ASC"
          ? leftPrice - rightPrice
          : rightPrice - leftPrice;
      }

      return String(leftPlainDish?.name || "").localeCompare(
        String(rightPlainDish?.name || ""),
        "vi",
      );
    });
  }

  function applyEntityFiltersToDishes(dishes, query) {
    let filteredDishes = Array.isArray(dishes) ? [...dishes] : [];

    if (query.ingredientRule?.matcher) {
      filteredDishes = filteredDishes.filter((dish) =>
        query.ingredientRule.matcher(dish),
      );
    }

    if (Number.isInteger(query.beefPattyCountMin) && query.beefPattyCountMin > 0) {
      filteredDishes = filteredDishes.filter((dish) => {
        const metadata = deriveDishMetadata(dish);
        return (
          Number(metadata?.beef_patty_count || 0) >= query.beefPattyCountMin &&
          metadata?.is_combo !== true
        );
      });
    }

    if (Number.isFinite(query.priceConstraints?.minPrice)) {
      filteredDishes = filteredDishes.filter((dish) => {
        const plainDish = dish?.get ? dish.get({ plain: true }) : dish;
        return Number(plainDish?.price || 0) >= query.priceConstraints.minPrice;
      });
    }

    if (Number.isFinite(query.priceConstraints?.maxPrice)) {
      filteredDishes = filteredDishes.filter((dish) => {
        const plainDish = dish?.get ? dish.get({ plain: true }) : dish;
        return Number(plainDish?.price || 0) <= query.priceConstraints.maxPrice;
      });
    }

    return filteredDishes;
  }

  function shouldDelegateToGeneralRetrieval(query) {
    return Boolean(
      (query.categoryRule || query.ingredientRule) &&
        !query.wantsCategoryCheck,
    );
  }

  async function resolveDishesFromQuery(query, limit = 12) {
    if (shouldDelegateToGeneralRetrieval(query)) {
      return {
        shouldHandle: false,
        dishes: [],
        retrievalMode: "delegate_general_retrieval",
      };
    }

    if (!query.categoryRule && !query.ingredientRule) {
      return {
        shouldHandle: false,
        dishes: [],
        retrievalMode: "entity_skip",
      };
    }

    if (query.categoryRule) {
      const categoryDishes = await getDishesByCategoryNames(
        query.categoryRule.categoryNames,
        limit,
      );

      return {
        shouldHandle: true,
        dishes: applyEntityFiltersToDishes(categoryDishes, query),
        retrievalMode: `${query.categoryRule.key}_category_entity`,
      };
    }

    if (query.ingredientRule?.key === "beef") {
      const beefResult = await getBeefDishes(limit);
      return {
        shouldHandle: true,
        dishes: applyEntityFiltersToDishes(beefResult.dishes, query),
        retrievalMode: `${beefResult.retrievalMode}_${query.ingredientRule.key}_entity`,
      };
    }

    return {
      shouldHandle: false,
      dishes: [],
      retrievalMode: "entity_no_match",
    };
  }

  function buildEntitySummaryReply(query, dishes) {
    if (!dishes.length) {
      if (query.categoryRule && query.ingredientRule) {
        return `Hiện tại mình chưa tìm thấy ${query.categoryRule.singularLabel} nào có ${query.ingredientRule.displayLabel} đang mở bán.`;
      }

      if (query.categoryRule) {
        return `Hiện tại mình chưa tìm thấy ${query.categoryRule.singularLabel} nào đang mở bán.`;
      }

      if (query.ingredientRule) {
        return `Hiện tại mình chưa tìm thấy món nào có ${query.ingredientRule.displayLabel} đang mở bán.`;
      }

      return "Hiện tại mình chưa tìm thấy món phù hợp đang mở bán.";
    }

    const scopeLabel = query.categoryRule
      ? query.categoryRule.pluralLabel
      : "món";

    if (query.intent === "count") {
      if (query.categoryRule && query.ingredientRule) {
        return `Hiện tại Eatsy có ${dishes.length} ${scopeLabel} có ${query.ingredientRule.displayLabel} đang mở bán.`;
      }

      if (Number.isInteger(query.beefPattyCountMin) && query.beefPattyCountMin > 0) {
        return `Hiện tại Eatsy có ${dishes.length} món có từ ${query.beefPattyCountMin} miếng bò trở lên đang mở bán.`;
      }

      if (query.categoryRule) {
        return `Hiện tại Eatsy có ${dishes.length} ${scopeLabel} đang mở bán.`;
      }

      if (query.ingredientRule) {
        return `Hiện tại Eatsy có ${dishes.length} món có ${query.ingredientRule.displayLabel} đang mở bán.`;
      }
    }

    if (query.intent === "compare") {
      const sortedDishes = sortDishesByDirection(
        dishes,
        query.wantsCheapest ? "ASC" : "DESC",
      );
      const requestedCount = Math.max(1, Number(query.requestedCount || 1));
      const selectedDishes = sortedDishes.slice(0, requestedCount);
      const selectedDish = selectedDishes[0] || null;
      const plainDish = selectedDish?.get
        ? selectedDish.get({ plain: true })
        : selectedDish;

      if (!plainDish) {
        return "Hiện tại mình chưa tìm thấy món phù hợp để so sánh giá.";
      }

      const formattedPrice = Number(plainDish.price || 0).toLocaleString(
        "vi-VN",
      );
      const comparatorLabel = query.wantsCheapest
        ? "giá thấp nhất"
        : "giá cao nhất";

      if (requestedCount > 1) {
        return `Trong các ${scopeLabel} đang mở bán, đây là ${selectedDishes.length} món có ${comparatorLabel}: ${selectedDishes
          .map((dish) => {
            const plain = dish?.get ? dish.get({ plain: true }) : dish;
            return `${plain.name} (${Number(plain.price || 0).toLocaleString("vi-VN")}đ)`;
          })
          .join(", ")}.`;
      }

      return `Trong các ${scopeLabel} đang mở bán, ${plainDish.name} là món có ${comparatorLabel} với mức ${formattedPrice}đ.`;
    }

    if (query.categoryRule && query.ingredientRule) {
      return `Trong menu hiện có ${dishes.length} ${scopeLabel} có ${query.ingredientRule.displayLabel}. Một vài món tiêu biểu là ${dishes
        .slice(0, 5)
        .map(
          (dish) =>
            `${dish.name} (${Number(dish.price || 0).toLocaleString("vi-VN")}đ)`,
        )
        .join(", ")}.`;
    }

    if (Number.isInteger(query.beefPattyCountMin) && query.beefPattyCountMin > 0) {
      return `Trong menu hiện có ${dishes.length} món có từ ${query.beefPattyCountMin} miếng bò trở lên. Một vài món tiêu biểu là ${dishes
        .slice(0, 5)
        .map(
          (dish) =>
            `${dish.name} (${Number(dish.price || 0).toLocaleString("vi-VN")}đ)`,
        )
        .join(", ")}.`;
    }

    return `Hiện tại Eatsy có ${dishes.length} ${scopeLabel} đang mở bán. Một vài lựa chọn là ${dishes
      .slice(0, 5)
      .map(
        (dish) =>
          `${dish.name} (${Number(dish.price || 0).toLocaleString("vi-VN")}đ)`,
      )
      .join(", ")}.`;
  }

  function getLatestAssistantCardsFromChatHistory(chatHistory) {
    const history = Array.isArray(chatHistory) ? chatHistory : [];

    for (let index = history.length - 1; index >= 0; index -= 1) {
      const entry = history[index];
      if (
        entry?.role === "assistant" &&
        Array.isArray(entry?.dishes) &&
        entry.dishes.length > 0
      ) {
        return entry.dishes;
      }
    }

    return [];
  }

  function getLatestAssistantTextFromChatHistory(chatHistory) {
    const history = Array.isArray(chatHistory) ? chatHistory : [];

    for (let index = history.length - 1; index >= 0; index -= 1) {
      const entry = history[index];
      if (entry?.role === "assistant" && String(entry?.content || "").trim()) {
        return String(entry.content).trim();
      }
    }

    return "";
  }

  function getBestAssistantCardsForReference(chatHistory, message) {
    const history = Array.isArray(chatHistory) ? chatHistory : [];
    const ordinalIndex = extractOrdinalReferenceIndex(message);
    const prefersSuggestedList =
      normalizeText(message).includes("goi y") ||
      normalizeText(message).includes("de xuat");

    for (let index = history.length - 1; index >= 0; index -= 1) {
      const entry = history[index];
      if (
        entry?.role !== "assistant" ||
        !Array.isArray(entry?.dishes) ||
        entry.dishes.length === 0
      ) {
        continue;
      }

      if (ordinalIndex === "last") {
        return entry.dishes;
      }

      if (Number.isInteger(ordinalIndex)) {
        if (entry.dishes.length > ordinalIndex) {
          return entry.dishes;
        }
        continue;
      }

      if (prefersSuggestedList && entry.dishes.length < 2) {
        continue;
      }

      return entry.dishes;
    }

    return [];
  }

  function shouldPreferResolvedCategoryCards(query, chatHistory = []) {
    if (!query?.categoryRule) {
      return false;
    }

    const latestAssistantCards = getLatestAssistantCardsFromChatHistory(chatHistory);
    return latestAssistantCards.length === 0;
  }

  function normalizeCardLike(card) {
    if (!card) {
      return null;
    }

    return {
      id: card.id || card.dish_id || null,
      name: card.name || "Món ăn",
      price: Number(card.price || 0),
      image: card.image || card.image_url || "",
      rating: Number(card.rating || 0),
    };
  }

  function buildDisambiguationReply(cards = []) {
    const options = cards
      .slice(0, 3)
      .map((card) => card?.name)
      .filter(Boolean);

    if (options.length === 0) {
      return "Mình chưa chắc bạn đang muốn chọn món nào. Bạn nói lại tên món giúp mình nhé.";
    }

    if (options.length === 1) {
      return `Bạn đang muốn chọn ${options[0]} phải không ạ?`;
    }

    if (options.length === 2) {
      return `Bạn đang muốn thêm ${options[0]} hay ${options[1]} vào giỏ ạ?`;
    }

    return `Mình chưa chắc bạn đang muốn chọn món nào. Bạn muốn ${options[0]}, ${options[1]} hay ${options[2]} ạ?`;
  }

  function uniqueCards(cards = []) {
    const uniqueCardMap = new Map();

    for (const rawCard of cards) {
      const card = normalizeCardLike(rawCard);
      if (!card) {
        continue;
      }

      const key = card.id || normalizeText(card.name);
      if (key && !uniqueCardMap.has(key)) {
        uniqueCardMap.set(key, card);
      }
    }

    return Array.from(uniqueCardMap.values());
  }

  function cardsShareIdentity(leftCard, rightCard) {
    const left = normalizeCardLike(leftCard);
    const right = normalizeCardLike(rightCard);
    if (!left || !right) {
      return false;
    }

    if (left.id && right.id) {
      return left.id === right.id;
    }

    return normalizeText(left.name || "") === normalizeText(right.name || "");
  }

  function resolveCardByName(message, cards = []) {
    const normalizedMessage = normalizeText(message);

    return (
      cards.find((card) => {
        const normalizedCardName = normalizeText(card?.name || "");
        return (
          normalizedCardName &&
          (normalizedMessage.includes(normalizedCardName) ||
            normalizedCardName.includes(normalizedMessage))
        );
      }) || null
    );
  }

  function resolveCardByPrice(prices, cards = []) {
    if (!Array.isArray(prices) || prices.length === 0 || cards.length === 0) {
      return null;
    }

    let bestMatch = null;

    for (const price of prices) {
      const exactMatch =
        cards.find((card) => Number(card.price || 0) === price) || null;
      if (exactMatch) {
        return exactMatch;
      }

      const nearestMatch =
        [...cards]
          .sort(
            (left, right) =>
              Math.abs(Number(left.price || 0) - price) -
              Math.abs(Number(right.price || 0) - price),
          )
          .find((card) => Math.abs(Number(card.price || 0) - price) <= 5000) ||
        null;

      if (nearestMatch && !bestMatch) {
        bestMatch = nearestMatch;
      }
    }

    return bestMatch;
  }

  function resolveRelativePriceCard(message, referencedCard, cards = []) {
    if (!referencedCard || cards.length === 0) {
      return null;
    }

    const referencePrice = Number(referencedCard.price || 0);
    if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
      return null;
    }

    if (hasCheaperPreference(message)) {
      return (
        [...cards]
          .filter((card) => Number(card.price || 0) < referencePrice)
          .sort(
            (left, right) =>
              Number(right.price || 0) - Number(left.price || 0),
          )[0] || null
      );
    }

    if (hasMoreExpensivePreference(message)) {
      return (
        [...cards]
          .filter((card) => Number(card.price || 0) > referencePrice)
          .sort(
            (left, right) =>
              Number(left.price || 0) - Number(right.price || 0),
          )[0] || null
      );
    }

    return null;
  }

  async function buildEntityDrivenResponse(message, sessionId, chatHistory = []) {
    const query = buildQuerySchema(message, chatHistory);

    if (query.scope === "all_menu" && query.intent === "count") {
      const totalActiveDishes = await dishService.countDishes({
        where: {
          status: "active",
          available: true,
        },
      });
      const reply = `Hiện tại Eatsy có ${totalActiveDishes} món đang mở bán trong menu.`;
      recordAssistantTurn(sessionId, reply, []);

      return {
        reply,
        cards: [],
        meta: {
          dishes_retrieved: totalActiveDishes,
          history_window: 0,
          model: null,
          provider: "entity_rule",
          semantic_enabled: isSemanticSearchEnabled(),
          retrieval_mode: "menu_count_entity",
          session_id: sessionId || null,
        },
        entities: query,
        query,
        resolved: {
          shouldHandle: true,
          dishes: [],
          retrievalMode: "menu_count_entity",
        },
        type: "general_count",
      };
    }

    if (
      !query.categoryRule &&
      !query.ingredientRule &&
      !query.wantsCategoryCheck
    ) {
      return null;
    }

    if (shouldDelegateToGeneralRetrieval(query)) {
      return null;
    }

    // Prefer natural LLM follow-up answers over canned DB summaries when the
    // user is asking about a referenced item from prior dialogue.
    if (query.wantsReferenceQuestion && query.intent === "list") {
      return null;
    }

    // Keep rules focused on explicit or structured requests; inherited list
    // context tends to sound too canned for open-ended follow-ups.
    if (
      query.inheritedCategory &&
      query.intent === "list" &&
      !query.requestedCount &&
      !query.wantsCount
    ) {
      return null;
    }

    const resolved = await resolveDishesFromQuery(
      query,
      Math.max(12, Number(query.requestedCount || 0)),
    );
    if (!resolved.shouldHandle && !query.wantsCategoryCheck) {
      return null;
    }

    if (query.intent === "verify") {
      return {
        entities: query,
        query,
        resolved,
        sessionId,
        type: "category_check",
      };
    }

    if (query.intent === "purchase") {
      return {
        entities: query,
        query,
        resolved,
        sessionId,
        type: "purchase",
      };
    }

    const sortedDishes =
      query.intent === "compare"
        ? sortDishesByDirection(
            resolved.dishes,
            query.wantsCheapest ? "ASC" : "DESC",
          )
        : resolved.dishes;
    const requestedCount = Math.max(1, Number(query.requestedCount || 0) || 0);
    const responseDishes =
      query.intent === "compare" && requestedCount > 1
        ? sortedDishes.slice(0, requestedCount)
        : sortedDishes;

    const cards =
      query.intent === "compare"
        ? requestedCount > 1
          ? buildFallbackDishCards(responseDishes).slice(0, requestedCount)
          : sortedDishes[0]
            ? [buildDishCardPayload(sortedDishes[0])]
            : []
        : buildFallbackDishCards(responseDishes);
    const reply = buildEntitySummaryReply(query, responseDishes);
    recordAssistantTurn(sessionId, reply, cards);

    return {
      reply,
      cards:
        query.intent === "list" && query.categoryRule
          ? cards
          : shouldAttachDishCards(message, responseDishes)
            ? cards
            : [],
      meta: {
        dishes_retrieved: responseDishes.length,
        history_window: 0,
        model: null,
        provider: "entity_rule",
        semantic_enabled: isSemanticSearchEnabled(),
        retrieval_mode: resolved.retrievalMode,
        session_id: sessionId || null,
      },
      entities: query,
      query,
      resolved: {
        ...resolved,
        dishes: responseDishes,
      },
      type: "list_or_filter",
    };
  }

  async function resolvePurchaseTarget({
    message,
    chatHistory,
    memoryContext,
  }) {
    const query = buildQuerySchema(message, chatHistory);
    const hasRelativePriceRequest =
      hasCheaperPreference(message) || hasMoreExpensivePreference(message);

    if (
      query.intent !== "purchase" &&
      !hasRelativePriceRequest
    ) {
      return null;
    }

    const historyCards = getBestAssistantCardsForReference(chatHistory, message);
    const referencedCard = normalizeCardLike(memoryContext.referencedCard);
    const hasExplicitTargetReference = Boolean(
      referencedCard ||
        resolveCardByName(message, historyCards) ||
        extractOrdinalReferenceIndex(message) !== null ||
        hasContextReference(message),
    );

    if (hasRelativePriceRequest && !hasExplicitTargetReference) {
      return null;
    }

    const latestAssistantText = getLatestAssistantTextFromChatHistory(chatHistory);
    const entityResolved = await resolveDishesFromQuery(
      query,
      Math.max(12, Number(query.requestedCount || 0)),
    );
    const relevantRetrieval =
      entityResolved.shouldHandle && entityResolved.dishes.length > 0
        ? {
            dishes: entityResolved.dishes,
            retrievalMode: entityResolved.retrievalMode,
          }
        : await retrieveRelevantDishes(memoryContext.retrievalQuery);
    const latestAssistantRetrieval =
      hasContextReference(message) && latestAssistantText
        ? await retrieveRelevantDishes(latestAssistantText)
        : { dishes: [], retrievalMode: null };
    const latestAssistantCards = latestAssistantRetrieval.dishes.map(
      buildDishCardPayload,
    );
    const retrievalCards = relevantRetrieval.dishes.map(buildDishCardPayload);
    const contextualCards = shouldPreferResolvedCategoryCards(query, chatHistory)
      ? uniqueCards([...retrievalCards, ...latestAssistantCards])
      : uniqueCards([...historyCards, ...latestAssistantCards]);
    const referencedCardMatchesContext = contextualCards.some((card) =>
      cardsShareIdentity(card, referencedCard),
    );
    const candidateCards =
      contextualCards.length > 0
        ? uniqueCards([
            ...contextualCards,
            ...(referencedCardMatchesContext ? [referencedCard] : []),
          ])
        : uniqueCards([referencedCard, ...retrievalCards]);

    if (candidateCards.length === 0) {
      return null;
    }

    const namedCard = resolveCardByName(message, candidateCards);
    if (namedCard) {
      return {
        card: namedCard,
        source: "named_candidate",
        retrievalMode: relevantRetrieval.retrievalMode,
        debug: {
          candidateNames: candidateCards.map((card) => card?.name).filter(Boolean),
          contextualCandidateCount: contextualCards.length,
          retrievalCandidateCount: retrievalCards.length,
        },
      };
    }

    const ordinalReferenceIndex = extractOrdinalReferenceIndex(message);
    if (
      (ordinalReferenceIndex === "last" || Number.isInteger(ordinalReferenceIndex)) &&
      candidateCards.length > 0
    ) {
      const ordinalCard =
        ordinalReferenceIndex === "last"
          ? candidateCards[candidateCards.length - 1] || null
          : candidateCards[ordinalReferenceIndex] || null;

      if (ordinalCard) {
        return {
          card: normalizeCardLike(ordinalCard),
          source: "ordinal_candidate",
          retrievalMode: relevantRetrieval.retrievalMode,
          debug: {
            candidateNames: candidateCards.map((card) => card?.name).filter(Boolean),
            contextualCandidateCount: contextualCards.length,
            retrievalCandidateCount: retrievalCards.length,
          },
        };
      }
    }

    const priceMatchedCard = resolveCardByPrice(
      query.explicitPrices,
      candidateCards,
    );
    if (priceMatchedCard) {
      return {
        card: priceMatchedCard,
        source: "price_candidate",
        retrievalMode: relevantRetrieval.retrievalMode,
        debug: {
          candidateNames: candidateCards.map((card) => card?.name).filter(Boolean),
          contextualCandidateCount: contextualCards.length,
          retrievalCandidateCount: retrievalCards.length,
        },
      };
    }

    const relativeCard = resolveRelativePriceCard(
      message,
      referencedCard,
      candidateCards,
    );
    if (relativeCard) {
      return {
        card: relativeCard,
        source: "relative_price_candidate",
        retrievalMode: relevantRetrieval.retrievalMode,
        debug: {
          candidateNames: candidateCards.map((card) => card?.name).filter(Boolean),
          contextualCandidateCount: contextualCards.length,
          retrievalCandidateCount: retrievalCards.length,
        },
      };
    }

    // Memory may already resolve ordinal references like "món thứ 2".
    if (referencedCard) {
      return {
        card: referencedCard,
        source: "referenced_candidate",
        retrievalMode: relevantRetrieval.retrievalMode,
        debug: {
          candidateNames: candidateCards.map((card) => card?.name).filter(Boolean),
          contextualCandidateCount: contextualCards.length,
          retrievalCandidateCount: retrievalCards.length,
        },
      };
    }

    if (candidateCards.length === 1) {
      return {
        card: candidateCards[0],
        source: "single_candidate",
        retrievalMode: relevantRetrieval.retrievalMode,
        debug: {
          candidateNames: candidateCards.map((card) => card?.name).filter(Boolean),
          contextualCandidateCount: contextualCards.length,
          retrievalCandidateCount: retrievalCards.length,
        },
      };
    }

    if (
      candidateCards.length > 1 &&
      (query.intent === "purchase" || hasContextReference(message))
    ) {
      return {
        card: null,
        source: "ambiguous_candidate",
        retrievalMode: relevantRetrieval.retrievalMode,
        needsClarification: true,
        candidates: candidateCards.slice(0, 3),
        reply: buildDisambiguationReply(candidateCards),
        debug: {
          candidateNames: candidateCards.map((card) => card?.name).filter(Boolean),
          contextualCandidateCount: contextualCards.length,
          retrievalCandidateCount: retrievalCards.length,
        },
      };
    }

    return null;
  }

  return {
    buildEntityDrivenResponse,
    buildSemanticSearchOptions,
    resolvePurchaseTarget,
    buildQuerySchema,
    resolveDishesFromQuery,
    extractQueryEntities,
  };
}

module.exports = {
  createChatQueryResolver,
};
