import { describe, expect, it } from "vitest";
import { conPreciosAlDia, firmaDeOfertas, mismosPrecios, ticketConPreciosAlDia, type PreciosReleidos } from "./precios-en-vivo-reglas";
import type { FilaOfertaDeMonto, OfertaDeGrupoDeVariante } from "./ofertas-de-grupo";
import { RAZON_CAMPANA, type CampanaLinea } from "./vender-reglas";

const VERANO: CampanaLinea = { etiquetaId: "e1", nombre: "Verano", pct: 20 };

const releido = (precios: Record<string, number>, campanas: Record<string, CampanaLinea> | null = {}): PreciosReleidos => ({
  precios: new Map(Object.entries(precios)),
  campanas: campanas === null ? null : new Map(Object.entries(campanas)),
});

const linea = (varianteId: string, precioUnitario: number, extra: Record<string, unknown> = {}) => ({
  claveLinea: varianteId,
  varianteId,
  referencia: `Blusa ${varianteId}`,
  precioUnitario,
  descuentoUnitario: 0,
  razonDescuento: "",
  razonDescuentoOtro: "",
  argumentoDescuento: "",
  campana: null as CampanaLinea | null,
  ...extra,
});

describe("conPreciosAlDia (Felipe 2026-10-08: el precio cambiado en otra pestaña llega a Vender)", () => {
  const variantes = [
    { varianteId: "a", precio: 100, campana: VERANO },
    { varianteId: "b", precio: 50, campana: null },
  ];
  it("sin lectura todavía, manda lo que trajo el servidor", () => {
    expect(conPreciosAlDia(variantes, null)).toBe(variantes);
  });
  it("toma el precio nuevo y suelta la campaña que ya no rige", () => {
    const [a, b] = conPreciosAlDia(variantes, releido({ a: 100, b: 60 }));
    expect(a).toEqual({ varianteId: "a", precio: 100, campana: null });
    expect(b.precio).toBe(60);
  });
  it("una prenda que la lectura no trajo conserva su precio, y si las campañas no cargaron conserva la suya", () => {
    const [a] = conPreciosAlDia(variantes, releido({}, null));
    expect(a).toBe(variantes[0]);
  });
  it("sin cambios devuelve el mismo arreglo (no repinta la grilla)", () => {
    expect(conPreciosAlDia(variantes, releido({ a: 100, b: 50 }, { a: VERANO }))).toBe(variantes);
  });
});

describe("ticketConPreciosAlDia", () => {
  it("una línea sin descuento toma el precio nuevo y se avisa", () => {
    const r = ticketConPreciosAlDia([linea("a", 100)], releido({ a: 120 }));
    expect(r.carrito[0].precioUnitario).toBe(120);
    expect(r.cambiaron).toEqual(["Blusa a"]);
    expect(r.porRevisar).toEqual([]);
  });
  it("quitar la etiqueta de descuento le quita la campaña a la línea del ticket", () => {
    const conCampana = linea("a", 100, { campana: VERANO, descuentoUnitario: 20, razonDescuento: RAZON_CAMPANA });
    const r = ticketConPreciosAlDia([conCampana], releido({ a: 100 }, {}));
    expect(r.carrito[0]).toMatchObject({ precioUnitario: 100, descuentoUnitario: 0, razonDescuento: "", campana: null });
    expect(r.cambiaron).toEqual(["Blusa a"]);
  });
  it("una campaña nueva entra con su descuento sobre el precio nuevo", () => {
    const r = ticketConPreciosAlDia([linea("a", 100)], releido({ a: 200 }, { a: VERANO }));
    expect(r.carrito[0]).toMatchObject({ precioUnitario: 200, descuentoUnitario: 40, razonDescuento: RAZON_CAMPANA });
  });
  it("con un descuento puesto a mano y el precio cambiado, no se toca: se pide revisarla", () => {
    const manual = linea("a", 100, { descuentoUnitario: 10, razonDescuento: "fidelidad" });
    const r = ticketConPreciosAlDia([manual], releido({ a: 120 }));
    expect(r.carrito[0]).toBe(manual);
    expect(r.porRevisar).toEqual(["Blusa a"]);
  });
  it("una prenda sin registrar no se toca (su precio lo puso la caja)", () => {
    const libre = linea("x", 35, { prendaLibre: { descripcion: "Top" } });
    const r = ticketConPreciosAlDia([libre], releido({ x: 99 }));
    expect(r.carrito[0]).toBe(libre);
    expect(r.cambiaron).toEqual([]);
  });
  it("si las campañas no cargaron, la línea conserva su campaña", () => {
    const conCampana = linea("a", 100, { campana: VERANO, descuentoUnitario: 20, razonDescuento: RAZON_CAMPANA });
    const r = ticketConPreciosAlDia([conCampana], releido({ a: 100 }, null));
    expect(r.carrito[0]).toBe(conCampana);
  });
  it("sin cambios devuelve el mismo carrito", () => {
    const carrito = [linea("a", 100)];
    expect(ticketConPreciosAlDia(carrito, releido({ a: 100 })).carrito).toBe(carrito);
  });
});

