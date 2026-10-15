import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RPC_TELA_DEL_TALLER, leerTelaDelTaller } from "./tela-del-taller-reglas";

// La lectura de la tela del Taller (ADR-0400, actividad 8d): lo que la base manda y lo que se entiende de ello. La paridad se comprueba LEYENDO la migración.

const MIGRACION = readFileSync(join(__dirname, "../../../supabase/migrations/20261015173000_produccion_tela_del_taller.sql"), "utf8");

const respuesta = (o: Record<string, unknown> = {}) => ({
  telas: [
    {
      insumo_id: "lino",
      comprometido: 37.8,
      ordenes: ["Blusa Marina"],
      pedidos: [{ numero_texto: "OI-000003", proveedor: "Textiles Andinos", cantidad: 50, unidad: "metro", fecha_entrega: "2026-10-23", emision: "2026-10-12" }],
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
    for (const clave of ["telas", "sin_declarar", "insumo_id", "comprometido", "ordenes", "pedidos", "numero_texto", "proveedor", "cantidad", "unidad", "fecha_entrega", "producto_id", "referencia"]) {
      expect(MIGRACION, clave).toContain(`'${clave}'`);
    }
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
      { insumoId: "lino", comprometido: 37.8, ordenes: ["Blusa Marina"], pedidos: [{ numeroTexto: "OI-000003", proveedor: "Textiles Andinos", cantidad: 50, unidad: "metro", fechaEntrega: "2026-10-23" }] },
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

  it("de un pedido o una orden a medias se queda con lo que se entiende", () => {
    const l = leerTelaDelTaller(
      respuesta({
        telas: [{ insumo_id: "a", comprometido: 1, ordenes: ["Una", 3, ""], pedidos: [{ cantidad: 5 }, { numero_texto: "OI-000009", cantidad: "20", proveedor: null, unidad: null }] }],
        sin_declarar: [{ id: "x" }, { id: "y", producto_id: "p", referencia: null }],
      }),
    );
    expect(l?.telas[0].ordenes).toEqual(["Una"]);
    expect(l?.telas[0].pedidos).toEqual([{ numeroTexto: "OI-000009", proveedor: "un proveedor", cantidad: 20, unidad: "unidad", fechaEntrega: null }]);
    expect(l?.sinDeclarar).toEqual([{ id: "y", productoId: "p", referencia: "Una orden" }]);
  });
});
