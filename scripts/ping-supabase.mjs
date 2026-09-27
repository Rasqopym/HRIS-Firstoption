// Automated Supabase keep-alive ping utility
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wnmoczubrqzkbidyiltg.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_r2p3u7UkUVYaE6mgm3sVaw_JprAXm7Q';

async function ping() {
  const url = `${supabaseUrl}/rest/v1/workspaces?select=id&limit=1`;
  console.log(`[Supabase Keep-Alive] Sending health ping to: ${url}...`);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });

    const body = await res.text();
    if (res.ok) {
      console.log(`✅ [Supabase Keep-Alive] Success! HTTP ${res.status}`);
      console.log(`[Supabase Keep-Alive] Response: ${body}`);
      console.log(`[Supabase Keep-Alive] Database activity confirmed at ${new Date().toISOString()}.`);
    } else {
      console.error(`⚠️ [Supabase Keep-Alive] HTTP error ${res.status}: ${body}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`❌ [Supabase Keep-Alive] Network connection failed:`, err);
    process.exit(1);
  }
}

ping();
