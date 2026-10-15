import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import ReplyPanel from "./ReplyPanel";

// get all messages of a conversation, oldest first
async function fetchMessages(conversationId) {
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Could not load messages:", error);
    return [];
  }
  return data;
}

function daysSince(dateString) {
  const ms = Date.now() - new Date(dateString).getTime();
  return Math.floor(ms / 86400000);
}

export default function ConversationView({ conversationId, role }) {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // load the conversation details and messages when the selection changes
  useEffect(() => {
    let ignore = false; // don't update the screen if the user already switched

    async function load() {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          "id, brand_id, brands(name), customers(name), orders(product, status, delivered_on, total)"
        )
        .eq("id", conversationId)
        .single();

      if (error) {
        console.error("Could not load conversation:", error);
        return;
      }

      const msgs = await fetchMessages(conversationId);
      if (ignore) return;

      setConversation(data);
      setMessages(msgs);
    }

    load();
    return () => {
      ignore = true;
    };
  }, [conversationId]);

  async function sendMessage(event) {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending) return;

    setSending(true);
    const { error } = await supabase.from("messages").insert({
      brand_id: conversation.brand_id,
      conversation_id: conversationId,
      sender: role,
      body,
    });
    setSending(false);

    if (error) {
      console.error(error);
      alert("Could not send the message. Please try again.");
      return;
    }

    setText("");
    setMessages(await fetchMessages(conversationId));
  }

  if (!conversation) {
    return <div className="empty">Loading...</div>;
  }

  const order = conversation.orders;
  const latestCustomerMessage = [...messages]
    .reverse()
    .find((m) => m.sender === "customer");

  return (
    <>
      <header className="conv-header">
        <h1>
          {conversation.customers.name}
          <span className="brand-tag">{conversation.brands.name}</span>
        </h1>

        {order && (
          <div className="order-info">
            Order: {order.product} · {order.status}
            {order.delivered_on &&
              ` · delivered ${daysSince(order.delivered_on)} days ago`}
            {` · Rs ${order.total}`}
          </div>
        )}
      </header>

      {latestCustomerMessage && (
        <div className="latest">
          <small>Latest customer message</small>
          {latestCustomerMessage.body}
        </div>
      )}

      <div className="messages">
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.sender}`}>
            {m.body}
            <small>
              {m.sender} ·{" "}
              {new Date(m.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </small>
          </div>
        ))}
      </div>

              {role === "agent" && latestCustomerMessage && (
        <ReplyPanel
          key={`${conversationId}-${latestCustomerMessage.id}`}
          conversationId={conversationId}
          onSent={async () => setMessages(await fetchMessages(conversationId))}
        />
      )}
      
      <form className="send-box" onSubmit={sendMessage}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Type a message as the ${role}...`}
        />
        <button type="submit" disabled={sending || !text.trim()}>
          Send
        </button>
      </form>
    </>
  );
}