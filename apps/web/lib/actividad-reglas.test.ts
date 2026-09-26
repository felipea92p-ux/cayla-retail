import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MODULOS_CON_ACTIVIDAD,
  agruparPorDia,
  desdeDe,
  etiquetaDelDia,
  inicioDelDiaLima,
  moduloDeRuta,
  opcionesDeModulo,
  opcionesDePersona,
  pieDeFila,
  veActividad,
  type FilaActividad,
} from "./actividad-reglas";
import { CLAVES_MODULO, MODULOS_SOLO_PERSONAS } from "./modulos";

// La receta del ADR-0207 y los módulos que se suman después con su propia migración (Apartados: 20260927120000).
const MIGRACION = [
  "20260926090000_actividad_por_modulo.sql",
  "20260927120000_apartados_actividad_y_editar.sql",
]
  .map((f) => readFileSync(new URL(`../../../supabase/migrations/${f}`, import.meta.url), "utf8"))
  .join("\n");

// 25 de setiembre, 10:00 en Lima = 15:00 UTC.
const AHORA = new Date("2026-09-25T15:00:00Z");

const fila = (p: Partial<FilaActividad>): FilaActividad => ({
  id: 1,
  ocurrio_at: AHORA.toISOString(),
  modulo: "caja",
  accion: "caja_abierta",
  descripcion: "abrió la caja con S/ 100.00",
  persona_id: null,
  persona_nombre: "Rosa Mendoza",
  terminal_nombre: null,
  ubicacion_id: null,
  ubicacion_nombre: "Tienda Trujillo",
  ubicacion_destino_nombre: null,
  tabla: "cajas",
  registro_id: "x",
  detalle: {},
  origen: "vivo",
  ...p,
});

describe("quién ve el botón «Actividad»", () => {
  it("el líder, siempre; una persona, con el módulo; una terminal, nunca", () => {
    expect(veActividad({ rol: "lider" })).toBe(true);
    expect(veActividad({ rol: "integrante", modulos: ["vender"] })).toBe(false);
    expect(veActividad({ rol: "integrante", modulos: ["vender", "actividad"] })).toBe(true);
    expect(veActividad({ rol: "integrante", terminal: true, modulos: ["actividad"] })).toBe(false);
    expect(veActividad({ rol: "lider", terminal: true })).toBe(false);
  });

  it("«Actividad» es de los módulos que solo se dan a personas", () => {
    expect(MODULOS_SOLO_PERSONAS).toContain("actividad");
    expect(MIGRACION).toMatch(/c_solo_personas constant text\[\] := array\['colaboradores', 'roles', 'actividad'\]/);
  });
});

describe("el módulo de la pantalla donde uno está parado", () => {
  it("la ruta más larga manda", () => {
    expect(moduloDeRuta("/vender")).toBe("vender");
    expect(moduloDeRuta("/vender/historial")).toBe("historial");
    expect(moduloDeRuta("/vender/apartados")).toBe("apartados");
    expect(moduloDeRuta("/caja")).toBe("caja");
    expect(moduloDeRuta("/caja/historial")).toBe("caja");
    expect(moduloDeRuta("/cambios")).toBe("cambios");
    expect(moduloDeRuta("/inventario/traslados")).toBe("traslados");
    expect(moduloDeRuta("/inventario")).toBe("existencias");
    expect(moduloDeRuta("/clientas")).toBe("clientas");
  });

  it("Inicio o una ruta sin módulo: ninguno (el panel muestra todos)", () => {
    expect(moduloDeRuta("/")).toBeNull();
    expect(moduloDeRuta("/buscar")).toBeNull();
  });
});

describe("los módulos que ya anotan su actividad", () => {
  it("existen en el catálogo y la migración los anota", () => {
    for (const m of MODULOS_CON_ACTIVIDAD) {
      expect(CLAVES_MODULO).toContain(m);
      expect(MIGRACION, m).toContain(`'${m}', '`);
    }
  });
});