describe("mismosPrecios", () => {
  it("compara por valor", () => {
    expect(mismosPrecios(releido({ a: 1 }, { a: VERANO }), releido({ a: 1 }, { a: { ...VERANO } }))).toBe(true);
    expect(mismosPrecios(releido({ a: 1 }, { a: VERANO }), releido({ a: 1 }, {}))).toBe(false);
    expect(mismosPrecios(releido({ a: 1 }), releido({ a: 2 }))).toBe(false);
  });
});

describe("las ofertas de grupo y los montos releídos (ADR-0655)", () => {
  const tresPorDos = (reglaId = "r1"): OfertaDeGrupoDeVariante => ({
    reglaId, tipo: "nxm", lleva: 3, paga: 2, monto: null, porcentaje: null, agrupa: "campana", modeloId: "m1", nombre: "Verano", titular: "3 x 2",
  });
  const monto = (variantes: string[]): FilaOfertaDeMonto => ({
    regla_id: "m", oferta_nombre: "Monto", etiqueta_nombre: "Verano", escalones: [{ desde: 300, ahorra: 30 }], ahorro_en: "soles", cuenta: "campana",
    variantes, excluidas: [],
  });
  it("la firma no depende del orden en que llegan las filas", () => {
    expect(firmaDeOfertas({ a: tresPorDos(), b: tresPorDos() }, [monto(["x", "y"])])).toBe(firmaDeOfertas({ b: tresPorDos(), a: tresPorDos() }, [monto(["y", "x"])]));
  });
  it("cambia si se activa, cambia o se retira un 3x2 o un monto", () => {
    const hoy = firmaDeOfertas({ a: tresPorDos() }, []);
    expect(firmaDeOfertas({}, [])).not.toBe(hoy);
    expect(firmaDeOfertas({ a: { ...tresPorDos(), paga: 1 } }, [])).not.toBe(hoy);
    expect(firmaDeOfertas({ a: tresPorDos("r2") }, [])).not.toBe(hoy);
    expect(firmaDeOfertas({ a: tresPorDos() }, [monto(["x"])])).not.toBe(hoy);
  });
  it("una lectura con otras ofertas no es «lo mismo» aunque precios y campañas no cambien", () => {
    const con = (firma: string): PreciosReleidos => ({ ...releido({ a: 1 }, {}), ofertas: { grupo: {}, monto: [], firma } });
    expect(mismosPrecios(con("x"), con("x"))).toBe(true);
    expect(mismosPrecios(con("x"), con("y"))).toBe(false);
    expect(mismosPrecios(releido({ a: 1 }, {}), con("x"))).toBe(false);
  });
});
