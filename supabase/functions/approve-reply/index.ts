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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { generation_id, final_text } = await req.json();
    const text = String(final_text ?? "").trim();

    if (!generation_id || !text) {
      return json({ error: "generation_id and final_text are required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // find the AI attempt this reply belongs to
    const { data: generation } = await supabase
      .from("ai_generations")
      .select("id, brand_id, conversation_id, ai_response")
      .eq("id", generation_id)
      .single();

    if (!generation) {
      return json({ error: "Reply draft not found" }, 404);
    }

    // only count it as "edited" if the agent really changed the AI text
    const wasEdited = generation.ai_response !== null &&
      text !== generation.ai_response;

    // claim this draft. The "is null" check means a second click finds nothing to claim
    const { data: claimed } = await supabase
      .from("ai_generations")
      .update({
        agent_edited_response: wasEdited ? text : null,
        final_response: text,
      })
      .eq("id", generation_id)
      .is("final_response", null)
      .select("id");

    if (!claimed || claimed.length === 0) {
      return json({ error: "This reply was already sent" }, 409);
    }

    // add the reply to the conversation (brand and conversation come from our own record)
    const { error: messageError } = await supabase.from("messages").insert({
      brand_id: generation.brand_id,
      conversation_id: generation.conversation_id,
      sender: "agent",
      body: text,
    });

    if (messageError) {
      // undo the claim so the agent can try again
      await supabase
        .from("ai_generations")
        .update({ agent_edited_response: null, final_response: null })
        .eq("id", generation_id);

      console.error(messageError);
      return json({ error: "Could not send the reply. Please try again." }, 500);
    }

    return json({ ok: true, edited: wasEdited });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong" }, 500);
  }
});