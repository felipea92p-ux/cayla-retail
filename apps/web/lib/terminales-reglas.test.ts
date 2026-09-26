import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MODULOS_SOLO_PERSONAS } from "./modulos";
import {
  ALFABETO_CLAVE,
  codigoDeTienda,
  correoTerminal,
  generarClave,
  mensajeErrorAlta,
  nombreOcupado,
  nombrePropuesto,
  normalizarNombre,
  MODULOS_SOLO_PERSONAS_TERMINAL,
  resolverTienda,
  rolesParaTerminal,
  rolSugerido,
  slug,
  sufijoAzar,
  validarEntrada,
} from "./terminales-reglas";

const U1 = "11111111-1111-4111-8111-111111111111";
const R1 = "22222222-2222-4222-8222-222222222222";

describe("la clave", () => {
  it("4 grupos de 5, solo del alfabeto sin símbolos confundibles", () => {
    for (let i = 0; i < 200; i++) {
      const clave = generarClave((n) => randomBytes(n));
      expect(clave).toMatch(/^[^-]{5}-[^-]{5}-[^-]{5}-[^-]{5}$/);
      for (const c of clave.replaceAll("-", "")) expect(ALFABETO_CLAVE).toContain(c);
      expect(clave).not.toMatch(/[0O1lI]/);
    }
  });

  it("descarta los bytes que sesgarían el reparto, sin colgarse", () => {
    let llamadas = 0;
    const azar = (n: number) => new Uint8Array(n).fill(llamadas++ === 0 ? 255 : 0);
    expect(generarClave(azar)).toBe("aaaaa-aaaaa-aaaaa-aaaaa");
  });

  it("dos claves seguidas no se repiten", () => {
    expect(generarClave((n) => randomBytes(n))).not.toBe(generarClave((n) => randomBytes(n)));
  });
});

describe("el correo del aparato: sin datos de ninguna persona", () => {
  it("tienda + nombre sin repetir «terminal» ni el código + 4 al azar", () => {
    expect(correoTerminal("tru", "Terminal Caja TRU", "k7m2")).toBe("terminal-tru-caja-k7m2@cayla.pe");
    expect(correoTerminal("aqp", "Mostrador 2", "ab3d")).toBe("terminal-aqp-mostrador-2-ab3d@cayla.pe");
  });

  it("tildes, eñes y símbolos se limpian; si el nombre solo decía «Terminal TRU», queda el nombre entero", () => {
    expect(correoTerminal("lim", "Almacén Ñaña #1", "zz22")).toBe("terminal-lim-almacen-nana-1-zz22@cayla.pe");
    expect(correoTerminal("tru", "Terminal TRU", "aaaa")).toBe("terminal-tru-terminal-tru-aaaa@cayla.pe");
  });

  it("el sufijo: 4 minúsculas o números, sin confundibles", () => {
    for (let i = 0; i < 100; i++) expect(sufijoAzar((n) => randomBytes(n))).toMatch(/^[a-km-np-z2-9]{4}$/);
  });

  it("slug recorta sin dejar un guion al final", () => {
    expect(slug("Caja de la entrada principal del local", 12)).toBe("caja-de-la-e");
    expect(slug("---", 10)).toBe("terminal");
  });
});

describe("la tienda", () => {
  it("el código sale del nombre en producción (TRU) y en local (Trujillo)", () => {
    expect(codigoDeTienda("Tienda TRU")).toBe("tru");
    expect(codigoDeTienda("Tienda Trujillo")).toBe("tru");
    expect(codigoDeTienda("Tienda Arequipa")).toBe("aqp");
    expect(codigoDeTienda("Tienda Cusco")).toBe("cusco");
  });

  const UBICACIONES = [
    { id: "1", nombre: "Tienda TRU", tipo: "tienda", activo: true },
    { id: "2", nombre: "Tienda Arequipa", tipo: "tienda", activo: true },
    { id: "3", nombre: "Taller LIM", tipo: "taller", activo: true },
    { id: "4", nombre: "Tienda LIM", tipo: "tienda", activo: false },
  ];

  it("resolverTienda (script): solo tiendas activas, y se detiene si no hay o hay dos", () => {
    expect(resolverTienda(UBICACIONES, "TRU").id).toBe("1");
    expect(() => resolverTienda(UBICACIONES, "LIM")).toThrow(/No encontré una tienda activa para LIM/);
    expect(() => resolverTienda([...UBICACIONES, { id: "5", nombre: "Tienda Trujillo Mall", tipo: "tienda", activo: true }], "TRU")).toThrow(/más de una/);
  });
});

