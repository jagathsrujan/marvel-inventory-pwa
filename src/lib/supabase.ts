import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// The app must boot without a backend — data.ts runs a guarded dynamic import
// of api.ts and falls back to the Dexie cache + mock seed. Throwing here would
// kill the whole bundle at module scope (auth.ts is in the eager graph), so a
// missing env gets placeholder values: the client constructs fine, real calls
// fail, and every caller already handles the failure.
export const supabase = createClient(
  url || 'https://supabase.placeholder.invalid',
  anonKey || 'public-anon-key-placeholder',
);
