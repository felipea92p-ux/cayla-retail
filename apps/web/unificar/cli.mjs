#!/usr/bin/env node
/**
 * El censo de `/unificar` (ADR-0354): recorre las pantallas (y sus modales, con los escenarios del auditor de tema) contra un
 * `next dev` LOCAL, reconoce cada familia de piezas (`unificar/familias.mjs`), agrupa las variantes por su huella visual, captura
 * cada una a ×2 y deja un informe y una LÁMINA de comparación. No hace clic en nada que guarde: solo mira.
 *
 *   pnpm --filter web unificar:censo -- --todas                                 todo el ERP (rutas estáticas), cuenta admin
 *   pnpm --filter web unificar:censo -- --todas --foco inventario --escenarios  + los modales de Inventario, con foco en él
 *   pnpm --filter web unificar:censo -- --modulo inventario,vender --escenarios
 *   pnpm --filter web unificar:censo -- --todas --familia pestanas,accion.cancelar   solo captura esas familias
 *   pnpm --filter web unificar:censo -- --listar
 *
 * Opciones
 *   --base-url <url>    el ERP local (por defecto $UNIFICAR_BASE_URL, $TEMA_BASE_URL o http://localhost:3010)
 *   --cuenta <a,b>      claves de `tema/cuentas.mjs` (por defecto: admin)
 *   --ruta <a,b>        rutas exactas     --modulo <a,b>   las estáticas de esos módulos     --todas   todas las estáticas
 *   --escenarios        agrega los escenarios (modales, listas) de las rutas del foco, o de las elegidas si no hay foco
 *   --foco <modulo>     el módulo que se está unificando: la lámina marca sus variantes y el informe las cuenta aparte
 *   --familia <a,b>     solo captura y muestra esas familias (`accion` = todos los botones por función)
 *   --capturas N        capturas por variante (por defecto 2, de pantallas distintas)      --sin-capturas
 *   --ancho N --alto N  viewport (por defecto 1440×900: escritorio primero, ADR-0350)       --espera <ms> (por defecto 1500)
 *   --salida <dir>      dónde escribir (por defecto unificar/.salida/<fecha>)               --sin-comparativas
 *   --otra-obra         medir aunque el servidor sea de OTRA worktree (por defecto se niega: mediría otro código)
 *   --lamina <dir>      rehace la lámina y las comparativas de un censo ya hecho (tras escribir una propuesta), sin recorrer el ERP
 *
 * Sale con 0 si terminó, con 2 si el propio script se cayó. Solo corre contra localhost.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { CUENTAS, inicioDe, porClave } from "../tema/cuentas.mjs";
import { escenariosDe, ESCENARIOS } from "../tema/escenarios/registro.mjs";
import { inventarioDeRutas, moduloDeRuta } from "../tema/motor/rutas.mjs";
import { abrirContexto, exigirLocal } from "../tema/motor/sesion.mjs";
import { FAMILIAS, familiaPorId, funcionDe, ICONO_A_FUNCION } from "./familias.mjs";
import { archivosProbables } from "./motor/archivos.mjs";
import { aplanar, escribirLamina, guardarEstilos, medidasPng } from "./motor/lamina.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(AQUI, "..");
const REPO = resolve(WEB, "..", "..");
const CENSO = readFileSync(join(AQUI, "motor", "censo-en-pagina.js"), "utf8");

function leerArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--") || argv[i] === "--") continue;
    const k = argv[i].slice(2);
    const sig = argv[i + 1];
    if (sig === undefined || sig.startsWith("--")) a[k] = true;
    else {
      a[k] = sig;
      i++;
    }
  }
  return a;
}
const lista = (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
const slug = (s) => s.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "inicio";
const huellaCorta = (h) =>
  Object.entries(aplanar(h))
    .map(([k, v]) => `${k.split(".").at(-1)} ${v}`)
    .join(", ");

/** Una imagen por familia (su sección de la lámina): para mandarla al chat y verla en el celular. */
async function fotografiarLamina(navegador, lamina, familias, dirSalida) {
  mkdirSync(join(dirSalida, "comparativas"), { recursive: true });
  const ctx = await navegador.newContext({ viewport: { width: 1480, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(pathToFileURL(lamina).href, { waitUntil: "load" });
  // Todas las capturas cargadas antes de fotografiar (la lámina no usa carga perezosa: una sección lejana saldría en blanco).
  await p.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 30_000 }).catch(() => {});
  await p.waitForTimeout(600);
  // Abre los «Cómo se ve» para que la diferencia se lea en la imagen.
  await p.evaluate(() => document.querySelectorAll(".lam-variante details:first-of-type").forEach((d) => (d.open = true)));
  for (const f of familias.filter((x) => x.subgrupos.some((s) => s.variantes.length > 1))) {
    // Con todos los «Cómo se ve» abiertos la lámina pasa de 70 000 px, y Chrome deforma la captura de lo que queda tan abajo (salía
    // corrida y con la barra fija en el medio). Para cada imagen se deja a la vista solo la sección de esa familia, arriba del todo.
    const hay = await p.evaluate((id) => {
      let encontrada = false;
      for (const el of document.querySelectorAll("section[data-familia], .lam-cabeza, .lam-resumen, .lam-barra")) {
        const es = el.getAttribute("data-familia") === id;
        el.style.display = es ? "block" : "none";
        encontrada ||= es;
      }
      scrollTo(0, 0);
      return encontrada;
    }, f.id);
    if (!hay) continue;
    await p.locator(`section[data-familia="${f.id}"]`).screenshot({ path: join(dirSalida, "comparativas", `${f.id}.png`), animations: "disabled" }).catch(() => {});
    // La propuesta sola, en claro y oscuro: es la imagen que se mira con calma antes de elegir.
    const propuesta = p.locator(`section[data-familia="${f.id}"] .lam-propuesta`);
    if (await propuesta.count()) await propuesta.screenshot({ path: join(dirSalida, "comparativas", `${f.id}.propuesta.png`), animations: "disabled" }).catch(() => {});
  }
  await ctx.close();
}

const args = leerArgs(process.argv.slice(2));
const baseUrl = (args["base-url"] || process.env.UNIFICAR_BASE_URL || process.env.TEMA_BASE_URL || "http://localhost:3010").replace(/\/$/, "");
const ancho = Number(args.ancho || 1440);
const alto = Number(args.alto || 900);
const esperaMs = Number(args.espera || 1500);
const porVariante = args["sin-capturas"] ? 0 : Number(args.capturas || 2);
const foco = typeof args.foco === "string" ? args.foco : null;
const filtroFamilias = lista(args.familia);
const quiereFamiliaDe = (filtro) => (id) => !filtro.length || filtro.some((f) => id === f || id.startsWith(`${f}.`));
const quiereFamilia = quiereFamiliaDe(filtroFamilias);
const { estaticas } = inventarioDeRutas();

if (args.listar) {
  console.log(`Familias (${FAMILIAS.length}):\n${FAMILIAS.map((f) => `  ${f.id.padEnd(22)} ${f.nombre}${f.decision ? `  · decidida: ${f.decision.elegida}` : ""}`).join("\n")}`);
  console.log(`\nCuentas:\n${CUENTAS.map((c) => `  ${c.clave.padEnd(24)} ${c.descripcion}`).join("\n")}`);
  console.log(`\nRutas estáticas (${estaticas.length}). Módulos: ${[...new Set(estaticas.map(moduloDeRuta))].join(", ")}`);
  process.exit(0);
}

// Rehacer la lámina de un censo ya hecho (después de escribir o cambiar una propuesta): no vuelve a recorrer el ERP.
if (typeof args.lamina === "string") {
  const dir = resolve(args.lamina);
  const censo = JSON.parse(readFileSync(join(dir, "censo.json"), "utf8"));
  const familiasLamina = censo.familias.filter((f) => quiereFamiliaDe(lista(args.familia))(f.id)).map((f) => ({ ...f, ...(familiaPorId(f.id) ?? {}), subgrupos: f.subgrupos }));
  const lam = escribirLamina(dir, { ...censo, familias: familiasLamina }, { propuestasDir: join(REPO, "docs", "unificar", "propuestas"), foco: censo.foco });
  if (!args["sin-comparativas"]) {
    const nav = await chromium.launch({ headless: true });
    await fotografiarLamina(nav, lam, familiasLamina, dir);
    await nav.close();
  }
  console.log(`Lámina rehecha:  ${lam}\nComparativas:    ${join(dir, "comparativas")}`);
  process.exit(0);
}

exigirLocal(baseUrl);

// ¿El servidor de esa URL es el de ESTA obra? Con varias worktrees corriendo `next dev` a la vez, censar el de otra mide OTRO código
// y la lámina saldría con variantes que aquí ya no existen (o sin las que acabas de crear).
try {
  const puerto = new URL(baseUrl).port || "80";
  const pid = execFileSync("lsof", ["-nP", `-iTCP:${puerto}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim().split("\n")[0];
  const cwd = execFileSync("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"], { encoding: "utf8" })
    .split("\n")
    .find((l) => l.startsWith("n"))
    ?.slice(1);
  if (cwd && resolve(cwd) !== WEB && !args["otra-obra"]) {
    console.error(`El servidor de ${baseUrl} es de otra worktree:\n  ${cwd}\nEsta obra es:\n  ${WEB}\nLevanta el de esta (preview_start «cayla-retail-dev», o PORT=<libre> pnpm --filter web dev) y pásalo con --base-url. Si de verdad quieres medir aquel, --otra-obra.`);
    process.exit(2);
  }
} catch {
  console.warn(`(No se pudo comprobar de qué worktree es el servidor de ${baseUrl}: sin lsof. Sigue.)`);
}
try {
  await fetch(`${baseUrl}/login`, { redirect: "manual" });
} catch (e) {
  console.error(`No se pudo hablar con ${baseUrl}: ${e.message}. ¿Está levantado el \`next dev\`?`);
  process.exit(2);
}

const cuentas = lista(args.cuenta || "admin").map((c) => porClave(c) ?? (console.error(`No existe la cuenta «${c}». Con --listar se ven.`), process.exit(2)));
let rutas = lista(args.ruta);
if (args.modulo) rutas.push(...estaticas.filter((r) => lista(args.modulo).includes(moduloDeRuta(r))));
if (args.todas) rutas = [...estaticas];
if (!rutas.length) rutas = ["/"];
rutas = [...new Set(rutas)];

const cuando = new Date();
const sello = cuando.toISOString().replace(/[-:T]/g, "").slice(0, 12);
const dirSalida = resolve(args.salida || join(AQUI, ".salida", `${sello.slice(0, 8)}-${sello.slice(8)}`));
mkdirSync(join(dirSalida, "capturas"), { recursive: true });

function visitasDe(cuenta) {
  const casa = (r) => (r === "/" ? inicioDe(cuenta) : r);
  const v = rutas.map((ruta) => ({ ruta: casa(ruta), logica: ruta, titulo: casa(ruta), escenario: null }));
  if (args.escenarios) {
    const conEscenarios = foco ? rutas.filter((r) => moduloDeRuta(r) === foco) : rutas;
    for (const ruta of conEscenarios) for (const e of escenariosDe(ruta, cuenta.clave, ancho < 700)) if (!e.soloPorId) v.push({ ruta: casa(ruta), logica: ruta, titulo: `${casa(ruta)} · ${e.nombre}`, escenario: e });
  }
  return v;
}


// ---------- la agregación: familia → subgrupo → variante (por huella) ----------
const variantes = new Map();
const desconocidas = new Set();
const sinNombre = [];
let estilos = null;
const estados = [];

const GLIFO_A_FUNCION = { "←": "volver", "×": "cerrar", "✕": "cerrar", "✖": "cerrar", "›": "siguiente", "→": "siguiente", "»": "siguiente", "‹": "anterior", "«": "anterior", "⋯": "menu", "…": "menu", "+": "nuevo", "✓": "listo", "✔︎": "listo" };
function entradasDe(inst) {
  if (inst.familia === "boton" || inst.familia === "enlace") {
    // Un enlace de texto que dice «← Traslados» también es un Volver: entra a la familia de su función con su propia forma.
    const sal = [{ familia: inst.familia, sub: "", huella: inst.huella }];
    const fn = funcionDe(inst.nombre, inst.soloIcono ? inst.iconoNombre : null);
    if (fn) sal.push({ familia: `accion.${fn}`, sub: "", huella: inst.familia === "enlace" ? { forma: "enlace de texto", ...inst.huella } : { forma: "botón", ...inst.huella } });
    return sal;
  }
  if (inst.familia === "icono") {
    const nombre = inst.icono || "propio";
    const glifo = nombre.startsWith("glifo ") ? nombre.slice(6) : null;
    const sub = glifo ? GLIFO_A_FUNCION[glifo] || `glifo ${glifo}` : ICONO_A_FUNCION[nombre] || nombre;
    return [{ familia: "icono", sub, huella: { dibujo: nombre, ...inst.huella } }];
  }
  return [{ familia: inst.familia, sub: "", huella: inst.huella }];
}

async function capturar(pagina, inst, destino) {
  const caja = await pagina.evaluate((uid) => window.__unificarEnfocar(uid), inst.uid);
  if (!caja) return null;
  await pagina.waitForTimeout(120);
  const vp = pagina.viewportSize();
  const m = 10;
  const x = Math.max(0, Math.floor(caja.x - m));
  const y = Math.max(0, Math.floor(caja.y - m));
  const w = Math.min(vp.width - x, Math.ceil(caja.w + 2 * m), 1000);
  const h = Math.min(vp.height - y, Math.ceil(caja.h + 2 * m), 620);
  if (w < 4 || h < 4) return null;
  mkdirSync(dirname(destino), { recursive: true });
  await pagina.screenshot({ path: destino, clip: { x, y, width: w, height: h }, animations: "disabled" });
  return destino;
}

async function visitar(ctx, cuenta, visita) {
  const pagina = await ctx.newPage();
  const res = { cuenta: cuenta.clave, titulo: visita.titulo, estado: "ok", instancias: 0 };
  try {
    const respuesta = await pagina.goto(baseUrl + visita.ruta, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => null);
    if (respuesta && respuesta.status() === 404) {
      res.estado = "no existe (404)";
      return res;
    }
    await pagina.evaluate(() => document.fonts?.ready);
    await pagina.waitForTimeout(esperaMs);
    const final = new URL(pagina.url()).pathname.replace(/\/$/, "") || "/";
    if (final !== (visita.ruta.replace(/\/$/, "") || "/")) {
      res.estado = final.startsWith("/sin-acceso") ? "sin acceso" : `redirige a ${final}`;
      return res;
    }
    if (visita.escenario) {
      try {
        await visita.escenario.preparar(pagina);
        if (visita.escenario.abre) await pagina.locator(visita.escenario.abre).first().waitFor({ state: "visible", timeout: 6000 });
        await pagina.waitForTimeout(900); // la cascada del modal (ADR-0136) tiene que terminar de entrar
      } catch (e) {
        res.estado = `el escenario no abrió lo que dice abrir: ${String(e.message).split("\n")[0].slice(0, 100)}`;
        return res;
      }
    } else {
      // Toda la página a la vista (tope 4000 px), como el auditor de tema: así se cuenta lo que está bajo el pliegue.
      const altoPagina = await pagina.evaluate(() => document.documentElement.scrollHeight);
      await pagina.setViewportSize({ width: ancho, height: Math.min(Math.max(altoPagina, alto), 4000) });
      await pagina.waitForTimeout(400);
    }
    await pagina.addScriptTag({ content: CENSO });
    const censo = await pagina.evaluate(() => window.__unificarCensar());
    if (!estilos) estilos = await pagina.evaluate(() => window.__unificarEstilos());
    res.instancias = censo.instancias.length;
    res.cortadas = censo.cortadas;
    const pantalla = visita.escenario ? `${visita.logica} · ${visita.escenario.nombre}` : visita.logica;
    const modulo = moduloDeRuta(visita.logica);
    for (const inst of censo.instancias) {
      if (inst.familia === "boton" && inst.soloIcono && !inst.nombre) sinNombre.push({ pantalla, icono: inst.iconoNombre, clases: inst.clases });
      for (const e of entradasDe(inst)) {
        if (!familiaPorId(e.familia)) {
          desconocidas.add(e.familia);
          continue;
        }
        const clave = `${e.familia}|${e.sub}|${JSON.stringify(e.huella)}`;
        let v = variantes.get(clave);
        if (!v) {
          v = { familia: e.familia, sub: e.sub, huella: e.huella, usos: 0, pantallas: new Set(), porModulo: {}, capturas: [], ejemplos: new Set(), clases: new Set(), hash: createHash("sha1").update(clave).digest("hex").slice(0, 10) };
          variantes.set(clave, v);
        }
        v.usos++;
        v.pantallas.add(pantalla);
        v.porModulo[modulo] = (v.porModulo[modulo] || 0) + 1;
        if (inst.texto && v.ejemplos.size < 6) v.ejemplos.add(inst.texto.slice(0, 40));
        if (v.clases.size < 4) v.clases.add(inst.clases || inst.clasesPadre);
        const yaDeAqui = v.capturas.some((c) => c.ruta === pantalla);
        if (porVariante && quiereFamilia(e.familia) && v.capturas.length < porVariante && !yaDeAqui) {
          const archivo = join("capturas", slug(e.familia), `${v.hash}-${v.capturas.length + 1}.png`);
          const hecho = await capturar(pagina, inst, join(dirSalida, archivo)).catch(() => null);
          if (hecho) v.capturas.push({ archivo, ruta: pantalla });
        }
      }
    }
  } catch (e) {
    res.estado = `falló: ${String(e.message).split("\n")[0].slice(0, 110)}`;
  } finally {
    await visita.escenario?.limpiar?.(pagina).catch(() => {});
    await pagina.close().catch(() => {});
  }
  return res;
}

const navegador = await chromium.launch({ headless: true });
let visitasHechas = 0;
try {
  for (const cuenta of cuentas) {
    const lote = visitasDe(cuenta);
    const ctx = await abrirContexto(navegador, cuenta, { baseUrl, tema: "claro", viewport: { width: ancho, height: alto }, escala: 2 });
    // Visitar /global (o un escenario que cambia de sede) deja la cookie de la sede activa en «CAYLA Global», y desde ahí toda
    // pantalla de sede pide elegir una. Antes de cada visita, la cuenta vuelve a su sede de partida.
    const SEDE = "cayla_ubicacion_activa";
    const sedeInicial = (await ctx.cookies()).find((c) => c.name === SEDE);
    for (const v of lote) {
      if (sedeInicial) await ctx.addCookies([sedeInicial]);
      else await ctx.clearCookies({ name: SEDE });
      process.stdout.write(`  ${cuenta.clave} · ${v.titulo}\n`);
      const r = await visitar(ctx, cuenta, v);
      estados.push(r);
      if (r.estado === "ok") visitasHechas++;
    }
    await ctx.close();
  }
} catch (e) {
  console.error("\nEl censo se cayó:", e.message);
  await navegador.close();
  process.exit(2);
}

// ---------- el resultado ----------
const LETRAS = (i) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
const familias = FAMILIAS.map((f) => {
  const deEsta = [...variantes.values()].filter((v) => v.familia === f.id);
  const subs = [...new Set(deEsta.map((v) => v.sub))].sort();
  return {
    ...f,
    subgrupos: subs.map((sub) => ({
      sub,
      variantes: deEsta
        .filter((v) => v.sub === sub)
        .sort((a, b) => b.usos - a.usos || b.pantallas.size - a.pantallas.size)
        .map((v, i) => {
          const { archivos, sistema } = archivosProbables([...v.clases]);
          return {
            letra: LETRAS(i),
            hash: v.hash,
            huella: v.huella,
            usos: v.usos,
            pantallas: [...v.pantallas].sort(),
            porModulo: v.porModulo,
            foco: !!(foco && v.porModulo[foco]),
            capturas: v.capturas.map((c) => ({ ...c, ...(medidasPng(join(dirSalida, c.archivo)) ?? {}) })),
            ejemplos: [...v.ejemplos],
            archivos,
            sistema,
          };
        }),
    })),
  };
}).filter((f) => quiereFamilia(f.id));

const censo = {
  cuando: cuando.toLocaleString("es-PE", { timeZone: "America/Lima" }),
  rama: (() => {
    try {
      return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim() + " @ " + execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
    } catch {
      return "?";
    }
  })(),
  baseUrl,
  cuentas: cuentas.map((c) => c.clave),
  foco,
  visitas: visitasHechas,
  estados,
  estilos: estilos ?? { hojas: [], enLinea: [], claseHtml: "", claseBody: "" },
  sinNombre,
  familias,
};

writeFileSync(join(dirSalida, "censo.json"), JSON.stringify(censo, null, 1));
await guardarEstilos(dirSalida, censo.estilos, baseUrl);
const lamina = escribirLamina(dirSalida, censo, { propuestasDir: join(REPO, "docs", "unificar", "propuestas"), foco });

if (!args["sin-comparativas"]) await fotografiarLamina(navegador, lamina, familias, dirSalida);
await navegador.close();

// ---------- el informe (lo que lee /unificar antes de mirar las capturas) ----------
const lineas = [];
lineas.push(`# Censo de /unificar — ${censo.cuando}`, "");
lineas.push(`Rama: \`${censo.rama}\` · Base: ${baseUrl} · Cuentas: ${censo.cuentas.join(", ")} · Vistas medidas: ${visitasHechas} de ${estados.length}${foco ? ` · Foco: **${foco}**` : ""}`, "");
lineas.push("| Familia | Formas distintas | Usos | Pantallas | Pieza del sistema hoy |", "|---|---:|---:|---:|---|");
for (const f of familias) {
  const vs = f.subgrupos.flatMap((s) => s.variantes);
  if (!vs.length) continue;
  lineas.push(`| ${f.nombre} (\`${f.id}\`) | ${vs.length} | ${vs.reduce((a, v) => a + v.usos, 0)} | ${new Set(vs.flatMap((v) => v.pantallas)).size} | ${f.pieza ?? "—"} |`);
}
lineas.push("");
for (const f of familias) {
  const conVarias = f.subgrupos.filter((s) => s.variantes.length > 1);
  if (!conVarias.length) continue;
  lineas.push(`## ${f.nombre} (\`${f.id}\`)`, "", f.funcion, "");
  if (f.gobierna.length) lineas.push(`Reglas que ya decidieron algo aquí: ${f.gobierna.join(", ")}.`, "");
  for (const s of conVarias) {
    if (s.sub) lineas.push(`### ${s.sub}`, "");
    for (const v of s.variantes.slice(0, 15)) {
      const mods = Object.entries(v.porModulo).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m}×${n}`).join(", ");
      lineas.push(`- **${v.letra}**${v.foco ? " ◆" : ""} · ${v.usos} usos · ${v.pantallas.length} pantallas · ${mods}${v.sistema.length ? ` · sistema: ${v.sistema.join(" ")}` : ""} · [probable] ${v.archivos.join(", ") || "—"}`);
      lineas.push(`  - ${huellaCorta(v.huella)}`);
      if (v.ejemplos.length) lineas.push(`  - dice: ${v.ejemplos.map((e) => `«${e}»`).join(" · ")}`);
    }
    if (s.variantes.length > 15) lineas.push(`- … y ${s.variantes.length - 15} variantes más (en censo.json)`);
    lineas.push("");
  }
}
if (sinNombre.length) {
  lineas.push(`## Botones de solo icono sin nombre (${sinNombre.length})`, "", "No dicen qué hacen ni a un lector de pantalla ni a /unificar (sin texto, aria-label ni title). Van en el informe como falta aparte.", "");
  for (const b of sinNombre.slice(0, 20)) lineas.push(`- ${b.pantalla} · icono ${b.icono ?? "?"} · \`${(b.clases || "").slice(0, 90)}\``);
  lineas.push("");
}
const fallidas = estados.filter((e) => e.estado !== "ok");
if (fallidas.length) {
  lineas.push(`## No cubierto (${fallidas.length})`, "");
  for (const e of fallidas) lineas.push(`- ${e.cuenta} · ${e.titulo}: ${e.estado}`);
  lineas.push("");
}
const cortadas = estados.filter((e) => e.cortadas && Object.keys(e.cortadas).length);
if (cortadas.length) lineas.push(`Nota: en ${cortadas.length} vistas una familia pasó de 120 elementos y el resto no se detalló (el conteo de esas vistas queda corto).`, "");
if (desconocidas.size) lineas.push(`Ojo: el detector devolvió familias que \`familias.mjs\` no conoce: ${[...desconocidas].join(", ")}.`, "");
writeFileSync(join(dirSalida, "reporte.md"), lineas.join("\n"));

const conVarias = familias.filter((f) => f.subgrupos.some((s) => s.variantes.length > 1));
console.log(`\n${visitasHechas} vistas medidas (${fallidas.length} sin cubrir) · ${conVarias.length} familias con más de una forma`);
for (const f of conVarias.slice(0, 40)) console.log(`  ${f.id.padEnd(22)} ${f.subgrupos.reduce((a, s) => a + s.variantes.length, 0)} formas`);
console.log(`\nInforme:      ${join(dirSalida, "reporte.md")}`);
console.log(`Lámina:       ${lamina}`);
console.log(`Comparativas: ${join(dirSalida, "comparativas")} (una imagen por familia)`);
