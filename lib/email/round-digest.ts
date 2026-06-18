// =============================================================================
// Round-close digest email — pure HTML renderer.
// Produces { subject, html } for one recipient. Same function used by the
// preview button in the admin UI and by the actual send path, so what an admin
// previews is byte-for-byte what gets emailed.
// =============================================================================

export type DigestLocale = "es" | "en" | "ko";

export interface DigestTeam {
  id: string;
  code: string;
  name_en: string;
  name_es: string;
  name_ko: string;
}

export interface DigestMatch {
  id: string;
  kickoff_at: string;
  home_team: DigestTeam | null;
  away_team: DigestTeam | null;
}

export interface DigestMatchPrediction {
  user_id: string;
  match_id: string;
  home_score_pred: number;
  away_score_pred: number;
  penalty_winner_team_id: string | null;
}

export interface DigestPodioPrediction {
  user_id: string;
  champion_team_id: string | null;
  runner_up_team_id: string | null;
  third_place_team_id: string | null;
}

export interface DigestRound {
  name_key: string;
  stage: "group" | "knockout" | "podio";
  lock_time: string;
}

export interface DigestRecipient {
  id: string;
  displayName: string;
  locale: DigestLocale;
}

export interface RenderRoundDigestInput {
  round: DigestRound;
  recipient: DigestRecipient;
  matches: DigestMatch[];
  matchPredictions?: DigestMatchPrediction[];
  podioPredictions?: DigestPodioPrediction[];
  profilesById: Map<string, string>;
  teamsById: Map<string, DigestTeam>;
  layout?: "per_match" | "per_player";
}

const LABELS: Record<DigestLocale, Record<string, string>> = {
  es: {
    subjectPrefix: "Polla 2026 — Cierre de",
    yourPicks: "Tus pronósticos",
    everyonesPicks: "Pronósticos de todos",
    player: "Jugador",
    home: "Local",
    away: "Visita",
    penaltyWinner: "Ganador penales",
    champion: "Campeón",
    runnerUp: "Subcampeón",
    third: "Tercer lugar",
    noPick: "Sin predicción",
    signoff: "Polla Mundial 2026 — pollamundial.cl",
  },
  en: {
    subjectPrefix: "Polla 2026 — Round close —",
    yourPicks: "Your predictions",
    everyonesPicks: "Everyone's predictions",
    player: "Player",
    home: "Home",
    away: "Away",
    penaltyWinner: "Penalty winner",
    champion: "Champion",
    runnerUp: "Runner-up",
    third: "Third place",
    noPick: "No prediction",
    signoff: "Polla Mundial 2026 — pollamundial.cl",
  },
  ko: {
    subjectPrefix: "Polla 2026 — 마감 —",
    yourPicks: "내 예측",
    everyonesPicks: "전체 예측",
    player: "선수",
    home: "홈",
    away: "원정",
    penaltyWinner: "승부차기 승자",
    champion: "챔피언",
    runnerUp: "준우승",
    third: "3위",
    noPick: "예측 없음",
    signoff: "Polla Mundial 2026 — pollamundial.cl",
  },
};

const ROUND_NAMES: Record<string, Record<DigestLocale, string>> = {
  group_1: { es: "Fecha 1", en: "Matchday 1", ko: "1차전" },
  group_2: { es: "Fecha 2", en: "Matchday 2", ko: "2차전" },
  group_3: { es: "Fecha 3", en: "Matchday 3", ko: "3차전" },
  knockout_r32: { es: "Dieciseisavos", en: "Round of 32", ko: "32강" },
  knockout_r16: { es: "Octavos", en: "Round of 16", ko: "16강" },
  knockout_qf: { es: "Cuartos de final", en: "Quarter-finals", ko: "8강" },
  knockout_sf: { es: "Semifinales", en: "Semi-finals", ko: "준결승" },
  knockout_3rd: { es: "Tercer puesto", en: "Third place", ko: "3·4위전" },
  knockout_final: { es: "Final", en: "Final", ko: "결승" },
  podio: { es: "Bonus Podio", en: "Bonus Podium", ko: "보너스 포디엄" },
};

function roundDisplayName(name_key: string, locale: DigestLocale): string {
  const key = name_key.replace(/^rounds\./, "");
  return ROUND_NAMES[key]?.[locale] ?? key;
}

