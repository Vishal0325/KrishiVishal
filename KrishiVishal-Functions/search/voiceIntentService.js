/**
 * Voice Search AI Intent Extraction Service
 * KrishiVishal-Functions
 *
 * Extracts structured agricultural search intent from farmer voice queries (Hindi/Hinglish/Bhojpuri/English).
 * Uses Gemini Flash (via @google/genai) when GEMINI_API_KEY is configured,
 * with a comprehensive local rule-engine fallback for resilience and offline support.
 */

const { GoogleGenAI } = require('@google/genai');

// --- CROP KNOWLEDGE BASE ---
const CROP_MAP = [
  { canonical: 'Maize', aliases: ['makka', 'makai', 'bhutta', 'corn', 'maize', 'मक्का', 'भुट्टा'] },
  { canonical: 'Wheat', aliases: ['gehu', 'gehun', 'wheat', 'गेहूं', 'ग़ेहूं'] },
  { canonical: 'Paddy', aliases: ['dhaan', 'dhan', 'chawal', 'rice', 'paddy', 'धान', 'चावल'] },
  { canonical: 'Potato', aliases: ['aalu', 'alu', 'potato', 'आलू'] },
  { canonical: 'Mustard', aliases: ['sarso', 'sarson', 'rai', 'toria', 'mustard', 'सरसों', 'राई'] },
  { canonical: 'Tomato', aliases: ['tamatar', 'tomato', 'टमाटर'] },
  { canonical: 'Chilli', aliases: ['mirchi', 'mirch', 'chilli', 'chili', 'pepper', 'मिर्च'] },
  { canonical: 'Onion', aliases: ['pyaaz', 'pyaz', 'kanda', 'onion', 'प्याज़', 'प्याज'] },
  { canonical: 'Gram', aliases: ['chana', 'chane', 'gram', 'chickpea', 'चना'] },
  { canonical: 'Pea', aliases: ['matar', 'pea', 'मटर'] },
  { canonical: 'Soybean', aliases: ['soya', 'soyabean', 'soybean', 'सोयाबीन'] },
  { canonical: 'Cotton', aliases: ['kapas', 'cotton', 'कपास'] },
  { canonical: 'Brinjal', aliases: ['baigan', 'baingan', 'brinjal', 'eggplant', 'बैंगन'] },
  { canonical: 'Cauliflower', aliases: ['gobhi', 'gobi', 'cauliflower', 'cabbage', 'गोभी'] },
  { canonical: 'Garlic', aliases: ['lahsun', 'lahsan', 'garlic', 'लहसुन'] }
];

// --- PROBLEM & CATEGORY KNOWLEDGE BASE ---
const PROBLEM_MAP = [
  {
    problem: 'pest',
    category: 'Insecticide',
    aliases: ['kida', 'keeda', 'kide', 'keede', 'kidey', 'sundi', 'sondi', 'illii', 'illi', 'mahu', 'tiddi', 'pest', 'insects', 'insect', 'caterpillar', 'worm', 'borer', 'कीड़ा', 'कीड़े', 'सुंडी', 'माहू']
  },
  {
    problem: 'fungus',
    category: 'Fungicide',
    aliases: ['faphund', 'faphundi', 'fungus', 'fungal', 'jhulsa', 'daag', 'galan', 'sadhan', 'rot', 'blight', 'rust', 'mildew', 'tikka', 'karpa', 'फफूंद', 'झुलसा', 'गलन', 'दाग']
  },
  {
    problem: 'weed',
    category: 'Herbicide',
    aliases: ['ghas', 'ghaas', 'kharpatwar', 'kharpatwaar', 'weed', 'weeds', 'kharpatwar-nashak', 'घास', 'खरपतवार', 'खरपतवारनाशक']
  },
  {
    problem: 'nutrition',
    category: 'Fertilizer',
    aliases: ['khad', 'fertilizer', 'urea', 'dap', 'potash', 'zinc', 'boron', 'micronutrient', 'npk', 'खाद', 'यूरिया', 'डीएपी']
  },
  {
    problem: 'growth',
    category: 'Growth Promoter',
    aliases: ['growth', 'badhwar', 'tonic', 'utpadan', 'boost', 'vridhi', 'टॉनिक', 'बढ़वार']
  },
  {
    problem: null,
    category: 'Seeds',
    aliases: ['beej', 'beejh', 'seed', 'seeds', 'biyada', 'बीज']
  }
];

const STOP_WORDS = new Set([
  'me', 'mein', 'ki', 'ka', 'ke', 'ko', 'se', 'par', 'hai', 'hain', 'tha',
  'thi', 'the', 'lag', 'laga', 'gaya', 'gayi', 'hoga', 'hogi', 'chahiye',
  'batao', 'dawa', 'dawai', 'medicine', 'upchar', 'karo', 'kaise', 'kya',
  'aur', 'to', 'bhi', 'for', 'in', 'the', 'is', 'give', 'tell', 'suggest'
]);

/**
 * Fallback Rule-Engine for extracting agricultural intent
 * @param {string} query Raw speech text
 * @returns {Object} Structured intent payload
 */
