import { describe, expect, it } from "vitest";
import { cortesAnteriores, etiquetaDelCorte, informeDeLaSede, informeDelBalance, lecturaDeLaSede, lecturaDelBalance, nombreDelCierre, partesDeLaSede, partesDelBalance, totalesDelBalance } from "./estados-balance";
import { solesCentimos } from "./flujo-caja-reglas";
import { cuadreArranque, leerMontoArranque, nombreLinea, type LineaBalance, type UnidadBalance } from "./balance-reglas";
import { gruposDelBalance, type GrupoBalance } from "./vale-reglas";

const g = (clave: string, lado: GrupoBalance["lado"], monto: number, nombre = clave): GrupoBalance => ({ clave, nombre, lado, clase: "", monto, lineas: [{ nombre: `${nombre} 1`, monto }] });
const GRUPOS: GrupoBalance[] = [g("plata", "tiene", 30000, "Plata"), g("mercaderia", "tiene", 60000, "Mercadería"), g("equipos", "tiene", 10000, "Muebles"), g("proveedores", "debe", 25000, "Proveedores"), g("impuestos", "debe", 5000, "Impuestos"), g("tuyo", "tuyo", 70000, "Lo tuyo")];
const ANTES: GrupoBalance[] = [g("plata", "tiene", 20000), g("proveedores", "debe", 30000), g("tuyo", "tuyo", 60000)];

describe("los cierres con que se compara", () => {
  it("los dos meses de antes, del más viejo al más nuevo", () => {
    expect(cortesAnteriores("2026-10-14", null)).toEqual([
      { corte: "2026-08-31", etiqueta: "Ago" },
      { corte: "2026-09-30", etiqueta: "Sep" },
    ]);
    expect(nombreDelCierre("2026-10-14")).toBe("fin de septiembre");
    expect(etiquetaDelCorte("2026-10-14")).toBe("Oct");
  });
  it("solo los que Finanzas alcanzó a contar", () => {
    expect(cortesAnteriores("2026-10-14", "2026-09-01").map((c) => c.corte)).toEqual(["2026-09-30"]);
    expect(cortesAnteriores("2026-10-14", "2026-10-01")).toEqual([]);
  });
});

describe("lo que dice la pantalla", () => {
  it("lo que vale, lo que tienes y lo que debes", () => {
    const l = lecturaDelBalance(GRUPOS, ANTES, "2026-10-31");
    expect(l).toMatchObject({ valor: 70000, mal: false, frase: `Es lo que vale CAYLA: tienes ${solesCentimos(100000)} y debes ${solesCentimos(30000)}.` });
    expect(l.chip).toEqual({ texto: `${solesCentimos(10000)} más que a fin de septiembre`, tono: "bien" });
    expect(l.nota).toBe("El 60 % de lo que tienes está en mercadería.");
  });
  it("sin un cierre anterior que cuadre, no compara", () => {
    expect(lecturaDelBalance(GRUPOS, null, "2026-10-31").chip).toBeNull();
  });
  it("menos, igual y en negativo", () => {
    expect(lecturaDelBalance(GRUPOS, [g("tuyo", "tuyo", 80000)], "2026-10-31").chip).toEqual({ texto: `${solesCentimos(10000)} menos que a fin de septiembre`, tono: "mal" });
    expect(lecturaDelBalance(GRUPOS, [g("tuyo", "tuyo", 70000)], "2026-10-31").chip).toEqual({ texto: "Igual que a fin de septiembre", tono: null });
    expect(lecturaDelBalance([g("tuyo", "tuyo", -5)], null, "2026-10-31")).toMatchObject({ mal: true, nota: null });
  });
});

