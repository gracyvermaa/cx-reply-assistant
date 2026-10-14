import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------- keyword matching (our simple retrieval) ----------

// words that don't tell us anything about the topic
const STOPWORDS = new Set([
  "what", "with", "this", "that", "have", "from", "your", "about", "there",
  "they", "them", "will", "would", "could", "should", "when", "were", "been",
  "into", "does", "just", "like", "please", "hello", "thanks", "thank",
  "order", "orders", "can", "how", "days",
]);

// customers say "broken", policies say "damaged"
const SYNONYMS: Record<string, string> = {
  broken: "damaged",
  cracked: "damaged",
  smashed: "damaged",
  leaking: "damaged",
  leaked: "damaged",
  defective: "damaged",
  faulty: "damaged",
  money: "refund",
  arrived: "delivered",
  arrive: "delivered",
};

// turn text into a set of simple word stems, e.g. "bottles" -> "bott"
function keywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w))
    .map((w) => SYNONYMS[w] ?? w)
    .map((w) => w.slice(0, 4));
  return new Set(words);
}

// score each KB entry by how many of the customer's words it shares
function findRelevantEntries(
  message: string,
  entries: { title: string; content: string }[],
) {
  const wanted = keywords(message);

  return entries
    .map((entry) => {
      const entryWords = keywords(entry.title + " " + entry.content);
      let score = 0;
      for (const w of wanted) {
        if (entryWords.has(w)) score++;
      }
      return { ...entry, score };
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

// ---------- talking to Gemini ----------

// ask one model, retrying a few times if Google says it is busy
async function askModel(model: string, systemPrompt: string, userPrompt: string) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(15000), // don't wait forever on one try
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": Deno.env.get("GEMINI_API_KEY")!,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.2, // low = sticks to the policy, less creative
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              reply: { type: "STRING" },
              confidence: { type: "STRING", enum: ["high", "medium", "low"] },
              needs_human: { type: "BOOLEAN" },
              reason: { type: "STRING" },
            },
            required: ["reply", "confidence", "needs_human", "reason"],
          },
        },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return JSON.parse(text);
    }

    // 503 = overloaded, 429 = too many requests. These are worth retrying.
    const worthRetrying = res.status === 503 || res.status === 429;
    if (!worthRetrying || attempt === 3) {
      throw new Error(`${model} returned ${res.status}: ${await res.text()}`);
    }

    // wait a little longer after each failed try
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }

  throw new Error(`${model} failed`);
}

// try the main model first, then the backup model if there is one
async function askGemini(systemPrompt: string, userPrompt: string) {
  const models = [
    Deno.env.get("GEMINI_MODEL") ?? "gemini-flash-latest",
    Deno.env.get("GEMINI_FALLBACK_MODEL"),
  ].filter(Boolean) as string[];

  let lastError: unknown;
  for (const model of models) {
    try {
      return await askModel(model, systemPrompt, userPrompt);
    } catch (err) {
      console.error(`Model ${model} failed:`, err);
      lastError = err;
    }
  }
  throw lastError;
}

