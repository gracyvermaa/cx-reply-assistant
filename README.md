# CX Reply Assistant

An AI-assisted reply tool for customer support agents. The agent opens a conversation, clicks **Generate Reply**, and gets a draft that is based only on that brand's own policies. The agent can edit it, regenerate it, approve it, or ignore the AI and type a reply by hand.

Built for the Datastraw Technologies assessment.

- **Live app:** https://cx-reply-assistant-theta.vercel.app/
- **Repo:** https://github.com/gracyvermaa/cx-reply-assistant

## How to try it

1. Open the live app. Two seeded conversations are in the left list: **Priya Sharma (Urban Brew)** and **Rahul Mehta (Glow Naturals)**.
2. Use the **Acting as** toggle at the bottom left to switch between **Customer** and **Agent**. As the customer, send a message. As the agent, click **Generate Reply**.
3. Read the draft. Under it, **Knowledge used** shows exactly which policy entries the AI was given. A yellow banner appears when the agent needs to take a closer look.
4. Edit the text, **Regenerate**, or **Approve & send**. The reply lands in the chat. You can also type a manual message in the box at the bottom, independent of the AI.
5. Open the **Knowledge base** tab to add, edit or delete policy entries for a brand. Change a policy, go back to the inbox, click Regenerate, and the draft follows the new policy.

### Things worth testing

| Try this | What should happen |
| --- | --- |
| Priya: "My order was delivered but the bottle is broken. What can I do?" | Draft cites Urban Brew's 48-hour damage rule, does not promise a refund, and flags the case for the agent |
| Rahul: "I received this 20 days ago. Can I get a refund?" | Draft uses Glow's 30-day rule for unopened items, asks about the product's condition, and does not promise a refund |
| As Customer, ask "Do you have a store in Mumbai?" | No AI call is made. The panel says the knowledge base has nothing on this and asks the agent to reply manually |
| Change Urban Brew's refund window in the Knowledge base tab, then Regenerate | The new window shows up in "Knowledge used" |
| Compare "Knowledge used" for Priya and Rahul | Each shows only their own brand's entries |

If you see a "daily limit reached" message, that is the built-in cap on AI replies (see below), not a bug.

## The two brands

The policies differ on purpose, so leaks between brands are easy to spot.

| | Glow Naturals | Urban Brew |
| --- | --- | --- |
| Returns | Unopened products within 30 days | No returns, except damaged or leaking items |
| Refunds | To the original payment method; damaged items reported within 14 days | Only within 7 days of delivery; damaged items reported within 48 hours |
| Shipping | Ships in 2 business days, delivery 4-6 days, free above Rs 999 | Ships in 24 hours, delivery 2-3 days, flat Rs 99 |
| Cancellation | Any time before shipping | Within 2 hours of ordering |

## How it works

```
Browser (React)
   |  Generate Reply (conversation_id only)
   v
Edge Function: generate-reply
   1. look up the conversation -> brand, customer, order   (brand comes from the database, never from the browser)
   2. take the latest customer message
   3. fetch ONLY that brand's KB entries and pick the relevant ones
   4. nothing relevant?  -> stop, no AI call, flag for the agent
   5. daily cap reached? -> stop with a clear message
   6. build the prompt: rules + order facts + policy excerpts + chat history
   7. call Gemini (retry on overload, fall back to a second model)
   8. save everything to ai_generations and return the draft + the knowledge used
   |
   v
Agent edits / regenerates / approves
   |  Approve & send (generation_id + final text)
   v
Edge Function: approve-reply
   - saves the edited and final text, adds the reply to the conversation
   - refuses to send the same draft twice
```

## Key decisions

**Keyword retrieval instead of embeddings.** Each brand has a handful of short entries, so matching on word stems is simple, free, fast and easy to explain. Customer words are cleaned up (stopwords removed, "broken" treated as "damaged", a refund question also pulls in the return policy) and each entry is scored by overlap. With hundreds of entries per brand I would switch to embeddings in Qdrant, filtered by brand.

**Brand isolation is enforced on the server.** The browser only sends a conversation id. The function looks up the brand itself and filters every knowledge query by it, so the client cannot ask for another brand's policies. All tables carry a `brand_id`, and the database also rejects a message whose brand does not match its conversation.

**Guardrails.**
- The prompt tells the model to use only the policy excerpts and order facts it is given, never to promise a refund or exception the policy does not clearly allow, to ask for missing facts instead of assuming, and to say so when the policy does not answer the question.
- The model must answer in a fixed JSON shape: `reply`, `confidence`, `needs_human`, `reason`. The app shows a warning banner when `needs_human` is set or confidence is low, and always shows the reason.
- If no knowledge entry matches the question, the AI is not called at all. That is both safer and cheaper.
- Days since delivery is calculated in code and handed to the model as a fact, because models are unreliable at date arithmetic.

