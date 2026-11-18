import { describe, expect, it } from "vitest";
import { cuadroVentas, leerSedeCuadre, type CuadroVentas, type SedeCuadre } from "./cuadre-ventas-reglas";
import { SEDE_EMPRESA, SEDE_TODAS } from "./finanzas-telar-reglas";

const sede = (p: Partial<SedeCuadre>): SedeCuadre => ({ ubicacionId: "u1", nombre: "Tienda A", vendido: 0, igv: 0, anulaciones: 0, devoluciones: 0, cambios: 0, claure: 0, otras: 0, ventasNetas: 0, ...p });
const A = sede({ vendido: 11800.1, igv: -1800.2, devoluciones: -100.3, cambios: 200.7, ventasNetas: 10100.3 });
const B = sede({ ubicacionId: "u2", nombre: "Tienda B", vendido: 1770, igv: -270, claure: -500, ventasNetas: 1000 });

type Arriba = Parameters<typeof cuadroVentas>[2][number];
/** La columna de Ganancias y pérdidas de una sede, con lo que ya trae leído. */
const arriba = (s: SedeCuadre, igvCobrado?: number, ventas = s.ventasNetas): Arriba => ({ unidad: "tienda", ubicacionId: s.ubicacionId, ventas, igvCobrado, claureSinIgv: igvCobrado === undefined ? undefined : -s.claure || 0 });

const fila = (c: CuadroVentas, clave: string) => c.filas.find((f) => f.clave === clave);
const claves = (c: CuadroVentas) => c.filas.map((f) => f.clave);

describe("De Ventas a Finanzas (ADR-0609), sin el IGV de la columna", () => {
  const sinIgv = [arriba(A), arriba(B)];
  it("lee los números de la base, también si vienen como texto", () => {
    expect(leerSedeCuadre({ ubicacion_id: "u", nombre: "X", vendido: "118.00", anulaciones_otro_mes: "-100.00", ventas_netas: "18" })).toMatchObject({ vendido: 118, anulaciones: -100, ventasNetas: 18 });
  });
  it("todas las sedes: una columna por sede y su total, en céntimos exactos", () => {
    const c = cuadroVentas([A, B], SEDE_TODAS, sinIgv)!;
    expect(c.columnas).toEqual(["Tienda A", "Tienda B"]);
    expect(c.conTotal).toBe(true);
    expect(fila(c, "vendido")!.total).toBe(13570.1);
    expect(fila(c, "ventasNetas")!.total).toBe(11100.3);
  });
  it("va directo a las ventas sin IGV, lo dice y no dibuja la cifra con IGV", () => {
    const c = cuadroVentas([A, B], SEDE_TODAS, sinIgv)!;
    expect(c.conIgv).toBe(false);
    expect(claves(c)).toEqual(["vendido", "igv", "devoluciones", "cambios", "claure", "ventasNetas"]);
    expect(fila(c, "ventasNetas")!.nombre).toBe("Ventas");
  });
  it("cada columna y el total suman lo que dicen", () => {
    const c = cuadroVentas([A, B], SEDE_TODAS, sinIgv)!;
    const final = fila(c, "ventasNetas")!;
    const partes = c.filas.filter((f) => f.clave !== "ventasNetas");
    final.montos.forEach((m, i) => expect(Math.round(partes.reduce((t, f) => t + f.montos[i]!, 0) * 100) / 100).toBe(m));
    expect(Math.round(partes.reduce((t, f) => t + f.total, 0) * 100) / 100).toBe(final.total);
  });
  it("una sede: solo esa, sin total", () => {
    const c = cuadroVentas([A, B], "u2", sinIgv)!;
    expect(c.columnas).toEqual(["Tienda B"]);
    expect(c.conTotal).toBe(false);
  });
  it("esconde lo que no aporta, nunca el principio ni el final", () => {
    expect(claves(cuadroVentas([A], SEDE_TODAS, sinIgv)!)).toEqual(["vendido", "igv", "devoluciones", "cambios", "ventasNetas"]);
  });
  it("«Sin explicar» solo sale si hay algo, y se reporta", () => {
    expect(cuadroVentas([A], SEDE_TODAS, sinIgv)!.sinExplicar).toBe(0);
    const c = cuadroVentas([sede({ vendido: 100, otras: 3.5, ventasNetas: 103.5 })], SEDE_TODAS, [])!;
    expect(c.sinExplicar).toBe(3.5);
    expect(claves(c)).toContain("otras");
  });
  it("sin nada que comparar no hay cuadro; «De la empresa» no vende", () => {
    expect(cuadroVentas([], SEDE_TODAS, [])).toBeNull();
    expect(cuadroVentas([A], "otra-sede", [])).toBeNull();
    expect(cuadroVentas([A], SEDE_EMPRESA, [])).toBeNull();
    expect(cuadroVentas([sede({})], SEDE_TODAS, [])).toBeNull();
  });
  it("una sede sin su columna deja todo el cuadro sin IGV: nunca la mitad de la cuenta", () => {
    expect(cuadroVentas([A, B], SEDE_TODAS, [arriba(A, 1818.2)])!.conIgv).toBe(false);
  });
});

