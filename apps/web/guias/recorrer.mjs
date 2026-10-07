#!/usr/bin/env node
/**
 * El recorredor de las guías interactivas (ADR-0362): corre cada guía en un navegador de verdad contra el ERP LOCAL, como lo
 * haría una persona, y comprueba lo que la prueba del CI no puede ver:
 *   · que cada paso encuentra su pieza VISIBLE (un paso no opcional que dice «no está a la vista» es una guía rota);
 *   · que la demo NUNCA escribe en la base: vigila la red y falla si sale una escritura (POST/PATCH/DELETE a una tabla, o una
 *     RPC que no es de lectura) mientras la guía corre — salvo `marcar_guia_vista`, que es la propia guía anotando que se vio;
 *   · que al terminar no queda ningún modal abierto ni la pantalla en otra ruta;
 *   · y saca una captura por paso, para MIRARLAS (en claro u oscuro, escritorio o 375 px).
 *
 *   pnpm --filter web guias:recorrer                                   ← todas las guías, cuenta admin, 1440×900, claro
 *   pnpm --filter web guias:recorrer -- --guia vender,vender.historial --cuenta integrante --ancho 375 --alto 812 --tema oscuro
 *
 * Opciones: --base-url (por defecto $TEMA_BASE_URL o http://localhost:3010), --cuenta (claves de tema/cuentas.mjs), --guia,
 * --ancho, --alto, --tema claro|oscuro, --salida <dir>, --sin-capturas. Sale con 1 si una guía falla, con 2 si el script se cayó.
 * Solo corre contra localhost (las cuentas y claves son del seed local).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { porClave } from "../tema/cuentas.mjs";
import { abrirContexto, exigirLocal } from "../tema/motor/sesion.mjs";
import { guiasDeLosArchivos } from "./escaner.mjs";
import { EJEMPLOS } from "./ejemplos.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith("--")) args[a.slice(2)] = true;
  else (args[a.slice(2)] = v), i++;
}
const baseUrl = (args["base-url"] || process.env.TEMA_BASE_URL || "http://localhost:3010").replace(/\/$/, "");
const origen = exigirLocal(baseUrl);
const cuenta = porClave(args.cuenta || "admin");
if (!cuenta) {
  console.error(`No existe la cuenta «${args.cuenta}» (tema/cuentas.mjs).`);
  process.exit(2);
}
const viewport = { width: Number(args.ancho || 1440), height: Number(args.alto || 900) };
const tema = args.tema === "oscuro" ? "oscuro" : "claro";
const elegidas = typeof args.guia === "string" ? args.guia.split(",") : null;
const guias = guiasDeLosArchivos().filter((g) => !elegidas || elegidas.includes(g.id));
const salida = args.salida || join(AQUI, ".salida", new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12));
const conCapturas = !args["sin-capturas"];
if (conCapturas) mkdirSync(salida, { recursive: true });

/** ¿Esta petición escribe en la base? Lectura = GET/HEAD, o una RPC con prefijo de lectura (lib/espera-reglas.ts). */
function escribe(req) {
  const url = new URL(req.url());
  if (!url.pathname.includes("/rest/v1/")) return false;
  const metodo = req.method();
  if (metodo === "GET" || metodo === "HEAD" || metodo === "OPTIONS") return false;
  const rpc = url.pathname.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/);
  if (rpc) {
    const fn = rpc[1];
    if (fn === "marcar_guia_vista") return false; // la guía anotando que se vio: es lo único que la demo escribe
    return !/^(fn_|previsualizar_|campanas_|resumen_|buscar_|get_)/.test(fn);
  }
  return true;
}