**Reliability.**
- Each AI attempt has a 15-second timeout. On a "busy" or "slow down" response (503/429) it retries up to 3 times with a growing wait, then tries a second model.
- If the AI is completely unavailable, the agent sees a clear message and can still write a reply manually.
- Approving a draft is safe to repeat: the second attempt on the same draft is refused, so a double click cannot send two replies.

**Cost control.**
- A daily cap on AI replies (default 30 per 24 hours, set by `DAILY_AI_LIMIT`).
- No AI call when the knowledge base has no answer.
- Only the matching policy entries and the last 10 messages go into the prompt, and the model runs at a low temperature.
- A `MOCK_AI` test switch returns a placeholder reply so the whole app can be tested at no cost.

**Security.**
- The browser only holds the publishable Supabase key. The service role key and the Gemini key live in Edge Function secrets.
- Row Level Security is on for every table. Conversations, orders and customers are read-only from the browser, messages can be read and added but not edited or deleted, and the `ai_generations` log has no browser access at all.

**LLM choice.** I used the Google Gemini API on its free tier. The model call lives in one small function in `generate-reply`, so moving to OpenRouter or DeepInfra means changing one place.

## What is logged

Every attempt creates a row in `ai_generations` with the customer message, the retrieved knowledge (as JSON), the AI draft, the agent-edited text (only when the agent really changed it), the final text sent, a `needs_human` flag and a timestamp. A regenerate creates a new row.

## Known limitations

- **No login.** The demo is open, so "the public" means everyone, and anyone can read all brands or edit any brand's knowledge base. The production version uses Supabase Auth plus row policies that check an agent's brand membership (a commented example is at the bottom of `database/policies.sql`).
- **Keyword matching is crude.** While testing, the word "days" in a customer message linked it to an unrelated shipping policy. Fixing that removed the only word connecting refund questions to the return policy, so the AI missed a rule and wrongly told a customer they were out of the window. I fixed it with a small "related topics" lookup and a stricter prompt rule, but it shows why embeddings are the better long-term answer.
- **Free-tier AI.** Model names and limits on the Gemini free tier change, so the `-latest` model aliases are used.
- Messages stay inside the app. WhatsApp and email delivery are not implemented.

## What I would improve with more time

1. Supabase Auth with per-brand agent accounts and brand-scoped policies.
2. Embeddings plus Qdrant retrieval, with a small evaluation set of customer questions to measure retrieval and answer quality after every change.
3. Move AI calls to a queue with idempotency keys, for webhook-driven incoming messages.

## Project structure

```
database/
  schema.sql        tables
  seed.sql          two brands, policies, customers, orders, conversations
  policies.sql      row level security policies
supabase/functions/
  generate-reply/   retrieval, guardrails, Gemini call, logging
  approve-reply/    saves the final reply, blocks double sends
frontend/           React + Vite app
```

### Tables

| Table | Purpose |
| --- | --- |
| `brands` | The companies |
| `kb_entries` | Policy text per brand |
| `customers`, `orders` | Mock customer and order data |
| `conversations`, `messages` | Chat history |
| `ai_generations` | Log of every AI attempt and the agent's final reply |

## Run it yourself

You need Node.js 18 or newer, a free Supabase account, and a free Gemini API key from Google AI Studio.

**1. Clone and install**

```bash
git clone https://github.com/gracyvermaa/cx-reply-assistant.git
cd cx-reply-assistant/frontend
npm install
```

**2. Create a Supabase project.** In its SQL Editor, run these three files in order: `database/schema.sql`, `database/seed.sql`, `database/policies.sql`.

**3. Deploy the functions** from the project root:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase secrets set GEMINI_API_KEY=your_key GEMINI_MODEL=gemini-flash-latest GEMINI_FALLBACK_MODEL=gemini-flash-lite-latest DAILY_AI_LIMIT=30
npx supabase functions deploy generate-reply
npx supabase functions deploy approve-reply
```

**4. Run the frontend.** Copy `frontend/.env.example` to `frontend/.env` and fill in your project URL and publishable key (Project Settings > API Keys), then:

```bash
cd frontend
npm run dev
```

Open http://localhost:5173.

**5. Deploy (optional).** Import the repo into Vercel, set the Root Directory to `frontend`, and add the two `VITE_` variables.

### Settings reference

| Name | Where | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `frontend/.env` | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `frontend/.env` | Public browser key |
| `GEMINI_API_KEY` | Supabase secret | Google AI Studio key |
| `GEMINI_MODEL` | Supabase secret | Main model (default `gemini-flash-latest`) |
| `GEMINI_FALLBACK_MODEL` | Supabase secret | Backup model if the first keeps failing |
| `DAILY_AI_LIMIT` | Supabase secret | Max AI replies per 24 hours (default 30) |
| `MOCK_AI` | Supabase secret | Set to `true` to return placeholder replies without calling the AI |