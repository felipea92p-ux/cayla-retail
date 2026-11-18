#!/usr/bin/env node
// La evaluación de TAREAS de «Pregúntale a CAYLA» (ADR-0536, «Acompañar una tarea»). La de `evaluar.mjs` mide si la IA elige la pantalla;
// esta mide si el acompañante lleva a la persona de punta a punta: le pregunta cada pedido de `tareas.json` al ERP LOCAL y lo recorre en el
// navegador como lo haría una persona (escribe, toca lo que dice la orden, elige de una lista), hasta el primer paso que guarda, que NO
// toca: guardar lo hace la persona. Dice cuántas llegaron y, de las que no, en qué paso se trabaron y por qué.
//
//   pnpm --filter web asistente:tareas -- --base-url http://localhost:3012 [--solo vender,gasto] [--ancho 375] [--capturas <carpeta>]
//
// Solo local (`exigirLocal`), con las cuentas del seed y el asistente encendido en Tienda Lima. Cuesta ~US$0,05 y anota las preguntas en la
// base local. `--con-asistencia` crea por un momento la asistencia de Dynamic que la base local no tiene (`public.marcajes`, para que
// Cobrar se encienda) y la quita al terminar: es la base compartida, así que úsalo solo si nadie más la está usando. Sin eso, una tarea
// marcada `asistencia` se informa aparte, sin contarla mal. Sale con 1 si llegan menos que `--minimo` (por defecto 80 %).

import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto, exigirLocal } from "../../../tema/motor/sesion.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const { tareas } = JSON.parse(readFileSync(join(AQUI, "tareas.json"), "utf8"));

const args = process.argv.slice(2).filter((a) => a !== "--");
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : porDefecto;
};
const baseUrl = exigirLocal(opcion("base-url", process.env.TEMA_BASE_URL ?? "http://localhost:3010"));
const ancho = Number(opcion("ancho", "1440"));
const alto = ancho < 700 ? 812 : 900;
const minimo = Number(opcion("minimo", "80"));
const solo = opcion("solo", "")?.split(",").filter(Boolean) ?? [];
const capturas = opcion("capturas", "");
const conAsistencia = args.includes("--con-asistencia");
const elegidas = solo.length ? tareas.filter((t) => solo.includes(t.id)) : tareas;
if (capturas) mkdirSync(capturas, { recursive: true });

/** Lo que espera entre un toque y mirar de nuevo: el acompañante revisa cada 200 ms y un campo escrito pasa a los 1,6 s. */
const ESPERA_MS = 1800;
/** Cuántas vueltas sin cambiar de paso son «se trabó». */
const VUELTAS_SIN_AVANCE = 4;
const NO_TOCAR = /^\s*(Cancelar|Descartar|Cerrar|Volver|Eliminar|Desactivar|Anular)/i;
const PALABRAS_VACIAS = /^(la|el|los|las|una|uno|que|del|tú|con|para|por|lista|en|de|su|sus|tu|tus|y|o|al)$/i;

function sql(texto) {
  execFileSync("docker", ["exec", "-i", "supabase_db_cayla-retail", "psql", "-U", "postgres", "-q", "-v", "ON_ERROR_STOP=1"], { input: texto });
}
const ASISTENCIA_PON = `create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz, fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
grant select on public.marcajes, public.jornadas to authenticated, anon, service_role;
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca)
select c.persona_id, u.sede_dynamic_id, 'entrada', now() from retail.colaboradores c join public.personas p on p.id = c.persona_id
join retail.ubicaciones u on u.sede_dynamic_id = p.sede_base_id where u.nombre = 'Tienda Lima' and p.estado = 'activo' limit 2;`;
const ASISTENCIA_QUITA = "drop table if exists public.marcajes; drop table if exists public.jornadas;";

