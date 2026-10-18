#!/usr/bin/env node
/**
 * ¿Responde la base? — el vigía de salud (`.github/workflows/vigia-salud.yml`, ADR-0450).
 *
 * EL PROBLEMA. El 2026-10-17 la base de producción se cayó dos veces (16:41 y ~17:04, hora de Lima) y nos enteramos por las colaboradoras:
 * nada del sistema le preguntaba a Postgres si estaba vivo, y el aviso de errores (Sentry) solo cuenta lo que ya les pasó a las personas.
 *
 * QUÉ PROMETE. Cada 5 minutos pregunta a `/api/salud` del ERP y de la tienda (ambas corren una consulta de verdad dentro de Postgres:
 * ERP `retail.fn_salud()` y tienda `select 1`). Una dirección se da por caída solo si fallan TODOS los intentos (3, a 20 s uno del otro):
 * un parpadeo no despierta a nadie. Si alguna está caída abre un aviso «Base o tienda sin responder (vigía de salud)» y sale con 1 (la
 * corrida queda en rojo y GitHub avisa); mientras siga caída no repite ni el aviso ni el rojo; cuando todas vuelven, comenta y lo cierra.
 *
 * QUÉ NO PROMETE. Un monitor de verdad: GitHub puede retrasar un trabajo programado varios minutos y no manda mensajes al teléfono. Es
 * lo que se tiene sin abrir ninguna cuenta; un monitor externo (UptimeRobot, Better Stack…) sobre las mismas dos direcciones es mejor y
 * no lo reemplaza este: se suman. Tampoco mira Auth, el almacén de fotos ni SUNAT, solo si Postgres contesta.
 *
 * QUÉ ASUME. Las direcciones están en variables del repositorio (Settings ▸ Secrets and variables ▸ Actions ▸ Variables:
 * `URL_SALUD_ERP`, `URL_SALUD_TIENDA`, la ruta completa `…/api/salud`). Sin ninguna, no hace nada y lo dice. El repo es público: el aviso
 * y el registro NUNCA llevan las direcciones ni lo que la respuesta diga fuera de una lista de motivos (`MOTIVOS`).
 *
 * USO
 *   node scripts/ci/vigia-salud.mjs                 → lo que corre el workflow (lee URL_SALUD_ERP, URL_SALUD_TIENDA, GH_TOKEN…)
 *   node scripts/ci/vigia-salud.mjs --ensayo        → pregunta y dice qué haría: no abre, comenta ni cierra ningún aviso
 */
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { clienteGitHub } from "./vigia-vercel.mjs";

export const TITULO_AVISO = "Base o tienda sin responder (vigía de salud)";
const ADR = "ADR-0450";

/** Lo único de la respuesta que se repite en un aviso público (coincide con `MotivoDeSalud` de `apps/web/lib/salud-reglas.ts`). */
export const MOTIVOS = new Set(["no_responde", "falta_fn_salud", "llave_rechazada", "respuesta_inesperada"]);

/**
 * Pregunta una dirección UNA vez. Devuelve `{ ok, estado, motivo }`: `estado` es el código HTTP (null si no hubo respuesta) y `motivo` una
 * palabra de `MOTIVOS` o «sin_respuesta» (la dirección no contestó: Vercel o la red) o «respuesta_ajena» (contestó algo que no es la salud).
 */
export async function preguntar(url, { fetchImpl = fetch, topeMs = 15_000 } = {}) {
  let r;
  try {
    r = await fetchImpl(url, { headers: { "cache-control": "no-cache" }, signal: AbortSignal.timeout(topeMs) });
  } catch {
    return { ok: false, estado: null, motivo: "sin_respuesta" };
  }
  let cuerpo = null;
  try {
    cuerpo = await r.json();
  } catch {
    cuerpo = null;
  }
  if (r.status === 200 && cuerpo?.ok === true) return { ok: true, estado: 200, motivo: "" };
  if (cuerpo && cuerpo.ok === false && MOTIVOS.has(cuerpo.motivo)) return { ok: false, estado: r.status, motivo: cuerpo.motivo };
  return { ok: false, estado: r.status, motivo: r.status >= 500 ? "sin_respuesta" : "respuesta_ajena" };
}

/** Pregunta hasta `intentos` veces, con `pausaS` entre una y otra; en cuanto una responde bien, listo. Devuelve el último resultado y cuántos intentos hizo. */
export async function sondear(url, { intentos = 3, pausaS = 20, dormir = (s) => new Promise((r) => setTimeout(r, s * 1000)), ...opciones } = {}) {
  let ultimo = { ok: false, estado: null, motivo: "sin_respuesta" };
  for (let i = 1; i <= intentos; i++) {
    ultimo = await preguntar(url, opciones);
    if (ultimo.ok) return { ...ultimo, intentos: i };
    if (i < intentos) await dormir(pausaS);
  }
  return { ...ultimo, intentos };
}

/**
 * La decisión, sin red. `resultados`: `[{ nombre, ok, … }]`. `avisoAbierto`: el número del aviso si ya hay uno abierto.
 * Devuelve `{ accion: "nada" | "abrir" | "seguir" | "cerrar", caidos }`; solo «abrir» deja la corrida en rojo.
 */
