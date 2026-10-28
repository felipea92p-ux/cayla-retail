import { describe, expect, it } from "vitest";
import { calcular, type FilaPlan } from "./plan-compra-reglas";
import {
  compararConHoy,
  hayCambiosSinVersion,
  leerVersionConFoto,
  leerVersiones,
  notaDeLaVersion,
  notaSugerida,
  numeroDeLaSiguiente,
  origenEnPalabras,
  planDeLaFoto,
  versionDeHoy,
  type LineaDeVersion,
  type VersionConFoto,
  type VersionDelPlan,
} from "./plan-compra-versiones";

const version = (numero: number, huella: string, extra: Record<string, unknown> = {}) => ({
  numero, nota: `Nota ${numero}`, origen: "manual", restaurada_de: null, precio_de_la_plata: 0, tope: null, prendas: 100, inversion: 5000, huella, por: "Felipe", en: "2026-10-26T15:00:00+00:00", ...extra,
});
const respuesta = (versiones: unknown[], extra: Record<string, unknown> = {}) => ({ soportado: true, precio_de_la_plata: 0, tope: null, huella_actual: "h3", versiones, ...extra });

describe("leer lo que manda la base", () => {
  it("sin la marca «soportado», o con una forma que no es, no hay versiones (la base todavía no las tiene)", () => {
    expect(leerVersiones(null)).toBeNull();
    expect(leerVersiones([])).toBeNull();
    expect(leerVersiones({ ...respuesta([]), soportado: false })).toBeNull();
    expect(leerVersiones({ versiones: [] })).toBeNull();
    expect(leerVersiones({ ...respuesta([]), huella_actual: "" })).toBeNull();
    expect(leerVersiones({ ...respuesta([]), precio_de_la_plata: "no" })).toBeNull();
  });
  it("lee el precio de la plata y el tope de hoy, y ordena de la más nueva a la más vieja", () => {
    const l = leerVersiones(respuesta([version(1, "h1"), version(3, "h3"), version(2, "h2")], { precio_de_la_plata: "0.100", tope: "28000.00" }))!;
    expect(l.precioDeLaPlata).toBe(0.1);
    expect(l.tope).toBe(28000);
    expect(l.versiones.map((v) => v.numero)).toEqual([3, 2, 1]);
  });
  it("una fila que no calza se descarta sin llevarse a las demás; nunca se inventa una", () => {
    const l = leerVersiones(respuesta([version(1, "h1"), { numero: 2 }, "x", null, version(0, "h0"), version(4, "h4", { origen: "inventado" }), version(5, "h5", { huella: "" }), version(6, "h6")]))!;
    expect(l.versiones.map((v) => v.numero)).toEqual([6, 1]);
  });
  it("un tope en 0 o negativo cuenta como sin tope; las prendas y la inversión que no se saben quedan en null", () => {
    const l = leerVersiones(respuesta([version(1, "h1", { tope: 0, prendas: null, inversion: "x" })], { tope: -5 }))!;
    expect(l.tope).toBeNull();
    expect(l.versiones[0]).toMatchObject({ tope: null, prendas: null, inversion: null });
  });
});

describe("cuál es la de hoy", () => {
  const l = leerVersiones(respuesta([version(1, "h1"), version(2, "h2"), version(3, "h3")]))!;
  it("la de hoy es la de la misma huella que el plan", () => {
    expect(versionDeHoy(l)?.numero).toBe(3);
    expect(versionDeHoy({ ...l, huellaActual: "h1" })?.numero).toBe(1);
  });
  it("si ninguna coincide, el plan tiene cambios que ninguna versión recuerda (si tiene categorías)", () => {
    const otro = { ...l, huellaActual: "otra" };
    expect(versionDeHoy(otro)).toBeNull();
    expect(hayCambiosSinVersion(otro, true)).toBe(true);
    expect(hayCambiosSinVersion(otro, false)).toBe(false);
    expect(hayCambiosSinVersion(l, true)).toBe(false);
  });
  it("la siguiente lleva el número que sigue a la más nueva, o el 1", () => {
    expect(numeroDeLaSiguiente(l)).toBe(4);
    expect(numeroDeLaSiguiente({ ...l, versiones: [] })).toBe(1);
  });
});

