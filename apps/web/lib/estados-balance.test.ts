import { describe, expect, it } from "vitest";
import { cortesAnteriores, etiquetaDelCorte, ladosDeLaSede, ladosDelBalance, lecturaDeLaSede, lecturaDelBalance, nombreDelCierre, partesDeLaSede, partesDelBalance, totalesDelBalance } from "./estados-balance";
import { pasosDelLado } from "./estados-partes";
import { solesCentimos } from "./flujo-caja-reglas";
import type { UnidadBalance } from "./balance-reglas";
import type { GrupoBalance } from "./vale-reglas";

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

describe("el libro", () => {
  const lados = ladosDelBalance(GRUPOS);
  it("con sus nombres de siempre y sus totales", () => {
    expect(lados[0]!.filas.map((f) => f.nombre)).toEqual(["Efectivo y equivalentes", "Mercadería", "Muebles y equipos", "Total activo"]);
    expect(lados[1]!.filas.map((f) => f.nombre)).toEqual(["Proveedores", "Tributos por pagar", "Total pasivo", "Patrimonio"]);
    expect(totalesDelBalance(GRUPOS)).toEqual({ tiene: 100000, debe: 30000, tuyo: 70000 });
  });
  it("cada barra mide contra lo que tienes", () => {
    const pasos = pasosDelLado(lados[0]!);
    expect(pasos[1]).toMatchObject({ desde: 0, ancho: 60 });
    expect(pasos[3]).toMatchObject({ ancho: 100, tipo: "total" });
    expect(pasosDelLado({ titulo: "x", total: 0, filas: [{ nombre: "a", valor: 5, tipo: "normal" }] })[0]!.ancho).toBe(0);
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
    expect(ladosDeLaSede(u({ caja: null }))[0]!.filas.map((f) => f.nombre)).not.toContain("Cajón y caja fuerte");
  });
  it("su libro suma", () => {
    const [a, b] = ladosDeLaSede(u());
    expect(a!.filas.at(-1)).toMatchObject({ valor: 50000 });
    expect(b!.filas.reduce((x, f) => x + f.valor, 0)).toBe(50000);
  });
});
