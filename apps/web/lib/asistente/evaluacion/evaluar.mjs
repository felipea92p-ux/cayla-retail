#!/usr/bin/env node
// La evaluación fija de «Pregúntale a CAYLA», con la IA de verdad (ADR-0536). Se corre a mano antes de cambiar el modelo, las instrucciones o
// la búsqueda local: le hace las 50 preguntas de `casos.json` al ERP LOCAL, con las cuentas de prueba, y dice cuántas respondió bien.
//
//   pnpm --filter web asistente:evaluar -- --base-url http://localhost:3011 [--veces 3] [--minimo 90]
//
// Cada caso se pregunta `--veces` veces (3 por defecto), en pasadas completas: la IA no responde siempre igual, y una sola pasada con
// suerte no puede pasar por buena. Los de seguridad (sin acceso y fuera de tema) tienen que salir bien todas las veces; el resto pasa si
// el promedio llega a `--minimo` (90 %). La cuenta vive en `resumen.mjs`, con su prueba. Sale con 1 si no pasa.
//
// Solo local (`exigirLocal`): las cuentas y sus claves son del seed. Necesita `ANTHROPIC_API_KEY` en el `.env.local` del servidor, el
// servidor con `next dev` (solo así `/api/asistente` devuelve lo que costó cada pregunta) y el asistente encendido en Tienda Lima y en el
// Taller (Configuración ▸ Empresa y tiendas). Cuesta ~US$0,15 por pasada, imprime el costo y el tiempo de la corrida al final, y deja
// cada pregunta anotada en la base local.

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto, exigirLocal } from "../../../tema/motor/sesion.mjs";
import { acerto, claves, duracion, lineasDelResumen, mostrar, resumir } from "./resumen.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const { casos } = JSON.parse(readFileSync(join(AQUI, "casos.json"), "utf8"));

const args = process.argv.slice(2).filter((a) => a !== "--");
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : porDefecto;
};
const baseUrl = exigirLocal(opcion("base-url", process.env.TEMA_BASE_URL ?? "http://localhost:3010"));
const minimo = Number(opcion("minimo", "90"));
const veces = Number(opcion("veces", "3"));
if (!Number.isInteger(veces) || veces < 1 || veces > 10) {
  console.error(`--veces tiene que ser un número entero de 1 a 10 (llegó «${opcion("veces", "")}»).`);
  process.exit(2);
}
// El freno de la API es de 20 preguntas por minuto y cuenta: con esta pausa, una cuenta no lo toca.
const PAUSA_MS = 3200;

const total = casos.length * veces;
console.log(
  `${total} preguntas (${casos.length} casos × ${veces} ${veces === 1 ? "pasada" : "pasadas"}) a ${baseUrl}, una cada ~${PAUSA_MS / 1000} s: al menos ${duracion(total * PAUSA_MS)}.\n`,
);

const inicio = Date.now();
const navegador = await chromium.launch();
const contextos = new Map();
/** @type {import("./resumen.mjs").Intento[]} */
const intentos = [];
try {
  for (let pasada = 1; pasada <= veces; pasada++) {
    if (veces > 1) console.log(`Pasada ${pasada} de ${veces}`);
    for (const [i, c] of casos.entries()) {
      if (!contextos.has(c.cuenta)) {
        contextos.set(c.cuenta, await abrirContexto(navegador, porClave(c.cuenta), { baseUrl, tema: "claro", viewport: { width: 1280, height: 800 } }));
      }
      // Una pregunta que se cae (el servidor no responde en 20 s) cuenta como fallida y la corrida sigue: con 150 preguntas, perder las
      // anteriores por una sola sería peor que el fallo.
      let dio;
      let gasto = null;
      try {
        const r = await contextos.get(c.cuenta).request.post(`${baseUrl}/api/asistente`, { data: { pregunta: c.pregunta, ruta: c.ruta }, timeout: 20_000 });
        const cuerpo = await r.json().catch(() => ({}));
        dio = r.ok() ? claves(cuerpo.resultado) : [`http:${r.status()}`];
        if (typeof cuerpo.gasto?.costoUsd === "number") gasto = { costoUsd: cuerpo.gasto.costoUsd, ms: cuerpo.gasto.ms ?? null };
      } catch (e) {
        dio = [`red:${e instanceof Error ? e.name : "desconocido"}`];
      }
      intentos.push({ caso: i, pasada, dio, gasto });
      const bien = acerto(c, dio);
      console.log(`${bien ? "✓" : "✗"} ${String(i + 1).padStart(2)} ${c.pregunta}${bien ? "" : `\n     dio: ${mostrar(dio)}   ·   esperaba: ${c.acepta.join(", ")}`}`);
      await new Promise((h) => setTimeout(h, PAUSA_MS));
    }
    const dePasada = intentos.filter((t) => t.pasada === pasada);
    console.log(`${veces > 1 ? `Pasada ${pasada}: ` : ""}${dePasada.filter((t) => acerto(casos[t.caso], t.dio)).length} de ${casos.length} bien.\n`);
  }
} finally {
  for (const ctx of contextos.values()) await ctx.close();
  await navegador.close();
}

const resumen = resumir({ casos, intentos, veces, minimo });
console.log(lineasDelResumen(resumen, { msCorrida: Date.now() - inicio }).join("\n"));
process.exit(resumen.pasa ? 0 : 1);
