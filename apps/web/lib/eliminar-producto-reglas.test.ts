import { describe, expect, it } from "vitest";
import {
  leerComoEliminar,
  ofreceEliminar,
  rpcParaEliminar,
  salidaSinEliminar,
  textoNoSePuede,
  textoQuienLoCargo,
  textoSeBorra,
  textoSeBorraConHistoria,
  type ComoEliminar,
} from "./eliminar-producto-reglas";

const base: ComoEliminar = { nivel: "libre", puedes: true, razon: null, prendas: 0, movimientos: 0, cargadoPor: null, cargadoEl: null };

describe("leerComoEliminar", () => {
  it("lee la fila única que entrega PostgREST (arreglo de una fila), con los nombres de la base", () => {
    expect(
      leerComoEliminar([
        { nivel: "con_historia", puedes: true, razon: "tiene movimientos de stock (7)", prendas: 13, movimientos: 7, cargado_por: "Danixa Pérez", cargado_el: "2026-09-27T17:12:00+00:00" },
      ])
    ).toEqual({ nivel: "con_historia", puedes: true, razon: "tiene movimientos de stock (7)", prendas: 13, movimientos: 7, cargadoPor: "Danixa Pérez", cargadoEl: "2026-09-27T17:12:00+00:00" });
  });

  it("acepta un objeto suelto, números como texto (bigint) y trata lo vacío como ausente", () => {
    expect(leerComoEliminar({ nivel: "libre", puedes: true, razon: "  ", prendas: "0", movimientos: "0", cargado_por: null, cargado_el: null })).toEqual(base);
  });

  it("cualquier otra forma es null: la ventana no ofrece borrar a ciegas", () => {
    expect(leerComoEliminar(null)).toBeNull();
    expect(leerComoEliminar([])).toBeNull();
    expect(leerComoEliminar([{ nivel: "otro", puedes: true }])).toBeNull();
    expect(leerComoEliminar([{ nivel: "libre", puedes: "true" }])).toBeNull();
    // La respuesta VIEJA de fn_producto_se_puede_eliminar no se confunde con la nueva.
    expect(leerComoEliminar([{ puede: true, razon: null }])).toBeNull();
    expect(leerComoEliminar("hola")).toBeNull();
  });
});

describe("ofreceEliminar y rpcParaEliminar", () => {
  it("sin historia: eliminar_producto (Líder o Admin)", () => {
    expect(ofreceEliminar(base)).toBe(true);
    expect(rpcParaEliminar(base)).toBe("eliminar_producto");
  });

  it("con historia de stock y cuenta Admin: eliminar_producto_con_historia", () => {
    const c = { ...base, nivel: "con_historia" as const };
    expect(ofreceEliminar(c)).toBe(true);
    expect(rpcParaEliminar(c)).toBe("eliminar_producto_con_historia");
  });

  it("con historia de stock y un Líder que no es Admin: ningún botón", () => {
    const c = { ...base, nivel: "con_historia" as const, puedes: false };
    expect(ofreceEliminar(c)).toBe(false);
    expect(rpcParaEliminar(c)).toBeNull();
  });

  it("con documentos o pieza del sistema: nunca, aunque la base dijera puedes", () => {
    expect(rpcParaEliminar({ ...base, nivel: "con_documentos", puedes: true })).toBeNull();
    expect(rpcParaEliminar({ ...base, nivel: "sistema", puedes: true })).toBeNull();
  });
});

