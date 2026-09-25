import { collection, query, limit, getDocs, doc, getDoc, setDoc, Timestamp, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";

/**
 * Get Gemini API Key from various sources:
 * 1. Firestore 'settings/config' (geminiApiKey)
 * 2. LocalStorage ('KV_GEMINI_API_KEY')
 * 3. Vite Environment variable ('VITE_GEMINI_API_KEY')
 */
export async function getGeminiApiKey() {
  try {
    const configSnap = await getDoc(doc(db, "settings", "config"));
    if (configSnap.exists() && configSnap.data().geminiApiKey) {
      return configSnap.data().geminiApiKey.trim();
    }
  } catch (e) {
    console.warn("Could not read Gemini key from Firestore config:", e);
  }

  const localKey = localStorage.getItem("KV_GEMINI_API_KEY");
  if (localKey && localKey.trim()) return localKey.trim();

  if (import.meta.env.VITE_GEMINI_API_KEY) {
    return import.meta.env.VITE_GEMINI_API_KEY.trim();
  }

  return null;
}

export async function saveGeminiApiKey(apiKey) {
  const trimmed = (apiKey || "").trim();
  localStorage.setItem("KV_GEMINI_API_KEY", trimmed);
  try {
    await setDoc(doc(db, "settings", "config"), { geminiApiKey: trimmed, updatedAt: Timestamp.now() }, { merge: true });
  } catch (e) {
    console.warn("Could not save Gemini key to Firestore:", e);
  }
  return true;
}

/**
 * Executes a real-time Firestore query on behalf of the AI.
 * It fetches the latest 50 docs and performs a client-side fuzzy search if a searchTerm is provided.
 */
async function executeDatabaseQuery(collectionName, searchTerm = "") {
  try {
    const allowedCollections = ["orders", "products", "customers", "users", "riders", "warehouses", "expenses", "leave_requests", "procurement", "payouts"];
    if (!allowedCollections.includes(collectionName)) {
      return { error: `Collection '${collectionName}' is not accessible. Allowed collections are: ${allowedCollections.join(", ")}` };
    }

    const q = query(collection(db, collectionName), limit(50));
    const querySnapshot = await getDocs(q);
    let results = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Clean up large fields (e.g. createdAt timestamps) for token saving
    results = results.map(r => {
      const clean = { ...r };
      if (clean.createdAt && typeof clean.createdAt.toDate === 'function') {
        clean.createdAt = clean.createdAt.toDate().toISOString();
      }
      return clean;
    });

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      results = results.filter(item => {
        // Search across all string/number values in the document
        return Object.values(item).some(val => 
          val && (typeof val === 'string' || typeof val === 'number') && String(val).toLowerCase().includes(term)
        );
      });
    }

    // Return max 5 documents to save tokens
    return { 
      status: "success", 
      collection: collectionName,
      totalMatches: results.length,
      data: results.slice(0, 5) 
    };
  } catch (err) {
    console.error("Tool execution error:", err);
    return { error: err.message };
  }
}

/**
 * Main Gemini Interaction Loop (Supports Multi-turn & Function Calling)
 */
