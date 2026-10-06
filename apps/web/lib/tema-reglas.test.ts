import { describe, expect, it } from "vitest";
import {
  alternarTema,
  ATRIBUTO_TEMA,
  CLAVE_TEMA,
  esTema,
  resolverTema,
  SCRIPT_TEMA_ANTES_DE_PINTAR,
  TEMA_POR_DEFECTO,
  textosDelBoton,
} from "./tema-reglas";

describe("tema — reglas puras (ADR-0336)", () => {
  it("arranca en claro: nadie se encuentra el ERP distinto el día del despliegue", () => {
    expect(TEMA_POR_DEFECTO).toBe("claro");
  });

  it("esTema solo acepta los dos temas, exactos", () => {
    expect(esTema("claro")).toBe(true);
    expect(esTema("oscuro")).toBe(true);
    for (const raro of ["OSCURO", "dark", "light", "", " oscuro", null, undefined, 1, {}, []]) expect(esTema(raro)).toBe(false);
  });

  it("lo guardado ausente, viejo o corrupto cae al claro; lo válido se respeta", () => {
    expect(resolverTema("oscuro")).toBe("oscuro");
    expect(resolverTema("claro")).toBe("claro");
    for (const raro of [null, undefined, "", "dark", "OSCURO", 0, {}]) expect(resolverTema(raro)).toBe("claro");
  });

  it("alternar va y vuelve (A→B→A)", () => {
    expect(alternarTema("claro")).toBe("oscuro");
    expect(alternarTema("oscuro")).toBe("claro");
    expect(alternarTema(alternarTema("claro"))).toBe("claro");
  });

  it("el nombre accesible del botón no cambia; el título dice qué hará el clic", () => {
    expect(textosDelBoton("claro").etiqueta).toBe("Modo oscuro");
    expect(textosDelBoton("oscuro").etiqueta).toBe("Modo oscuro");
    expect(textosDelBoton("claro").titulo).toBe("Cambiar a modo oscuro");
    expect(textosDelBoton("oscuro").titulo).toBe("Cambiar a modo claro");
  });
});

// El script se inyecta como cadena en el <head>: aquí se ejecuta de verdad contra un documento y un almacenamiento falsos.
function correrScript(almacen: { getItem: (k: string) => string | null }) {
  const atributos: Record<string, string> = {};
  const documento = { documentElement: { setAttribute: (k: string, v: string) => void (atributos[k] = v) } };
  new Function("document", "localStorage", SCRIPT_TEMA_ANTES_DE_PINTAR)(documento, almacen);
  return atributos;
}

describe("script anti-parpadeo", () => {
  it("lee la clave que usa el botón y fija el atributo que lee el CSS", () => {
    const pedidas: string[] = [];
    const a = correrScript({ getItem: (k) => (pedidas.push(k), "oscuro") });
    expect(pedidas).toEqual([CLAVE_TEMA]);
    expect(a).toEqual({ [ATRIBUTO_TEMA]: "oscuro" });
  });

  it("guardado «claro» o ausente → claro, y SIEMPRE deja un valor puesto", () => {
    expect(correrScript({ getItem: () => "claro" })).toEqual({ [ATRIBUTO_TEMA]: "claro" });
    expect(correrScript({ getItem: () => null })).toEqual({ [ATRIBUTO_TEMA]: "claro" });
  });

  it("un valor corrupto no oscurece la página", () => {
    for (const raro of ["dark", "OSCURO", "1", "undefined", "<script>"]) {
      expect(correrScript({ getItem: () => raro })).toEqual({ [ATRIBUTO_TEMA]: "claro" });
    }
  });

  it("si el almacenamiento falla (ventana privada, datos bloqueados) cae al claro sin lanzar", () => {
    const roto = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(() => correrScript(roto)).not.toThrow();
    expect(correrScript(roto)).toEqual({ [ATRIBUTO_TEMA]: "claro" });
  });

  it("es una sola línea sin comillas simples ni saltos: se inyecta tal cual en un <script>", () => {
    expect(SCRIPT_TEMA_ANTES_DE_PINTAR).not.toMatch(/[\n\r]/);
    expect(SCRIPT_TEMA_ANTES_DE_PINTAR).not.toContain("</script");
  });
});
