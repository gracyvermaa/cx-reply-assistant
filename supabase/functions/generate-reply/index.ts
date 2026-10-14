import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// small helper so we don't repeat the headers everywhere
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // browsers send an OPTIONS request first, we just say ok
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { conversation_id } = await req.json();
    if (!conversation_id) {
      return json({ error: "conversation_id is required" }, 400);
    }

    // this key stays on the server, it is never sent to the browser
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // step 1: find the conversation and its brand
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, brand_id, brands(name)")
      .eq("id", conversation_id)
      .single();

    if (convError || !conversation) {
      return json({ error: "Conversation not found" }, 404);
    }

    // step 2: get the knowledge base for THIS brand only
    const { data: kbEntries, error: kbError } = await supabase
      .from("kb_entries")
      .select("title, content")
      .eq("brand_id", conversation.brand_id);

    if (kbError) {
      return json({ error: "Could not load knowledge base" }, 500);
    }

    return json({
      brand: conversation.brands.name,
      kb_entries: kbEntries,
    });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong" }, 500);
  }
});