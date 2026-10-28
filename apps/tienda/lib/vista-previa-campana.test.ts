import { describe, expect, it } from "vitest";
import { esLlaveDeVistaPrevia, interpretarVistaPrevia } from "./vista-previa-campana";

const llave = "0123456789abcdef".repeat(3);
const ORIGEN = "https://abc.supabase.co";
const A = "0a1b2c3d-0000-4000-8000-000000000001";
const B = "0a1b2c3d-0000-4000-8000-000000000002";
const dato = (diseno: unknown, extra: Record<string, unknown> = {}) => ({
  campana: { nombre: "Día del Gato", pct: 25, desde: "2026-10-25", hasta: "2026-10-31", diseno, ...extra },
  expira_en: "2026-10-28T19:00:00Z",
});
const ambiente = { modo: "ambiente", plantilla: "gato", paleta: 0, acento: null };

describe("esLlaveDeVistaPrevia: lo único que llega a la base", () => {
  it("son 48 letras de 0 a f", () => {
    expect(esLlaveDeVistaPrevia(llave)).toBe(true);
    for (const malo of ["", "corta", llave.toUpperCase(), `${llave}0`, llave.slice(1), `${llave.slice(2)}zz`, "../../etc", null, undefined, 7]) {
      expect(esLlaveDeVistaPrevia(malo), String(malo)).toBe(false);
    }
  });
});

describe("interpretarVistaPrevia: lo que se pinta", () => {
  it("un diseño de ambiente se pinta aunque la campaña aún no empiece (no se mira la fecha de inicio)", () => {
    const v = interpretarVistaPrevia(dato(ambiente), ORIGEN);
    expect(v?.campana).toEqual({ nombre: "Día del Gato", pct: 25, desde: "2026-10-25", hasta: "2026-10-31" });
    expect(v?.diseno?.plantilla).toBe("gato");
  });

  it("un diseño con imagen propia arma la dirección de su imagen", () => {
    const v = interpretarVistaPrevia(dato({ modo: "imagen", imagen_ruta: `campanas/${A}/${B}.webp`, imagen_vertical_ruta: null }), ORIGEN);
    expect(v?.diseno?.imagen?.horizontal).toBe(`${ORIGEN}/storage/v1/object/public/retail-campanas/campanas/${A}/${B}.webp`);
  });

  it("dice hasta qué día de Lima vale el enlace (a las 03:00 UTC todavía es el día anterior)", () => {
    expect(interpretarVistaPrevia(dato(ambiente), ORIGEN)?.valeHasta).toBe("2026-10-28");
    expect(interpretarVistaPrevia({ ...dato(ambiente), expira_en: "2026-10-29T03:00:00Z" }, ORIGEN)?.valeHasta).toBe("2026-10-28");
    expect(interpretarVistaPrevia({ ...dato(ambiente), expira_en: "no es fecha" }, ORIGEN)?.valeHasta).toBeNull();
  });

  it("un diseño que la tienda no sabe pintar se avisa (diseno null) pero la campaña sí se muestra", () => {
    const v = interpretarVistaPrevia(dato({ ...ambiente, plantilla: "halloween" }), ORIGEN);
    expect(v?.campana.nombre).toBe("Día del Gato");
    expect(v?.diseno).toBeNull();
    expect(interpretarVistaPrevia(dato({ modo: "imagen", imagen_ruta: "x.webp" }), ORIGEN)?.diseno).toBeNull();
    expect(interpretarVistaPrevia(dato(ambiente), undefined)?.diseno?.plantilla).toBe("gato");
  });

  it("una llave que no existe o venció (campana null), o una respuesta torcida, es «el enlace no sirve»", () => {
    for (const malo of [{ campana: null }, null, undefined, {}, "x", { campana: { nombre: "", pct: 25, diseno: null } }, { campana: { nombre: "X", pct: 0, diseno: null } }, { campana: { nombre: "X", pct: "mucho", diseno: null } }]) {
      expect(interpretarVistaPrevia(malo, ORIGEN), JSON.stringify(malo)).toBeNull();
    }
  });
});
