import { describe, expect, it } from "vitest";
import { atributoDelTema, CLAVE_DEL_TEMA, SCRIPT_DEL_TEMA, temaGuardado, temaSiguiente } from "./tema";

/** Corre el script del `<head>` contra un `<html>` y un almacén de mentira. */
function correr(almacen: Record<string, string> | "roto") {
  const atributos: Record<string, string> = {};
  const documento = { documentElement: { setAttribute: (k: string, v: string) => (atributos[k] = v) } };
  const localStorage =
    almacen === "roto"
      ? {
          getItem: () => {
            throw new Error("sin almacén");
          },
        }
      : { getItem: (k: string) => almacen[k] ?? null };
  new Function("document", "localStorage", SCRIPT_DEL_TEMA)(documento, localStorage);
  return atributos;
}

describe("el tema de la tienda", () => {
  it("lo guardado: solo «claro» y «oscuro» cuentan; lo demás es automático", () => {
    expect(temaGuardado("claro")).toBe("claro");
    expect(temaGuardado("oscuro")).toBe("oscuro");
    for (const raro of [null, undefined, "", "auto", "dark", "OSCURO", "1"]) expect(temaGuardado(raro)).toBe("auto");
  });

  it("cada elección tiene su atributo y el automático ninguno", () => {
    expect(atributoDelTema("claro")).toBe("light");
    expect(atributoDelTema("oscuro")).toBe("dark");
    expect(atributoDelTema("auto")).toBeNull();
  });

  it("el botón recorre automático → claro → oscuro → automático", () => {
    expect(temaSiguiente("auto")).toBe("claro");
    expect(temaSiguiente("claro")).toBe("oscuro");
    expect(temaSiguiente("oscuro")).toBe("auto");
  });

  it("el script del <head> marca <html> con lo guardado, antes de pintar", () => {
    expect(correr({ [CLAVE_DEL_TEMA]: "oscuro" })).toEqual({ "data-theme": "dark" });
    expect(correr({ [CLAVE_DEL_TEMA]: "claro" })).toEqual({ "data-theme": "light" });
  });

  it("sin elección, con un valor raro o con el almacén roto, no marca nada: manda el aparato", () => {
    expect(correr({})).toEqual({});
    expect(correr({ [CLAVE_DEL_TEMA]: "morado" })).toEqual({});
    expect(correr("roto")).toEqual({});
  });
});
