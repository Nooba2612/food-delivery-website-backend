const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_STORED_TURNS = 20;
const MAX_STORED_CARDS = 8;
const MAX_KEYWORDS = 12;

const sessionMemories = new Map();

const STOPWORDS = new Set([
  "va",
  "và",
  "la",
  "là",
  "cho",
  "toi",
  "tôi",
  "minh",
  "mình",
  "ban",
  "bạn",
  "co",
  "có",
  "khong",
  "không",
  "cai",
  "cái",
  "mon",
  "món",
  "loai",
  "loại",
  "tren",
  "trên",
  "duoi",
  "dưới",
  "nay",
  "này",
  "do",
  "đó",
  "kia",
  "nua",
  "nữa",
  "giup",
  "giúp",
  "them",
  "thêm",
  "voi",
  "với",
  "mot",
  "một",
  "nhung",
  "những",
]);

function stripDishCardTags(content) {
  return String(content || "")
    .replace(/\[DISH_CARD:\s*\{.*?\}\]/g, " ")
    .trim();
}

function pruneExpiredSessions() {
  const now = Date.now();

  for (const [sessionId, memory] of sessionMemories.entries()) {
    if (now - memory.lastUpdatedAt > SESSION_TTL_MS) {
      sessionMemories.delete(sessionId);
    }
  }
}

function ensureMemory(sessionId) {
  pruneExpiredSessions();

  if (!sessionId) {
    return null;
  }

  if (!sessionMemories.has(sessionId)) {
    sessionMemories.set(sessionId, {
      sessionId,
      lastUpdatedAt: Date.now(),
      recentTurns: [],
      recentUserIntents: [],
      lastAssistantCards: [],
      lastReferencedCard: null,
      preferences: {
        keywords: [],
        taste: [],
        budget: [],
      },
    });
  }

  const memory = sessionMemories.get(sessionId);
  memory.lastUpdatedAt = Date.now();
  return memory;
}