const linea = (categoria_id: string, normal: number, extra: Record<string, unknown> = {}) => ({ categoria_id, flojo: 80, normal, bueno: 180, precio: 79.9, costo: 32, recupero_pct: 50, descuento_pct: 0, curva: {}, nota: null, ...extra });
describe("la foto de una versión", () => {
  it("lee las categorías con sus supuestos; una línea que no calza se descarta", () => {
    const f = leerVersionConFoto({ ...version(2, "h2"), lineas: [linea("a", 120), { categoria_id: "b" }, linea("c", 90, { descuento_pct: "10" }), null] })!;
    expect(f.version.numero).toBe(2);
    expect(f.lineas.map((l) => [l.categoriaId, l.normal, l.descuentoPct])).toEqual([["a", 120, 0], ["c", 90, 10]]);
  });
  it("sin lista de categorías, o con una versión que no calza, no hay foto", () => {
    expect(leerVersionConFoto({ ...version(2, "h2") })).toBeNull();
    expect(leerVersionConFoto({ numero: 2, lineas: [] })).toBeNull();
    expect(leerVersionConFoto(null)).toBeNull();
  });
});

// Una hoja de hoy con dos categorías con plan y una sin plan, con su stock.
const fila = (id: string, nombre: string, l: LineaDeVersion | null, stock: number, precioDeLaPlata = 0): FilaPlan =>
  ({ c: { id, nombre }, linea: l ?? undefined, stock, enCamino: 0, calculo: l ? calcular(l, stock, precioDeLaPlata) : null }) as unknown as FilaPlan;
const base = (id: string, normal: number, extra: Partial<LineaDeVersion> = {}): LineaDeVersion => ({ categoriaId: id, flojo: 80, normal, bueno: 180, precio: 79.9, costo: 32, recuperoPct: 50, descuentoPct: 0, ...extra });
const foto = (lineas: LineaDeVersion[], extra: Partial<VersionDelPlan> = {}): VersionConFoto => ({
  version: { numero: 2, nota: "", origen: "manual", restauradaDe: null, precioDeLaPlata: 0, tope: null, prendas: null, inversion: null, huella: "h2", por: null, en: null, ...extra },
  lineas,
});

describe("lo que compraría la foto con lo de hoy", () => {
  it("las decisiones de entonces con el stock de ahora: es la misma cuenta de calcular", () => {
    const lineas = [base("a", 120), base("b", 90)];
    const plan = planDeLaFoto(lineas, 0, [fila("a", "Polos", null, 40), fila("b", "Faldas", null, 10)]);
    expect(plan.porCategoria.get("a")?.comprar).toBe(calcular(lineas[0], 40).comprar);
    expect(plan.porCategoria.get("b")?.comprar).toBe(calcular(lineas[1], 10).comprar);
    expect(plan.prendas).toBe(plan.porCategoria.get("a")!.comprar + plan.porCategoria.get("b")!.comprar);
  });
  it("con otro precio de la plata compra distinto; una categoría que hoy no está en la hoja no cuenta", () => {
    const lineas = [base("a", 120), base("fuera", 90)];
    const sin = planDeLaFoto(lineas, 0, [fila("a", "Polos", null, 40)]);
    const con = planDeLaFoto(lineas, 0.3, [fila("a", "Polos", null, 40)]);
    expect(con.prendas).toBeLessThan(sin.prendas);
    expect(sin.porCategoria.has("fuera")).toBe(false);
  });
});