describe("De Ventas a Finanzas, pasando por «Vendiste con IGV» (2026-11-09)", () => {
  // Cifras inventadas (las reales no entran al repo, que es público: ADR-0609): el total de CAYLA, partido en Lima y el resto.
  const RESTO_OCT = sede({ vendido: 118000.1, igv: -18000.2, devoluciones: -100.3, cambios: 200.7, ventasNetas: 100100.3 });
  const LIMA_OCT = sede({ ubicacionId: "lim", nombre: "Tienda LIM", vendido: 1770, igv: -270, claure: -500, ventasNetas: 1000 });
  const COLUMNAS_OCT = [arriba(RESTO_OCT, 18018.2), arriba(LIMA_OCT, 270)];

  it("primer tramo hasta la cifra de arriba, segundo hasta lo que vendiste, en el orden del cuadro", () => {
    const c = cuadroVentas([RESTO_OCT, LIMA_OCT], SEDE_TODAS, COLUMNAS_OCT)!;
    expect(c.conIgv).toBe(true);
    expect(claves(c)).toEqual(["vendido", "devoluciones", "cambios", "igvAjustes", "vendisteConIgv", "igv", "claure", "ventasNetas"]);
    expect(c.filas.map((f) => f.total)).toEqual([119770.1, -100.3, 200.7, 18, 119888.5, -18288.2, -500, 101100.3]);
    expect(fila(c, "igvAjustes")!.nombre).toBe("IGV de cambios y devoluciones");
    expect(fila(c, "vendisteConIgv")!.nombre).toBe("Vendiste con IGV");
    expect(fila(c, "ventasNetas")!.nombre).toBe("Lo que vendiste");
  });
  it("un mes a medias: cuadra con sus cifras", () => {
    const s = sede({ vendido: 23600, igv: -3600, cambios: 100, claure: -600, ventasNetas: 19500 });
    const c = cuadroVentas([s], SEDE_TODAS, [arriba(s, 3618)])!;
    expect(c.filas.map((f) => f.total)).toEqual([23600, 100, 18, 23718, -3618, -600, 19500]);
    expect(c.sinExplicar).toBe(0);
  });
  it("Lima: sin ajustes la fila de su IGV no sale, y lo de CLAURE sí", () => {
    const c = cuadroVentas([RESTO_OCT, LIMA_OCT], "lim", COLUMNAS_OCT)!;
    expect(claves(c)).toEqual(["vendido", "vendisteConIgv", "igv", "claure", "ventasNetas"]);
    expect(c.filas.map((f) => f.montos[0])).toEqual([1770, 1770, -270, -500, 1000]);
  });
  it("lo de CLAURE es suyo, sin afirmar que se le deba: el efectivo ya lo tiene Claudia", () => {
    const c = cuadroVentas([RESTO_OCT, LIMA_OCT], "lim", COLUMNAS_OCT)!;
    expect(fila(c, "claure")!.detalle).toBe("Sin IGV. Es de CLAURE: no es ingreso de CAYLA");
  });
  it("cada tramo suma, sede por sede y en el total", () => {
    const c = cuadroVentas([RESTO_OCT, LIMA_OCT], SEDE_TODAS, COLUMNAS_OCT)!;
    const corte = claves(c).indexOf("vendisteConIgv");
    const suma = (fs: typeof c.filas, leer: (f: (typeof c.filas)[number]) => number) => Math.round(fs.reduce((t, f) => t + leer(f), 0) * 100) / 100;
    const leeres = [(f: (typeof c.filas)[number]) => f.montos[0]!, (f: (typeof c.filas)[number]) => f.montos[1]!, (f: (typeof c.filas)[number]) => f.total];
    for (const leer of leeres) {
      expect(suma(c.filas.slice(0, corte), leer)).toBe(leer(c.filas[corte]!));
      expect(suma(c.filas.slice(corte, -1), leer)).toBe(leer(c.filas.at(-1)!));
    }
  });
  it("la cifra de cada columna es la de arriba: ventas + IGV + CLAURE", () => {
    const c = cuadroVentas([RESTO_OCT, LIMA_OCT], SEDE_TODAS, COLUMNAS_OCT)!;
    expect(fila(c, "vendisteConIgv")!.montos).toEqual([118118.5, 1770]);
  });
  it("conserva «Anuladas en otro mes» dentro del primer tramo", () => {
    const s = sede({ vendido: 1180, igv: -180, anulaciones: -100, ventasNetas: 900 });
    const c = cuadroVentas([s], SEDE_TODAS, [arriba(s, 162)])!;
    expect(claves(c)).toEqual(["vendido", "anulaciones", "igvAjustes", "vendisteConIgv", "igv", "ventasNetas"]);
    expect(fila(c, "igvAjustes")!.total).toBe(-18);
    expect(fila(c, "vendisteConIgv")!.total).toBe(1062);
    expect(c.sinExplicar).toBe(0);
  });
  it("«Sin explicar» de la base sale antes de la cifra de arriba y apaga el «Cuadra al céntimo»", () => {
    const s = sede({ vendido: 100, otras: 3.5, ventasNetas: 103.5 });
    const c = cuadroVentas([s], SEDE_TODAS, [arriba(s, 0)])!;
    expect(claves(c)).toEqual(["vendido", "otras", "vendisteConIgv", "ventasNetas"]);
    expect(c.sinExplicar).toBe(3.5);
    expect(fila(c, "vendisteConIgv")!.total).toBe(103.5);
  });
  it("si las ventas de arriba no son las del cuadro, sale en «Sin explicar»: el chip no puede mentir", () => {
    const c = cuadroVentas([RESTO_OCT], SEDE_TODAS, [arriba(RESTO_OCT, 18018.2, 100105.3)])!;
    expect(c.sinExplicar).toBe(5);
    expect(fila(c, "otras")!.total).toBe(5);
    expect(fila(c, "ventasNetas")!.total).toBe(100105.3);
  });
  it("una sede de más y otra de menos no se cancelan", () => {
    const uno = sede({ vendido: 100, ventasNetas: 100 });
    const dos = sede({ ubicacionId: "u2", nombre: "Tienda B", vendido: 100, ventasNetas: 100 });
    const c = cuadroVentas([uno, dos], SEDE_TODAS, [arriba(uno, 0, 110), arriba(dos, 0, 90)])!;
    expect(fila(c, "otras")!.total).toBe(0);
    expect(c.sinExplicar).toBe(20);
  });
  it("sin centavos de diferencia no hay «Sin explicar», aunque la suma arrastre decimales de coma flotante", () => {
    const c = cuadroVentas([RESTO_OCT, LIMA_OCT], SEDE_TODAS, COLUMNAS_OCT)!;
    expect(claves(c)).not.toContain("otras");
    expect(c.sinExplicar).toBe(0);
  });
  it("«De la empresa» se casa con su columna, no con el consolidado", () => {
    const e = sede({ ubicacionId: null, nombre: "De la empresa", vendido: 118, igv: -18, ventasNetas: 100 });
    const columnas: Arriba[] = [
      { unidad: "consolidado", ubicacionId: null, ventas: 999, igvCobrado: 99, claureSinIgv: 0 },
      { unidad: "empresa", ubicacionId: null, ventas: 100, igvCobrado: 18, claureSinIgv: 0 },
    ];
    const c = cuadroVentas([e], SEDE_TODAS, columnas)!;
    expect(fila(c, "vendisteConIgv")!.total).toBe(118);
    expect(c.sinExplicar).toBe(0);
  });
});
