import { describe, expect, it } from "vitest";
import { MAX_DESCRIPCION_GASTO } from "./finanzas-topes";
import type { CategoriaGasto } from "./gastos-reglas";
import {
  borradorDe,
  camposDeLaCorreccion,
  cambiosDeLaCorreccion,
  categoriasParaCorregir,
  detalleDelGuardado,
  porQueNoSeCorrige,
  problemaDeLaCorreccion,
  textoDeCambioDeGasto,
  textoGuardarCorreccion,
} from "./gastos-corregir-reglas";

const cat = (codigo: string, nombre: string): CategoriaGasto => ({ codigo, nombre, ejemplos: "", cuenta: "63", cuentaNombre: "" });
const CATS = [cat("limpieza", "Limpieza"), cat("bolsas", "Bolsas y empaque"), cat("viaje_compra", "Viaje de compra"), cat("traer_mercaderia", "Traer la mercadería")];
const GASTO = { estado: "vigente" as const, categoria: "limpieza", categoriaNombre: "Limpieza", descripcion: "Bolsas de papel" };

describe("porQueNoSeCorrige", () => {
  it("un gasto vigente se corrige", () => expect(porQueNoSeCorrige(GASTO)).toBeNull());
  it("uno anulado no", () => expect(porQueNoSeCorrige({ ...GASTO, estado: "anulado" })).toMatch(/anulado/));
  it("uno del viaje se corrige en Compras", () => {
    expect(porQueNoSeCorrige({ ...GASTO, categoria: "viaje_compra" })).toMatch(/Compras/);
    expect(porQueNoSeCorrige({ ...GASTO, categoria: "traer_mercaderia" })).toMatch(/Compras/);
  });
});

describe("categoriasParaCorregir", () => {
  it("deja fuera las del viaje y conserva el orden", () => {
    expect(categoriasParaCorregir(CATS).map((c) => c.codigo)).toEqual(["limpieza", "bolsas"]);
  });
});

describe("problemaDeLaCorreccion", () => {
  it("lo que viene del gasto ya se puede guardar", () => expect(problemaDeLaCorreccion(borradorDe(GASTO))).toBeNull());
  it("sin categoría", () => expect(problemaDeLaCorreccion({ categoria: "", descripcion: "x" })).toBe("Elige la categoría."));
  it("sin «qué fue» (solo espacios)", () => expect(problemaDeLaCorreccion({ categoria: "bolsas", descripcion: "   " })).toBe("Escribe qué se pagó."));
  it("con más letras que el tope de la base", () => {
    expect(problemaDeLaCorreccion({ categoria: "bolsas", descripcion: "a".repeat(MAX_DESCRIPCION_GASTO + 1) })).toMatch(/200 letras/);
    expect(problemaDeLaCorreccion({ categoria: "bolsas", descripcion: "a".repeat(MAX_DESCRIPCION_GASTO) })).toBeNull();
  });
});

describe("cambiosDeLaCorreccion", () => {
  it("sin tocar nada no hay cambios", () => expect(cambiosDeLaCorreccion(GASTO, borradorDe(GASTO), CATS)).toEqual([]));
  it("espacios de más no son un cambio (la base también los quita)", () => {
    expect(cambiosDeLaCorreccion(GASTO, { categoria: "limpieza", descripcion: "  Bolsas de papel " }, CATS)).toEqual([]);
  });
  it("la categoría va por su nombre", () => {
    expect(cambiosDeLaCorreccion(GASTO, { categoria: "bolsas", descripcion: "Bolsas de papel" }, CATS)).toEqual([
      { campo: "categoria", antes: "Limpieza", despues: "Bolsas y empaque" },
    ]);
  });
  it("los dos, en el orden de la hoja", () => {
    const c = cambiosDeLaCorreccion(GASTO, { categoria: "bolsas", descripcion: "Bolsas kraft " }, CATS);
    expect(c.map((x) => x.campo)).toEqual(["categoria", "descripcion"]);
    expect(c[1]).toEqual({ campo: "descripcion", antes: "Bolsas de papel", despues: "Bolsas kraft" });
  });
  it("con la categoría vacía (aún sin elegir) no la cuenta como cambio", () => {
    expect(cambiosDeLaCorreccion(GASTO, { categoria: "", descripcion: "Bolsas de papel" }, CATS)).toEqual([]);
  });
});

describe("textoGuardarCorreccion", () => {
  it.each([
    [0, "Guardar"],
    [1, "Guardar 1 cambio"],
    [2, "Guardar 2 cambios"],
  ])("%i → %s", (n, t) => expect(textoGuardarCorreccion(n)).toBe(t));
});

describe("textoDeCambioDeGasto y detalleDelGuardado", () => {
  it("dice el dato con el nombre de la hoja", () => {
    expect(textoDeCambioDeGasto({ campo: "categoria", antes: "Limpieza", despues: "Bolsas y empaque" })).toBe("En qué: Limpieza → Bolsas y empaque");
    expect(textoDeCambioDeGasto({ campo: "descripcion", antes: "Bolsas", despues: null })).toBe("Qué fue: Bolsas → nada");
    expect(textoDeCambioDeGasto({ campo: "comprobante", antes: "Sin comprobante", despues: "Factura F001-288" })).toBe("Comprobante: Sin comprobante → Factura F001-288");
  });
  it("el aviso dice dónde cuenta ahora solo si cambió la categoría", () => {
    expect(detalleDelGuardado([{ campo: "categoria", antes: "Limpieza", despues: "Bolsas y empaque" }])).toBe("Ahora cuenta en «Bolsas y empaque».");
    expect(detalleDelGuardado([{ campo: "descripcion", antes: "a", despues: "b" }])).toBeUndefined();
  });
});

describe("camposDeLaCorreccion (la guía sale de lo que bloquea guardar)", () => {
  const listo = { listo: true, motivo: null };
  const borradores = [
    borradorDe(GASTO),
    { categoria: "bolsas", descripcion: "Bolsas de papel" },
    { categoria: "", descripcion: "Bolsas" },
    { categoria: "bolsas", descripcion: "  " },
    { categoria: "bolsas", descripcion: "a".repeat(MAX_DESCRIPCION_GASTO + 1) },
    { categoria: "limpieza", descripcion: "Bolsas kraft" },
  ];
  it.each(borradores)("faltan requeridos ⇔ no se puede guardar (%o)", (b) => {
    const cambios = cambiosDeLaCorreccion(GASTO, b, CATS);
    const faltan = camposDeLaCorreccion(b, cambios, listo).filter((c) => c.requerido && !c.hecho);
    const sePuedeGuardar = problemaDeLaCorreccion(b) === null && cambios.length > 0;
    expect(faltan.length === 0).toBe(sePuedeGuardar);
  });
  it("sin tocar nada, lo que falta es cambiar algo", () => {
    const faltan = camposDeLaCorreccion(borradorDe(GASTO), [], listo).filter((c) => !c.hecho);
    expect(faltan.map((c) => c.id)).toEqual(["cambio"]);
  });
  it("sin responsable, lo dice con el motivo del combo", () => {
    const c = camposDeLaCorreccion(borradorDe(GASTO), [], { listo: false, motivo: "Marca tu asistencia." }).find((x) => x.id === "responsable");
    expect(c?.pendiente).toBe("Marca tu asistencia.");
  });
});