describe("qué cambió contra el plan de hoy", () => {
  const a = base("a", 120);
  const b = base("b", 90);
  const hoyIgual = { precioDeLaPlata: 0, tope: null as number | null, filas: [fila("a", "Polos", a, 40), fila("b", "Faldas", b, 10), fila("c", "Casacas", null, 5)] };
  it("si todo es igual, no hay cambios", () => {
    const c = compararConHoy(foto([a, b]), hoyIgual);
    expect(c.sinCambios).toBe(true);
    expect(c.categorias).toEqual([]);
    expect(c.prendasEnLaVersion).toBe(c.prendasHoy);
    expect(c.inversionEnLaVersion).toBe(c.inversionHoy);
  });
  it("una categoría con otro escenario compra distinto: sale en la lista con lo de cada lado", () => {
    // Con lo que sobra a la mitad del precio, sobrar no cuesta: se compra hasta el bueno. Por eso el escenario que mueve la compra es el bueno.
    const otro = base("a", 120, { bueno: 250 });
    const c = compararConHoy(foto([a, b]), { ...hoyIgual, filas: [fila("a", "Polos", otro, 40), fila("b", "Faldas", b, 10)] });
    expect(c.sinCambios).toBe(false);
    expect(c.categorias).toHaveLength(1);
    expect(c.categorias[0]).toMatchObject({ clave: "a", nombre: "Polos", enLaVersion: calcular(a, 40).comprar, hoy: calcular(otro, 40).comprar, soloSupuestos: false });
    expect(c.prendasHoy).toBeGreaterThan(c.prendasEnLaVersion);
  });
  it("una categoría armada DESPUÉS no estaba en la foto: sale con «no estaba»", () => {
    const c = compararConHoy(foto([a]), { ...hoyIgual, filas: [fila("a", "Polos", a, 40), fila("b", "Faldas", b, 10)] });
    expect(c.categorias).toEqual([{ clave: "b", nombre: "Faldas", enLaVersion: null, hoy: calcular(b, 10).comprar, soloSupuestos: false }]);
  });
  it("otros supuestos con la misma compra (el stock cubre todo) no se esconden: sale marcada «solo supuestos»", () => {
    // Con 500 en stock nada se compra con ningún escenario: lo único que cambió son los supuestos.
    const c = compararConHoy(foto([base("a", 120)]), { ...hoyIgual, filas: [fila("a", "Polos", base("a", 170), 500)] });
    expect(c.categorias).toEqual([{ clave: "a", nombre: "Polos", enLaVersion: 0, hoy: 0, soloSupuestos: true }]);
    expect(c.sinCambios).toBe(false);
  });
  it("el tope y el precio de la plata distintos salen aparte; iguales, no", () => {
    const c = compararConHoy(foto([a, b], { tope: 28000, precioDeLaPlata: 0.1 }), { ...hoyIgual, tope: null });
    expect(c.tope).toEqual({ enLaVersion: 28000, hoy: null });
    expect(c.precioDeLaPlata).toEqual({ enLaVersion: 0.1, hoy: 0 });
    expect(c.sinCambios).toBe(false);
    const igual = compararConHoy(foto([a, b], { tope: 28000 }), { ...hoyIgual, tope: 28000 });
    expect(igual.tope).toBeNull();
    expect(igual.precioDeLaPlata).toBeNull();
  });
  it("el precio de la plata de la versión se aplica a SU cuenta: la versión con tope compra menos que hoy sin tope", () => {
    const filas = [fila("a", "Polos", a, 40), fila("b", "Faldas", b, 10)];
    const c = compararConHoy(foto([a, b], { precioDeLaPlata: 0.3 }), { precioDeLaPlata: 0, tope: null, filas });
    expect(c.prendasEnLaVersion).toBeLessThan(c.prendasHoy);
  });
});

describe("cómo se dice una versión", () => {
  it("el origen en palabras", () => {
    expect(origenEnPalabras({ origen: "manual", restauradaDe: null })).toBeNull();
    expect(origenEnPalabras({ origen: "plan_con_tope", restauradaDe: null })).toBe("Plan con tope");
    expect(origenEnPalabras({ origen: "restauracion", restauradaDe: 2 })).toBe("Volvió a la versión 2");
    expect(origenEnPalabras({ origen: "automatica", restauradaDe: null })).toBe("Guardada sola antes de un cambio");
  });
  it("una fila de la lista nunca queda sin decir qué es", () => {
    expect(notaDeLaVersion({ nota: "Subí Tops", origen: "manual", restauradaDe: null })).toBe("Subí Tops");
    expect(notaDeLaVersion({ nota: "  ", origen: "manual", restauradaDe: null })).toBe("Punto de control");
    expect(notaDeLaVersion({ nota: "", origen: "plan_con_tope", restauradaDe: null })).toBe("Plan con tope");
  });
  it("la nota que propone la hoja", () => {
    expect(notaSugerida("manual", null, null)).toBe("");
    expect(notaSugerida("plan_con_tope", 28000, null)).toBe("Plan con tope de S/ 28,000");
    expect(notaSugerida("plan_con_tope", null, null)).toBe("Plan con tope");
    expect(notaSugerida("restauracion", null, 3)).toBe("Volví a la versión 3");
  });
});
