#!/usr/bin/env node
/**
 * ¿Vercel recibió el último commit de `main`? — el vigía del acuse (`.github/workflows/vigia-vercel.yml`, ADR-0425).
 *
 * EL PROBLEMA. Vercel publica producción cuando GitHub le avisa de un push a `main`. Si ese aviso se pierde, nadie lo
 * reintenta: GitHub no lo vuelve a mandar y Vercel no sabe que existió. El 2026-10-15 la fusión del PR #1115 (db7ecbdd)
 * quedó sin publicar 47 minutos, en verde en todas partes, hasta que alguien la publicó a mano. Pasó 2 veces en 837
 * fusiones (1-sep al 15-oct); la otra la tapó una fusión 11 s después. Lo que falla DESPUÉS del aviso no es silencioso:
 * una publicación caída deja la X roja en el commit y Vercel manda su correo. Lo silencioso es el aviso que no llega, y
 * el filtro que se salta producción (el 2026-10-09, 6 fusiones con «Canceled by Ignored Build Step» en VERDE).
 *
 * QUÉ PROMETE. Mira el ÚLTIMO commit de `main` en ese momento, no el del push que lo despertó: si llegaron tres fusiones
 * seguidas, publicar la tercera publica las tres. Busca la marca que Vercel deja en ese commit para el proyecto (la
 * reconoce por su enlace, vercel.com/<equipo>/<proyecto>/…, porque su nombre cambia: «Vercel» con un proyecto conectado,
 * «Vercel – cayla-retail» con varios) y decide:
 *   · sin marca a los 3 min de creado el commit → pide la publicación al Deploy Hook (secreto `VERCEL_DEPLOY_HOOK`),
 *     espera a ver la marca nueva y lo deja en un aviso de GitHub: cerrado si Vercel la tomó, abierto si no;
 *   · «Canceled by Ignored Build Step» → producción saltada por el filtro: aviso abierto, sin Deploy Hook (lo saltaría igual);
 *   · cualquier otra marca (publicando, publicada, falló, cancelada a mano) → nada que hacer: Vercel ya lo tiene. Si había
 *     un aviso abierto, lo cierra: lo que quedó atrás viaja con este commit.
 * Sale con 1 (la corrida queda en rojo) solo si hace falta una persona: aviso abierto, o no pudo leer GitHub.
 *
 * QUÉ ASUME. Vercel marca el commit en segundos (79 fusiones del 15-oct: mediana 5 s, máximo 9 s): 3 minutos es 20 veces
 * eso. El Deploy Hook publica el último commit de `main`, y lo que publica también marca el commit (por confirmar en la
 * primera prueba manual: si no, el vigía diría «no veo la marca» aunque Vercel sí la tomara). Corre con el Node del
 * runner, sin dependencias. La URL del Deploy Hook nunca se imprime: el repo y sus registros son públicos.
 *
 * USO
 *   node scripts/ci/vigia-vercel.mjs                       → lo que corre el workflow (lee GITHUB_REPOSITORY, GH_TOKEN…)
 *   node scripts/ci/vigia-vercel.mjs --ensayo              → solo mira y dice qué haría: no llama al hook ni escribe avisos
 *   node scripts/ci/vigia-vercel.mjs --ensayo --sha <sha>  → lo mismo, con ese commit en lugar del último de main
 *   node scripts/ci/vigia-vercel.mjs --probar              → llama al Deploy Hook aunque Vercel ya tenga el commit (prueba el secreto)
 */
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const TITULO_AVISO = "Producción atrás de main (vigía de Vercel)";
const ADR = "ADR-0425";

/**
 * ¿Esta marca del commit es de Vercel y de este proyecto? Por el enlace, no por el nombre: «Vercel» y «Vercel –
 * cayla-retail» son el mismo proyecto según cuántos haya conectados, y «Vercel Deployments – CAYLA» es el resumen del
 * equipo (enlace /cayla/~/deployments), no una publicación.
 */
export function esDelProyecto(marca, proyecto) {
  if (!/^Vercel(\s+[–-]\s+.+)?$/.test(marca?.context ?? "")) return false;
  try {
    return new URL(marca.target_url).pathname.split("/")[2] === proyecto;
  } catch {
    return false;
  }
}

/** La marca más reciente del proyecto en el commit, o `null` si Vercel nunca lo marcó. */
export function ultimaMarca(marcas, proyecto) {
  const delProyecto = (marcas ?? []).filter((m) => esDelProyecto(m, proyecto));
  delProyecto.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return delProyecto[0] ?? null;
}

/**
 * La decisión, sin red. `marca` = `ultimaMarca(...)`; `edadS` = segundos desde que se creó el commit.
 * Devuelve { accion: "esperar" | "listo" | "disparar" | "avisar", motivo }.
 */