/** Un paso a mano, como una persona: lo que la orden nombra, una opción de la lista abierta o lo que hay que escribir. */
async function hacerPaso(p, paso, tarea, orden) {
  const ancla = p.locator(`[data-guia="${paso.ancla}"]:visible`).first();
  // Una lista abierta (los colores de un combo, quién atiende): la primera opción de verdad.
  const opcion = p.locator('[role="option"]:visible:not([aria-disabled="true"]):not([disabled])').filter({ hasNotText: /Crear|Ninguno|Todos/ }).first();
  if (await opcion.count()) return (await opcion.click({ timeout: 3000 }).then(() => true).catch(() => false)) ? "eligió de la lista" : null;
  if (!(await ancla.count())) return null;
  // Opciones para elegir dentro de la pieza (el motivo de una devolución): se toca la primera, antes de escribir en su nota.
  const opciones = ancla.locator("button[aria-pressed]:visible");
  if ((await opciones.count()) && !(await ancla.locator('button[aria-pressed="true"]').count())) {
    if (await opciones.first().click({ timeout: 3000 }).then(() => true).catch(() => false)) return "eligió una opción";
  }
  // Un campo de fecha u hora: una fecha válida (mañana al mediodía), como la pondría la persona.
  const fecha = ancla.locator('input[type="date"]:visible, input[type="datetime-local"]:visible, input[type="time"]:visible').first();
  if ((await fecha.count()) && !(await fecha.inputValue().catch(() => ""))) {
    const tipo = await fecha.getAttribute("type");
    const manana = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    const valor = tipo === "date" ? manana : tipo === "time" ? "12:00" : `${manana}T12:00`;
    if (await fecha.fill(valor, { timeout: 3000 }).then(() => true).catch(() => false)) return `puso la fecha ${valor}`;
  }
  // Un campo vacío: lo que la persona escribiría (el buscador, con el nombre; otro, con el número de la orden o una palabra).
  const campo = ancla.locator("input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([readonly]):not([disabled]):visible, textarea:visible").first();
  if (await campo.count()) {
    const valor = await campo.inputValue().catch(() => "");
    if (valor) return "espera (el campo ya tiene lo escrito)";
    if (/buscador/.test(paso.ancla) && paso.rellenar) return "espera (lo escribe CAYLA)";
    const numero = paso.orden.match(/\d+(?:[.,]\d+)?/)?.[0];
    const documento = /\bruc\b/i.test(paso.orden) ? "20123456789" : /\b(dni|documento|n[uú]mero)\b/i.test(paso.orden) ? "45678912" : null;
    const nombre = /\bnombre\b/i.test(orden) ? "Ana Prueba" : null;
    const texto = /buscador/.test(paso.ancla) ? tarea.escribe : numero ?? documento ?? nombre ?? (paso.orden.match(/[«"]([^»"]+)[»"]/)?.[1] || "Prueba");
    if (texto && (await campo.fill(texto, { timeout: 3000 }).then(() => true).catch(() => false))) return `escribió «${texto}»`;
  }
  // Un combo en la pieza (el destino de un traslado, quién atiende): se abre, y la vuelta siguiente elige de su lista.
  const combo = ancla.locator('[aria-haspopup="listbox"]:visible, [role="combobox"]:visible').first();
  if (await combo.count()) if (await combo.click({ timeout: 3000 }).then(() => true).catch(() => false)) return "abrió el combo";
  const palabras = orden.replace(/[«»"]/g, "").split(/[\s·,]+/).slice(1).filter((w) => w.length >= 3 && !PALABRAS_VACIAS.test(w));
  // La pieza misma es el botón («Registrar gasto»): se toca ella, no otro con el mismo nombre en la pantalla.
  if (await ancla.evaluate((n) => n.matches('button, a, [role="button"], [role="tab"]')).catch(() => false)) {
    if (await ancla.click({ timeout: 3000 }).then(() => true).catch(() => false)) return "tocó la pieza (es el botón)";
  }
  for (const w of palabras) {
    const enPieza = ancla.locator('button, [role="radio"], [role="option"], [role="button"], [role="tab"], a').filter({ hasText: new RegExp(`\\b${w}`, "i") }).filter({ hasNotText: NO_TOCAR });
    if (await enPieza.count()) if (await enPieza.first().click({ timeout: 3000 }).then(() => true).catch(() => false)) return `tocó «${w}»`;
  }
  const visible = p.locator("button:visible").filter({ hasText: new RegExp(`^\\s*${palabras.slice(0, 2).join("\\s+")}`, "i") });
  if (palabras.length && (await visible.count())) if (await visible.first().click({ timeout: 3000 }).then(() => true).catch(() => false)) return `tocó «${palabras.slice(0, 2).join(" ")}» en la pantalla`;
  // Una tarjeta o una fila se toca entera, como con el dedo (no un color ni un botón que tenga adentro); un pie, en su botón principal.
  if (/(tarjeta|fila|compra|pase)$/.test(paso.ancla) && (await ancla.click({ timeout: 3000 }).then(() => true).catch(() => false))) return "tocó la tarjeta";
  const controles = ancla.locator('[role="option"]:not([disabled]), button:not([disabled]), a, [role="radio"]').filter({ hasNotText: NO_TOCAR });
  if ((await controles.count()) <= 1 && (await ancla.click({ timeout: 3000 }).then(() => true).catch(() => false))) return "tocó la pieza entera";
  const principal = controles.last();
  if (await principal.count()) if (await principal.click({ timeout: 3000 }).then(() => true).catch(() => false)) return "tocó el control principal";
  return (await ancla.click({ timeout: 3000 }).then(() => true).catch(() => false)) ? "tocó la pieza" : null;
}

async function recorrer(contexto, tarea) {
  const p = await contexto.newPage();
  try {
    await p.goto(baseUrl + tarea.inicio, { waitUntil: "networkidle" });
    await p.waitForTimeout(1200);
    for (const n of ["Ahora no", "Más tarde"]) {
      const b = p.getByRole("button", { name: n });
      if (await b.count()) await b.first().click().catch(() => {});
    }
    const pasosIA = await p.evaluate(async ([pregunta, ruta]) => {
      const r = await fetch("/api/asistente", { method: "POST", headers: { "content-type": "application/json", "x-espera": "no" }, body: JSON.stringify({ pregunta, ruta }) });
      const j = await r.json().catch(() => ({}));
      return { tipo: j.resultado?.tipo ?? `http ${r.status}`, tarea: j.resultado?.tarea ?? null, receta: j.resultado?.receta ?? null };
    }, [tarea.pregunta, tarea.inicio]);
    if (!pasosIA.tarea) return { estado: "sin-tarea", detalle: `respondió ${pasosIA.tipo}, sin pasos` };
    const receta = pasosIA.receta ?? "—";
    // Como `empezarTarea`: en escritorio, sin los pasos que solo existen en el celular.
    const pasos = pasosIA.tarea.filter((x) => ancho < 640 || !x.soloCelular);
    await p.evaluate((t) => {
      sessionStorage.setItem("cayla-tarea", JSON.stringify({ pasos: t, i: 0, desde: Date.now() }));
      window.dispatchEvent(new Event("cayla:tarea"));
    }, pasos);
    const primero = pasos[0];
    if (!primero.href.includes("[") && primero.href.split("?")[0] !== tarea.inicio) await p.goto(baseUrl + primero.href, { waitUntil: "networkidle" });

    const bitacora = [];
    let ultimo = -1;
    let quieto = 0;
    for (let vuelta = 0; vuelta < pasos.length * 4 + 6; vuelta++) {
      await p.waitForTimeout(ESPERA_MS);
      const g = await p.evaluate(() => {
        try {
          return JSON.parse(sessionStorage.getItem("cayla-tarea") ?? "null");
        } catch {
          return null;
        }
      });
      if (!g) return { estado: "llegó", pasos: pasos.length, hasta: pasos.length, detalle: "terminó la tarea", bitacora, receta };
      const paso = g.pasos[g.i];
      if (capturas) await p.screenshot({ path: join(capturas, `${tarea.id}-${ancho}-${String(vuelta).padStart(2, "0")}.png`) });
      if (g.i !== ultimo) {
        ultimo = g.i;
        quieto = 0;
        bitacora.push(`${g.i + 1}. ${paso.orden} [${paso.ancla}]`);
      } else quieto++;
      // El primer paso que guarda es la meta: lo hace la persona (o el último, si ninguno guarda).
      if (paso.guarda || g.i === g.pasos.length - 1) {
        const seVe = await p.locator(`[data-guia="${paso.ancla}"]:visible`).count();
        if (seVe) return { estado: "llegó", pasos: g.pasos.length, hasta: g.i + 1, detalle: `llegó a «${paso.orden}» con su pieza a la vista`, bitacora, receta };
        if (quieto >= VUELTAS_SIN_AVANCE) return { estado: "trabada", pasos: g.pasos.length, hasta: g.i + 1, detalle: `en el paso que guarda, sin su pieza a la vista [${paso.ancla}]`, bitacora, receta };
        continue;
      }
      if (quieto >= VUELTAS_SIN_AVANCE) {
        const seVe = await p.locator(`[data-guia="${paso.ancla}"]:visible`).count();
        const turno = await p.getByText(/Nadie de turno/).count();
        const padron = await p.getByText(/padrón no respondió/i).count();
        return {
          estado: tarea.asistencia && turno ? "sin-asistencia" : tarea.padron && padron ? "sin-padron" : "trabada",
          pasos: g.pasos.length,
          hasta: g.i + 1,
          detalle: `${seVe ? "la pieza está, pero el paso no avanzó" : "la pieza no aparece"} [${paso.ancla}] «${paso.orden}»`,
          bitacora,
          receta,
        };
      }
      // La orden como la ve la persona en la barra (a veces la completa la pantalla: «Toca «Agregar color»»).
      const orden = await p.locator("[data-acompanante] .barra-abajo p.font-medium").first().innerText().catch(() => paso.orden);
      const hecho = await hacerPaso(p, paso, tarea, orden);
      if (hecho) bitacora.push(`   ${hecho}`);
    }
    return { estado: "trabada", pasos: pasos.length, hasta: ultimo + 1, detalle: "se acabaron las vueltas", bitacora, receta };
  } finally {
    await p.close();
  }
}

const navegador = await chromium.launch();
const contextos = new Map();
const filas = [];
if (conAsistencia) sql(ASISTENCIA_PON);
try {
  for (const tarea of elegidas) {
    if (!contextos.has(tarea.cuenta)) {
      contextos.set(tarea.cuenta, await abrirContexto(navegador, porClave(tarea.cuenta), { baseUrl, tema: "claro", viewport: { width: ancho, height: alto } }));
    }
    const r = await recorrer(contextos.get(tarea.cuenta), tarea).catch((e) => ({ estado: "error", detalle: String(e?.message ?? e).split("\n")[0] }));
    filas.push({ tarea, ...r });
    const marca = r.estado === "llegó" ? "✓" : r.estado === "sin-asistencia" || r.estado === "sin-padron" ? "·" : "✗";
    const conReceta = r.receta && r.receta !== "—" ? `[receta ${r.receta}${tarea.receta && tarea.receta !== r.receta ? ` ≠ ${tarea.receta}` : ""}]` : tarea.receta ? `[sin receta ≠ ${tarea.receta}]` : "";
    console.log(`${marca} ${tarea.id.padEnd(18)} ${r.estado === "llegó" || r.hasta ? `${r.hasta ?? "?"}/${r.pasos ?? "?"}` : ""}  ${conReceta}  ${r.detalle}`);
    if (r.estado !== "llegó" && r.bitacora) for (const linea of r.bitacora) console.log(`      ${linea}`);
  }
} finally {
  await navegador.close();
  if (conAsistencia) sql(ASISTENCIA_QUITA);
}

const contadas = filas.filter((f) => f.estado !== "sin-asistencia" && f.estado !== "sin-padron");
const llegaron = contadas.filter((f) => f.estado === "llegó").length;
const pct = contadas.length ? Math.round((llegaron / contadas.length) * 100) : 0;
const aparte = filas.length - contadas.length;
console.log(`\n${llegaron} de ${contadas.length} tareas llegaron al paso que guarda (${pct} %) a ${ancho} px.${aparte ? ` ${aparte} sin contar: piden a alguien de turno (--con-asistencia) o el padrón de SUNAT, que en local no responde.` : ""}`);
process.exit(pct >= minimo ? 0 : 1);