describe("textos", () => {
  it("sin historia: qué se borra, en singular y plural, y que no se deshace", () => {
    expect(textoSeBorra(1)).toContain("su única variante");
    expect(textoSeBorra(12)).toContain("sus 12 variantes (todas sus tallas y colores)");
    expect(textoSeBorra(2)).toMatch(/No se puede deshacer\.$/);
  });

  it("sin el número (Existencias abre desde un color en una sede): dice que se van TODAS sus tallas y colores", () => {
    expect(textoSeBorra(null)).toBe(
      "Nunca se vendió ni se movió, así que se borra por completo: su ficha, todas sus tallas y colores, sus códigos de barras y sus fotos. No se puede deshacer."
    );
    expect(textoSeBorraConHistoria(null, 17, 3)).toBe(
      "Ya se movió (17 prendas en stock y 3 movimientos), pero nunca se vendió ni se compró. Se borra todo: su ficha, todas sus tallas y colores, su stock en todas las sedes y ese historial."
    );
  });

  it("con historia: cuenta prendas y movimientos en palabras, sin «0 prendas»", () => {
    expect(textoSeBorraConHistoria(3, 13, 7)).toBe(
      "Ya se movió (13 prendas en stock y 7 movimientos), pero nunca se vendió ni se compró. Se borra todo: su ficha, sus 3 variantes (todas sus tallas y colores), su stock en todas las sedes y ese historial."
    );
    expect(textoSeBorraConHistoria(1, 1, 1)).toContain("(1 prenda en stock y 1 movimiento)");
    expect(textoSeBorraConHistoria(1, 0, 2)).toContain("(2 movimientos)");
  });

  it("quién lo cargó, en fecha de Lima; sin fecha, nada", () => {
    // 00:30 del 28 en UTC es todavía el 27 en Lima.
    expect(textoQuienLoCargo("Danixa Pérez", "2026-09-28T00:30:00+00:00")).toBe("Lo cargó Danixa Pérez el 27/09/2026.");
    expect(textoQuienLoCargo(null, "2026-09-27T15:00:00+00:00")).toBe("Lo cargó alguien sin nombre registrado el 27/09/2026.");
    expect(textoQuienLoCargo("Danixa", null)).toBeNull();
  });

  it("por qué no, según el caso", () => {
    expect(textoNoSePuede("Polo Básico", { nivel: "con_documentos", razon: "tiene líneas de venta (4), líneas de conteo (4)" })).toBe(
      "«Polo Básico» tiene líneas de venta (4), líneas de conteo (4). Del otro lado hay una clienta, un proveedor, otra sede o dinero, y eso no se borra desde aquí."
    );
    expect(textoNoSePuede("Fdhh", { nivel: "con_historia", razon: "tiene movimientos de stock (6)" })).toBe(
      "«Fdhh» tiene movimientos de stock (6). Solo una cuenta Admin puede eliminarlo con su historia."
    );
    expect(textoNoSePuede("Prenda sin Registrar", { nivel: "sistema", razon: "es una pieza del sistema: el cobro de «Monto manual» del punto de venta la necesita" })).toBe(
      "«Prenda sin Registrar» es una pieza del sistema: el cobro de «Monto manual» del punto de venta la necesita."
    );
    expect(textoNoSePuede("X", { nivel: "con_documentos", razon: null })).toMatch(/^«X» ya se usó\./);
  });
});

describe("salidaSinEliminar", () => {
  it("activo: se descontinúa desde Editar", () => {
    expect(salidaSinEliminar("activo", "con_documentos")).toEqual({
      texto: "Si ya no lo quieres a la venta, márcalo como descontinuado: su historia se conserva.",
      irAEditar: true,
    });
    expect(salidaSinEliminar("activo", "con_historia")?.irAEditar).toBe(true);
  });

  it("descontinuado: ya está retirado, no hay nada que sugerir", () => {
    expect(salidaSinEliminar("descontinuado", "con_documentos")).toEqual({ texto: "Ya está descontinuado: su historia se conserva.", irAEditar: false });
  });

  it("una pieza del sistema no tiene salida: no se retira de ninguna manera", () => {
    expect(salidaSinEliminar("activo", "sistema")).toBeNull();
    expect(salidaSinEliminar(null, "sistema")).toBeNull();
  });

  it("sin saber el estado (Existencias no lo lee): se ofrece descontinuar desde Editar, como a uno activo", () => {
    expect(salidaSinEliminar(null, "con_documentos")).toEqual(salidaSinEliminar("activo", "con_documentos"));
  });
});
