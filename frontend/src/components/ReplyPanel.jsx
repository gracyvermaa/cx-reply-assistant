import { useState } from "react";
import { supabase } from "../lib/supabase";

// our functions reply with { error: "..." } when something fails, so read that
async function getErrorMessage(error) {
  try {
    const body = await error.context.json();
    if (body.error) return body.error;
  } catch {
    // couldn't read it, use the generic message below
  }
  return "Something went wrong. Please try again.";
}

export default function ReplyPanel({ conversationId, onSent }) {
  const [generation, setGeneration] = useState(null); // what generate-reply returned
  const [draft, setDraft] = useState(""); // the text the agent can edit
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const wasEdited = generation && generation.reply && draft !== generation.reply;

  async function generate() {
    // don't throw away the agent's edits by accident
    if (wasEdited && !window.confirm("Regenerating will replace your edits. Continue?")) {
      return;
    }

    setLoading(true);
    setError("");

    const { data, error: fnError } = await supabase.functions.invoke(
      "generate-reply",
      { body: { conversation_id: conversationId } }
    );

    setLoading(false);

    if (fnError) {
      setError(await getErrorMessage(fnError));
      return;
    }

    setGeneration(data);
    setDraft(data.reply ?? "");
  }

  async function approve() {
    setSending(true);
    setError("");

    const { error: fnError } = await supabase.functions.invoke("approve-reply", {
      body: { generation_id: generation.generation_id, final_text: draft },
    });

    setSending(false);

    if (fnError) {
      setError(await getErrorMessage(fnError));
      return;
    }

    // sent: clear the panel and refresh the chat
    setGeneration(null);
    setDraft("");
    await onSent();
  }

  return (
    <section className="reply-panel">
      <div className="reply-top">
        <strong>AI reply assistant</strong>
        <button
          className="primary"
          onClick={generate}
          disabled={loading || sending}
        >
          {loading
            ? "Generating..."
            : generation
              ? "Regenerate"
              : "Generate Reply"}
        </button>
      </div>

      {error && <div className="notice error">{error}</div>}

      {generation && (
        <>
          {generation.needs_human && (
            <div className="notice warn">
              Needs your attention: {generation.reason}
            </div>
          )}

          <textarea
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              generation.reply
                ? ""
                : "No AI draft for this question. Write your own reply here."
            }
          />

          {generation.reply && !generation.needs_human && (
            <p className="reason">Why: {generation.reason}</p>
          )}

          <details className="context" open>
            <summary>
              Knowledge used ({generation.retrieved_context.length})
            </summary>
            {generation.retrieved_context.length === 0 ? (
              <p className="muted">Nothing in the knowledge base matched.</p>
            ) : (
              <ul>
                {generation.retrieved_context.map((entry) => (
                  <li key={entry.title}>
                    <strong>{entry.title}:</strong> {entry.content}
                  </li>
                ))}
              </ul>
            )}
          </details>

          <div className="reply-actions">
            <span className="muted">
              Confidence: {generation.confidence}
              {wasEdited && " · edited by you"}
            </span>
            <button
              className="primary"
              onClick={approve}
              disabled={!draft.trim() || sending || loading}
            >
              {sending ? "Sending..." : "Approve & send"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}