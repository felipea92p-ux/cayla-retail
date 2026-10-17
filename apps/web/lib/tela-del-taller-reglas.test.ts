import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RPC_TELA_DEL_TALLER, RPC_TELA_EN_CAMINO, leerTelaDelTaller, leerTelaEnCamino } from "./tela-del-taller-reglas";

// La lectura de la tela del Taller (ADR-0400, actividad 8d): lo que la base manda y lo que se entiende de ello. La paridad se comprueba LEYENDO la migración.

const MIGRACION = readFileSync(join(__dirname, "../../../supabase/migrations/20261015173000_produccion_tela_del_taller.sql"), "utf8");

const respuesta = (o: Record<string, unknown> = {}) => ({
  telas: [
    {
      insumo_id: "lino",
      comprometido: 37.8,
      ordenes: ["Blusa Marina"],
      en_camino: 50,
      atrasado: 0,
      pedidos: [{ numero_texto: "OI-000003", proveedor: "Textiles Andinos", cantidad: 50, unidad: "metro", fecha_entrega: "2026-10-23", emision: "2026-10-12", atrasado: false }],
    },
  ],
  sin_declarar: [{ id: "o1", producto_id: "p1", referencia: "Vestido Aurora" }],
  ...o,
});

describe("paridad con la base", () => {
  it("la función se llama como la web la llama y pide la ubicación del Taller", () => {
    expect(MIGRACION).toContain(`create or replace function retail.${RPC_TELA_DEL_TALLER}(p_ubicacion_id uuid)`);
  });

  it("las claves que la web lee son las que la base escribe", () => {
    for (const clave of ["telas", "sin_declarar", "insumo_id", "comprometido", "ordenes", "en_camino", "atrasado", "pedidos", "producto_id", "referencia"]) {
      expect(MIGRACION, clave).toContain(`'${clave}'`);
    }
    // Los pedidos los arma `fn_tela_en_camino` (la lectura única); sus llaves viven en su migración.
    const camino = readFileSync(join(__dirname, "../../../supabase/migrations/20261015165000_produccion_tela_pendiente_de_la_orden.sql"), "utf8");
    for (const clave of ["numero_texto", "proveedor", "cantidad", "unidad", "fecha_entrega", "atrasado", "cuenta"]) expect(camino, clave).toContain(`'${clave}'`);
  });

  it("lo que viene en camino sale de la lectura única `fn_tela_en_camino`, la misma de la página de la orden y de Nueva orden", () => {
    expect(MIGRACION).toContain("retail.fn_tela_en_camino(p_ubicacion_id)");
  });

  it("lo comprometido es la cuenta de «Nueva orden»: el plan declarado menos lo descontado de las órdenes abiertas del Taller", () => {
    const nuevaOrden = readFileSync(join(__dirname, "../../../supabase/migrations/20261014154000_produccion_fases_y_tela_de_la_orden.sql"), "utf8");
    const cuenta = "greatest(sum(pi.cantidad_plan) - coalesce((";
    expect(nuevaOrden).toContain(cuenta);
    expect(MIGRACION).toContain(cuenta);
  });
});