describe("las partes", () => {
  const p = partesDelBalance({ grupos: GRUPOS, comparadas: [{ etiqueta: "Sep", grupos: ANTES }], etiquetaActual: "Oct", corte: "2026-10-31" });
  it("una por grupo; lo tuyo solo está en el tubo", () => {
    expect(p.map((x) => x.clave)).toEqual(["plata", "mercaderia", "equipos", "proveedores", "impuestos", "tuyo"]);
    expect(p.filter((x) => x.soloEnElGrafico).map((x) => x.clave)).toEqual(["tuyo"]);
    expect(p.find((x) => x.clave === "tuyo")).toMatchObject({ tono: "bien", cifra: 70000 });
  });
  it("los dos tubos miden lo mismo", () => {
    const suma = (claves: string[]) => p.filter((x) => claves.includes(x.clave)).reduce((a, x) => a + x.enBarra, 0);
    expect(suma(["plata", "mercaderia", "equipos"])).toBe(suma(["proveedores", "impuestos", "tuyo"]));
  });
  it("lo tuyo que sube es bueno, una deuda que sube no, y lo demás solo se dice", () => {
    expect(p.find((x) => x.clave === "tuyo")!.chip).toEqual({ texto: `${solesCentimos(10000)} más que a fin de septiembre`, tono: "bien" });
    expect(p.find((x) => x.clave === "proveedores")!.chip).toEqual({ texto: `${solesCentimos(5000)} menos que a fin de septiembre`, tono: "bien" });
    expect(p.find((x) => x.clave === "plata")!.chip!.tono).toBeNull();
  });
  it("un cierre que no cuadró no se dibuja", () => {
    const q = partesDelBalance({ grupos: GRUPOS, comparadas: [{ etiqueta: "Sep", grupos: null }], etiquetaActual: "Oct", corte: "2026-10-31" });
    expect(q[0]!.columnas).toHaveLength(1);
    expect(q[0]!.chip).toBeNull();
  });
  it("un grupo negativo no entra al tubo", () => {
    expect(partesDelBalance({ grupos: [g("plata", "tiene", -100)], comparadas: [], etiquetaActual: "Oct", corte: "2026-10-31" })[0]!.enBarra).toBe(0);
  });
});

describe("el informe (camino A, 2026-11-06)", () => {
  const partes = partesDelBalance({ grupos: GRUPOS, comparadas: [], etiquetaActual: "Oct", corte: "2026-10-31" });
  const inf = informeDelBalance({ grupos: GRUPOS, partes, comparadas: [{ etiqueta: "Sep", grupos: null }], etiquetaActual: "Oct" });
  it("con los nombres del contador, sus subtotales y lo tuyo al final", () => {
    expect(inf.filas.map((f) => f.contable)).toEqual(["Efectivo y equivalentes", "Mercadería", "Muebles y equipos", "Total activo", "Proveedores", "Tributos por pagar", "Total pasivo", "Patrimonio"]);
    expect(totalesDelBalance(GRUPOS)).toEqual({ tiene: 100000, debe: 30000, tuyo: 70000 });
  });
  it("cuadra: lo que tienes menos lo que debes es lo tuyo, y cada fila pesa contra lo que tienes", () => {
    const ahora = (clave: string) => inf.filas.find((f) => f.clave === clave)!.valores.at(-1)!;
    expect(ahora("total-tiene") - ahora("total-debe")).toBe(ahora("tuyo"));
    expect(inf.filas.find((f) => f.clave === "mercaderia")!.peso).toBe("60 %");
    // Un cierre que no cuadró no se compara: «—».
    expect(inf.filas[0]!.valores[0]).toBeNull();
  });
});