function extractWithRuleEngine(query) {
  if (!query || typeof query !== 'string') {
    return {
      crop: null,
      problem: null,
      category: null,
      keywords: [],
      confidence: 0.0,
      source: 'rule_engine'
    };
  }

  const cleanQuery = query.toLowerCase().trim();
  if (cleanQuery.length === 0) {
    return {
      crop: null,
      problem: null,
      category: null,
      keywords: [],
      confidence: 0.0,
      source: 'rule_engine'
    };
  }

  // Tokenize query
  const rawTokens = cleanQuery
    .replace(/[^\w\s\u0900-\u097F]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let detectedCrop = null;
  let matchedCropAliases = [];

  // 1. Detect Crop
  for (const cropEntry of CROP_MAP) {
    for (const alias of cropEntry.aliases) {
      if (cleanQuery.includes(alias) || rawTokens.includes(alias)) {
        detectedCrop = cropEntry.canonical;
        matchedCropAliases = [cropEntry.canonical.toLowerCase(), ...cropEntry.aliases.slice(0, 3)];
        break;
      }
    }
    if (detectedCrop) break;
  }

  // 2. Detect Problem and Category
  let detectedProblem = null;
  let detectedCategory = null;
  let matchedProblemAliases = [];

  for (const probEntry of PROBLEM_MAP) {
    for (const alias of probEntry.aliases) {
      if (cleanQuery.includes(alias) || rawTokens.includes(alias)) {
        detectedProblem = probEntry.problem;
        detectedCategory = probEntry.category;
        matchedProblemAliases = [alias];
        break;
      }
    }
    if (detectedCategory) break;
  }

  // 3. Special handling for general medicine ("dawa" without specific problem)
  if (!detectedCategory && (cleanQuery.includes('dawa') || cleanQuery.includes('dawai') || cleanQuery.includes('medicine'))) {
    if (detectedCrop) {
      // Default to general crop protection search
      detectedProblem = detectedProblem || 'pest';
      detectedCategory = detectedCategory || 'Insecticide';
    }
  }

  // 4. Construct Search Keywords for Firestore indexing
  const meaningfulTokens = rawTokens.filter(t => !STOP_WORDS.has(t) && t.length > 1);
  const keywordsSet = new Set(meaningfulTokens);

  if (detectedCrop) {
    keywordsSet.add(detectedCrop.toLowerCase());
    matchedCropAliases.forEach(a => keywordsSet.add(a.toLowerCase()));
  }

  if (detectedCategory) {
    keywordsSet.add(detectedCategory.toLowerCase());
  }

  if (detectedProblem) {
    keywordsSet.add(detectedProblem.toLowerCase());
  }

  matchedProblemAliases.forEach(a => keywordsSet.add(a.toLowerCase()));

  // 5. Calculate Confidence Score
  let confidence = 0.2;
  if (detectedCrop && detectedCategory) {
    confidence = 0.85;
  } else if (detectedCrop || detectedCategory) {
    confidence = 0.70;
  } else if (meaningfulTokens.length > 0) {
    confidence = 0.40;
  }

  return {
    crop: detectedCrop,
    problem: detectedProblem,
    category: detectedCategory,
    keywords: Array.from(keywordsSet).filter(Boolean),
    confidence,
    source: 'rule_engine'
  };
}

/**
 * Main Extract Voice Intent Function
 * Uses Gemini if configured, otherwise gracefully falls back to Rule Engine.
 * @param {string} query Raw speech text
 * @returns {Promise<Object>} Clean, normalized intent payload
 */
async function extractVoiceIntent(query) {
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return {
      crop: null,
      problem: null,
      category: null,
      keywords: [],
      confidence: 0.0,
      source: 'rule_engine'
    };
  }

  const cleanQuery = query.trim();

  // If GEMINI_API_KEY is available, attempt Gemini extraction
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `User spoken query: "${cleanQuery}"`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
          systemInstruction: `You are an agricultural search intent parser for Bihar farmers (KrishiVishal). Given spoken text in Hindi/Bhojpuri/English, extract:
- crop: Normalized English name (e.g., 'Maize', 'Paddy', 'Wheat', 'Potato', 'Mustard', 'Tomato', 'Chilli', 'Onion') or null
- problem: Type of problem ('pest', 'fungus', 'weed', 'nutrition', 'growth') or null
- category: E-commerce category ('Insecticide', 'Fungicide', 'Herbicide', 'Fertilizer', 'Growth Promoter', 'Seeds') or null
- keywords: Array of search keywords in English and Hindi for Firestore searchKeywords index (e.g. ["maize", "makka", "kida", "insecticide"])
- confidence: float 0.0 to 1.0

Return valid JSON strictly matching this schema.`,
          responseMimeType: 'application/json'
        }
      });

      if (response && response.text) {
        const parsed = JSON.parse(response.text);
        if (parsed && typeof parsed === 'object') {
          return {
            crop: parsed.crop ? String(parsed.crop).trim() : null,
            problem: parsed.problem ? String(parsed.problem).trim() : null,
            category: parsed.category ? String(parsed.category).trim() : null,
            keywords: Array.isArray(parsed.keywords)
              ? Array.from(new Set(parsed.keywords.map(k => String(k).trim().toLowerCase()).filter(Boolean)))
              : [],
            confidence: typeof parsed.confidence === 'number'
              ? Math.min(1.0, Math.max(0.0, parsed.confidence))
              : 0.8,
            source: 'gemini'
          };
        }
      }
    } catch (err) {
      console.warn(`[voiceIntentService] Gemini API call failed or timed out (${err.message}). Falling back to rule-engine.`);
    }
  }

  // Fallback to rule engine
  return extractWithRuleEngine(cleanQuery);
}

module.exports = {
  extractVoiceIntent,
  extractWithRuleEngine
};
