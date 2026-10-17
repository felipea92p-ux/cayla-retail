import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { traducirError } from "./error-escritura";

// /chaos de Producción (2026-10-14, ADR-0409): en Ingresar insumo se perdió la respuesta de un lote que la base SÍ guardó, y la
// pantalla dijo «No se guardó nada — revisa el internet y vuelve a intentar». Es falso: la conexión puede cortarse DESPUÉS de que la
// base guardó. Las pantallas del Taller que mandan un token piden la frase honesta («no podemos confirmar si llegó a guardarse»).
// Si alguien quita la opción, esta prueba falla.
const PANTALLAS: [archivo: string, contexto: string][] = [
  ["InsumoModales.tsx", "ingresar el insumo"],
  ["ComprobanteProduccionForm.tsx", "registrar el comprobante"],
  ["PagarComprobanteProduccionModal.tsx", "registrar el pago"],
  ["RecibirComprobanteModal.tsx", "registrar la recepción"],
  ["NuevaOrdenProduccionForm.tsx", "abrir la orden"],
];

describe("Producción: un corte de red no afirma que no se guardó nada", () => {
  it.each(PANTALLAS)("%s pide confirmar antes de repetir (%s)", (archivo, contexto) => {
    const codigo = readFileSync(new URL(`../components/${archivo}`, import.meta.url), "utf8");
    const llamadas = [...codigo.matchAll(new RegExp(`traducirError\\([^)]*"${contexto}"[^)]*\\)`, "g"))].map((m) => m[0]);
    expect(llamadas.length).toBeGreaterThan(0);
    for (const llamada of llamadas) expect(llamada).toContain("confirmarAntesDeRepetir: true");
    expect(codigo).toContain("p_token");
  });

  // Lo mismo en las hojas del rediseño (ADR-0400) que guardan sin token propio: el /chaos del 2026-10-15 (hallazgo #3) vio la misma frase falsa en «Nueva tarifa», «Cambiar quién»,
  // la ficha de la tela y «Nuevo insumo». «Deshacer» lo que se anotó es la salida de un error: también dice la frase honesta.
  const HOJAS_DEL_REDISENO: [archivo: string, contexto: string][] = [
    ["proveedores-produccion/TarifaServicioModal.tsx", "guardar la tarifa"],
    ["orden-pagina/CambiarQuienModal.tsx", "cambiar quién hace"],
    ["insumos-taller/FichaDeLaTelaModal.tsx", "guardar la ficha"],
    ["insumos-taller/NuevoInsumoModal.tsx", "crear el insumo"],
    ["orden-pagina/DeshacerAvanceModal.tsx", "deshacer lo que se anotó"],
    ["orden-pagina/PasarAlStockModal.tsx", "pasar la orden al stock"],
    ["orden-pagina/AnularLaOrdenModal.tsx", "anular la orden"],
    ["orden-pagina/RevertirLaOrdenModal.tsx", "revertir el cierre"],
  ];
  it.each(HOJAS_DEL_REDISENO)("%s pide confirmar antes de repetir (%s)", (archivo, contexto) => {
    const codigo = readFileSync(new URL(`../components/${archivo}`, import.meta.url), "utf8");
    const llamadas = [...codigo.matchAll(new RegExp(`traducirError\\([^)]*${contexto}[^)]*\\)`, "g"))].map((m) => m[0]);
    expect(llamadas.length).toBeGreaterThan(0);
    for (const llamada of llamadas) expect(llamada).toContain("confirmarAntesDeRepetir: true");
  });

  it("con la opción, la frase no promete que no se guardó", () => {
    const frase = traducirError({ message: "TypeError: Failed to fetch" }, "ingresar el insumo", { confirmarAntesDeRepetir: true });
    expect(frase).toMatch(/no podemos confirmar si llegó a guardarse/);
    expect(frase).not.toMatch(/No se guardó nada/);
  });
});
