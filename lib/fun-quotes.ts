export interface FunQuote {
  quote: string;
  author: string;
}

// Quoted content from the group chat, NOT UI copy: stays in the original
// Chilean Spanish in every locale (the en/ko section subtitles explain why).
// First names only — this repo is public.
export const FUN_QUOTES: readonly FunQuote[] = [
  {
    quote:
      "Entre el 5to y el 24 hay solamente un calzón de diferencia, todo puede pasar",
    author: "Alberto",
  },
  {
    quote: "Brigido el calzón paralelo que se mandaron los líderes",
    author: "Alberto",
  },
  {
    quote: "Gracias mi dictador por este calzón",
    author: "Tito",
  },
  {
    quote: "—Van a ganar 3-0 todos los partidos. —¡No reveles mi técnica!",
    author: "Santi F. y Tito",
  },
  {
    quote:
      "Pasé de 5to a 45 en una semana 🤣 por lo menos estoy disfrutando el mundial ahora",
    author: "Edu",
  },
  {
    quote: "Ecuador salió a ratoniar desde el seg 1",
    author: "JP",
  },
  {
    quote: "Es ilegal esa delantera",
    author: "Nacho",
  },
  {
    quote: "MEX-ECU va a dejar el pico en la tabliña",
    author: "Santi F.",
  },
  {
    quote:
      "Doué ctm lo más bien que el otro día me cagó el calzón, y hoy día entra durmiendo",
    author: "JP",
  },
  {
    quote: "¿Y el profe no tendrá razones para anularlo?",
    author: "Alberto",
  },
  {
    quote: "Olise q wea",
    author: "JP",
  },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailDisplayName(name: string): boolean {
  return EMAIL_RE.test(name.trim());
}

// Easter egg: only exists while the leaderboard leader's display name is a
// raw email address. Never renders the actual address — the joke is the
// pattern, not the person. Transfers automatically to any future email-named
// leader; disappears the moment the leader changes or renames.
export const GMAIL_QUOTES: readonly FunQuote[] = [
  {
    quote: "El gmail sigue primero. El gmail.",
    author: "la tabliña, minuto a minuto",
  },
  {
    quote: "Primero va un correo electrónico. Después, seres humanos.",
    author: "la tabliña, minuto a minuto",
  },
];

export function buildQuotePool(leaderName: string | null): FunQuote[] {
  return leaderName && isEmailDisplayName(leaderName)
    ? [...FUN_QUOTES, ...GMAIL_QUOTES]
    : [...FUN_QUOTES];
}
