#!/usr/bin/env node
/**
 * El recorredor de las guías interactivas (ADR-0389): corre cada guía en un navegador de verdad contra el ERP LOCAL, como lo
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
 * Con --cobertura, además mide en vivo cuántos controles de la pantalla (botones, campos, enlaces, pestañas a la vista en el
 * contenido, sin el lateral ni la cabecera del ERP) quedaron DENTRO de algún recorte encendido, y lista los que ninguna pieza
 * encendió: es dónde profundizar la guía. Escribe `cobertura.json` en la carpeta de salida.
 *
 * Con --ida-y-vuelta, cada guía se recorre tres veces con el teclado, como la persona que vuelve a mirar algo: → hasta el último
 * paso, ← hasta el primero y → otra vez hasta el último, donde termina. En cada paso anota el título, la nota de la tarjeta («no está
 * a la vista», «no pudo hacer este paso») y cuántas hojas hay abiertas, y la guía falla si un paso de la ida se salta al volver o en
 * la segunda ida, si dice una nota que en la ida no decía o si cambia la cantidad de hojas (`guias/ida-y-vuelta.mjs`). Las capturas
 * de esas pasadas van como `<guía>-vuelta-NN.png` y `<guía>-ida2-NN.png` (NN, el número del paso en la tarjeta).
 *
 * Opciones: --base-url (por defecto $TEMA_BASE_URL o http://localhost:3010), --cuenta (claves de tema/cuentas.mjs), --guia,
 * --ancho, --alto, --tema claro|oscuro, --salida <dir>, --sin-capturas, --cobertura, --ida-y-vuelta. Sale con 1 si una guía falla,
 * con 2 si el script se cayó.
 * Solo corre contra localhost (las cuentas y claves son del seed local).
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { porClave } from "../tema/cuentas.mjs";
import { abrirContexto, consultarLocal, exigirLocal } from "../tema/motor/sesion.mjs";
import { guiasDeLosArchivos } from "./escaner.mjs";
import { EJEMPLOS } from "./ejemplos.mjs";
import { compararIdaYVuelta, frasesDeDiferencias, mismoLugar } from "./ida-y-vuelta.mjs";

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
const idaYVuelta = !!args["ida-y-vuelta"];
if (conCapturas) mkdirSync(salida, { recursive: true });

/**
 * Los prefijos de las RPC de solo lectura, leídos de `lib/espera-reglas.ts` (la misma lista que usa el loader global): escritos aquí a
 * mano se quedaron atrás y una lectura (`ofertas_de_grupo_vigentes`) salía como «ESCRIBIÓ EN LA BASE».
 */
const PREFIJOS_LECTURA = (() => {
  const m = /PREFIJOS_RPC_DE_LECTURA = \[([^\]]+)\]/.exec(readFileSync(join(AQUI, "..", "lib", "espera-reglas.ts"), "utf8"));
  const prefijos = m ? [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]) : [];
  if (!prefijos.length) throw new Error("No encontré PREFIJOS_RPC_DE_LECTURA en lib/espera-reglas.ts: el recorredor no sabría qué RPC solo leen.");
  return prefijos;
})();

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
    return !PREFIJOS_LECTURA.some((p) => fn.startsWith(p));
  }
  return true;
}

// Como el auditor de tema (`tema/cli.mjs`): `NAVEGADOR_CANAL=chrome` usa el Chrome del sistema cuando no está el Chromium de Playwright.
const navegador = await chromium.launch({ channel: process.env.NAVEGADOR_CANAL || undefined });
let fallas = 0;
const cobertura = [];

/**
 * Corre en la página: los controles visibles del contenido (sin lateral, cabecera ni la propia guía), con una clave estable y si
 * su centro cae dentro del recorte encendido ahora.
 */