export function decidir({ marca, edadS, plazoS = 180 }) {
  if (!marca) {
    if (edadS < plazoS) return { accion: "esperar", motivo: "Vercel todavía no marca el commit" };
    return {
      accion: "disparar",
      motivo: `Vercel no marcó el commit en ${minutos(edadS)}: el aviso de GitHub no le llegó`,
    };
  }
  const descripcion = marca.description ?? "";
  if (/Ignored Build Step/i.test(descripcion)) {
    return { accion: "avisar", motivo: "Vercel se saltó producción con el filtro («Canceled by Ignored Build Step»)" };
  }
  if (marca.state === "pending") return { accion: "listo", motivo: "Vercel lo está publicando" };
  if (marca.state === "success") return { accion: "listo", motivo: "Vercel ya lo publicó" };
  if (/Canceled from the Vercel Dashboard/i.test(descripcion)) {
    return { accion: "listo", motivo: "alguien canceló la publicación en Vercel: no se repite" };
  }
  return { accion: "listo", motivo: "la publicación falló en Vercel: eso ya avisa solo (X roja en el commit y correo de Vercel)" };
}

const minutos = (s) => {
  const m = Math.round(s / 60);
  return m <= 1 ? "1 minuto" : `${m} minutos`;
};

const horaLima = (ms) =>
  new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));

/** El commit como se nombra en un aviso: sha corto y su PR, si lo trae el asunto. */
function nombreCommit(cabeza) {
  const pr = cabeza.asunto?.match(/#(\d+)/)?.[1];
  return `\`${cabeza.sha.slice(0, 9)}\`${pr ? ` (#${pr})` : ""}`;
}

/**
 * El texto del aviso. `tipo`: "resuelto" | "sin-secreto" | "hook-fallo" | "sin-confirmar" | "filtro" | "cierre".
 * Público (el repo lo es): commits, PR y horas; nunca la URL del Deploy Hook ni lo que responde.
 */
export function textoAviso({ tipo, cabeza, ahora, codigo, marcaNueva, plazoS = 180, prueba = false }) {
  const cuando = `**${horaLima(ahora)}** (Lima)`;
  const commit = nombreCommit(cabeza);
  // La prueba manual (`--probar`) usa los mismos textos con otra primera frase: ahí nadie perdió ningún aviso.
  const perdido = prueba
    ? `Prueba manual del Deploy Hook sobre ${commit}, el último commit de \`main\`.`
    : `Vercel no marcó ${commit} en ${minutos(plazoS)}: el aviso de GitHub no le llegó y producción se quedó atrás de \`main\`.`;
  const aMano =
    "Mientras tanto, se publica a mano: Vercel ▸ cayla-retail ▸ Deployments ▸ el último de `main` ▸ Redeploy.";
  switch (tipo) {
    case "resuelto":
      return [
        `${cuando} — ${perdido}`,
        "",
        `El vigía pidió la publicación por el Deploy Hook y Vercel la tomó${marcaNueva?.target_url ? ` ([ver](${marcaNueva.target_url}))` : ""}. No hace falta hacer nada: este aviso queda como registro. ${ADR}.`,
      ].join("\n");
    case "sin-secreto":
      return [
        `${cuando} — ${perdido}`,
        "",
        "No pude pedir la publicación: falta el secreto `VERCEL_DEPLOY_HOOK` (Settings ▸ Secrets and variables ▸ Actions; la URL sale de Vercel ▸ cayla-retail ▸ Settings ▸ Git ▸ Deploy Hooks, rama `main`).",
        aMano,
        ADR,
      ].join("\n");
    case "hook-fallo":
      return [
        `${cuando} — ${perdido}`,
        "",
        `Pedí la publicación por el Deploy Hook y no la aceptó (${codigo === "sin respuesta" ? "no respondió" : `HTTP ${codigo}`}). Si es 404, el hook se borró o cambió: crea otro y reemplaza el secreto \`VERCEL_DEPLOY_HOOK\`.`,
        aMano,
        ADR,
      ].join("\n");
    case "sin-confirmar":
      return [
        `${cuando} — ${perdido}`,
        "",
        `Pedí la publicación por el Deploy Hook (respondió HTTP ${codigo}), pero en ${minutos(plazoS)} no veo la marca de Vercel en el último commit de \`main\`. Mira Vercel ▸ cayla-retail ▸ Deployments: si está publicando, todo bien; si no, publícalo a mano.`,
        ADR,
      ].join("\n");
    case "filtro":
      return [
        `${cuando} — Vercel se saltó ${commit} en producción («Canceled by Ignored Build Step»), y lo marcó en verde.`,
        "",
        "El filtro de `apps/web/vercel.json` (`scripts/ci/vercel-ignorar.mjs`, ADR-0383) solo debe saltar vistas previas. No llamé al Deploy Hook: el filtro lo saltaría igual. Hay que arreglar el filtro y publicar a mano.",
        ADR,
      ].join("\n");
    case "cierre":
      return `${cuando} — Vercel volvió a marcar el último commit de \`main\` (${commit}): lo que quedó atrás viaja con él. Cierro el aviso. ${ADR}.`;
    default:
      throw new Error(`aviso desconocido: ${tipo}`);
  }
}

/** Una lectura de GitHub con 3 intentos: un tropiezo de la API no debe dejar la corrida en rojo. */
async function leer(fn, dormir, intentos = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i >= intentos) throw error;
      await dormir(5);
    }
  }
}

