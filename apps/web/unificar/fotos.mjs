#!/usr/bin/env node
/**
 * Fotos antes/después de una migración de `/unificar` (ADR-0358, paso 7): la misma pantalla, la misma cuenta y el mismo ancho, antes
 * de tocar el código y después, para que Felipe apruebe mirando y no leyendo un diff.
 *
 *   pnpm --filter web unificar:fotos -- --base-url http://localhost:3110 --salida unificar/.salida/fotos-antes
 *   pnpm --filter web unificar:fotos -- --base-url http://localhost:3110 --salida unificar/.salida/fotos-despues
 *   pnpm --filter web unificar:fotos -- --comparar unificar/.salida/fotos-antes unificar/.salida/fotos-despues
 *
 * Opciones
 *   --rutas <a,b>   en vez del juego de siempre (RUTAS, abajo)     --cuenta <clave>   de tema/cuentas.mjs (por defecto admin)
 *   --espera <ms>   tras cargar (por defecto 1800)                 --comparar <antes> <despues>   arma comparar.html en <despues>
 *   --marcar        antes de fotografiar, dibuja un recuadro numerado sobre cada pieza que cambió (Volver, pestaña de vista,
 *                   segmento de modo, tarjeta de cifra) y guarda dónde está (<foto>.marcas.json): la comparación lo dice en palabras
 * Solo corre contra localhost (las cuentas son del seed local). Pantalla completa hasta 4000 px de alto; el celular, a 375 × 812.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { porClave } from "../tema/cuentas.mjs";
import { moduloDeRuta } from "../tema/motor/rutas.mjs";
import { abrirContexto, exigirLocal } from "../tema/motor/sesion.mjs";

/** El juego de pantallas de siempre: al menos una por módulo, y las que más piezas comparten. `celular` = también a 375 px (PL-105). */
export const RUTAS = [
  { ruta: "/", nombre: "Inicio" },
  { ruta: "/inventario", nombre: "Existencias" },
  { ruta: "/inventario/resumen", nombre: "Análisis" },
  { ruta: "/inventario/frescura", nombre: "Frescura del piso" },
  { ruta: "/inventario/traslados", nombre: "Traslados" },
  { ruta: "/inventario/movimientos", nombre: "Movimientos" },
  { ruta: "/inventario/bajar", nombre: "Bajar prendas al piso" },
  { ruta: "/inventario/conteo", nombre: "Conteos" },
  { ruta: "/inventario/por-regularizar", nombre: "Por regularizar" },
  { ruta: "/vender", nombre: "Vender", celular: true },
  { ruta: "/vender/comprobantes", nombre: "Comprobantes" },
  { ruta: "/vender/historial", nombre: "Historial de ventas" },
  { ruta: "/vender/apartados", nombre: "Apartados", celular: true },
  { ruta: "/cambios", nombre: "Cambios", celular: true },
  { ruta: "/devoluciones", nombre: "Devoluciones", celular: true },
  { ruta: "/caja", nombre: "Caja" },
  { ruta: "/caja/historial", nombre: "Historial de caja" },
  { ruta: "/clientas", nombre: "Clientes" },
  { ruta: "/clientas/avisos", nombre: "Avisos del club" },
  { ruta: "/compras", nombre: "Facturas de proveedor" },
  { ruta: "/compras/nueva", nombre: "Registrar factura" },
  { ruta: "/compras/por-pagar", nombre: "Por pagar" },
  { ruta: "/compras/notas-credito", nombre: "Notas de crédito" },
  { ruta: "/compras/proveedores", nombre: "Proveedores" },
  { ruta: "/recibir", nombre: "Recibir mercadería" },
  { ruta: "/productos", nombre: "Productos" },
  { ruta: "/productos/nuevo", nombre: "Nuevo producto" },
  { ruta: "/productos/familias", nombre: "Familias" },
  { ruta: "/comercial/calidad", nombre: "Calidad" },
  { ruta: "/rendimiento", nombre: "Rendimiento" },
  { ruta: "/produccion", nombre: "Producción" },
  { ruta: "/produccion/eficiencia", nombre: "Eficiencia del taller" },
  { ruta: "/actividad", nombre: "Actividad" },
  { ruta: "/colaboradores", nombre: "Colaboradores" },
  { ruta: "/configuracion", nombre: "Configuración" },
  { ruta: "/finanzas/dinero", nombre: "Cuentas y dinero" },
];

function leerArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--") continue;
    if (!argv[i].startsWith("--")) {
      a._.push(argv[i]);
      continue;
    }
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
const slug = (s) => s.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "inicio";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const args = leerArgs(process.argv.slice(2));

