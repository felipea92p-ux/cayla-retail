import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { EMOJIS_DEL_MENSAJE } from "./emojis-del-mensaje";
import { MENSAJE_PREDETERMINADO_WEB } from "./pedidos-web-reglas";

// La regla de Felipe (2026-11-04): toda hoja que edita un mensaje ofrece los mismos emojis. Por eso hay una sola lista, y `FilaEmojis`
// no recibe otra. Esta prueba falla si alguien arma su propia fila, o si una lista propia vuelve a nacer al lado de la común.

const RAIZ_WEB = join(__dirname, "..");
const MIGRACION_DEL_CLUB = join(RAIZ_WEB, "..", "..", "supabase", "migrations", "20261020144000_club_avisos_mensajes_editables.sql");
const PIEZA = "components/ui/FilaEmojis.tsx";

function archivosTsx(carpeta: string): string[] {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(carpeta, e.name);
    if (e.isDirectory()) return archivosTsx(ruta);
    return e.name.endsWith(".tsx") ? [ruta] : [];
  });
}

const fuentes = ["components", "app"].flatMap((c) => archivosTsx(join(RAIZ_WEB, c))).map((ruta) => ({
  rel: relative(RAIZ_WEB, ruta).replace(/\\/g, "/"),
  texto: readFileSync(ruta, "utf8"),
}));

/** Los emojis de un texto, con su selector de variante si lo trae (🛍️ son dos caracteres). */
const emojisDe = (texto: string) => texto.match(/\p{Extended_Pictographic}️?/gu) ?? [];

describe("los emojis de un mensaje son los mismos en toda hoja", () => {
  it("las dos hojas que editan un mensaje usan la pieza común", () => {
    for (const hoja of ["components/pedidos-web/EditarMensajePredeterminadoHoja.tsx", "components/clientas/EditarMensajesAvisos.tsx"]) {
      expect(fuentes.find((f) => f.rel === hoja)?.texto, hoja).toContain("<FilaEmojis");
    }
  });

  it("nadie más dibuja una fila de emojis ni trae su propia lista", () => {
    const ajenos = fuentes.filter((f) => f.rel !== PIEZA && (/Insertar \$\{/.test(f.texto) || /EMOJIS_/.test(f.texto))).map((f) => f.rel);
    expect(ajenos).toEqual([]);
  });

  it("la pieza no acepta otra lista", () => {
    const usos = fuentes.flatMap((f) => f.texto.match(/<FilaEmojis\b[^>]*>/g) ?? []);
    expect(usos.length).toBeGreaterThan(0);
    for (const uso of usos) expect(uso).not.toMatch(/\b(mas|emojis|lista|opciones)=/);
  });

  it("la lista no repite ninguno", () => {
    expect(new Set(EMOJIS_DEL_MENSAJE).size).toBe(EMOJIS_DEL_MENSAJE.length);
  });

  it("trae los de los mensajes de fábrica: quien borra uno puede volver a ponerlo", () => {
    const deFabrica = [...emojisDe(MENSAJE_PREDETERMINADO_WEB), ...emojisDe(readFileSync(MIGRACION_DEL_CLUB, "utf8"))];
    expect(deFabrica.length).toBeGreaterThan(0);
    const faltan = [...new Set(deFabrica)].filter((e) => !(EMOJIS_DEL_MENSAJE as readonly string[]).includes(e));
    expect(faltan).toEqual([]);
  });
});
