/**
 * Sync match results from football-data.org.
 * Run manually: pnpm sync-results
 * Also triggered from the admin panel.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { syncResults } from "../lib/sync";

async function main() {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    console.error("✗ FOOTBALL_DATA_API_KEY not set in .env.local");
    process.exit(1);
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  console.warn("⚽ Syncing match results from football-data.org...");
  const result = await syncResults(admin, apiKey);

  console.warn(`✅ Updated: ${result.updated} matches`);
  console.warn(`   Teams assigned: ${result.teamsAssigned}`);
  console.warn(`   Skipped: ${result.skipped}`);
  if (result.errors.length) {
    console.warn(`   Errors (${result.errors.length}):`);
    for (const e of result.errors) console.warn(`     • ${e}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
