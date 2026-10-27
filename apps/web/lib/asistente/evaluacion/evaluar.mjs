#!/usr/bin/env node
// La evaluación fija de «Pregúntale a CAYLA», con la IA de verdad (ADR-0529). Se corre a mano antes de cambiar el modelo, las instrucciones o
// la búsqueda local: le hace las 40 preguntas de `casos.json` al ERP LOCAL, con las cuentas de prueba, y dice cuántas respondió bien.
//
//   pnpm --filter web asistente:evaluar -- --base-url http://localhost:3011
//
// Solo local (`exigirLocal`): las cuentas y sus claves son del seed. Necesita `ANTHROPIC_API_KEY` en el `.env.local` del servidor y el
// asistente encendido en Tienda Lima y en el Taller (Configuración ▸ Tiendas y caja). Cuesta ~US$0,05 y deja las 40 preguntas anotadas en
// la base local. Sale con 1 si acierta menos que `--minimo` (por defecto 90 %).

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto, exigirLocal } from "../../../tema/motor/sesion.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const { casos } = JSON.parse(readFileSync(join(AQUI, "casos.json"), "utf8"));

const args = process.argv.slice(2).filter((a) => a !== "--");
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : porDefecto;
};
const baseUrl = exigirLocal(opcion("base-url", process.env.TEMA_BASE_URL ?? "http://localhost:3010"));
const minimo = Number(opcion("minimo", "90"));
// El freno de la API es de 20 preguntas por minuto y cuenta: con esta pausa, una cuenta no lo toca.
const PAUSA_MS = 3200;

/** Lo que respondió, como se escribe en `acepta`: `guia:<id>` por cada tramo, `regla:<id>`, `sin_acceso:<módulo>`… */
function claves(resultado) {
  switch (resultado?.tipo) {
    case "guia":
      return resultado.tramos.map((t) => `guia:${t.guiaId}`);
    case "regla":
      return [`regla:${resultado.reglaId}`];
    case "error":
      return [`error:${resultado.marca}`];
    case "sin_acceso":
      return [`sin_acceso:${resultado.modulo ?? ""}`, "sin_acceso"];
    case "basico":
      return [`basico:${resultado.motivo}`];
    default:
      return [String(resultado?.tipo ?? "nada")];
  }
}

const navegador = await chromium.launch();
const contextos = new Map();
const filas = [];
try {
  for (const [i, c] of casos.entries()) {
    if (!contextos.has(c.cuenta)) {
      contextos.set(c.cuenta, await abrirContexto(navegador, porClave(c.cuenta), { baseUrl, tema: "claro", viewport: { width: 1280, height: 800 } }));
    }
    const r = await contextos.get(c.cuenta).request.post(`${baseUrl}/api/asistente`, { data: { pregunta: c.pregunta, ruta: c.ruta }, timeout: 20_000 });
    const cuerpo = await r.json().catch(() => ({}));
    const dio = r.ok() ? claves(cuerpo.resultado) : [`http:${r.status()}`];
    const bien = c.acepta.some((a) => dio.includes(a));
    filas.push({ n: i + 1, bien, cuenta: c.cuenta, pregunta: c.pregunta, dio: dio.filter((d) => d !== "sin_acceso").join(", "), acepta: c.acepta.join(", ") });
    console.log(`${bien ? "✓" : "✗"} ${String(i + 1).padStart(2)} ${c.pregunta}\n     dio: ${filas.at(-1).dio}${bien ? "" : `   ·   esperaba: ${filas.at(-1).acepta}`}`);
    await new Promise((h) => setTimeout(h, PAUSA_MS));
  }
} finally {
  for (const ctx of contextos.values()) await ctx.close();
  await navegador.close();
}

const aciertos = filas.filter((f) => f.bien).length;
const pct = Math.round((aciertos / filas.length) * 100);
const sinIA = filas.filter((f) => f.dio.startsWith("basico")).length;
console.log(`\n${aciertos} de ${filas.length} bien (${pct} %).${sinIA ? ` ${sinIA} sin IA (revisa la clave, el tope o la conexión).` : ""}`);
process.exit(pct >= minimo ? 0 : 1);
