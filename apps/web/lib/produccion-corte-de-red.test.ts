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

  it("con la opción, la frase no promete que no se guardó", () => {
    const frase = traducirError({ message: "TypeError: Failed to fetch" }, "ingresar el insumo", { confirmarAntesDeRepetir: true });
    expect(frase).toMatch(/no podemos confirmar si llegó a guardarse/);
    expect(frase).not.toMatch(/No se guardó nada/);
  });
});
