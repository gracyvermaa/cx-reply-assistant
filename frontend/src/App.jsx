import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import ConversationView from "./components/ConversationView";
import KnowledgeBase from "./components/KnowledgeBase";
import "./App.css";

export default function App() {
  const [page, setPage] = useState("inbox"); // "inbox" or "kb"
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  // which side of the conversation we are acting as
  const [role, setRole] = useState("agent");

  useEffect(() => {
    async function loadConversations() {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, customers(name), brands(name)")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Could not load conversations:", error);
        return;
      }

      setConversations(data);
      if (data.length > 0) setSelectedId(data[0].id);
    }

    loadConversations();
  }, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="page-tabs">
          <button
            className={page === "inbox" ? "on" : ""}
            onClick={() => setPage("inbox")}
          >
            Inbox
          </button>
          <button
            className={page === "kb" ? "on" : ""}
            onClick={() => setPage("kb")}
          >
            Knowledge base
          </button>
        </div>

        {page === "inbox" && (
          <>
            <h2>Conversations</h2>

            {conversations.map((c) => (
              <button
                key={c.id}
                className={
                  c.id === selectedId ? "chat-item active" : "chat-item"
                }
                onClick={() => setSelectedId(c.id)}
              >
                <strong>{c.customers.name}</strong>
                <span>{c.brands.name}</span>
              </button>
            ))}

            <div className="role-toggle">
              <p>Acting as</p>
              <div className="role-buttons">
                <button
                  className={role === "customer" ? "on" : ""}
                  onClick={() => setRole("customer")}
                >
                  Customer
                </button>
                <button
                  className={role === "agent" ? "on" : ""}
                  onClick={() => setRole("agent")}
                >
                  Agent
                </button>
              </div>
            </div>
          </>
        )}
      </aside>

      <main className="main">
        {page === "kb" ? (
          <KnowledgeBase />
        ) : selectedId ? (
          <ConversationView conversationId={selectedId} role={role} />
        ) : (
          <div className="empty">Loading conversations...</div>
        )}
      </main>
    </div>
  );
}