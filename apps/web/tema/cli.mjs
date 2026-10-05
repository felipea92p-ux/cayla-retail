#!/usr/bin/env node
/**
 * Auditoría del modo oscuro (ADR-0336): recorre cuenta × ruta × tema contra un `next dev` LOCAL ya levantado, mide el contraste de
 * cada texto, detecta manchas claras y velos que aclaran, y captura la pantalla. Compara claro contra oscuro para separar lo que
 * ROMPIÓ el tema de lo que ya estaba mal.
 *
 *   pnpm --filter web tema:auditar -- --cuenta admin --ruta /,/caja
 *   pnpm --filter web tema:auditar -- --cuenta admin,integrante --modulo inventario
 *   pnpm --filter web tema:auditar -- --cuenta todas --todas              (todas las rutas estáticas: es largo)
 *   pnpm --filter web tema:auditar -- --cuenta admin --escenarios --ruta /  (+ modales, listas y buscador de esas rutas)
 *
 * Opciones
 *   --base-url <url>     el ERP local (por defecto $TEMA_BASE_URL o http://localhost:3010)
 *   --cuenta <a,b|todas> claves de `tema/cuentas.mjs` (por defecto: admin)
 *   --ruta <a,b>         rutas exactas       --modulo <a,b>   todas las estáticas de esos módulos      --todas   todas las estáticas
 *   --escenarios         agrega los escenarios (`tema/escenarios/registro.mjs`) de las rutas elegidas   --escenario <id>   solo ese
 *   --ancho N --alto N   viewport (por defecto 1440×900; 375 para celular)
 *   --sin-claro          no mide el claro (más rápido, pero no distingue lo heredado de lo nuevo)
 *   --capturas-claro     también captura el claro      --espera <ms>   espera tras cargar (por defecto 1800)
 *   --salida <dir>       dónde escribir (por defecto tema/.salida/<fecha>)
 *   --listar             solo lista las rutas y las cuentas, y sale
 *
 * Sale con 1 si hay hallazgos SOLO en oscuro, con 2 si el propio script se cayó. Solo corre contra localhost.
 */

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CUENTAS, inicioDe, porClave } from "./cuentas.mjs";
import { escenariosDe, ESCENARIOS } from "./escenarios/registro.mjs";
import { inventarioDeRutas, moduloDeRuta } from "./motor/rutas.mjs";
import { escribirReporte, resumirVisita } from "./motor/reporte.mjs";
import { abrirContexto, exigirLocal } from "./motor/sesion.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ESCANER = readFileSync(join(AQUI, "motor", "escaner-en-pagina.js"), "utf8");

function leerArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const siguiente = argv[i + 1];
    if (siguiente === undefined || siguiente.startsWith("--")) {
      a[k] = true;
    } else {
      a[k] = siguiente;
      i++;
    }
  }
  return a;
}
const lista = (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
const slug = (s) => s.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "inicio";

const args = leerArgs(process.argv.slice(2));
const baseUrl = (args["base-url"] || process.env.TEMA_BASE_URL || "http://localhost:3010").replace(/\/$/, "");
const ancho = Number(args.ancho || 1440);
const alto = Number(args.alto || 900);
const esperaMs = Number(args.espera || 1800);
const { estaticas, dinamicas } = inventarioDeRutas();

if (args.listar) {
  console.log(`Cuentas:\n${CUENTAS.map((c) => `  ${c.clave.padEnd(24)} ${c.descripcion}`).join("\n")}`);
  console.log(`\nRutas estáticas (${estaticas.length}):\n  ${estaticas.join("\n  ")}`);
  console.log(`\nRutas dinámicas (${dinamicas.length}, solo por escenario):\n  ${dinamicas.join("\n  ")}`);
  console.log(`\nEscenarios:\n${ESCENARIOS.map((e) => `  ${e.id.padEnd(24)} ${e.ruta}  ${e.nombre}`).join("\n")}`);
  process.exit(0);
}

exigirLocal(baseUrl);
// ¿El servidor de esa URL es el de ESTA obra? Con varias sesiones corriendo `next dev` en puertos vecinos, auditar el de otra
// worktree da un «0 hallazgos» que no vale nada. Si su HTML no trae el script del tema, no tiene el modo oscuro.
try {
  const html = await (await fetch(`${baseUrl}/login`, { redirect: "follow" })).text();
  if (!html.includes("cayla-tema")) {
    console.error(`El servidor de ${baseUrl} no trae el modo oscuro (su HTML no tiene el script del tema): ¿es el de otra worktree?\nLevanta el de esta con \`pnpm --filter web dev\` y pasa su puerto con --base-url o TEMA_BASE_URL.`);
    process.exit(2);
  }
} catch (e) {
  console.error(`No se pudo hablar con ${baseUrl}: ${e.message}. ¿Está levantado el \`next dev\`? (--base-url o TEMA_BASE_URL)`);
  process.exit(2);
}
const cuentas = args.cuenta === "todas" ? CUENTAS : lista(args.cuenta || "admin").map((c) => porClave(c) ?? (console.error(`No existe la cuenta «${c}». Con --listar se ven.`), process.exit(2)));
let rutas = lista(args.ruta);
if (args.modulo) rutas.push(...estaticas.filter((r) => lista(args.modulo).includes(moduloDeRuta(r))));
if (args.todas) rutas = [...estaticas];
if (!rutas.length && !args.escenario) rutas = ["/"];
rutas = [...new Set(rutas)];

const cuando = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
const dirSalida = args.salida || join(AQUI, ".salida", `${cuando.slice(0, 8)}-${cuando.slice(8)}`);

/** Lo que se visita: cada ruta, y sus escenarios si se pidieron. */
function visitasDe(cuenta) {
  // «/» es el INICIO de la cuenta: para la terminal de ventas es Vender. `logica` es la ruta con la que se buscan los escenarios.
  const casa = (r) => (r === "/" ? inicioDe(cuenta) : r);
  const v = rutas.map((ruta) => ({ ruta: casa(ruta), logica: ruta, titulo: casa(ruta), escenario: null }));
  if (args.escenarios || args.escenario) {
    const candidatas = new Set([...rutas, ...(args.escenario ? ESCENARIOS.filter((e) => e.id === args.escenario).map((e) => e.ruta) : [])]);
    for (const ruta of candidatas) {
      for (const e of escenariosDe(ruta, cuenta.clave, ancho < 700)) if (!args.escenario || e.id === args.escenario) v.push({ ruta: casa(ruta), logica: ruta, titulo: `${casa(ruta)} · ${e.nombre}`, escenario: e });
    }
  }
  return args.escenario ? v.filter((x) => x.escenario?.id === args.escenario) : v;
}

async function visitar(ctx, cuenta, visita, tema) {
  const pagina = await ctx.newPage();
  const errores = [];
  pagina.on("console", (m) => m.type() === "error" && !/favicon|Failed to load resource/.test(m.text()) && errores.push(m.text().slice(0, 200)));
  pagina.on("pageerror", (e) => errores.push("pageerror: " + String(e).slice(0, 200)));
  const res = { tema, estado: "ok", errores };
  try {
    await pagina.goto(baseUrl + visita.ruta, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
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
      } catch (e) {
        res.estado = `el escenario falló: ${String(e.message).split("\n")[0].slice(0, 100)}`;
        return res;
      }
    }
    await pagina.addScriptTag({ content: ESCANER });
    Object.assign(res, await pagina.evaluate(() => window.__temaEscanear()));
    if (tema === "oscuro" || args["capturas-claro"]) {
      const archivo = join("capturas", cuenta.clave, `${slug(visita.escenario ? `${visita.ruta}-${visita.escenario.id}` : visita.ruta)}.${tema}.png`);
      // Una ruta se captura con una ventana TAN ALTA como la página (tope 4000 px): el modo `fullPage` de Playwright desacomoda el
      // lateral fijo. Un escenario (modal, lista abierta) se captura con el viewport normal: redimensionar podría cerrarlo o moverlo.
      if (!visita.escenario) {
        const altoPagina = await pagina.evaluate(() => document.documentElement.scrollHeight);
        await pagina.setViewportSize({ width: ancho, height: Math.min(Math.max(altoPagina, alto), 4000) });
        await pagina.waitForTimeout(500);
      }
      await pagina.screenshot({ path: join(dirSalida, archivo) });
      res.captura = archivo;
    }
  } finally {
    await pagina.close();
  }
  return res;
}

const navegador = await chromium.launch({ headless: true });
const visitas = [];
try {
  for (const cuenta of cuentas) {
    const lote = visitasDe(cuenta);
    if (!lote.length) continue;
    const porTema = {};
    for (const tema of args["sin-claro"] ? ["oscuro"] : ["claro", "oscuro"]) {
      const ctx = await abrirContexto(navegador, cuenta, { baseUrl, tema, viewport: { width: ancho, height: alto } });
      porTema[tema] = [];
      for (const v of lote) {
        process.stdout.write(`  ${cuenta.clave} · ${tema} · ${v.titulo}\n`);
        porTema[tema].push(await visitar(ctx, cuenta, v, tema));
      }
      await ctx.close();
    }
    lote.forEach((v, i) => {
      const oscuro = porTema.oscuro[i];
      const claro = porTema.claro?.[i];
      visitas.push({ cuenta: cuenta.clave, titulo: v.titulo, ruta: v.ruta, estado: oscuro.estado, errores: oscuro.errores, captura: oscuro.captura, oscuro, claro: claro?.estado === "ok" ? claro : undefined });
    });
  }
} catch (e) {
  console.error("\nLa auditoría se cayó:", e.message);
  await navegador.close();
  process.exit(2);
}
await navegador.close();

const { hallazgos, md } = escribirReporte(dirSalida, visitas, { cuando: new Date().toLocaleString("es-PE"), baseUrl, ancho, alto });
const sinAcceso = visitas.filter((v) => v.estado !== "ok").length;
const tot = visitas.filter((v) => v.estado === "ok").reduce((a, v) => { const r = resumirVisita(v); a.he += r.heredados.length; a.so += r.soloOscuro.length; return a; }, { he: 0, so: 0 });
console.log(`\n${md.split("\n").filter((l) => l.startsWith("|") || l.startsWith("Base:")).join("\n")}`);
console.log(`\n${visitas.length} visitas (${sinAcceso} sin acceso o sin cargar) · ${hallazgos} hallazgos SOLO en oscuro · ${tot.he} heredados del claro`);
console.log(`Reporte y capturas: ${dirSalida}`);
process.exit(hallazgos > 0 ? 1 : 0);