describe("los combos: lo elegido siempre está en la lista", () => {
  it("«Módulo»: todos primero, luego los que anotan", () => {
    expect(opcionesDeModulo(null).map((o) => o.valor)).toEqual(["", ...MODULOS_CON_ACTIVIDAD]);
    expect(opcionesDeModulo(null)[0].texto).toBe("Todos los módulos");
    expect(opcionesDeModulo("caja")).toEqual(opcionesDeModulo(null));
  });

  it("«Módulo»: parado en uno que todavía no anota, también está (si no, el combo diría «Elegir»)", () => {
    const opciones = opcionesDeModulo("existencias");
    expect(opciones.map((o) => o.valor)).toEqual(["", ...MODULOS_CON_ACTIVIDAD, "existencias"]);
    expect(opciones.at(-1)?.texto).toBe("Existencias");
  });

  it("«Persona»: la elegida sigue aunque ya no tenga actividad en lo que se mira, y no se repite", () => {
    const rosa = { persona_id: "r", nombre: "Rosa Mendoza" };
    const ana = { persona_id: "a", nombre: "Ana Díaz" };
    expect(opcionesDePersona([rosa], null)).toEqual([
      { valor: "", texto: "Todas las personas" },
      { valor: "r", texto: "Rosa Mendoza" },
    ]);
    expect(opcionesDePersona([rosa, ana], ana).map((o) => o.valor)).toEqual(["", "r", "a"]);
    expect(opcionesDePersona([rosa], ana).map((o) => o.valor)).toEqual(["", "r", "a"]);
  });
});

describe("fechas en hora de Lima", () => {
  it("«Hoy» empieza a la medianoche de Lima (05:00 UTC)", () => {
    expect(inicioDelDiaLima(AHORA).toISOString()).toBe("2026-09-25T05:00:00.000Z");
    // 23:30 en Lima del 24 = 04:30 UTC del 25: sigue siendo el 24.
    expect(inicioDelDiaLima(new Date("2026-09-25T04:30:00Z")).toISOString()).toBe("2026-09-24T05:00:00.000Z");
    expect(desdeDe("hoy", AHORA)).toBe("2026-09-25T05:00:00.000Z");
    expect(desdeDe("7d", AHORA)).toBe("2026-09-19T05:00:00.000Z");
    expect(desdeDe("todo", AHORA)).toBeNull();
  });

  it("agrupa por día: Hoy, Ayer y la fecha", () => {
    expect(etiquetaDelDia("2026-09-25T06:00:00Z", AHORA)).toBe("Hoy");
    expect(etiquetaDelDia("2026-09-25T04:59:00Z", AHORA)).toBe("Ayer");
    const grupos = agruparPorDia(
      [fila({ id: 3, ocurrio_at: "2026-09-25T14:00:00Z" }), fila({ id: 2, ocurrio_at: "2026-09-24T20:00:00Z" }), fila({ id: 1, ocurrio_at: "2026-09-22T20:00:00Z" })],
      AHORA,
    );
    expect(grupos.map((g) => [g.dia, g.filas.length])).toEqual([
      ["Hoy", 1],
      ["Ayer", 1],
      [expect.stringMatching(/^Martes, 22 de sep?tiembre$/), 1],
    ]);
  });
});

describe("la línea de debajo", () => {
  it("hora, aparato y, si se miran varias sedes, la sede (o las dos de un traslado)", () => {
    expect(pieDeFila(fila({ terminal_nombre: "Caja 1" }), { conSede: false })).toBe("10:00 · Caja 1");
    expect(pieDeFila(fila({}), { conSede: true })).toBe("10:00 · Tienda Trujillo");
    expect(pieDeFila(fila({ ubicacion_nombre: "Tienda Lima", ubicacion_destino_nombre: "Tienda Trujillo" }), { conSede: true })).toBe(
      "10:00 · Tienda Lima → Tienda Trujillo",
    );
    expect(pieDeFila(fila({ detalle: { es_prueba: true } }), { conSede: false })).toBe("10:00 · prueba");
  });
});