describe("lo que se valida antes de crear", () => {
  it("tienda, nombre y rol; el nombre sale sin espacios de sobra", () => {
    expect(validarEntrada({ ubicacionId: U1, nombre: "  Terminal   Caja  TRU ", rolId: R1 })).toEqual({
      ok: true,
      datos: { ubicacionId: U1, nombre: "Terminal Caja TRU", rolId: R1 },
    });
  });

  it("rechaza con un mensaje para el líder, no para un programador", () => {
    expect(validarEntrada({ ubicacionId: "", nombre: "x", rolId: R1 })).toEqual({ ok: false, error: "Elige la tienda de la terminal." });
    expect(validarEntrada({ ubicacionId: U1, nombre: "   ", rolId: R1 })).toMatchObject({ ok: false, error: expect.stringMatching(/Ponle un nombre/) });
    expect(validarEntrada({ ubicacionId: U1, nombre: "x".repeat(61), rolId: R1 })).toMatchObject({ ok: false, error: expect.stringMatching(/muy largo/) });
    expect(validarEntrada({ ubicacionId: U1, nombre: "Caja", rolId: "" })).toMatchObject({ ok: false, error: expect.stringMatching(/rol/) });
    expect(validarEntrada(null)).toMatchObject({ ok: false });
  });

  it("nombre ocupado: igual que el índice de la base (sin mayúsculas ni espacios), solo entre ACTIVAS de la MISMA tienda", () => {
    const t = [
      { ubicacion_id: "a", nombre: "Terminal Caja TRU", activo: true },
      { ubicacion_id: "a", nombre: "Terminal Vieja", activo: false },
      { ubicacion_id: "b", nombre: "Terminal Caja AQP", activo: true },
    ];
    expect(nombreOcupado(t, "a", " terminal  caja tru")).toBe(true);
    expect(nombreOcupado(t, "a", "Terminal Vieja")).toBe(false);
    expect(nombreOcupado(t, "b", "Terminal Caja TRU")).toBe(false);
  });

  it("normalizarNombre", () => {
    expect(normalizarNombre("  a   b ")).toBe("a b");
  });
});

describe("el formulario", () => {
  const roles = [
    { id: "l", clave: "lider", archivado: false, fijo: true },
    { id: "i", clave: "integrante", archivado: false, fijo: false },
    { id: "tv", clave: "terminal_ventas", archivado: false, fijo: false },
    { id: "x", clave: null, archivado: true, fijo: false },
    { id: "m", clave: null, archivado: false, fijo: false },
  ];

  it("ofrece los roles vigentes menos Líder, y sugiere «Terminal de ventas»", () => {
    expect(rolesParaTerminal(roles).map((r) => r.id)).toEqual(["i", "tv", "m"]);
    expect(rolSugerido(roles)).toBe("tv");
    expect(rolSugerido(roles.filter((r) => r.id !== "tv"))).toBe("");
  });

  it("propone «Terminal Caja TRU» y, si ya existe, «Terminal Caja 2 TRU»", () => {
    expect(nombrePropuesto("tru", [])).toBe("Terminal Caja TRU");
    expect(nombrePropuesto("tru", ["terminal caja tru"])).toBe("Terminal Caja 2 TRU");
    expect(nombrePropuesto("tru", ["Terminal Caja TRU", "Terminal Caja 2 TRU"])).toBe("Terminal Caja 3 TRU");
  });

  it("el error de la base, dicho en claro", () => {
    expect(mensajeErrorAlta({ code: "23505", message: "duplicate key" })).toMatch(/ya tiene una terminal activa con ese nombre/);
    expect(mensajeErrorAlta({ code: "23514", message: "Una terminal solo se crea en una tienda activa" })).toMatch(/tienda activa/);
    expect(mensajeErrorAlta(null)).toMatch(/No se pudo crear/);
  });
});

// ADR-0161 P6 (20260923140000): una terminal nunca recibe Colaboradores ni Roles y accesos. La lista vive repetida aquí
// porque este archivo no importa nada (lo carga Node tal cual): esta prueba vigila que diga lo mismo que `lib/modulos.ts`.
describe("P6 · roles para una terminal", () => {
  it("no se ofrece un rol con Colaboradores o Roles y accesos", () => {
    const roles = [
      { id: "tv", clave: "terminal_ventas", archivado: false, fijo: false, modulos: ["vender", "caja"] },
      { id: "g", clave: null, archivado: false, fijo: false, modulos: ["existencias", "colaboradores"] },
      { id: "r", clave: null, archivado: false, fijo: false, modulos: ["roles"] },
    ];
    expect(rolesParaTerminal(roles).map((r) => r.id)).toEqual(["tv"]);
  });
  it("la lista de módulos solo para personas es la misma que la de lib/modulos.ts", () => {
    expect([...MODULOS_SOLO_PERSONAS_TERMINAL].sort()).toEqual([...MODULOS_SOLO_PERSONAS].sort());
  });
});
