import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado del refresco de Existencias por WebSocket (ADR-0603): se actualiza sola, sin que nadie lo pida, y NO debe encender el loader
// de pantalla completa (ADR-0149). Un `router.refresh()` es una petición de pantalla (`RSC: 1`) y `clasificarPeticion` la cuenta como
// «carga»; lo que la deja pasar es anunciarla antes con `navegacionSinEspera`. Mismo espíritu que `errores-reintentar.test.ts`: leer el
// fuente y fallar si deja de cumplirse (el hook importa el cliente de Supabase, que Vitest no carga hoy).

/** El fuente sin comentarios: uno que MENCIONE `router.refresh()` no cuenta como que lo llama. */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

const fuente = sinComentarios(readFileSync(join(__dirname, "useRefrescoEnVivo.ts"), "utf8"));

describe("useRefrescoEnVivo: el refresco por WebSocket no enciende el loader", () => {
  it("refresca la pantalla con router.refresh()", () => {
    expect(fuente).toMatch(/router\.refresh\(\)/);
  });

  it("anuncia la dirección al loader justo antes de cada router.refresh()", () => {
    const refrescos = fuente.match(/router\.refresh\(\)/g) ?? [];
    const anunciados = fuente.match(/navegacionSinEspera\(window\.location\.href\);\s*router\.refresh\(\)/g) ?? [];
    expect(anunciados.length).toBe(refrescos.length);
  });

  it("importa navegacionSinEspera del loader general", () => {
    expect(fuente).toMatch(/import \{ navegacionSinEspera \} from "@\/components\/ui\/Espera"/);
  });
});