/**
 * La vigilancia completa, con todo lo de afuera inyectado (`github`, `pedir`, `reloj`, `dormir`) para poder simularla.
 * Devuelve { codigo, decision, aviso } — `codigo` 1 si hace falta una persona.
 */
export async function vigilar({
  github,
  proyecto,
  hook,
  pedir,
  reloj = Date.now,
  dormir,
  plazoS = 180,
  pausaS = 15,
  sha = null,
  ensayo = false,
  probar = false,
  registrar = () => {},
}) {
  // 1. Mirar el último commit de main hasta que Vercel lo marque o venza el plazo.
  let cabeza;
  let decision;
  for (;;) {
    cabeza = await leer(() => github.cabeza(sha), dormir);
    const marca = ultimaMarca(await leer(() => github.marcas(cabeza.sha), dormir), proyecto);
    const edadS = (reloj() - Date.parse(cabeza.fecha)) / 1000;
    decision = probar
      ? { accion: "disparar", motivo: "prueba manual del Deploy Hook" }
      : decidir({ marca, edadS, plazoS });
    if (decision.accion !== "esperar") break;
    await dormir(Math.min(pausaS, Math.max(0.05, plazoS - edadS)));
  }
  registrar(`${cabeza.sha.slice(0, 9)}: ${decision.motivo}`);

  const avisar = async (tipo, extra = {}) => {
    const cuerpo = textoAviso({ tipo, cabeza, ahora: reloj(), plazoS, prueba: probar, ...extra });
    if (ensayo || probar) return { tipo, cuerpo, numero: null };
    const abierto = await leer(() => github.avisoAbierto(TITULO_AVISO), dormir);
    let numero = abierto;
    if (abierto) await github.comentar(abierto, cuerpo);
    else numero = (await github.crearAviso(TITULO_AVISO, cuerpo)).number;
    // Un aviso que no pide nada a nadie se cierra en el acto: queda como registro y GitHub igual notifica.
    if (tipo === "resuelto") await github.cerrar(numero);
    return { tipo, cuerpo, numero };
  };

  // 2. Actuar.
  if (decision.accion === "listo") {
    if (ensayo || probar) return { codigo: 0, decision, aviso: null };
    const abierto = await leer(() => github.avisoAbierto(TITULO_AVISO), dormir);
    if (!abierto) return { codigo: 0, decision, aviso: null };
    const cuerpo = textoAviso({ tipo: "cierre", cabeza, ahora: reloj(), plazoS });
    await github.comentar(abierto, cuerpo);
    await github.cerrar(abierto);
    return { codigo: 0, decision, aviso: { tipo: "cierre", cuerpo, numero: abierto } };
  }
  if (decision.accion === "avisar") return { codigo: 1, decision, aviso: await avisar("filtro") };

  // disparar
  if (ensayo) {
    registrar("ensayo: aquí pediría la publicación al Deploy Hook y lo diría en un aviso");
    return { codigo: 0, decision, aviso: null };
  }
  if (!hook) return { codigo: 1, decision, aviso: await avisar("sin-secreto") };
  const disparo = reloj();
  const pedido = await pedir(hook);
  if (!pedido.ok) return { codigo: 1, decision, aviso: await avisar("hook-fallo", { codigo: pedido.codigo }) };
  registrar(`Deploy Hook: HTTP ${pedido.codigo}; espero la marca de Vercel`);

  // 3. Confirmar: una marca del proyecto en el último commit de main, puesta después del pedido (con 10 s de holgura por
  // la diferencia de relojes). Si entretanto llegó otra fusión y Vercel la marcó, también vale: trae todo lo anterior.
  const hasta = disparo + plazoS * 1000;
  for (;;) {
    const actual = await leer(() => github.cabeza(sha), dormir);
    const marca = ultimaMarca(await leer(() => github.marcas(actual.sha), dormir), proyecto);
    if (marca && Date.parse(marca.created_at) >= disparo - 10_000) {
      registrar(`Vercel lo tomó: ${marca.description}`);
      return { codigo: 0, decision, aviso: await avisar("resuelto", { marcaNueva: marca }) };
    }
    if (reloj() >= hasta) break;
    await dormir(Math.min(pausaS, Math.max(0.05, (hasta - reloj()) / 1000)));
  }
  return { codigo: 1, decision, aviso: await avisar("sin-confirmar", { codigo: pedido.codigo }) };
}