function controlesALaVista() {
  const r = document.querySelector(".guia-recorte");
  const caja = r && !r.hasAttribute("data-sin-pieza") ? { x: parseFloat(r.style.left), y: parseFloat(r.style.top), w: parseFloat(r.style.width), h: parseFloat(r.style.height) } : null;
  const fuera = (el) => el.closest("[data-guia-motor], aside.fixed, header, nav[aria-label='Menú'], .guia-oferta");
  const salida = [];
  for (const el of document.querySelectorAll("button, a[href], input:not([type=hidden]), textarea, select, [role=tab], [role=switch], [role=combobox]")) {
    if (fuera(el)) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 4 || b.height < 4) continue; // también lo que está más abajo: la pantalla entera cuenta
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || st.display === "none") continue;
    const nombre = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || el.getAttribute("title") || el.tagName).replace(/\s+/g, " ").trim().slice(0, 60);
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    const dentro = !!caja && cx >= caja.x && cx <= caja.x + caja.w && cy >= caja.y && cy <= caja.y + caja.h;
    salida.push({ clave: `${el.tagName}|${nombre}`, nombre: `${el.tagName.toLowerCase()} «${nombre}»`, dentro });
  }
  return salida;
}
/**
 * Que el piloto termine lo que está haciendo (preparar, cursor, escribir) antes de mirar el paso: la tarjeta deja de estar «ocupada»
 * y el cursor fantasma se esconde. Tope de 12 s por paso; después, un respiro para la animación.
 */