describe("mirando una sede", () => {
  const u = (o: Partial<UnidadBalance> = {}): UnidadBalance => ({ ubicacionId: "u1", nombre: "Tienda Lima", tipo: "tienda", caja: 2000, mercaderia: 40000, activosFijos: 8000, activosCosto: 10000, activosDepreciacion: 2000, facturasPorPagar: 15000, invertido: 35000, ventasMes: 50000, utilidadMes: 4000, rinde: 0.114, desde: "2026-10-01", hasta: "2026-10-31", planillaVisible: true, sueldosEstimados: 0, ...o });
  it("dice que no es un Balance completo y cuánto rinde", () => {
    const l = lecturaDeLaSede(u(), u({ invertido: 30000 }), "2026-10-31");
    expect(l.frase).toBe(`Es lo que hay invertido en Tienda Lima: tiene ${solesCentimos(50000)} y debe ${solesCentimos(15000)}.`);
    expect(l.nota).toBe("No es un Balance completo: el banco, el capital y el IGV son de CAYLA entera. Rinde 11,4 % al mes.");
    expect(l.chip!.texto).toBe(`${solesCentimos(5000)} más que a fin de septiembre`);
    expect(lecturaDeLaSede(u({ tipo: "taller" }), null, "2026-10-31").nota).toBe("No es un Balance completo: el banco, el capital y el IGV son de CAYLA entera. El Taller no vende.");
  });
  const p = partesDeLaSede({ unidad: u(), comparadas: [{ etiqueta: "Sep", unidad: u({ mercaderia: 30000 }) }], etiquetaActual: "Oct", corte: "2026-10-31" });
  it("lo suyo, parte por parte", () => {
    expect(p.map((x) => x.clave)).toEqual(["caja", "mercaderia", "equipos", "facturas", "invertido"]);
    expect(p.at(-1)).toMatchObject({ soloEnElGrafico: true, tono: "bien" });
    expect(p[2]!.filas).toEqual([
      { nombre: "Lo que costaron", valor: 10000 },
      { nombre: "Desgaste", valor: -2000 },
    ]);
    expect(p[1]!.chip!.texto).toBe(`${solesCentimos(10000)} más que a fin de septiembre`);
  });
  it("los dos tubos miden lo mismo", () => {
    const suma = (claves: string[]) => p.filter((x) => claves.includes(x.clave)).reduce((a, x) => a + x.enBarra, 0);
    expect(suma(["caja", "mercaderia", "equipos"])).toBe(suma(["facturas", "invertido"]));
  });
  it("con la caja abierta su cifra no se muestra (ADR-0186): se dice por qué", () => {
    const q = partesDeLaSede({ unidad: u({ caja: null }), comparadas: [], etiquetaActual: "Oct", corte: "2026-10-31" });
    expect(q[0]).toMatchObject({ texto: "—", cifra: 0, enBarra: 0, que: "La caja está abierta: su cifra la ve quien la cierra." });
    expect(informeDeLaSede({ unidad: u({ caja: null }), partes: q, comparadas: [], etiquetaActual: "Oct" }).filas[0]!.valores).toEqual([null]);
  });
  it("su informe suma", () => {
    const inf = informeDeLaSede({ unidad: u(), partes: [], comparadas: [], etiquetaActual: "Oct" });
    const ahora = (clave: string) => inf.filas.find((f) => f.clave === clave)!.valores.at(-1)!;
    expect(ahora("total-tiene")).toBe(50000);
    expect(ahora("facturas") + ahora("invertido")).toBe(50000);
  });
});

// ADR-0620: el arranque resta los 62,035 de saldo a favor contra los 20,157 de IGV por pagar.
describe("el IGV a favor", () => {
  const lineaIgv = (seccion: LineaBalance["seccion"], monto: number): LineaBalance => ({ seccion, cuenta: "4011", nombre: "IGV — cuenta corriente", monto, orden: 8, detalle: {} });

  it("a favor va en lo que te deben, con su nombre, y no entra a Impuestos", () => {
    const linea = lineaIgv("activo", 41878);
    expect(nombreLinea(linea)).toBe("Crédito fiscal de IGV (SUNAT le debe a CAYLA)");
    const grupos = gruposDelBalance([linea]);
    expect(grupos.map((x) => [x.clave, x.monto])).toEqual([["cobros", 41878]]);
  });
  it("por pagar va en Impuestos, y Impuestos no promete un pago al mes siguiente", () => {
    const linea = lineaIgv("pasivo", 1200);
    expect(nombreLinea(linea)).toBe("IGV por pagar");
    const grupos = gruposDelBalance([linea]);
    expect(grupos.map((x) => x.clave)).toEqual(["impuestos"]);
    const parte = partesDelBalance({ grupos, comparadas: [], etiquetaActual: "Nov", corte: "2026-11-30" }).find((p) => p.clave === "impuestos");
    expect(parte?.que).toContain("Impuestos");
    expect(parte?.que).not.toContain("mes siguiente");
  });
  it("el modal de arranque cuadra con la 4011 en negativo y el capital corregido", () => {
    const lineas = [
      ["101", "activo", 2682.44], ["104", "activo", 5305.24], ["1413", "activo", 5700], ["201", "activo", 82168.11], ["231", "activo", 1238.93], ["241", "activo", 197.93],
      ["332", "activo", 581.7], ["333", "activo", 15327.1], ["335", "activo", 920], ["336", "activo", 39021.48], ["391", "activo", 11979.45], ["122", "pasivo", 11.78],
      ["41", "pasivo", 10571.07], ["4011", "pasivo", -41878], ["50", "patrimonio", 201758.78], ["591", "patrimonio", -29300.15],
    ] as const;
    expect(cuadreArranque(lineas.map(([cuenta, tipo, monto]) => ({ cuenta, tipo, monto }))).cuadra).toBe(true);
    expect(leerMontoArranque("-41878")).toBe(-41878);
    expect(leerMontoArranque("−41878")).toBe(-41878);
  });
});
