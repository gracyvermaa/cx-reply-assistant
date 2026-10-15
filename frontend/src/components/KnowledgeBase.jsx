import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// get all KB entries of one brand
async function fetchEntries(brandId) {
  const { data, error } = await supabase
    .from("kb_entries")
    .select("id, title, content")
    .eq("brand_id", brandId)
    .order("title");

  if (error) {
    console.error("Could not load knowledge base:", error);
    return [];
  }
  return data;
}

export default function KnowledgeBase() {
  const [brands, setBrands] = useState([]);
  const [brandId, setBrandId] = useState("");
  const [entries, setEntries] = useState([]);

  // editingId is an entry id, the word "new", or null when the form is closed
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // load the brands once
  useEffect(() => {
    async function loadBrands() {
      const { data, error } = await supabase
        .from("brands")
        .select("id, name")
        .order("name");

      if (error) {
        console.error("Could not load brands:", error);
        return;
      }

      setBrands(data);
      if (data.length > 0) setBrandId(data[0].id);
    }

    loadBrands();
  }, []);

  // load the entries whenever the brand changes
  useEffect(() => {
    if (!brandId) return;
    let ignore = false;

    fetchEntries(brandId).then((data) => {
      if (!ignore) setEntries(data);
    });

    return () => {
      ignore = true;
    };
  }, [brandId]);

  function changeBrand(id) {
    setBrandId(id);
    setEditingId(null);
    setMessage("");
  }

  function startNew() {
    setEditingId("new");
    setTitle("");
    setContent("");
    setMessage("");
  }

  function startEdit(entry) {
    setEditingId(entry.id);
    setTitle(entry.title);
    setContent(entry.content);
    setMessage("");
  }

  async function save(event) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanContent = content.trim();

    if (!cleanTitle || !cleanContent) {
      setMessage("Please fill in both the title and the policy text.");
      return;
    }

    setSaving(true);
    setMessage("");

    let error;
    if (editingId === "new") {
      ({ error } = await supabase.from("kb_entries").insert({
        brand_id: brandId,
        title: cleanTitle,
        content: cleanContent,
      }));
    } else {
      // the brand_id check means we can only ever edit the selected brand's entry
      ({ error } = await supabase
        .from("kb_entries")
        .update({
          title: cleanTitle,
          content: cleanContent,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingId)
        .eq("brand_id", brandId));
    }

    setSaving(false);

    if (error) {
      console.error(error);
      setMessage("Could not save. Please try again.");
      return;
    }

    setEditingId(null);
    setEntries(await fetchEntries(brandId));
  }

  async function remove(entry) {
    if (!window.confirm(`Delete "${entry.title}"?`)) return;

    const { error } = await supabase
      .from("kb_entries")
      .delete()
      .eq("id", entry.id)
      .eq("brand_id", brandId);

    if (error) {
      console.error(error);
      setMessage("Could not delete. Please try again.");
      return;
    }

    setEntries(await fetchEntries(brandId));
  }

  return (
    <div className="kb">
      <div className="kb-top">
        <h1>Knowledge base</h1>

        <select value={brandId} onChange={(e) => changeBrand(e.target.value)}>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        <button className="primary" onClick={startNew}>
          Add entry
        </button>
      </div>

      <p className="kb-hint">
        Changes apply the next time you click Generate Reply. The AI only sees
        entries that match the customer's words, so use clear titles like
        "Refund policy".
      </p>

      {message && <div className="notice error">{message}</div>}

      {editingId && (
        <form className="kb-form" onSubmit={save}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title, e.g. Refund policy"
          />
          <textarea
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Policy text"
          />
          <div className="kb-form-buttons">
            <button className="primary" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setEditingId(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {entries.map((entry) => (
        <div key={entry.id} className="kb-card">
          <h3>{entry.title}</h3>
          <p>{entry.content}</p>
          <div className="kb-actions">
            <button onClick={() => startEdit(entry)}>Edit</button>
            <button className="danger" onClick={() => remove(entry)}>
              Delete
            </button>
          </div>
        </div>
      ))}

      {entries.length === 0 && brandId && (
        <p className="muted">No entries yet for this brand.</p>
      )}
    </div>
  );
}