'use strict';

// Shared backend — no login, everyone with this app's URL reads/writes the
// same data (see store.js). Both values below are the public/publishable
// credentials Supabase is designed to have shipped in client code — never
// put the secret/service_role key here.
const SUPABASE_URL = 'https://jhzucqbjmshrfzvvttqn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2wn8PnOI0LNzzbshKNvl4g_6B1xQzhL';

// Named `db`, not `supabase` — the CDN SDK bundle itself exposes a global
// `supabase` namespace object (that's what `.createClient` is called on
// below), so declaring another top-level `const supabase` here collides
// with it (classic <script> tags share one global scope, no modules).
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