// ---------- the function itself ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { conversation_id } = await req.json();
    if (!conversation_id) {
      return json({ error: "conversation_id is required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. conversation, brand, customer and order in one go
    const { data: conversation } = await supabase
      .from("conversations")
      .select(
        "id, brand_id, brands(name), customers(name), orders(product, status, delivered_on, total)",
      )
      .eq("id", conversation_id)
      .single();

    if (!conversation) {
      return json({ error: "Conversation not found" }, 404);
    }

    const brandName = conversation.brands.name;

    // 2. chat history and the latest customer message
    const { data: messages } = await supabase
      .from("messages")
      .select("sender, body")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true });

    const history = messages ?? [];
    const lastCustomerMessage = [...history]
      .reverse()
      .find((m) => m.sender === "customer");

    if (!lastCustomerMessage) {
      return json({ error: "There is no customer message to reply to" }, 400);
    }

    // 3. knowledge base for THIS brand only, then pick what's relevant
    const { data: kbEntries } = await supabase
      .from("kb_entries")
      .select("title, content")
      .eq("brand_id", conversation.brand_id);

    const relevant = findRelevantEntries(
      lastCustomerMessage.body,
      kbEntries ?? [],
    );

    // 4. nothing relevant in the KB -> don't ask the AI at all
    if (relevant.length === 0) {
      const reason =
        "The knowledge base has nothing about this question. Please reply manually.";

      const { data: saved } = await supabase
        .from("ai_generations")
        .insert({
          brand_id: conversation.brand_id,
          conversation_id,
          customer_message: lastCustomerMessage.body,
          retrieved_context: [],
          ai_response: null,
          needs_human: true,
        })
        .select("id")
        .single();

      return json({
        generation_id: saved?.id,
        brand: brandName,
        reply: null,
        needs_human: true,
        confidence: "low",
        reason,
        retrieved_context: [],
      });
    }

    // 5. work out the order facts ourselves (AI is bad at date maths)
    const order = conversation.orders;
    let orderFacts = "No order is linked to this conversation.";
    if (order) {
      const days = order.delivered_on
        ? Math.floor(
          (Date.now() - new Date(order.delivered_on).getTime()) / 86400000,
        )
        : null;
      orderFacts = `Product: ${order.product}\nStatus: ${order.status}\n` +
        (days !== null ? `Delivered ${days} days ago\n` : "") +
        `Total: Rs ${order.total}`;
    }

    // 6. build the prompt
    const systemPrompt = `You write draft replies for a customer support agent at ${brandName}.

Follow these rules strictly:
- Use ONLY the policy excerpts and order facts given below. Do not use outside knowledge.
- Never promise a refund, replacement or exception unless the policy clearly allows it for this order.
- If the policy conflicts with the customer's situation (for example the refund window has passed), do not promise anything. Explain the policy politely and say you will check what can be done.
- If the policies do not fully answer the question, say so, set needs_human to true and confidence to low.
- Never invent prices, dates, time limits or links.
- Keep the reply short, warm and written to the customer.
- In "reason", write one sentence for the agent explaining what you based the reply on and any concern.`;

    const policyText = relevant
      .map((e) => `${e.title}: ${e.content}`)
      .join("\n");

    const chatText = history
      .slice(-10)
      .map((m) => `${m.sender === "customer" ? "Customer" : "Agent"}: ${m.body}`)
      .join("\n");

    const userPrompt = `Customer name: ${conversation.customers.name}

ORDER FACTS
${orderFacts}

POLICY EXCERPTS (${brandName})
${policyText}

CONVERSATION SO FAR
${chatText}

Write the next reply to the customer.`;

    // 7. call the AI (if it fails, tell the agent to write manually)
    let result;
    try {
      result = await askGemini(systemPrompt, userPrompt);
    } catch (err) {
      console.error("AI call failed:", err);
      return json({
        error:
          "The AI service is not available right now. You can still write a reply manually.",
      }, 502);
    }

    const needsHuman = result.needs_human || result.confidence === "low";

    // 8. save everything for the logs
    const { data: saved } = await supabase
      .from("ai_generations")
      .insert({
        brand_id: conversation.brand_id,
        conversation_id,
        customer_message: lastCustomerMessage.body,
        retrieved_context: relevant.map((e) => ({
          title: e.title,
          content: e.content,
        })),
        ai_response: result.reply,
        needs_human: needsHuman,
      })
      .select("id")
      .single();

    return json({
      generation_id: saved?.id,
      brand: brandName,
      reply: result.reply,
      needs_human: needsHuman,
      confidence: result.confidence,
      reason: result.reason,
      retrieved_context: relevant.map((e) => ({
        title: e.title,
        content: e.content,
      })),
    });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong" }, 500);
  }
});