describe("leerTelaDelTaller", () => {
  it("lee las telas, sus modelos y sus pedidos, y las órdenes sin tela declarada", () => {
    const l = leerTelaDelTaller(respuesta());
    expect(l?.telas).toEqual([
      { insumoId: "lino", comprometido: 37.8, ordenes: ["Blusa Marina"], enCamino: 50, atrasado: 0, pedidos: [{ numeroTexto: "OI-000003", proveedor: "Textiles Andinos", cantidad: 50, unidad: "metro", fechaEntrega: "2026-10-23", atrasado: false }] },
    ]);
    expect(l?.sinDeclarar).toEqual([{ id: "o1", productoId: "p1", referencia: "Vestido Aurora" }]);
  });

  it("una respuesta que no se entiende es `null` (la base responde NULL a quien no puede leer)", () => {
    expect(leerTelaDelTaller(null)).toBeNull();
    expect(leerTelaDelTaller([])).toBeNull();
    expect(leerTelaDelTaller({ telas: [] })).toBeNull();
    expect(leerTelaDelTaller({ telas: {}, sin_declarar: [] })).toBeNull();
  });

  it("dos listas vacías son «no hay nada», no una falla", () => {
    expect(leerTelaDelTaller({ telas: [], sin_declarar: [] })).toEqual({ telas: [], sinDeclarar: [] });
  });

  it("normaliza los números (texto a número, sin negativos) y descarta lo que no tiene identificador", () => {
    const l = leerTelaDelTaller(respuesta({ telas: [{ insumo_id: "a", comprometido: "12.5", ordenes: [], pedidos: [] }, { insumo_id: "b", comprometido: -3 }, { comprometido: 4 }, "x"] }));
    expect(l?.telas.map((t) => [t.insumoId, t.comprometido])).toEqual([["a", 12.5], ["b", 0]]);
  });

  it("lo que viene en camino y lo atrasado se leen como números (texto a número, sin negativos); sin ellos, cero", () => {
    const l = leerTelaDelTaller(respuesta({ telas: [{ insumo_id: "a", en_camino: "35.5", atrasado: -2 }, { insumo_id: "b" }] }));
    expect(l?.telas.map((t) => [t.insumoId, t.enCamino, t.atrasado])).toEqual([["a", 35.5, 0], ["b", 0, 0]]);
  });

  it("de un pedido o una orden a medias se queda con lo que se entiende", () => {
    const l = leerTelaDelTaller(
      respuesta({
        telas: [{ insumo_id: "a", comprometido: 1, ordenes: ["Una", 3, ""], pedidos: [{ cantidad: 5 }, { numero_texto: "OI-000009", cantidad: "20", proveedor: null, unidad: null }] }],
        sin_declarar: [{ id: "x" }, { id: "y", producto_id: "p", referencia: null }],
      }),
    );
    expect(l?.telas[0].ordenes).toEqual(["Una"]);
    expect(l?.telas[0].pedidos).toEqual([{ numeroTexto: "OI-000009", proveedor: "un proveedor", cantidad: 20, unidad: "unidad", fechaEntrega: null, atrasado: false }]);
    expect(l?.sinDeclarar).toEqual([{ id: "y", productoId: "p", referencia: "Una orden" }]);
  });
});

describe("leerTelaEnCamino — la lectura única de lo que viene (la misma de la página de la orden, el Resumen y Nueva orden)", () => {
  const camino = readFileSync(join(__dirname, "../../../supabase/migrations/20261015165000_produccion_tela_pendiente_de_la_orden.sql"), "utf8");

  it("la web llama a la función con el nombre y el argumento que la base declara", () => {
    expect(RPC_TELA_EN_CAMINO).toBe("fn_tela_en_camino");
    expect(camino).toContain(`create or replace function retail.${RPC_TELA_EN_CAMINO}(p_ubicacion_id uuid)`);
  });

  it("lee, por insumo, lo que cuenta, lo atrasado y los pedidos", () => {
    const m = leerTelaEnCamino([
      { insumo_id: "lino", cuenta: "50.000", atrasado: 30, pedidos: [{ numero_texto: "OI-000003", proveedor: "Textiles Andinos", cantidad: 50, unidad: "metro", fecha_entrega: "2026-10-23", atrasado: false }] },
      { insumo_id: "boton", cuenta: 0, atrasado: 10, pedidos: [{ numero_texto: "OI-000001", proveedor: "Avíos Lima", cantidad: 10, unidad: "unidad", fecha_entrega: "2026-10-01", atrasado: true }] },
    ]);
    expect(m?.get("lino")).toEqual({ cuenta: 50, atrasado: 30, pedidos: [{ numeroTexto: "OI-000003", proveedor: "Textiles Andinos", cantidad: 50, unidad: "metro", fechaEntrega: "2026-10-23", atrasado: false }] });
    expect(m?.get("boton")).toMatchObject({ cuenta: 0, atrasado: 10, pedidos: [{ atrasado: true }] });
  });

  it("una lista vacía es «no viene nada»; lo que no es una lista es `null` (la base responde NULL a quien no puede leer)", () => {
    expect(leerTelaEnCamino([])?.size).toBe(0);
    expect(leerTelaEnCamino(null)).toBeNull();
    expect(leerTelaEnCamino({ no: "una lista" })).toBeNull();
  });

  it("descarta lo que no tiene identificador y no deja que un número roto sume (nada de negativos)", () => {
    const m = leerTelaEnCamino([{ cuenta: 5 }, "basura", { insumo_id: "a", cuenta: -4, atrasado: "x", pedidos: "no" }]);
    expect([...(m?.keys() ?? [])]).toEqual(["a"]);
    expect(m?.get("a")).toEqual({ cuenta: 0, atrasado: 0, pedidos: [] });
  });
});