async function esperarAlPiloto(page, primero) {
  await page.waitForTimeout(primero ? 900 : 700);
  await page
    .waitForFunction(
      () => !document.querySelector(".guia-tarjeta[data-ocupada]") && !document.querySelector(".guia-tarjeta[data-piloto]") && !document.querySelector(".guia-cursor[data-visible]"),
      null,
      { timeout: 12_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(primero ? 0 : 1200);
}

/** Corre en la página: lo que muestra la tarjeta de la guía ahora, o `null` si la guía ya se cerró. */
function pasoALaVista() {
  const t = document.querySelector(".guia-tarjeta");
  if (!t) return null;
  const r = document.querySelector(".guia-recorte");
  return {
    titulo: t.querySelector("h2")?.textContent ?? "",
    nota: t.querySelector(".nota-cayla")?.textContent ?? null,
    sinPieza: r?.hasAttribute("data-sin-pieza") ?? true,
    alto: r ? parseFloat(r.style.height || "0") : 0,
    // «3 de 12»: cuántos pasos lleva vistos la persona (al volver, baja).
    numero: Number(/^(\d+)/.exec(t.querySelector("p[aria-live]")?.textContent?.trim() ?? "")?.[1] ?? 0),
    ultimo: t.querySelector("[data-guia-siguiente]")?.textContent?.trim() === "Terminar",
    ocupada: t.hasAttribute("data-ocupada") || t.hasAttribute("data-piloto"),
    hojas: [...document.querySelectorAll("[role=dialog]")].filter((d) => !d.closest("[data-guia-motor]")).length,
  };
}

/**
 * Aprieta `tecla` (→ o ←) y espera a que la tarjeta cambie de paso. Mientras el motor busca el paso que sigue (prueba y descarta los
 * opcionales, abre una hoja) la tarjeta queda «ocupada» en el paso de antes, a veces casi un minuto: se espera sin volver a apretar,
 * porque una tecla de más cuando ya se liberó saltaría un paso. Si la tarjeta se liberó sin moverse, la tecla no llegó y se aprieta
 * otra vez (hasta 3). Devuelve el paso nuevo, el mismo si no se movió, o `null` si la guía se cerró.
 */
async function moverse(page, tecla, previo) {
  let estado = previo;
  for (let intento = 0; intento < 3 && mismoLugar(estado, previo); intento++) {
    await page.keyboard.press(tecla);
    // Hasta 8 esperas (unos 2 minutos) mientras siga ocupada en el mismo paso.
    for (let espera = 0; espera < 8; espera++) {
      await esperarAlPiloto(page, false);
      estado = await page.evaluate(pasoALaVista);
      if (!mismoLugar(estado, previo) || !estado.ocupada) break;
    }
  }
  return estado;
}

/**
 * Una pasada de `--ida-y-vuelta`: aprieta `tecla` desde el paso `desde` hasta que `llego` (el primero o el último). Devuelve los
 * pasos vistos y, si no llegó, por qué.
 */
async function pasada(page, { tecla, desde, llego, nombre }) {
  const vistos = [];
  let previo = desde;
  for (let n = 0; n < 60; n++) {
    const estado = await moverse(page, tecla, previo);
    if (!estado) return { vistos, corte: `la guía se cerró después de «${previo.titulo}»` };
    if (mismoLugar(estado, previo)) return { vistos, corte: `no pasó del paso ${estado.numero} «${estado.titulo}»` };
    vistos.push(estado);
    if (conCapturas) await page.screenshot({ path: join(salida, `${nombre}-${String(estado.numero).padStart(2, "0")}.png`) });
    if (llego(estado)) return { vistos, corte: null };
    previo = estado;
  }
  return { vistos, corte: "no llegó en 60 pasos" };
}

/** La vuelta y la segunda ida, desde el último paso de la ida. Lo que no coincide va a `problemas` (falla) o a `avisos`. */
async function vueltaYSegundaIda(page, id, ida, problemas, avisos) {
  const vuelta = await pasada(page, { tecla: "ArrowLeft", desde: ida.at(-1), llego: (e) => e.numero === 1, nombre: `${id}-vuelta` });
  if (vuelta.corte) return void problemas.push(`al volver ${vuelta.corte}: no llegó al primer paso`);
  const ida2 = await pasada(page, { tecla: "ArrowRight", desde: vuelta.vistos.at(-1), llego: (e) => e.ultimo, nombre: `${id}-ida2` });
  if (ida2.corte) problemas.push(`en la segunda ida ${ida2.corte}: no llegó al último paso`);
  const frases = frasesDeDiferencias(compararIdaYVuelta({ ida, vuelta: vuelta.vistos, ida2: ida2.corte ? null : ida2.vistos }));
  problemas.push(...frases.fallas);
  avisos.push(...frases.avisos);
}

let sinDatos = 0;
try {
  // Un contexto por cuenta (Producción se ve parado en el Taller, Global con su vista): se abren a medida que hacen falta.
  const contextos = new Map();
  const contextoDe = async (clave) => {
    if (!contextos.has(clave)) contextos.set(clave, await abrirContexto(navegador, porClave(clave), { baseUrl, tema, viewport }));
    return contextos.get(clave);
  };
  for (const g of guias) {
    const ejemplo = EJEMPLOS[g.ruta] ?? {};
    if (ejemplo.sinDatos) {
      const motivo = consultarLocal(ejemplo.sinDatos);
      if (motivo) {
        console.log(`⚠ ${g.id}: sin datos locales para recorrerla — ${motivo}. La guía está escrita; recórrela cuando los haya.`);
        sinDatos++;
        continue;
      }
    }
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
    // El ejemplo puede traer parámetros (`/buscar?q=blusa`): `demo=1` se suma a los que ya trae.
    // `next dev` compila cada pantalla la primera vez que se visita (a veces más de 30 s): tope de 2 minutos y un reintento.
    const url = `${origen}${destino}${destino.includes("?") ? "&" : "?"}demo=1`;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    } catch {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    }
    const iluminados = new Set();
    let base = null;
    try {
      await page.waitForSelector(".guia-tarjeta h2", { timeout: 60_000 });
    } catch {
      console.log(`✗ ${g.id}: la guía no arrancó con ?demo=1 (¿la cuenta ve ${g.ruta}?)`);
      fallas++;
      await page.close();
      continue;
    }
    const avisos = [];
    let volvio = false;
    let trabada = false;
    let estado = null;
    for (let n = 0; n < 60; n++) {
      if (n === 0) {
        await esperarAlPiloto(page, true);
        estado = await page.evaluate(pasoALaVista);
      } else {
        const previo = estado;
        estado = await moverse(page, "ArrowRight", previo);
        if (mismoLugar(estado, previo)) {
          problemas.push(`no pasó del paso ${estado.numero} «${estado.titulo}»: la tarjeta no se movió con →`);
          trabada = true;
          break;
        }
      }
      if (!estado) break;
      pasos.push(estado);
      if (args.cobertura) {
        const vistos = await page.evaluate(controlesALaVista);
        if (!base) base = new Map();
        for (const c of vistos) base.set(c.clave, c.nombre); // toda la pantalla, más lo que va apareciendo (modales, pestañas)
        for (const c of vistos) if (c.dentro) iluminados.add(c.clave);
      }
      if (estado.nota?.includes("Esta parte no está a la vista")) problemas.push(`«${estado.titulo}»: su pieza no apareció`);
      else if (estado.nota?.includes("no pudo hacer este paso")) problemas.push(`«${estado.titulo}»: ${estado.nota}`);
      // La guía le pidió al piloto tocar algo que guarda: el motor se negó (bien), pero el paso que dependía de ese toque quedó
      // vacío. La guía tiene que explicar ese botón sin pedir el toque.
      else if (estado.nota?.includes("hace algo de verdad")) problemas.push(`«${estado.titulo}»: la guía intenta tocar un botón que guarda (el motor se negó)`);
      if (!estado.sinPieza && estado.alto < 4) problemas.push(`«${estado.titulo}»: el recorte quedó sin alto (la pieza está fuera de la vista)`);
      if (conCapturas) await page.screenshot({ path: join(salida, `${g.id}-${String(n + 1).padStart(2, "0")}.png`) });
      // Con --ida-y-vuelta, la vuelta arranca desde el último paso: no se termina todavía.
      if (idaYVuelta && estado.ultimo && pasos.length > 1) {
        await vueltaYSegundaIda(page, g.id, pasos, problemas, avisos);
        volvio = true;
        break;
      }
    }
    // La guía sigue abierta si la ida y vuelta terminó (o se cortó) o si la ida se trabó: se cierra con «Terminar» desde el último
    // paso, si no con Esc, para que lo de abajo mire la pantalla como la deja la guía.
    const abierta = await page.evaluate(pasoALaVista);
    if (abierta && (volvio || trabada)) {
      const cerrada = abierta.ultimo && !(await moverse(page, "ArrowRight", abierta));
      if (!cerrada) {
        await page.keyboard.press("Escape");
        await esperarAlPiloto(page, false);
      }
    }
    await page.waitForTimeout(1200);
    const quedo = await page.evaluate(() => ({
      modales: [...document.querySelectorAll("[role=dialog]")].filter((d) => !d.closest("[data-guia-motor]")).length,
      titulos: [...document.querySelectorAll("[role=dialog]")].filter((d) => !d.closest("[data-guia-motor]")).map((d) => (d.getAttribute("aria-label") || d.querySelector("h2,h3")?.textContent || "").trim().slice(0, 40)),
      ruta: location.pathname,
      guia: !!document.querySelector(".guia-tarjeta"),
    }));
    if (quedo.guia && !trabada) problemas.push("la guía no terminó tras 60 pasos");
    // Sin un último paso a la vista («Terminar»), la vuelta no corrió: se dice, para que no pase en verde sin haber vuelto.
    if (idaYVuelta && !volvio && pasos.length > 1) problemas.push("la ida y vuelta no corrió: la ida nunca mostró «Terminar»");
    if (pasos.length < 2) problemas.push(`la guía se cortó al empezar (${pasos.length} paso${pasos.length === 1 ? "" : "s"}): ¿la página se recargó?`);
    if (quedo.modales > 0) problemas.push(`quedaron ${quedo.modales} modal(es) abiertos al terminar (${quedo.titulos.join(" · ")})`);
    if (quedo.ruta !== destino.split("?")[0]) problemas.push(`terminó en otra ruta (${quedo.ruta})`);
    if (escrituras.length) problemas.push(`ESCRIBIÓ EN LA BASE durante la demo: ${escrituras.join(", ")}`);
    if (problemas.length) fallas++;
    if (args.cobertura && base) {
      const total = base.size;
      const si = [...base.keys()].filter((k) => iluminados.has(k)).length;
      const faltan = [...base.entries()].filter(([k]) => !iluminados.has(k)).map(([, n]) => n);
      cobertura.push({ guia: g.id, ruta: g.ruta, total, encendidos: si, porcentaje: total ? Math.round((100 * si) / total) : 100, sinEncender: faltan });
      console.log(`    cobertura: ${si}/${total} controles a la vista encendidos (${total ? Math.round((100 * si) / total) : 100} %)`);
    }
    const lineas = [...problemas, ...avisos.map((a) => `⚠ ${a}`)];
    console.log(`${problemas.length ? "✗" : "✓"} ${g.id} (${g.ruta}): ${pasos.length} pasos${idaYVuelta ? ", ida y vuelta" : ""}${lineas.length ? `\n    · ${lineas.join("\n    · ")}` : ""}`);
    await page.close();
  }
  for (const c of contextos.values()) await c.close();
} catch (e) {
  console.error(`El recorredor se cayó: ${e.message}`);
  await navegador.close();
  process.exit(2);
}
await navegador.close();
if (args.cobertura) {
  mkdirSync(salida, { recursive: true });
  writeFileSync(join(salida, "cobertura.json"), JSON.stringify(cobertura, null, 2));
  console.log(`\nCobertura en ${join(salida, "cobertura.json")}`);
}
if (conCapturas) {
  writeFileSync(join(salida, "LEEME.txt"), `Capturas de cada paso (${cuenta.clave}, ${viewport.width}×${viewport.height}, ${tema}). Míralas: el recorredor no ve si el texto tapa algo.\n`);
  console.log(`\nCapturas en ${salida}`);
}
process.exit(fallas ? 1 : 0);
