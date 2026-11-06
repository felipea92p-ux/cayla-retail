import { describe, expect, it } from "vitest";
import { CLAVE_DEL_DISENO, SCRIPT_DEL_DISENO } from "./diseno";

function correr(busqueda: string, almacen: Record<string, string> | "roto" = {}) {
  const atributos: Record<string, string> = {};
  const documento = { documentElement: { setAttribute: (k: string, v: string) => (atributos[k] = v) } };
  const local =
    almacen === "roto"
      ? {
          getItem: () => {
            throw new Error("sin almacén");
          },
          setItem: () => {
            throw new Error("sin almacén");
          },
        }
      : { getItem: (k: string) => almacen[k] ?? null, setItem: (k: string, v: string) => (almacen[k] = v) };
  new Function("document", "localStorage", "location", SCRIPT_DEL_DISENO)(documento, local, { search: busqueda });
  return { atributos, almacen };
}

describe("el interruptor del rediseño", () => {
  it("el cliente que no pidió nada sigue en la tienda actual", () => {
    expect(correr("").atributos).toEqual({});
  });

  it("con ?diseno=nuevo se ve y se recuerda", () => {
    const { atributos, almacen } = correr("?diseno=nuevo");
    expect(atributos).toEqual({ "data-diseno": "nuevo" });
    expect(almacen).toEqual({ [CLAVE_DEL_DISENO]: "nuevo" });
    expect(correr("", { [CLAVE_DEL_DISENO]: "nuevo" }).atributos).toEqual({ "data-diseno": "nuevo" });
  });

  it("con ?diseno=actual se vuelve, aunque estuviera guardado", () => {
    expect(correr("?diseno=actual", { [CLAVE_DEL_DISENO]: "nuevo" }).atributos).toEqual({});
  });

  it("un valor raro o un almacén roto dejan la tienda actual, sin caerse", () => {
    expect(correr("?diseno=xyz").atributos).toEqual({});
    expect(correr("?diseno=nuevo", "roto").atributos).toEqual({});
  });
});