export async function queryGeminiSupervisor(prompt, userEmail = "Admin", chatHistory = []) {
  const apiKey = await getGeminiApiKey();

  if (!apiKey) {
    return generateLocalIntelligenceResponse(prompt, false);
  }

  const systemInstruction = `You are KrishiVishal AI Supervisor & Executive Business Intelligence Officer for KrishiVishal (an Agri-tech platform in Bihar, India).
You have access to a tool 'query_database' which you MUST use if you need real-time data to answer the user's question (e.g., specific customers, expenses, attendance, recent orders).
If the user asks about a specific person, order, or entity, USE THE TOOL with a searchTerm.
If the user asks for a general summary of a category, USE THE TOOL without a searchTerm to get the latest records.
Always provide formatted output using clean markdown bullet points, bold key figures, and rupee symbols (₹).`;

  const tools = [{
    functionDeclarations: [{
      name: "query_database",
      description: "Search and fetch real-time records from any database collection. Use this whenever you need factual, up-to-date data.",
      parameters: {
        type: "OBJECT",
        properties: {
          collectionName: {
            type: "STRING",
            description: "The name of the collection to query. Must be one of: 'orders', 'products', 'customers', 'users', 'riders', 'warehouses', 'expenses', 'leave_requests', 'procurement', 'payouts'."
          },
          searchTerm: {
            type: "STRING",
            description: "Optional keyword to search across the collection (e.g., name, phone, status). Leave empty for latest records."
          }
        },
        required: ["collectionName"]
      }
    }]
  }];

  // Build conversation contents with history
  const contents = [];
  
  if (chatHistory && chatHistory.length > 0) {
    contents.push({ role: "user", parts: [{ text: `${systemInstruction}\n\nUser: ${chatHistory[0].text}` }] });
    for (let i = 1; i < chatHistory.length; i++) {
      contents.push({ role: chatHistory[i].role === "user" ? "user" : "model", parts: [{ text: chatHistory[i].text }] });
    }
    contents.push({ role: "user", parts: [{ text: prompt }] });
  } else {
    contents.push({ role: "user", parts: [{ text: `${systemInstruction}\n\nUser Query: "${prompt}"` }] });
  }

  try {
    const defaultEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`;
    const fallbackEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
    
    let endpoint = defaultEndpoint;
    
    // ─── STEP 1: INITIAL CALL TO GEMINI ───
    let res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        tools,
        generationConfig: { temperature: 0.3 }
      })
    });

    if (!res.ok) {
      if (res.status === 404) {
        endpoint = fallbackEndpoint;
        res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents, tools, generationConfig: { temperature: 0.3 } })
        });
      }
      if (!res.ok) throw new Error(await res.text());
    }

    let data = await res.json();
    let candidate = data.candidates?.[0];
    let part = candidate?.content?.parts?.[0];

    // ─── STEP 2: HANDLE FUNCTION CALL ───
    if (part?.functionCall) {
      const { name, args } = part.functionCall;
      
      let toolResult = {};
      if (name === "query_database") {
        toolResult = await executeDatabaseQuery(args.collectionName, args.searchTerm);
      } else {
        toolResult = { error: "Unknown function" };
      }

      // ─── STEP 3: SEND FUNCTION RESPONSE BACK TO GEMINI ───
      contents.push(candidate.content); // Append model's functionCall
      contents.push({
        role: "user",
        parts: [{
          functionResponse: {
            name: name,
            response: { name: name, content: toolResult }
          }
        }]
      });

      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          tools,
          generationConfig: { temperature: 0.3 }
        })
      });

      if (!res.ok) throw new Error(await res.text());
      data = await res.json();
      candidate = data.candidates?.[0];
      part = candidate?.content?.parts?.[0];
    }

    // ─── STEP 4: RETURN FINAL RESPONSE ───
    const generatedText = part?.text;
    
    if (generatedText) {
      // Log activity
      try {
        await addDoc(collection(db, "ai_activity_logs"), {
          prompt,
          agentType: "Gemini 1.5 Agent",
          requestedBy: userEmail,
          timestamp: serverTimestamp(),
          status: "PROCESSED"
        });
      } catch (e) {}

      return {
        agentType: "Gemini 1.5 Flash (Agent Mode)",
        message: generatedText,
        isGeminiLive: true,
        data: null // We could attach the raw toolResult here if we wanted to show a table
      };
    }

  } catch (apiError) {
    console.warn("Gemini API call failed:", apiError);
    return generateLocalIntelligenceResponse(prompt, Boolean(apiKey), apiError.message);
  }

  return generateLocalIntelligenceResponse(prompt, Boolean(apiKey));
}

/**
 * Fallback local response
 */
function generateLocalIntelligenceResponse(prompt, hasKey, errorMessage = null) {
  let msg = `🤖 **KrishiVishal System Status:**\n`;
  if (hasKey && errorMessage) {
    msg += `⚠️ **Gemini API Error:** ${errorMessage}\n\n`;
    msg += `Try checking your API Key or network connection.`;
  } else {
    msg += `You are currently running in Local Mode because the Gemini API is unavailable or unconfigured.\n\n`;
    msg += `💡 *Tip: To enable advanced real-time Agent capabilities (e.g., searching customers, expenses, leave attendance), please set your Gemini API Key using the button on the left.*`;
  }
  return {
    agentType: "Local Supervisor",
    message: msg,
    isGeminiLive: false,
    data: null
  };
}
