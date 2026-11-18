import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// /chaos del 2026-11-18 (ADR-0677, 7c): tres clics en el mismo instante en «Guardar como borrador» creaban tres ofertas iguales, porque
// `guardar()` mira `guardando` del cierre y React todavía no había apagado el botón. Con un doble clic real salía una sola, y la base no lo
// frena (dos borradores iguales son válidos). La hoja de ofertas guarda y retira detrás del candado de un solo envío (`unSoloEnvio`, el mismo
// de la hoja de la campaña, DC-01 del 2026-10-23). Esta prueba lee el código: el candado mismo ya tiene la suya en `campana-hoja.test.ts`.
const HOJA = readFileSync(join(__dirname, "../components/sellos/OfertasHoja.tsx"), "utf8");

/** El cuerpo de una función de la hoja, desde su firma hasta la línea que la cierra a dos espacios. */
function cuerpoDe(firma: string): string {
  const i = HOJA.indexOf(firma);
  expect(i, `no encontré «${firma}» en OfertasHoja.tsx`).toBeGreaterThan(-1);
  const fin = HOJA.indexOf("\n  }\n", i);
  return HOJA.slice(i, fin);
}

describe("la hoja de ofertas manda cada guardado una sola vez (chaos 2026-11-18)", () => {
  it("tiene su candado de un solo envío", () => {
    expect(HOJA).toMatch(/useState\(unSoloEnvio\)/);
  });

  it("guardar y retirar pasan por el candado", () => {
    expect(cuerpoDe("async function guardar(")).toMatch(/unaVez\(/);
    expect(cuerpoDe("async function retirarRegla(")).toMatch(/unaVez\(/);
  });
});