function normalizePhrase(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function pushUnique(list, value, limit) {
  const normalizedValue = normalizePhrase(value);
  if (!normalizedValue) {
    return list;
  }

  const filtered = list.filter(
    (item) => normalizePhrase(item) !== normalizedValue,
  );
  filtered.unshift(value);
  return filtered.slice(0, limit);
}

function extractMeaningfulKeywords(text) {
  return [
    ...new Set(
      String(text || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word.length >= 2 && !STOPWORDS.has(word)),
    ),
  ].slice(0, 6);
}

function extractPreferenceSignals(text) {
  const normalized = normalizePhrase(text);
  const tastes = [
    "cay",
    "không cay",
    "ít cay",
    "ngọt",
    "ít ngọt",
    "mặn",
    "giòn",
    "béo",
    "healthy",
    "ít dầu",
    "nhiều đạm",
    "ăn kiêng",
  ].filter((signal) => normalized.includes(signal));

  const budgets = [
    "giá rẻ",
    "rẻ",
    "bình dân",
    "cao cấp",
    "dưới 50k",
    "dưới 100k",
    "tiết kiệm",
  ].filter((signal) => normalized.includes(signal));

  return {
    tastes,
    budgets,
    keywords: extractMeaningfulKeywords(text),
  };
}

function recordUserTurn(sessionId, message) {
  const memory = ensureMemory(sessionId);
  if (!memory) {
    return null;
  }

  const cleanMessage = stripDishCardTags(message);
  const signals = extractPreferenceSignals(cleanMessage);

  memory.recentTurns.push({
    role: "user",
    content: cleanMessage,
    createdAt: Date.now(),
  });
  memory.recentTurns = memory.recentTurns.slice(-MAX_STORED_TURNS);

  memory.recentUserIntents = pushUnique(
    memory.recentUserIntents,
    cleanMessage,
    6,
  );

  for (const keyword of signals.keywords) {
    memory.preferences.keywords = pushUnique(
      memory.preferences.keywords,
      keyword,
      MAX_KEYWORDS,
    );
  }

  for (const taste of signals.tastes) {
    memory.preferences.taste = pushUnique(memory.preferences.taste, taste, 8);
  }

  for (const budget of signals.budgets) {
    memory.preferences.budget = pushUnique(
      memory.preferences.budget,
      budget,
      6,
    );
  }

  return memory;
}

function recordAssistantTurn(sessionId, reply, cards = []) {
  const memory = ensureMemory(sessionId);
  if (!memory) {
    return null;
  }

  memory.recentTurns.push({
    role: "assistant",
    content: stripDishCardTags(reply),
    createdAt: Date.now(),
    cards,
  });
  memory.recentTurns = memory.recentTurns.slice(-MAX_STORED_TURNS);
  memory.lastAssistantCards = Array.isArray(cards)
    ? cards.slice(0, MAX_STORED_CARDS)
    : [];

  return memory;
}

function getLatestAssistantCardsFromHistory(chatHistory) {
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

function resolveOrdinalReference(message, cards = []) {
  if (!cards.length) {
    return null;
  }

  const normalized = normalizePhrase(message);
  const ordinalMatchers = [
    { pattern: /\b(món|cái|sp|sản phẩm|áo|quần)\s+đầu( tiên)?\b/, index: 0 },
    { pattern: /\b(món|cái|sp|sản phẩm|áo|quần)\s+thứ\s*1\b/, index: 0 },
    { pattern: /\b(món|cái|sp|sản phẩm|áo|quần)\s+thứ\s*2\b/, index: 1 },
    { pattern: /\b(món|cái|sp|sản phẩm|áo|quần)\s+thứ\s*3\b/, index: 2 },
    { pattern: /\b(món|cái|sp|sản phẩm|áo|quần)\s+thứ\s*4\b/, index: 3 },
    {
      pattern: /\b(món|cái|sp|sản phẩm|áo|quần)\s+cuối\b/,
      index: cards.length - 1,
    },
    {
      pattern: /\b(cái|món)\s+áp chót\b/,
      index: Math.max(cards.length - 2, 0),
    },
  ];

  for (const matcher of ordinalMatchers) {
    if (matcher.pattern.test(normalized)) {
      return cards[matcher.index] || null;
    }
  }

  return null;
}

function resolveNamedReference(message, cards = []) {
  const normalized = normalizePhrase(message);

  return (
    cards.find((card) => normalized.includes(normalizePhrase(card?.name))) ||
    null
  );
}

function resolveReferencedCard(sessionId, message, chatHistory) {
  const memory = ensureMemory(sessionId);
  const cardsFromHistory = getLatestAssistantCardsFromHistory(chatHistory);
  const candidateCards =
    cardsFromHistory.length > 0
      ? cardsFromHistory
      : memory?.lastAssistantCards || [];

  const ordinalCard = resolveOrdinalReference(message, candidateCards);
  if (ordinalCard) {
    if (memory) {
      memory.lastReferencedCard = ordinalCard;
    }
    return ordinalCard;
  }

  const namedCard = resolveNamedReference(message, candidateCards);
  if (namedCard) {
    if (memory) {
      memory.lastReferencedCard = namedCard;
    }
    return namedCard;
  }

  return memory?.lastReferencedCard || null;
}

function messageNeedsContext(message) {
  const normalized = normalizePhrase(message);
  const contextualSignals = [
    "món trên",
    "món đó",
    "món này",
    "loại đó",
    "loại này",
    "cái đó",
    "cái này",
    "cái kia",
    "ở trên",
    "ở dưới",
    "bên trên",
    "bên dưới",
    "thằng đó",
    "nó",
    "sp đó",
    "sản phẩm đó",
    "mẫu đó",
    "áo đó",
    "áo trên",
    "áo này",
    "quần đó",
    "món đầu",
    "món đầu tiên",
    "món cuối",
    "món thứ",
    "cái đầu",
    "cái cuối",
  ];

  return contextualSignals.some((signal) => normalized.includes(signal));
}

function buildReferencedCardContext(card) {
  if (!card) {
    return "";
  }

  const price = Number(card.price || 0).toLocaleString("vi-VN");
  return `Sản phẩm đang được nhắc tới: ${card.name || "N/A"} | ID: ${card.id || "N/A"} | Giá: ${price}đ | Rating: ${card.rating || 0}`;
}

function buildMemorySummary(sessionId) {
  const memory = ensureMemory(sessionId);
  if (!memory) {
    return "";
  }

  const lines = [];

  if (memory.preferences.taste.length > 0) {
    lines.push(
      `Khẩu vị quan tâm gần đây: ${memory.preferences.taste.join(", ")}`,
    );
  }

  if (memory.preferences.budget.length > 0) {
    lines.push(
      `Ngân sách/mức giá quan tâm: ${memory.preferences.budget.join(", ")}`,
    );
  }

  if (memory.preferences.keywords.length > 0) {
    lines.push(
      `Từ khóa người dùng hay nhắc: ${memory.preferences.keywords.slice(0, 8).join(", ")}`,
    );
  }

  if (memory.lastAssistantCards.length > 0) {
    const cardsSummary = memory.lastAssistantCards
      .slice(0, 4)
      .map((card, index) => `${index + 1}. ${card.name}`)
      .join(" | ");
    lines.push(`Các món gần nhất đã gợi ý: ${cardsSummary}`);
  }

  return lines.join("\n");
}

function buildRetrievalContext({ sessionId, message, chatHistory = [] }) {
  const currentMessage = String(message || "").trim();
  const memory = ensureMemory(sessionId);
  const referencedCard = resolveReferencedCard(
    sessionId,
    currentMessage,
    chatHistory,
  );
  const referencedCardContext = buildReferencedCardContext(referencedCard);
  const memorySummary = buildMemorySummary(sessionId);

  if (
    !messageNeedsContext(currentMessage) &&
    !referencedCardContext &&
    !memorySummary
  ) {
    return {
      retrievalQuery: currentMessage,
      memorySummary: "",
      referencedCard: null,
    };
  }

  const recentTurns = memory?.recentTurns || [];
  const recentContext = recentTurns
    .slice(-4)
    .map(
      (entry) =>
        `${entry.role === "assistant" ? "Assistant" : "User"}: ${entry.content}`,
    )
    .filter(Boolean)
    .join(" | ");

  return {
    retrievalQuery: [
      recentContext,
      memorySummary,
      referencedCardContext,
      `User hiện tại: ${currentMessage}`,
    ]
      .filter(Boolean)
      .join(" | "),
    memorySummary,
    referencedCard,
  };
}

module.exports = {
  buildMemorySummary,
  buildRetrievalContext,
  recordAssistantTurn,
  recordUserTurn,
  stripDishCardTags,
};