// Los mismos colores de las marcas, para la leyenda de la página de comparación (que no carga el CSS del ERP).
const MARCA_COLOR = { volver: "#b8412d", vista: "#4c5d6e", modo: "#a0681a", filtro: "#805c4c", cifra: "#48603f" };
const MARCA_NOMBRE = { volver: "La flecha para volver", vista: "Pestañas para cambiar de sección", modo: "Ver de otra forma u ordenar", filtro: "Filtro o período (píldora)", cifra: "Tarjeta de cifra" };

if (args.comparar) {
  const antes = resolve(String(args.comparar));
  const despues = resolve(args._[0] ?? "");
  if (!existsSync(antes) || !existsSync(despues)) {
    console.error("Uso: --comparar <carpeta-antes> <carpeta-despues>");
    process.exit(2);
  }
  const nombres = new Map(RUTAS.map((r) => [slug(r.ruta), r]));
  const fotos = readdirSync(despues).filter((f) => f.endsWith(".png"));
  const porModulo = new Map();
  for (const f of fotos) {
    const celular = f.endsWith(".375.png");
    const clave = f.replace(/(\.375)?\.png$/, "");
    const r = nombres.get(clave) ?? { ruta: `/${clave.replace(/-/g, "/")}`, nombre: clave };
    const mod = moduloDeRuta(r.ruta);
    if (!porModulo.has(mod)) porModulo.set(mod, []);
    porModulo.get(mod).push({ ...r, archivo: f, celular, hayAntes: existsSync(join(antes, f)) });
  }
  const rel = relative(despues, antes);
  const donde = (m, ancho) => {
    const cx = m.x + m.w / 2;
    const lado = cx < ancho * 0.36 ? "a la izquierda" : cx > ancho * 0.64 ? "a la derecha" : "al centro";
    const alto = m.y < 300 ? "arriba" : m.y < 900 ? "en el medio de la pantalla" : "más abajo (hay que bajar)";
    return `${alto}, ${lado}`;
  };
  const leyenda = (f) => {
    const ruta = join(despues, f.archivo.replace(/\.png$/, ".marcas.json"));
    if (!existsSync(ruta)) return "";
    const { ancho, marcas } = JSON.parse(readFileSync(ruta, "utf8"));
    if (!marcas.length) return `<p class="sin-marcas">En esta pantalla no hay ninguna de las piezas que cambiaron.</p>`;
    return `<ol class="marcas">${marcas.map((m) => `<li><span class="num" style="background:${MARCA_COLOR[m.tipo]}">${m.n}</span> <b>${esc(MARCA_NOMBRE[m.tipo])}</b> — ${donde(m, ancho)}</li>`).join("")}</ol>`;
  };
  const secciones = [...porModulo.entries()]
    .map(
      ([mod, fs]) => `<section><h2>${esc(mod)}</h2>${fs
        .sort((a, b) => a.ruta.localeCompare(b.ruta) || Number(a.celular) - Number(b.celular))
        .map(
          (f) => `<article><h3>${esc(f.nombre)} <code>${esc(f.ruta)}</code>${f.celular ? " · 375 px" : ""}</h3><div class="par${f.celular ? " cel" : ""}"><figure><figcaption>Antes</figcaption>${f.hayAntes ? `<a href="${esc(rel)}/${esc(f.archivo)}" target="_blank"><img src="${esc(rel)}/${esc(f.archivo)}" alt="Antes: ${esc(f.nombre)}"></a>` : "<p>sin foto de antes</p>"}</figure><figure><figcaption>Después (lo que cambió, con su número)</figcaption><a href="${esc(f.archivo)}" target="_blank"><img src="${esc(f.archivo)}" alt="Después: ${esc(f.nombre)}"></a></figure></div>${leyenda(f)}</article>`,
        )
        .join("")}</section>`,
    )
    .join("");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unificar · antes y después</title>
<style>
:root { --fondo: #f5f0e8; --papel: #fbf8f2; --linea: #e8e0d0; --tinta: #1a1a18; --taupe: #805c4c; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --fondo: #1a1a18; --papel: #242422; --linea: #3d3c38; --tinta: #f5f0e8; --taupe: #c4a898; color-scheme: dark; } }
body { margin: 0; background: var(--fondo); color: var(--tinta); font: 15px/1.5 system-ui, sans-serif; }
main { max-width: 1600px; margin: 0 auto; padding: 24px 16px 80px; }
h1 { font: 500 40px/1.1 Georgia, serif; margin: 8px 0 4px; } h2 { font: 500 28px/1.2 Georgia, serif; margin: 40px 0 8px; text-transform: capitalize; }
h3 { font-size: 15px; margin: 18px 0 8px; } code { font-size: 12px; color: var(--taupe); }
.par { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .par.cel { grid-template-columns: repeat(2, minmax(0, 380px)); }
figure { margin: 0; background: var(--papel); border: 1px solid var(--linea); border-radius: 12px; padding: 8px; }
figcaption { font-size: 12px; color: var(--taupe); margin-bottom: 6px; } img { display: block; width: 100%; height: auto; border-radius: 6px; }
.marcas { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
.marcas .num { display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px; color: #fff; font-weight: 700; font-size: 12px; }
.sin-marcas { color: var(--taupe); font-size: 13px; margin: 8px 0 0; }
.ley { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 10px 0 0; padding: 0; list-style: none; font-size: 14px; }
.ley span { display: inline-block; width: 14px; height: 14px; border-radius: 4px; vertical-align: -2px; margin-right: 6px; }
@media (max-width: 760px) { .par, .par.cel { grid-template-columns: 1fr; } }
</style></head><body><main><p><code>/unificar · ADR-0358</code></p><h1>Antes y después</h1>
<p>La misma pantalla, la misma cuenta (Admin) y el mismo ancho (1440 × 900; las de mostrador también a 375 px). Toca una foto para verla grande. En la foto de «Después», cada pieza de las familias que unificaste lleva un recuadro de color con su número, y debajo se dice dónde está. Las píldoras de filtro se marcan donde estén: en varias pantallas ya eran píldoras (no cambiaron) y en otras antes eran pestañas o una pista (Compras, Movimientos, Caja, Cambios, Devoluciones, Comprobantes, Historial de ventas, Rendimiento).</p><ul class="ley">${Object.keys(MARCA_COLOR).map((k) => `<li><span style="background:${MARCA_COLOR[k]}"></span>${esc(MARCA_NOMBRE[k])}</li>`).join("")}</ul>${secciones}</main></body></html>`;
  writeFileSync(join(despues, "comparar.html"), html);
  console.log(`Comparación: ${join(despues, "comparar.html")} (${fotos.length} fotos en ${porModulo.size} módulos)`);
  process.exit(0);
}

const baseUrl = String(args["base-url"] || process.env.UNIFICAR_BASE_URL || "http://localhost:3010").replace(/\/$/, "");
exigirLocal(baseUrl);
const salida = resolve(String(args.salida || "unificar/.salida/fotos"));
mkdirSync(salida, { recursive: true });
const cuenta = porClave(String(args.cuenta || "admin"));
if (!cuenta) {
  console.error(`No existe la cuenta «${args.cuenta}».`);
  process.exit(2);
}
const espera = Number(args.espera || 1800);
const pedidas = typeof args.rutas === "string" ? args.rutas.split(",").map((r) => ({ ruta: r.trim(), nombre: r.trim() })) : RUTAS;

const CENSO = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "motor", "censo-en-pagina.js"), "utf8");

/** Qué se marca y con qué color (solo tokens: la foto se toma en claro). */
export const MARCAS = {
  volver: { nombre: "La flecha para volver", color: "var(--color-rojo)" },
  vista: { nombre: "Pestañas para cambiar de sección", color: "var(--color-pizarra)" },
  modo: { nombre: "Ver de otra forma u ordenar", color: "var(--color-ambar)" },
  filtro: { nombre: "Filtro o período (píldora)", color: "var(--color-taupe)" },
  cifra: { nombre: "Tarjeta de cifra", color: "var(--color-verde)" },
};

/** Dibuja en la página un recuadro numerado sobre cada pieza que cambió y devuelve dónde quedó cada uno. */
async function marcar(p) {
  await p.addScriptTag({ content: CENSO });
  return p.evaluate((MARCAS) => {
    const res = window.__unificarCensar();
    const marcas = [];
    const vistos = new Set();
    const agregar = (el, tipo) => {
      if (!el || vistos.has(el)) return;
      if ([...vistos].some((v) => v.contains(el))) return;
      vistos.add(el);
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      marcas.push({ tipo, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
    };
    // Por clase, las piezas del sistema (lo que el detector podría no tomar):
    document.querySelectorAll(".pestanas-cayla").forEach((e) => agregar(e, "vista"));
    document.querySelectorAll(".segmento-cayla").forEach((e) => agregar(e, "modo"));
    // La vuelta: la pieza `Volver` (lleva `data-pieza="volver"`). No se busca por el texto: la × del Observatorio también dice «Volver».
    document.querySelectorAll('[data-pieza="volver"]').forEach((e) => {
      if (!e.closest("aside")) agregar(e, "volver");
    });
    // Una fila de píldoras se marca entera (su contenedor).
    const filas = new Set();
    document.querySelectorAll(".pildora-cayla").forEach((pl) => {
      if (pl.closest("aside")) return;
      const fila = pl.parentElement;
      if (fila && fila.querySelectorAll(":scope > .pildora-cayla, :scope > * > .pildora-cayla").length >= 2) filas.add(fila);
    });
    filas.forEach((f) => agregar(f, "filtro"));
    for (const i of res.instancias) {
      const el = document.querySelector(`[data-unificar-id="${i.uid}"]`);
      if (!el || el.closest("aside")) continue;
      // Solo la pieza elegida (`TarjetaCifra`: card-cayla con @container); las cifras decididas aparte (la cabecera, Caja) no cambiaron.
      if (i.familia === "cifra" && el.classList.contains("card-cayla") && el.classList.contains("@container")) agregar(el, "cifra");

    }
    marcas.sort((a, b) => a.y - b.y || a.x - b.x);
    marcas.forEach((m, n) => {
      const c = MARCAS[m.tipo].color;
      const caja = document.createElement("div");
      caja.setAttribute("data-marca-unificar", "");
      caja.style.cssText = `position:absolute;left:${m.x - 4}px;top:${m.y - 4}px;width:${m.w + 8}px;height:${m.h + 8}px;border:3px solid ${c};border-radius:10px;z-index:2147483646;pointer-events:none;box-sizing:border-box`;
      const num = document.createElement("div");
      num.textContent = String(n + 1);
      num.style.cssText = `position:absolute;left:-14px;top:-14px;min-width:24px;height:24px;padding:0 6px;border-radius:999px;background:${c};color:var(--color-crema);font:700 13px/24px system-ui,sans-serif;text-align:center;box-sizing:border-box`;
      caja.appendChild(num);
      document.body.appendChild(caja);
      m.n = n + 1;
    });
    if (getComputedStyle(document.body).position === "static") document.body.style.position = "relative";
    return marcas;
  }, MARCAS);
}

async function fotografiar(ctx, r, ancho, alto, archivo) {
  const p = await ctx.newPage();
  try {
    const res = await p.goto(baseUrl + r.ruta, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => null);
    if (res && res.status() === 404) return "no existe";
    await p.evaluate(() => document.fonts?.ready);
    await p.waitForTimeout(espera);
    const final = new URL(p.url()).pathname.replace(/\/$/, "") || "/";
    if (final !== (r.ruta.replace(/\/$/, "") || "/")) return `redirige a ${final}`;
    const altoPagina = await p.evaluate(() => document.documentElement.scrollHeight);
    await p.setViewportSize({ width: ancho, height: Math.min(Math.max(altoPagina, alto), 4000) });
    await p.waitForTimeout(500);
    if (args.marcar) {
      const marcas = await marcar(p);
      writeFileSync(join(salida, archivo.replace(/\.png$/, ".marcas.json")), JSON.stringify({ ancho, marcas }, null, 1));
    }
    await p.screenshot({ path: join(salida, archivo), animations: "disabled" });
    return "ok";
  } finally {
    await p.close().catch(() => {});
  }
}

const navegador = await chromium.launch({ headless: true });
for (const [ancho, alto, sufijo, cuales] of [
  [1440, 900, "", pedidas],
  [375, 812, ".375", pedidas.filter((r) => r.celular)],
]) {
  if (!cuales.length) continue;
  const ctx = await abrirContexto(navegador, cuenta, { baseUrl, tema: "claro", viewport: { width: ancho, height: alto } });
  const SEDE = "cayla_ubicacion_activa";
  const sede = (await ctx.cookies()).find((c) => c.name === SEDE);
  for (const r of cuales) {
    if (sede) await ctx.addCookies([sede]);
    else await ctx.clearCookies({ name: SEDE });
    const estado = await fotografiar(ctx, r, ancho, alto, `${slug(r.ruta)}${sufijo}.png`).catch((e) => `falló: ${String(e.message).split("\n")[0].slice(0, 80)}`);
    console.log(`  ${r.ruta}${sufijo ? " · 375" : ""}: ${estado}`);
  }
  await ctx.close();
}
await navegador.close();
console.log(`Fotos: ${salida} (${basename(salida)})`);
