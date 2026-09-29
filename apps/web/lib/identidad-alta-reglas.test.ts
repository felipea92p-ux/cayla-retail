import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { firmaDeMitad, MOTIVO_SIN_IDENTIDAD, type IdentidadDelAlta } from "./identidad-alta-reglas";

// La identidad única del alta de producto (Felipe, 2026-09-29): quien abre «Nueva prenda» se identifica UNA vez y esa persona
// firma la prenda y todo lo que se crea a mitad del formulario. Lo que estas pruebas cuidan:
//  1. Dentro del alta, un guardado de mitad firma con esa persona —no con la clave «sin responsable» del ADR-0280— y no sale
//     mientras no haya una identidad vigente.
//  2. Fuera del alta (sin identidad) nada cambió: sigue soltado del combo, con su clave.
//  3. Ningún componente del alta vuelve a firmar a mano ni a pintar su propio combo: todo pasa por `useFirmaDeMitad`.

const persona: IdentidadDelAlta = {
  listo: true,
  motivo: null,
  firma: () => ({ responsableId: "rosa", ubicacionId: "alm-tru" }),
};
const sinElegir: IdentidadDelAlta = { listo: false, motivo: "Elige quién hace esta operación.", firma: () => null };

describe("firmaDeMitad — dentro del alta", () => {
  it("firma con la persona que inició el alta: los mismos encabezados que el guardado final", () => {
    const f = firmaDeMitad(persona, "alta_producto_tejido");
    expect(f.listo).toBe(true);
    expect(f.motivo).toBeNull();
    expect(f.encabezados()).toEqual({ "x-responsable": "rosa", "x-ubicacion": "alm-tru" });
    expect(f.firma()).toEqual({ responsableId: "rosa", ubicacionId: "alm-tru" });
  });

  it("no manda la clave «sin responsable»: una terminal no deja el tejido nuevo sin persona", () => {
    expect(firmaDeMitad(persona, "alta_producto_color").encabezados()).not.toHaveProperty("x-responsable-omitido");
  });

  it("sin identidad no se puede guardar, dice por qué y no manda ningún encabezado", () => {
    const f = firmaDeMitad(sinElegir, "alta_producto_marca");
    expect(f.listo).toBe(false);
    expect(f.motivo).toBe("Elige quién hace esta operación.");
    expect(f.firma()).toBeNull();
    expect(f.encabezados()).toEqual({});
  });

  it("si el control no trae motivo, usa el del alta", () => {
    expect(firmaDeMitad({ listo: false, motivo: null, firma: () => null }, "alta_producto_talla").motivo).toBe(MOTIVO_SIN_IDENTIDAD);
  });

  it("aunque el control tenga firma, mientras no esté listo no sale: no se firma con alguien que ya no está presente", () => {
    const f = firmaDeMitad({ listo: false, motivo: "x", firma: () => ({ responsableId: "rosa", ubicacionId: "u" }) }, "alta_producto_tejido");
    expect(f.firma()).toBeNull();
    expect(f.encabezados()).toEqual({});
  });

  it("la identidad se lee al guardar, no al pintar: si cambia entre un guardado y otro, el segundo sale con la nueva", () => {
    let id = "rosa";
    const viva: IdentidadDelAlta = { listo: true, motivo: null, firma: () => ({ responsableId: id, ubicacionId: "u" }) };
    const f = firmaDeMitad(viva, "alta_producto_valor");
    expect(f.encabezados()["x-responsable"]).toBe("rosa");
    id = "lucia";
    expect(f.encabezados()["x-responsable"]).toBe("lucia");
  });
});

describe("firmaDeMitad — fuera del alta", () => {
  it("sigue soltado del combo, con la clave del ADR-0280 y sin pedir nada", () => {
    const f = firmaDeMitad(null, "alta_producto_marca");
    expect(f.listo).toBe(true);
    expect(f.motivo).toBeNull();
    expect(f.encabezados()).toEqual({ "x-responsable-omitido": "alta_producto_marca" });
    expect(f.firma()).toEqual({ omitida: "alta_producto_marca" });
  });
});

describe("los componentes del alta no firman a mano", () => {
  const dir = new URL("../components/alta-producto/", import.meta.url);
  const archivos = readdirSync(dir).filter((f) => f.endsWith(".tsx"));
  const fuente = (f: string) => readFileSync(new URL(f, dir), "utf8");
  const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("ninguno llama a encabezadosOmitidos ni a firmaOmitida: todo pasa por useFirmaDeMitad", () => {
    for (const f of archivos) {
      const t = sinComentarios(fuente(f));
      expect(t, f).not.toMatch(/\bencabezadosOmitidos\s*\(/);
      expect(t, f).not.toMatch(/\bfirmaOmitida\s*\(/);
    }
  });

  it("solo IdentidadAlta pinta el combo «Responsable»: hay UNO por alta", () => {
    for (const f of archivos) {
      if (f === "IdentidadAlta.tsx") continue;
      expect(sinComentarios(fuente(f)), f).not.toMatch(/<ComboResponsable\b/);
    }
    const form = sinComentarios(readFileSync(new URL("../components/NuevoProductoForm.tsx", import.meta.url), "utf8"));
    expect(form).not.toMatch(/<ComboResponsable\b/);
    expect(form.match(/<QuienRegistra\b/g)).toHaveLength(1);
    expect(form).toMatch(/<IdentidadAltaProveedor\b/);
  });

  it("guardar la prenda con éxito NO suelta la identidad: «Crear otro parecido» sigue con la misma persona", () => {
    const form = readFileSync(new URL("../components/NuevoProductoForm.tsx", import.meta.url), "utf8");
    expect(form).toMatch(/if \(error\) responsable\.despues\(error\);/);
    expect(form).not.toMatch(/^\s*responsable\.despues\(error\);/m);
  });
});