/** GitHub por su API REST, con el token del job. Solo lo que el vigía usa. */
export function clienteGitHub({ api, repo, token, fetchImpl = fetch }) {
  const pedir = async (ruta, { method = "GET", body } = {}) => {
    const r = await fetchImpl(`${api}/repos/${repo}${ruta}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(`GitHub respondió HTTP ${r.status} a ${method} ${ruta.split("?")[0]}`);
    return r.status === 204 ? null : r.json();
  };
  return {
    async cabeza(sha) {
      const c = await pedir(`/commits/${sha ?? "main"}`);
      return { sha: c.sha, fecha: c.commit.committer.date, asunto: c.commit.message.split("\n")[0] };
    },
    marcas: (sha) => pedir(`/commits/${sha}/statuses?per_page=100`),
    async avisoAbierto(titulo) {
      const lista = await pedir("/issues?state=open&per_page=100");
      return lista.find((i) => !i.pull_request && i.title === titulo)?.number ?? null;
    },
    crearAviso: (titulo, cuerpo) => pedir("/issues", { method: "POST", body: { title: titulo, body: cuerpo } }),
    comentar: (numero, cuerpo) => pedir(`/issues/${numero}/comments`, { method: "POST", body: { body: cuerpo } }),
    cerrar: (numero) => pedir(`/issues/${numero}`, { method: "PATCH", body: { state: "closed", state_reason: "completed" } }),
  };
}

/** El Deploy Hook. Nunca imprime la URL ni el error de red (podría traerla): solo el código. */
export async function pedirPublicacion(hook, fetchImpl = fetch) {
  try {
    const r = await fetchImpl(hook, { method: "POST", signal: AbortSignal.timeout(20_000) });
    return { ok: r.ok, codigo: r.status };
  } catch {
    return { ok: false, codigo: "sin respuesta" };
  }
}

function argumentos(argv) {
  const valor = (nombre) => {
    const i = argv.indexOf(nombre);
    return i === -1 ? undefined : argv[i + 1];
  };
  return {
    ensayo: argv.includes("--ensayo"),
    probar: argv.includes("--probar") || process.env.PROBAR_HOOK === "true",
    sha: valor("--sha") ?? null,
    proyecto: valor("--proyecto") ?? "cayla-retail",
    plazoS: Number(valor("--plazo") ?? 180),
    pausaS: Number(valor("--pausa") ?? 15),
  };
}

async function main() {
  const a = argumentos(process.argv.slice(2));
  if (a.sha && !a.ensayo) {
    console.error("--sha solo sirve con --ensayo: el vigía de verdad siempre mira el último commit de main.");
    process.exit(1);
  }
  const repo = process.env.GITHUB_REPOSITORY ?? "felipea92p-ux/cayla-retail";
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("Falta GH_TOKEN (en el workflow es el token del job; a mano: GH_TOKEN=$(gh auth token)).");
    process.exit(1);
  }
  const github = clienteGitHub({ api: process.env.GITHUB_API_URL ?? "https://api.github.com", repo, token });
  let resultado;
  try {
    resultado = await vigilar({
      github,
      proyecto: a.proyecto,
      hook: process.env.VERCEL_DEPLOY_HOOK || null,
      pedir: pedirPublicacion,
      dormir: (s) => new Promise((r) => setTimeout(r, s * 1000)),
      plazoS: a.plazoS,
      pausaS: a.pausaS,
      sha: a.sha,
      ensayo: a.ensayo,
      probar: a.probar,
      registrar: (linea) => console.log(linea),
    });
  } catch (error) {
    // Sin datos no se decide: ni Deploy Hook ni aviso. La corrida en rojo es la alarma.
    console.error(`::error::No se pudo mirar GitHub: ${error.message}`);
    process.exit(1);
  }
  const { codigo, decision, aviso } = resultado;
  const resumen = [`### Vigía de Vercel (${ADR})`, "", `**${decision.accion}** — ${decision.motivo}.`];
  if (aviso) resumen.push("", aviso.numero ? `Aviso #${aviso.numero}:` : "Aviso (no se publicó):", "", aviso.cuerpo);
  console.log(resumen.slice(2).join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${resumen.join("\n")}\n`);
  if (codigo !== 0) console.error("::error::El vigía necesita a una persona: mira el aviso de arriba.");
  process.exit(codigo);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