export function decidir({ resultados, avisoAbierto }) {
  const caidos = resultados.filter((r) => !r.ok);
  if (caidos.length === 0) return { accion: avisoAbierto ? "cerrar" : "nada", caidos };
  return { accion: avisoAbierto ? "seguir" : "abrir", caidos };
}

const horaLima = (ms) =>
  new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms));

/** Qué dice el sondeo de una dirección, en palabras de persona. Solo fórmulas fijas: nada de lo que respondió la dirección. */
export function frase(r) {
  const quien = r.nombre === "tienda" ? "La tienda" : "El ERP";
  switch (r.motivo) {
    case "no_responde":
      return `${quien} responde, pero dice que la base de datos no contesta.`;
    case "falta_fn_salud":
      return `${quien} responde, pero falta pegar la función \`retail.fn_salud()\` en producción (migración 20261017225000): el vigía no puede dar un «sí».`;
    case "llave_rechazada":
      return `${quien} responde, pero su llave pública fue rechazada: es un error de configuración, no de la base.`;
    case "respuesta_ajena":
      return `${quien} respondió algo que no es la salud (¿la dirección apunta a otra ruta?).`;
    default:
      return `La dirección de ${quien === "La tienda" ? "la tienda" : "el ERP"} no contesta${r.intentos ? ` (${r.intentos} intentos)` : ""}: puede ser Vercel o la red, no necesariamente la base.`;
  }
}

/** El texto del aviso. `tipo`: "abrir" | "cerrar". Público (el repo lo es): horas, nombres de sistema y frases fijas. */
export function textoAviso({ tipo, caidos = [], ahora }) {
  const cuando = `**${horaLima(ahora)}** (Lima)`;
  if (tipo === "cerrar") {
    return `${cuando} — Todo volvió a responder: el ERP y la tienda contestan y la base corre consultas. Cierro este aviso. ${ADR}.`;
  }
  return [
    `${cuando} — El vigía de salud no logró una respuesta sana:`,
    "",
    ...caidos.map((r) => `- ${frase(r)}`),
    "",
    "**Qué mirar, en este orden:**",
    "1. status.supabase.com: ¿hay una caída de Supabase en sa-east-1?",
    "2. Supabase ▸ proyecto `cayla-dynamic` ▸ Reports ▸ Database: CPU, memoria, disco y conexiones de la última hora.",
    "3. Si la base no responde: Settings ▸ General ▸ **Restart project** (tarda unos minutos; las sesiones no se pierden).",
    "4. Mientras tanto el ERP dice «Sin conexión con la base» y espera solo: no hace falta que nadie escriba su contraseña otra vez.",
    "",
    `Este aviso se cierra solo cuando todo vuelve a responder. ${ADR}.`,
  ].join("\n");
}

export async function vigilar({ direcciones, github, sondeo = sondear, ahora = () => Date.now(), ensayo = false, registrar = () => {} }) {
  const resultados = [];
  for (const { nombre, url } of direcciones) {
    const r = await sondeo(url);
    resultados.push({ nombre, ...r });
    registrar(`${nombre}: ${r.ok ? "responde" : `NO responde (${r.motivo}, ${r.intentos} intentos)`}`);
  }
  const avisoAbierto = await github.avisoAbierto(TITULO_AVISO);
  const decision = decidir({ resultados, avisoAbierto });
  registrar(`decisión: ${decision.accion}${ensayo ? " (ensayo: no escribe nada)" : ""}`);
  if (!ensayo) {
    if (decision.accion === "abrir") await github.crearAviso(TITULO_AVISO, textoAviso({ tipo: "abrir", caidos: decision.caidos, ahora: ahora() }));
    if (decision.accion === "cerrar") {
      await github.comentar(avisoAbierto, textoAviso({ tipo: "cerrar", ahora: ahora() }));
      await github.cerrar(avisoAbierto);
    }
  }
  return { codigo: decision.accion === "abrir" ? 1 : 0, decision, resultados };
}

function resumenDelJob(lineas) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lineas.join("\n")}\n`);
}

async function main() {
  const ensayo = process.argv.includes("--ensayo") || process.env.ENSAYO === "true";
  const direcciones = [
    { nombre: "ERP", url: process.env.URL_SALUD_ERP?.trim() },
    { nombre: "tienda", url: process.env.URL_SALUD_TIENDA?.trim() },
  ].filter((d) => d.url);
  if (direcciones.length === 0) {
    console.log("::notice::El vigía de salud no tiene direcciones: falta la variable URL_SALUD_ERP o URL_SALUD_TIENDA (Settings ▸ Secrets and variables ▸ Actions ▸ Variables). No hace nada.");
    return;
  }
  const repo = process.env.GITHUB_REPOSITORY ?? "felipea92p-ux/cayla-retail";
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("Falta GH_TOKEN (en el workflow es el token del job).");
    process.exit(1);
  }
  const github = clienteGitHub({ api: process.env.GITHUB_API_URL ?? "https://api.github.com", repo, token });
  const lineas = [];
  const { codigo, decision } = await vigilar({ direcciones, github, ensayo, registrar: (l) => (console.log(l), lineas.push(`- ${l}`)) });
  resumenDelJob([`### Vigía de salud — ${decision.accion}`, ...lineas]);
  if (decision.accion === "seguir") console.log("::warning::Sigue sin responder; el aviso ya está abierto (no se repite).");
  process.exit(codigo);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`El vigía de salud no pudo correr: ${e.message}`);
    process.exit(1);
  });
}
