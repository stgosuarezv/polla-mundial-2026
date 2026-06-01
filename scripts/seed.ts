/**
 * Phase 1 seed script — run once against a blank Supabase project.
 *
 * Prerequisites:
 *   1. Apply supabase/migrations/20260516000001_schema.sql
 *   2. Apply supabase/migrations/20260516000002_rls.sql
 *   3. Fill SUPABASE_SERVICE_ROLE_KEY and FOOTBALL_DATA_API_KEY in .env.local
 *
 * Usage:
 *   pnpm seed
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

function etMidnightOfKickoff(iso: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date(iso));
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  for (const off of ["-04:00", "-05:00"]) {
    const candidate = new Date(`${y}-${m}-${d}T00:00:00${off}`);
    const hh = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false,
    }).format(candidate);
    if (hh === "00") return candidate.toISOString();
  }
  throw new Error(`Cannot compute ET midnight for ${iso}`);
}

// ── Supabase admin client (bypasses RLS) ──────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const FD_API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const FD_BASE    = "https://api.football-data.org/v4";
const WC_CODE    = "WC"; // football-data.org competition code for FIFA World Cup

// ── Types ─────────────────────────────────────────────────────────────────────
interface FdTeam {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
}

interface FdTableEntry {
  position: number;
  team: FdTeam;
}

interface FdGroup {
  stage: string;
  type: string;
  group?: string;
  table: FdTableEntry[];
}

interface FdMatch {
  id: number;
  utcDate: string;
  stage: string;
  group?: string;
  matchday?: number;
  venue?: string;
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
}

interface FdStandings {
  season: { currentMatchday: number };
  standings: FdGroup[];
}

// ── Football-data.org helpers ─────────────────────────────────────────────────
async function fdGet<T>(path: string): Promise<T> {
  if (!FD_API_KEY) {
    throw new Error(
      "FOOTBALL_DATA_API_KEY is not set in .env.local.\n" +
      "Get a free key at https://www.football-data.org/client/register\n" +
      "then add it and re-run: pnpm seed"
    );
  }
  const res = await fetch(`${FD_BASE}${path}`, {
    headers: { "X-Auth-Token": FD_API_KEY },
  });
  if (res.status === 403) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `football-data.org returned 403 Forbidden for ${path}.\n` +
      `This competition may require a paid tier.\n` +
      `Response: ${body}\n` +
      `Please check https://www.football-data.org/coverage — if WC 2026 ` +
      `requires Tier 3, we need to discuss alternatives per §10 of the spec.`
    );
  }
  if (!res.ok) {
    throw new Error(`football-data.org ${path}: HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Translation stubs (expand in Phase 7) ────────────────────────────────────
// Spanish names use FIFA official names; Korean uses common transliterations.
// These will be improved in Phase 7 i18n polish.
const TEAM_TRANSLATIONS: Record<string, { es: string; ko: string }> = {
  // CONMEBOL
  ARG: { es: "Argentina",   ko: "아르헨티나" },
  BRA: { es: "Brasil",      ko: "브라질" },
  URY: { es: "Uruguay",     ko: "우루과이" },
  COL: { es: "Colombia",    ko: "콜롬비아" },
  ECU: { es: "Ecuador",     ko: "에콰도르" },
  VEN: { es: "Venezuela",   ko: "베네수엘라" },
  PAR: { es: "Paraguay",    ko: "파라과이" },
  CHI: { es: "Chile",       ko: "칠레" },
  PER: { es: "Perú",        ko: "페루" },
  BOL: { es: "Bolivia",     ko: "볼리비아" },
  // CONCACAF
  USA: { es: "Estados Unidos", ko: "미국" },
  MEX: { es: "México",      ko: "멕시코" },
  CAN: { es: "Canadá",      ko: "캐나다" },
  CRC: { es: "Costa Rica",  ko: "코스타리카" },
  PAN: { es: "Panamá",      ko: "파나마" },
  HON: { es: "Honduras",    ko: "온두라스" },
  HAI: { es: "Haití",       ko: "아이티" },
  JAM: { es: "Jamaica",     ko: "자메이카" },
  GUA: { es: "Guatemala",   ko: "과테말라" },
  CUR: { es: "Curazao",     ko: "퀴라소" },
  // UEFA
  FRA: { es: "Francia",     ko: "프랑스" },
  ENG: { es: "Inglaterra",  ko: "잉글랜드" },
  GER: { es: "Alemania",    ko: "독일" },
  ESP: { es: "España",      ko: "스페인" },
  POR: { es: "Portugal",    ko: "포르투갈" },
  NED: { es: "Países Bajos", ko: "네덜란드" },
  BEL: { es: "Bélgica",     ko: "벨기에" },
  CRO: { es: "Croacia",     ko: "크로아티아" },
  SUI: { es: "Suiza",       ko: "스위스" },
  AUT: { es: "Austria",     ko: "오스트리아" },
  SCO: { es: "Escocia",     ko: "스코틀랜드" },
  TUR: { es: "Turquía",     ko: "튀르키예" },
  SRB: { es: "Serbia",      ko: "세르비아" },
  POL: { es: "Polonia",     ko: "폴란드" },
  UKR: { es: "Ucrania",     ko: "우크라이나" },
  DEN: { es: "Dinamarca",   ko: "덴마크" },
  NOR: { es: "Noruega",     ko: "노르웨이" },
  SWE: { es: "Suecia",      ko: "스웨덴" },
  CZE: { es: "República Checa", ko: "체코" },
  BIH: { es: "Bosnia-Herzegovina", ko: "보스니아 헤르체고비나" },
  // AFC
  JPN: { es: "Japón",       ko: "일본" },
  KOR: { es: "Corea del Sur", ko: "한국" },
  AUS: { es: "Australia",   ko: "호주" },
  IRN: { es: "Irán",        ko: "이란" },
  KSA: { es: "Arabia Saudí", ko: "사우디아라비아" },
  QAT: { es: "Catar",       ko: "카타르" },
  IRQ: { es: "Irak",        ko: "이라크" },
  JOR: { es: "Jordania",    ko: "요르단" },
  UZB: { es: "Uzbekistán",  ko: "우즈베키스탄" },
  // CAF
  MAR: { es: "Marruecos",   ko: "모로코" },
  SEN: { es: "Senegal",     ko: "세네갈" },
  EGY: { es: "Egipto",      ko: "이집트" },
  NGA: { es: "Nigeria",     ko: "나이지리아" },
  GHA: { es: "Ghana",       ko: "가나" },
  CIV: { es: "Costa de Marfil", ko: "코트디부아르" },
  RSA: { es: "Sudáfrica",   ko: "남아프리카" },
  CMR: { es: "Camerún",     ko: "카메룬" },
  ALG: { es: "Argelia",     ko: "알제리" },
  COD: { es: "República Democrática del Congo", ko: "콩고 민주 공화국" },
  CPV: { es: "Cabo Verde",  ko: "카보베르데" },
  TUN: { es: "Túnez",       ko: "튀니지" },
  // OFC
  NZL: { es: "Nueva Zelanda", ko: "뉴질랜드" },
};

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.warn("⚽ Polla Mundial 2026 — Seed Script");
  console.warn("────────────────────────────────────");

  // 1. Fetch group standings to get teams + group assignments
  console.warn("→ Fetching teams from football-data.org...");
  let standings: FdStandings;
  try {
    standings = await fdGet<FdStandings>(`/competitions/${WC_CODE}/standings?season=2026`);
  } catch (err) {
    console.error("✗ Failed to fetch teams:", (err as Error).message);
    process.exit(1);
  }

  // 2. Build team rows
  const teamsByFdId = new Map<number, string>(); // fdId → our uuid
  const teamRows: {
    code: string;
    name_en: string;
    name_es: string;
    name_ko: string;
    flag_url: string;
    group_letter: string | null;
  }[] = [];

  for (const group of standings.standings) {
    if (group.type !== "TOTAL") continue; // skip HOME/AWAY duplicates
    const groupLetter = group.group?.replace("GROUP_", "") ?? null;
    for (const entry of group.table) {
      const team = entry.team;
      const code = team.tla?.toUpperCase() ?? team.shortName.slice(0, 3).toUpperCase();
      const trans = TEAM_TRANSLATIONS[code];
      teamRows.push({
        code,
        name_en: team.name,
        name_es: trans?.es ?? team.name,
        name_ko: trans?.ko ?? team.name,
        flag_url: team.crest,
        group_letter: groupLetter,
      });
    }
  }

  console.warn(`→ Upserting ${teamRows.length} teams...`);
  const { data: insertedTeams, error: teamsErr } = await supabase
    .from("teams")
    .upsert(teamRows, { onConflict: "code" })
    .select("id, code");
  if (teamsErr) { console.error("✗ Teams:", teamsErr.message); process.exit(1); }

  const teamIdByCode = new Map<string, string>();
  for (const t of insertedTeams ?? []) {
    teamIdByCode.set(t.code, t.id);
  }

  // Also fetch fd_id → our uuid mapping for matches
  // Re-fetch standings teams with fd IDs
  for (const group of standings.standings) {
    if (group.type !== "TOTAL") continue;
    for (const entry of group.table) {
      const team = entry.team;
      const code = team.tla?.toUpperCase() ?? team.shortName.slice(0, 3).toUpperCase();
      const ourId = teamIdByCode.get(code);
      if (ourId) teamsByFdId.set(team.id, ourId);
    }
  }

  // 3. Fetch matches
  console.warn("→ Fetching matches from football-data.org...");
  let matchesResponse: { matches: FdMatch[] };
  try {
    matchesResponse = await fdGet<{ matches: FdMatch[] }>(
      `/competitions/${WC_CODE}/matches?season=2026`
    );
  } catch (err) {
    console.error("✗ Failed to fetch matches:", (err as Error).message);
    process.exit(1);
  }

  const allMatches = matchesResponse.matches;
  console.warn(`→ Received ${allMatches.length} matches`);

  if (allMatches.length !== 104) {
    console.warn(
      `⚠ Expected 104 matches, got ${allMatches.length}. ` +
      `Some matches may not be scheduled yet (knockout slots). Continuing.`
    );
  }

  // 4. Group matches by stage → determine rounds
  const groupMatches = allMatches.filter((m) =>
    m.stage === "GROUP_STAGE" || m.stage?.includes("GROUP")
  );
  const knockoutMatches = allMatches.filter((m) =>
    m.stage !== "GROUP_STAGE" && !m.stage?.includes("GROUP")
  );

  // Split group matches into 3 fechas by matchday
  const byMatchday = new Map<number, FdMatch[]>();
  for (const m of groupMatches) {
    const day = m.matchday ?? 1;
    if (!byMatchday.has(day)) byMatchday.set(day, []);
    byMatchday.get(day)!.push(m);
  }
  const matchdays = Array.from(byMatchday.keys()).sort((a, b) => a - b);

  // Map football-data.org stages to our round name_keys
  const KO_STAGE_MAP: Record<string, { name_key: string; order_index: number }> = {
    LAST_32:         { name_key: "rounds.knockout_r32",   order_index: 5 },
    LAST_16:         { name_key: "rounds.knockout_r16",   order_index: 6 },
    QUARTER_FINALS:  { name_key: "rounds.knockout_qf",    order_index: 7 },
    SEMI_FINALS:     { name_key: "rounds.knockout_sf",    order_index: 8 },
    THIRD_PLACE:     { name_key: "rounds.knockout_3rd",   order_index: 9 },
    FINAL:           { name_key: "rounds.knockout_final", order_index: 10 },
  };

  // 5. Upsert rounds
  const roundRows: { stage: string; name_key: string; order_index: number; lock_time: string }[] = [];

  // Group fechas
  matchdays.forEach((day, i) => {
    const matches = byMatchday.get(day)!;
    const earliest = matches.map((m) => m.utcDate).sort()[0];
    roundRows.push({
      stage: "group",
      name_key: `rounds.group_${i + 1}`,
      order_index: i + 1,
      lock_time: etMidnightOfKickoff(earliest!),
    });
  });

  // Knockout rounds
  const koByStage = new Map<string, FdMatch[]>();
  for (const m of knockoutMatches) {
    if (!koByStage.has(m.stage)) koByStage.set(m.stage, []);
    koByStage.get(m.stage)!.push(m);
  }

  for (const [stage, matches] of koByStage) {
    const meta = KO_STAGE_MAP[stage];
    if (!meta) {
      console.warn(`⚠ Unknown knockout stage: ${stage} — skipping`);
      continue;
    }
    const earliest = matches.map((m) => m.utcDate).sort()[0];
    roundRows.push({ stage: "knockout", ...meta, lock_time: etMidnightOfKickoff(earliest!) });
  }

  // Podio round — locks at same time as Round of 32
  const r32 = roundRows.find((r) => r.name_key === "rounds.knockout_r32" && r.stage === "knockout");
  const podioLockTime = r32?.lock_time ?? new Date("2026-07-01T00:00:00Z").toISOString();
  roundRows.push({
    stage: "podio",
    name_key: "rounds.podio",
    order_index: 4, // between Fecha 3 (3) and R32 (5)
    lock_time: podioLockTime,
  });

  console.warn(`→ Upserting ${roundRows.length} rounds...`);
  const { data: insertedRounds, error: roundsErr } = await supabase
    .from("rounds")
    .upsert(roundRows, { onConflict: "name_key" })
    .select("id, name_key");
  if (roundsErr) { console.error("✗ Rounds:", roundsErr.message); process.exit(1); }

  const roundIdByKey = new Map<string, string>();
  for (const r of insertedRounds ?? []) roundIdByKey.set(r.name_key, r.id);

  // 6. Upsert matches
  const matchRows = allMatches.map((m) => {
    let roundId: string | undefined;
    if (m.stage === "GROUP_STAGE" || m.stage?.includes("GROUP")) {
      const day = m.matchday ?? 1;
      const dayIndex = matchdays.indexOf(day);
      roundId = roundIdByKey.get(`rounds.group_${dayIndex + 1}`);
    } else {
      const meta = KO_STAGE_MAP[m.stage];
      if (meta) roundId = roundIdByKey.get(meta.name_key);
    }

    return {
      round_id:     roundId,
      home_team_id: m.homeTeam?.id ? (teamsByFdId.get(m.homeTeam.id) ?? null) : null,
      away_team_id: m.awayTeam?.id ? (teamsByFdId.get(m.awayTeam.id) ?? null) : null,
      kickoff_at:   m.utcDate,
      venue:        m.venue ?? null,
      external_id:  String(m.id),
      status:       "scheduled" as const,
    };
  }).filter((m) => m.round_id != null);

  console.warn(`→ Upserting ${matchRows.length} matches...`);
  const { error: matchesErr } = await supabase
    .from("matches")
    .upsert(matchRows as Parameters<typeof supabase.from>[0], { onConflict: "external_id" });
  if (matchesErr) { console.error("✗ Matches:", matchesErr.message); process.exit(1); }

  console.warn("\n✅ Seed complete!");
  console.warn(`   Teams:   ${teamIdByCode.size}`);
  console.warn(`   Rounds:  ${roundIdByKey.size}`);
  console.warn(`   Matches: ${matchRows.length}`);
  console.warn("\nNext steps:");
  console.warn("  • Go to Supabase dashboard → Authentication → Settings");
  console.warn("  • Disable 'Enable email confirmations' for local dev (or set up redirect URL)");
  console.warn("  • Sign up as Santiago and Tomás, then set is_admin=true in Table Editor → profiles");
}

main().catch((err) => {
  console.error("Fatal:", (err as Error).message);
  process.exit(1);
});
