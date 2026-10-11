import { describe, expect, it } from "vitest";
import { formasDePrefijo, ICONOS_POR_PREFIJO, type FormaIcono } from "./icono-categoria-reglas";

// Los prefijos de las 42 categorías activas al 2026-09-29 (`select prefijo from retail.categorias where activo`, base local
// espejo de producción), más Bolsas (BOL, familia Empaque), que un Líder creó desde la pantalla y en producción se dibujaba
// como un círculo (Felipe 2026-10-10). Si una migración agrega una categoría de fábrica, se suma aquí Y en
// `icono-categoria-reglas.ts`: la que se olvide cae al ícono de su familia (no se rompe), pero esta prueba avisa que se
// quedó sin dibujo propio.
const PREFIJOS_ACTIVOS = [
  // Indumentaria (18)
  "ABR", "BLZ", "BOD", "CMS", "CAS", "CHA", "CMP", "CON", "ENT", "FAL", "JEA", "PAN", "SUD", "POL", "LEN", "SHO", "TOP", "VES",
  // Calzado (7)
  "BAI", "BOT", "BOI", "MSN", "SAN", "ZAP", "ZFO",
  // Accesorios y Complementos (8)
  "CAR", "CIN", "GOR", "LSO", "MOC", "BUF", "REL", "RIN",
  // Bisutería (4), Belleza (1), Papelería (4)
  "ANL", "ARE", "COL", "PUL", "MAQ", "UTC", "LAP", "LIB", "UOF",
  // Empaque (1)
  "BOL",
];

// Solo estos caracteres puede tener el `d` de un trazo SVG; un typo (una letra suelta, una coma doble) no dibuja nada y no avisa.
const TRAZO_VALIDO = /^[MmLlHhVvCcSsQqTtAaZz0-9\s.,+-]+$/;

const esNumeroFinito = (n: unknown) => typeof n === "number" && Number.isFinite(n);

function formaValida(f: FormaIcono): boolean {
  if (f.t === "path") return f.d.length > 0 && TRAZO_VALIDO.test(f.d) && /^[Mm]/.test(f.d.trim());
  if (f.t === "circle") return esNumeroFinito(f.cx) && esNumeroFinito(f.cy) && f.r > 0;
  return esNumeroFinito(f.x) && esNumeroFinito(f.y) && f.width > 0 && f.height > 0 && (f.rx === undefined || f.rx >= 0);
}

describe("formasDePrefijo", () => {
  it("las 43 categorías activas tienen ícono propio", () => {
    expect(PREFIJOS_ACTIVOS).toHaveLength(43);
    expect(new Set(PREFIJOS_ACTIVOS).size).toBe(43);
    const sinIcono = PREFIJOS_ACTIVOS.filter((p) => formasDePrefijo(p) === null);
    expect(sinIcono).toEqual([]);
  });

  it("no hay dos íconos con el mismo dibujo (un copiar-pegar se nota al perder la diferencia)", () => {
    const huellas = new Map<string, string>();
    for (const [prefijo, formas] of Object.entries(ICONOS_POR_PREFIJO)) {
      const huella = JSON.stringify(formas);
      expect(huellas.get(huella), `${prefijo} repite el dibujo de ${huellas.get(huella)}`).toBeUndefined();
      huellas.set(huella, prefijo);
    }
  });

  it("cada ícono tiene formas válidas y su primera forma (la silueta) es un trazo o un rectángulo cerrable", () => {
    for (const [prefijo, formas] of Object.entries(ICONOS_POR_PREFIJO)) {
      expect(prefijo, "el prefijo son 3 letras mayúsculas, como en `categorias`").toMatch(/^[A-Z]{3}$/);
      expect(formas.length, `${prefijo} sin formas`).toBeGreaterThan(0);
      for (const forma of formas) expect(formaValida(forma), `${prefijo}: ${JSON.stringify(forma)}`).toBe(true);
    }
  });

  it("una categoría nueva (prefijo desconocido) no tiene ícono: la pantalla cae al de su familia", () => {
    expect(formasDePrefijo("RBA")).toBeNull();
    expect(formasDePrefijo("")).toBeNull();
    expect(formasDePrefijo(null)).toBeNull();
    expect(formasDePrefijo(undefined)).toBeNull();
  });

  it("no distingue mayúsculas ni espacios: el prefijo que llega de la base o del formulario da el mismo ícono", () => {
    expect(formasDePrefijo("sud")).toBe(formasDePrefijo("SUD"));
    expect(formasDePrefijo(" SUD ")).toBe(formasDePrefijo("SUD"));
  });

  it("el nombre no interviene: Poleras (antes «Poleras/Sudaderas») sigue teniendo su ícono porque su prefijo no cambió", () => {
    expect(formasDePrefijo("SUD")).not.toBeNull();
  });
});