function teamName(team: DigestTeam | null, locale: DigestLocale): string {
  if (!team) return "—";
  return locale === "ko"
    ? team.name_ko
    : locale === "en"
      ? team.name_en
      : team.name_es;
}

function teamNameById(
  id: string | null,
  teamsById: Map<string, DigestTeam>,
  locale: DigestLocale
): string {
  if (!id) return "—";
  const t = teamsById.get(id);
  return t ? teamName(t, locale) : "—";
}

function escape(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!
  );
}

function fmtKickoff(iso: string, locale: DigestLocale): string {
  return new Date(iso).toLocaleString(
    locale === "ko" ? "ko-KR" : locale === "en" ? "en-US" : "es-CL",
    {
      timeZone: "America/Santiago",
      dateStyle: "medium",
      timeStyle: "short",
    }
  );
}

export function renderRoundDigest(input: RenderRoundDigestInput): {
  subject: string;
  html: string;
} {
  const labels = LABELS[input.recipient.locale];
  const roundName = roundDisplayName(input.round.name_key, input.recipient.locale);
  const subject = `${labels.subjectPrefix} ${roundName}`;

  const body =
    input.round.stage === "podio"
      ? renderPodioBody(input, roundName, labels)
      : (input.layout ?? "per_match") === "per_player"
        ? renderMatchBodyCompact(input, roundName, labels)
        : renderMatchBody(input, roundName, labels);

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:0 auto;padding:20px;color:#0A0A0A;line-height:1.5">
  ${body}
  <p style="margin-top:36px;color:#888;font-size:12px">${labels.signoff}</p>
</div>`;

  return { subject, html };
}

function renderMatchBody(
  input: RenderRoundDigestInput,
  roundName: string,
  labels: Record<string, string>
): string {
  const { round, recipient, matches, matchPredictions = [], profilesById, teamsById } = input;
  const locale = recipient.locale;
  const showPenalty = round.stage === "knockout";

  const sortedMatches = [...matches].sort(
    (a, b) =>
      new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime()
  );

  const predsByMatch = new Map<string, DigestMatchPrediction[]>();
  for (const p of matchPredictions) {
    if (!predsByMatch.has(p.match_id)) predsByMatch.set(p.match_id, []);
    predsByMatch.get(p.match_id)!.push(p);
  }

  const ownByMatch = new Map<string, DigestMatchPrediction>();
  for (const p of matchPredictions) {
    if (p.user_id === recipient.id) ownByMatch.set(p.match_id, p);
  }

  // OWN section
  let own = `<h2 style="font-size:18px;margin:0 0 12px">${labels.yourPicks} — ${escape(roundName)}</h2>`;
  own += `<ul style="margin:0;padding:0 0 0 18px">`;
  for (const m of sortedMatches) {
    const home = teamName(m.home_team, locale);
    const away = teamName(m.away_team, locale);
    const p = ownByMatch.get(m.id);
    if (p) {
      let line = `${escape(home)} <strong>${p.home_score_pred}–${p.away_score_pred}</strong> ${escape(away)}`;
      if (showPenalty && p.penalty_winner_team_id) {
        line += ` <span style="color:#666">(${labels.penaltyWinner}: ${escape(teamNameById(p.penalty_winner_team_id, teamsById, locale))})</span>`;
      }
      own += `<li style="margin:2px 0">${line}</li>`;
    } else {
      own += `<li style="margin:2px 0;color:#888">${escape(home)} vs ${escape(away)} — <em>${labels.noPick}</em></li>`;
    }
  }
  own += `</ul>`;

  // ALL section — one block per match
  let all = `<h2 style="font-size:18px;margin:28px 0 12px">${labels.everyonesPicks}</h2>`;
  for (const m of sortedMatches) {
    const home = teamName(m.home_team, locale);
    const away = teamName(m.away_team, locale);
    all += `<div style="margin:18px 0">`;
    all += `<h3 style="font-size:15px;margin:0 0 2px">${escape(home)} vs ${escape(away)}</h3>`;
    all += `<p style="color:#888;font-size:12px;margin:0 0 8px">${fmtKickoff(m.kickoff_at, locale)}</p>`;
    const preds = (predsByMatch.get(m.id) ?? []).slice().sort((a, b) => {
      const an = profilesById.get(a.user_id) ?? "";
      const bn = profilesById.get(b.user_id) ?? "";
      return an.localeCompare(bn);
    });
    if (preds.length === 0) {
      all += `<p style="color:#888;font-style:italic;margin:0">${labels.noPick}</p>`;
    } else {
      all += `<table style="border-collapse:collapse;font-size:13px;width:100%"><thead><tr style="border-bottom:1px solid #ddd">`;
      all += `<th style="text-align:left;padding:4px 8px 4px 0;font-weight:600">${labels.player}</th>`;
      all += `<th style="text-align:center;padding:4px 8px;font-weight:600;width:50px">${labels.home}</th>`;
      all += `<th style="text-align:center;padding:4px 8px;font-weight:600;width:50px">${labels.away}</th>`;
      if (showPenalty) all += `<th style="text-align:left;padding:4px 0;font-weight:600">${labels.penaltyWinner}</th>`;
      all += `</tr></thead><tbody>`;
      for (const p of preds) {
        const name = profilesById.get(p.user_id) ?? "?";
        all += `<tr>`;
        all += `<td style="padding:3px 8px 3px 0">${escape(name)}</td>`;
        all += `<td style="padding:3px 8px;text-align:center">${p.home_score_pred}</td>`;
        all += `<td style="padding:3px 8px;text-align:center">${p.away_score_pred}</td>`;
        if (showPenalty) {
          all += `<td style="padding:3px 0">${escape(teamNameById(p.penalty_winner_team_id, teamsById, locale))}</td>`;
        }
        all += `</tr>`;
      }
      all += `</tbody></table>`;
    }
    all += `</div>`;
  }

  return `${own}<hr style="margin:28px 0;border:none;border-top:1px solid #ddd">${all}`;
}

function renderMatchBodyCompact(
  input: RenderRoundDigestInput,
  roundName: string,
  labels: Record<string, string>
): string {
  const { round, recipient, matches, matchPredictions = [], profilesById, teamsById } = input;
  const locale = recipient.locale;
  const showPenalty = round.stage === "knockout";

  const sortedMatches = [...matches].sort(
    (a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime()
  );

  const predByMatchUser = new Map<string, Map<string, DigestMatchPrediction>>();
  for (const p of matchPredictions) {
    if (!predByMatchUser.has(p.match_id)) predByMatchUser.set(p.match_id, new Map());
    predByMatchUser.get(p.match_id)!.set(p.user_id, p);
  }

  const ownByMatch = new Map<string, DigestMatchPrediction>();
  for (const p of matchPredictions) {
    if (p.user_id === recipient.id) ownByMatch.set(p.match_id, p);
  }

  const allPlayerIds = [...profilesById.keys()].sort((a, b) =>
    (profilesById.get(a) ?? "").localeCompare(profilesById.get(b) ?? "")
  );

  // Own picks (same layout as per-match)
  let own = `<h2 style="font-size:18px;margin:0 0 12px">${labels.yourPicks} — ${escape(roundName)}</h2>`;
  own += `<ul style="margin:0;padding:0 0 0 18px">`;
  for (const m of sortedMatches) {
    const home = teamName(m.home_team, locale);
    const away = teamName(m.away_team, locale);
    const p = ownByMatch.get(m.id);
    if (p) {
      let line = `${escape(home)} <strong>${p.home_score_pred}–${p.away_score_pred}</strong> ${escape(away)}`;
      if (showPenalty && p.penalty_winner_team_id) {
        line += ` <span style="color:#666">(${labels.penaltyWinner}: ${escape(teamNameById(p.penalty_winner_team_id, teamsById, locale))})</span>`;
      }
      own += `<li style="margin:2px 0">${line}</li>`;
    } else {
      own += `<li style="margin:2px 0;color:#888">${escape(home)} vs ${escape(away)} — <em>${labels.noPick}</em></li>`;
    }
  }
  own += `</ul>`;

  // Everyone's picks — one row per player, one column per match
  let all = `<h2 style="font-size:18px;margin:28px 0 12px">${labels.everyonesPicks}</h2>`;
  all += `<div style="overflow-x:auto">`;
  all += `<table style="border-collapse:collapse;font-size:12px">`;
  all += `<thead><tr style="border-bottom:1px solid #ddd">`;
  all += `<th style="text-align:left;padding:4px 8px 4px 0;font-weight:600">${labels.player}</th>`;
  for (const m of sortedMatches) {
    const homeCode = m.home_team?.code ?? "?";
    const awayCode = m.away_team?.code ?? "?";
    const kickoffLabel = fmtKickoff(m.kickoff_at, locale);
    all += `<th style="text-align:center;padding:4px 3px;font-weight:600;white-space:nowrap" title="${escape(kickoffLabel)}">${escape(homeCode)}–${escape(awayCode)}</th>`;
  }
  all += `</tr></thead><tbody>`;
  for (const userId of allPlayerIds) {
    const name = profilesById.get(userId) ?? "?";
    all += `<tr>`;
    all += `<td style="padding:3px 8px 3px 0;white-space:nowrap">${escape(name)}</td>`;
    for (const m of sortedMatches) {
      const p = predByMatchUser.get(m.id)?.get(userId);
      if (!p) {
        all += `<td style="padding:3px 3px;text-align:center;color:#aaa">–</td>`;
      } else {
        let cell = `${p.home_score_pred}–${p.away_score_pred}`;
        if (showPenalty && p.penalty_winner_team_id) {
          const winner = teamsById.get(p.penalty_winner_team_id);
          if (winner) cell += `<span style="color:#888;font-size:10px"> (${escape(winner.code)})</span>`;
        }
        all += `<td style="padding:3px 3px;text-align:center;white-space:nowrap">${cell}</td>`;
      }
    }
    all += `</tr>`;
  }
  all += `</tbody></table></div>`;

  return `${own}<hr style="margin:28px 0;border:none;border-top:1px solid #ddd">${all}`;
}

function renderPodioBody(
  input: RenderRoundDigestInput,
  roundName: string,
  labels: Record<string, string>
): string {
  const { recipient, podioPredictions = [], profilesById, teamsById } = input;
  const locale = recipient.locale;

  const own = podioPredictions.find((p) => p.user_id === recipient.id);
  const all = [...podioPredictions].sort((a, b) => {
    const an = profilesById.get(a.user_id) ?? "";
    const bn = profilesById.get(b.user_id) ?? "";
    return an.localeCompare(bn);
  });

  let ownHtml = `<h2 style="font-size:18px;margin:0 0 12px">${labels.yourPicks} — ${escape(roundName)}</h2>`;
  if (own) {
    ownHtml += `<ul style="margin:0;padding:0 0 0 18px">`;
    ownHtml += `<li style="margin:2px 0">${labels.champion}: <strong>${escape(teamNameById(own.champion_team_id, teamsById, locale))}</strong></li>`;
    ownHtml += `<li style="margin:2px 0">${labels.runnerUp}: <strong>${escape(teamNameById(own.runner_up_team_id, teamsById, locale))}</strong></li>`;
    ownHtml += `<li style="margin:2px 0">${labels.third}: <strong>${escape(teamNameById(own.third_place_team_id, teamsById, locale))}</strong></li>`;
    ownHtml += `</ul>`;
  } else {
    ownHtml += `<p style="color:#888;font-style:italic;margin:0">${labels.noPick}</p>`;
  }

  let allHtml = `<h2 style="font-size:18px;margin:28px 0 12px">${labels.everyonesPicks}</h2>`;
  allHtml += `<table style="border-collapse:collapse;font-size:13px;width:100%"><thead><tr style="border-bottom:1px solid #ddd">`;
  allHtml += `<th style="text-align:left;padding:4px 8px 4px 0;font-weight:600">${labels.player}</th>`;
  allHtml += `<th style="text-align:left;padding:4px 8px;font-weight:600">${labels.champion}</th>`;
  allHtml += `<th style="text-align:left;padding:4px 8px;font-weight:600">${labels.runnerUp}</th>`;
  allHtml += `<th style="text-align:left;padding:4px 0;font-weight:600">${labels.third}</th>`;
  allHtml += `</tr></thead><tbody>`;
  for (const p of all) {
    const name = profilesById.get(p.user_id) ?? "?";
    allHtml += `<tr>`;
    allHtml += `<td style="padding:3px 8px 3px 0">${escape(name)}</td>`;
    allHtml += `<td style="padding:3px 8px">${escape(teamNameById(p.champion_team_id, teamsById, locale))}</td>`;
    allHtml += `<td style="padding:3px 8px">${escape(teamNameById(p.runner_up_team_id, teamsById, locale))}</td>`;
    allHtml += `<td style="padding:3px 0">${escape(teamNameById(p.third_place_team_id, teamsById, locale))}</td>`;
    allHtml += `</tr>`;
  }
  allHtml += `</tbody></table>`;

  return `${ownHtml}<hr style="margin:28px 0;border:none;border-top:1px solid #ddd">${allHtml}`;
}
