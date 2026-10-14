import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// fail loudly if someone forgot to set up their .env file
if (!url || !key) {
  throw new Error(
    "Missing Supabase settings. Copy .env.example to .env and fill in both values."
  );
}

export const supabase = createClient(url, key);