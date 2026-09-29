// Orquestador del Responsive Quality Gate — ver `responsive/README.md`.
//
// GENÉRICO: recorre pantalla × escenario × viewport, delega la preparación de cada escenario a
// la propia pantalla (`responsive/pantallas/*.mjs`) y delega la detección al motor puro de
// `deteccion.mjs`. No conoce Existencias, Vender ni ninguna regla de negocio.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { contextoAutenticado } from "./sesion.mjs";
import { analizarEnPagina, SELECTORES_POR_DEFECTO } from "./deteccion.mjs";
import { resolverViewports } from "../matriz-viewports.mjs";

const ESCENARIO_POR_DEFECTO = [{ id: "inicial", nombre: "Estado inicial", preparar: null }];

/**
 * @param {import('../pantallas/registro.mjs').Pantalla[]} pantallas
 * @param {{ baseURL: string, dirSalida: string, capturasTodas?: boolean, headed?: boolean, tolerancia?: number }} opciones
 */
export async function ejecutarQualityGate(pantallas, opciones) {
  const { baseURL, dirSalida, capturasTodas = false, headed = false, tolerancia = 1 } = opciones;

  const dirCapturas = join(dirSalida, "capturas");
  mkdirSync(dirCapturas, { recursive: true });

  const browser = await chromium.launch({ channel: "chrome", headless: !headed });
  const contexto = await contextoAutenticado(browser, { baseURL });

  const resultados = [];
  const inicio = Date.now();

  try {
    for (const pantalla of pantallas) {
      const viewports = resolverViewports(pantalla.viewports);
      const escenarios = pantalla.escenarios?.length ? pantalla.escenarios : ESCENARIO_POR_DEFECTO;

      for (const escenario of escenarios) {
        for (const viewport of viewports) {
          const entrada = await correrUnCaso({ contexto, baseURL, pantalla, escenario, viewport, tolerancia, capturasTodas, dirCapturas });
          resultados.push(entrada);
        }
      }
    }
  } finally {
    await contexto.close();
    await browser.close();
  }

  return { resultados, duracionMs: Date.now() - inicio };
}

async function correrUnCaso({ contexto, baseURL, pantalla, escenario, viewport, tolerancia, capturasTodas, dirCapturas }) {
  const entrada = {
    pantalla,
    escenario,
    viewport,
    ok: true,
    overflowGlobal: null,
    clipping: [],
    advertencia: null,
    screenshot: null,
    error: null,
  };

  const pagina = await contexto.newPage();
  try {
    await pagina.setViewportSize({ width: viewport.w, height: viewport.h });
    await pagina.goto(`${baseURL}${pantalla.ruta}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await pagina.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    await pagina.waitForTimeout(500); // hidratación + el loader global (ADR-0149) terminando de retirarse

    if (escenario.preparar) await escenario.preparar(pagina, { viewport, pantalla, escenario });
    await pagina.waitForTimeout(150); // animaciones cortas del sistema (cascada de modal, revelar combo)

    const selectoresClave = [...SELECTORES_POR_DEFECTO, ...(pantalla.elementosClave || []), ...(escenario.elementosClave || [])];
    const selectoresExclusion = [...(pantalla.exclusiones || []), ...(escenario.exclusiones || [])];
    const ambito = escenario.ambito ?? pantalla.ambito ?? null;
    const limite = escenario.limite ?? pantalla.limite ?? null;

    const analisis = await pagina.evaluate(analizarEnPagina, { selectoresClave, selectoresExclusion, ambito, limite, tolerancia });
    entrada.overflowGlobal = analisis.overflowGlobal;
    entrada.clipping = analisis.clipping;
    entrada.advertencia = analisis.advertencia || null;
    entrada.ok = analisis.clipping.length === 0;

    if (!entrada.ok || capturasTodas) {
      const nombrePantalla = pantalla.id.includes(".") ? pantalla.id.split(".").slice(1).join("-") : pantalla.id;
      const archivo = `${pantalla.modulo}-${nombrePantalla}-${escenario.id}-${viewport.id}-${entrada.ok ? "PASS" : "FAIL"}.png`;
      const ruta = join(dirCapturas, archivo);
      await pagina.screenshot({ path: ruta });
      entrada.screenshot = ruta;
    }
  } catch (e) {
    entrada.ok = false;
    entrada.error = e instanceof Error ? e.message : String(e);
  } finally {
    await pagina.close();
  }
  return entrada;
}