const navegador = await chromium.launch();
let fallas = 0;
try {
  // Un contexto por cuenta (Producción se ve parado en el Taller, Global con su vista): se abren a medida que hacen falta.
  const contextos = new Map();
  const contextoDe = async (clave) => {
    if (!contextos.has(clave)) contextos.set(clave, await abrirContexto(navegador, porClave(clave), { baseUrl, tema, viewport }));
    return contextos.get(clave);
  };
  for (const g of guias) {
    const ejemplo = EJEMPLOS[g.ruta] ?? {};
    const ctx = await contextoDe(args.cuenta ? cuenta.clave : (ejemplo.cuenta ?? cuenta.clave));
    let destino = g.ruta.replace(/\/\([^)]*\)/g, "");
    try {
      if (ejemplo.url) destino = ejemplo.url();
    } catch (e) {
      console.log(`✗ ${g.id}: ${e.message}`);
      fallas++;
      continue;
    }
    const page = await ctx.newPage();
    const escrituras = [];
    page.on("request", (req) => {
      if (escribe(req)) escrituras.push(`${req.method()} ${new URL(req.url()).pathname}`);
    });
    const problemas = [];
    const pasos = [];
    await page.goto(`${origen}${destino}?demo=1`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForSelector(".guia-tarjeta h2", { timeout: 15_000 });
    } catch {
      console.log(`✗ ${g.id}: la guía no arrancó con ?demo=1 (¿la cuenta ve ${g.ruta}?)`);
      fallas++;
      await page.close();
      continue;
    }
    for (let n = 0; n < 60; n++) {
      await page.waitForTimeout(n === 0 ? 900 : 2300);
      const estado = await page.evaluate(() => {
        const t = document.querySelector(".guia-tarjeta");
        if (!t) return null;
        const r = document.querySelector(".guia-recorte");
        return {
          titulo: t.querySelector("h2")?.textContent ?? "",
          nota: t.querySelector(".nota-cayla")?.textContent ?? null,
          sinPieza: r?.hasAttribute("data-sin-pieza") ?? true,
          alto: r ? parseFloat(r.style.height || "0") : 0,
        };
      });
      if (!estado) break;
      pasos.push(estado);
      if (estado.nota?.includes("Esta parte no está a la vista")) problemas.push(`«${estado.titulo}»: su pieza no apareció`);
      else if (estado.nota?.includes("no pudo hacer este paso")) problemas.push(`«${estado.titulo}»: ${estado.nota}`);
      if (!estado.sinPieza && estado.alto < 4) problemas.push(`«${estado.titulo}»: el recorte quedó sin alto (la pieza está fuera de la vista)`);
      if (conCapturas) await page.screenshot({ path: join(salida, `${g.id}-${String(n + 1).padStart(2, "0")}.png`) });
      await page.keyboard.press("ArrowRight");
    }
    await page.waitForTimeout(1200);
    const quedo = await page.evaluate(() => ({
      modales: [...document.querySelectorAll("[role=dialog]")].filter((d) => !d.closest("[data-guia-motor]")).length,
      ruta: location.pathname,
      guia: !!document.querySelector(".guia-tarjeta"),
    }));
    if (quedo.guia) problemas.push("la guía no terminó tras 60 pasos");
    if (quedo.modales > 0) problemas.push(`quedaron ${quedo.modales} modal(es) abiertos al terminar`);
    if (quedo.ruta !== destino) problemas.push(`terminó en otra ruta (${quedo.ruta})`);
    if (escrituras.length) problemas.push(`ESCRIBIÓ EN LA BASE durante la demo: ${escrituras.join(", ")}`);
    if (problemas.length) fallas++;
    console.log(`${problemas.length ? "✗" : "✓"} ${g.id} (${g.ruta}): ${pasos.length} pasos${problemas.length ? `\n    · ${problemas.join("\n    · ")}` : ""}`);
    await page.close();
  }
  for (const c of contextos.values()) await c.close();
} catch (e) {
  console.error(`El recorredor se cayó: ${e.message}`);
  await navegador.close();
  process.exit(2);
}
await navegador.close();
if (conCapturas) {
  writeFileSync(join(salida, "LEEME.txt"), `Capturas de cada paso (${cuenta.clave}, ${viewport.width}×${viewport.height}, ${tema}). Míralas: el recorredor no ve si el texto tapa algo.\n`);
  console.log(`\nCapturas en ${salida}`);
}
process.exit(fallas ? 1 : 0);
