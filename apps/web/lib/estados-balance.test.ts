import { describe, expect, it } from "vitest";
import { avisoSueldosDelBalance, cortesAnteriores, etiquetaDelCorte, informeDeLaSede, informeDelBalance, lecturaDeLaSede, lecturaDelBalance, nombreDelCierre, partesDeLaSede, partesDelBalance, totalesDelBalance } from "./estados-balance";
import { solesCentimos } from "./flujo-caja-reglas";
import { cuadreArranque, leerMontoArranque, nombreLinea, type LineaBalance, type UnidadBalance } from "./balance-reglas";
import { gruposDelBalance, type GrupoBalance } from "./vale-reglas";

const g = (clave: string, lado: GrupoBalance["lado"], monto: number, nombre = clave): GrupoBalance => ({ clave, nombre, lado, clase: "", monto, lineas: [{ nombre: `${nombre} 1`, monto, cuenta: lado === "tuyo" ? "50" : clave }] });
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
    expect(l).toMatchObject({ valor: 70000, mal: false, frase: `Es lo que vale CAYLA: Activo ${solesCentimos(100000)} menos Pasivo ${solesCentimos(30000)}.` });
    expect(l.chip).toEqual({ texto: `${solesCentimos(10000)} más que a fin de septiembre`, tono: "bien" });
    expect(l.nota).toBe("El 60 % del Activo está en mercadería y telas.");
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
  it("tres secciones, cada una con su total, y Pasivo + Patrimonio al final", () => {
    expect(inf.filas.map((f) => f.contable)).toEqual(["Activo", "Efectivo y equivalentes", "Existencias", "Muebles y equipos", "Total activo", "Pasivo", "Proveedores", "Tributos por pagar", "Total pasivo", "Patrimonio", "Capital", "Total patrimonio", "Total pasivo y patrimonio"]);
    expect(totalesDelBalance(GRUPOS)).toEqual({ tiene: 100000, debe: 30000, tuyo: 70000 });
  });
  it("cuadra: Activo = Pasivo + Patrimonio, y cada fila pesa contra el Activo", () => {
    const ahora = (clave: string) => inf.filas.find((f) => f.clave === clave)!.valores.at(-1)!;
    expect(ahora("total-tiene") - ahora("total-debe")).toBe(ahora("total-tuyo"));
    expect(ahora("total-pasivo-patrimonio")).toBe(ahora("total-tiene"));
    expect(inf.filas.find((f) => f.clave === "mercaderia")!.peso).toBe("60 %");
    // Un cierre que no cuadró no se compara: «—».
    expect(inf.filas.find((f) => f.clave === "plata")!.valores[0]).toBeNull();
  });
  it("el Patrimonio va línea por línea y compara cada una por su cuenta", () => {
    const linea = (nombre: string, monto: number, cuenta: string) => ({ nombre, monto, cuenta });
    const tuyo = (lineas: GrupoBalance["lineas"]): GrupoBalance => ({ clave: "tuyo", nombre: "Patrimonio", lado: "tuyo", clase: "", monto: lineas.reduce((a, l) => a + l.monto, 0), lineas });
    const ahora = [g("plata", "tiene", 100), tuyo([linea("Capital", 150, "50"), linea("Pérdida de noviembre", -50, "resultado_mes")])];
    const antes = [g("plata", "tiene", 80), tuyo([linea("Capital", 150, "50"), linea("Pérdida de octubre", -70, "resultado_mes")])];
    const f = informeDelBalance({ grupos: ahora, partes: [], comparadas: [{ etiqueta: "Oct", grupos: antes }], etiquetaActual: "Nov" }).filas.find((x) => x.clave === "tuyo-resultado_mes")!;
    expect(f.nombre).toBe("Resultado del mes");
    expect(f.contable).toBe("Resultado del ejercicio");
    expect(f.valores).toEqual([-70, -50]);
    // Sin columnas de antes, la fila dice su mes.
    expect(informeDelBalance({ grupos: ahora, partes: [], comparadas: [], etiquetaActual: "Nov" }).filas.find((x) => x.clave === "tuyo-resultado_mes")!.nombre).toBe("Pérdida de noviembre");
  });
  it("una línea en cero hoy, con saldo en un cierre de antes, se queda: cada columna suma su total", () => {
    const linea = (nombre: string, monto: number, cuenta: string) => ({ nombre, monto, cuenta });
    const tuyo = (lineas: GrupoBalance["lineas"]): GrupoBalance => ({ clave: "tuyo", nombre: "Patrimonio", lado: "tuyo", clase: "", monto: lineas.reduce((a, l) => a + l.monto, 0), lineas });
    const ahora = [g("plata", "tiene", 1200), tuyo([linea("Capital", 800, "50"), linea("Resultados acumulados", 400, "591"), linea("Utilidad de noviembre", 0, "resultado_mes")])];
    const antes = [g("plata", "tiene", 1000), tuyo([linea("Capital", 800, "50"), linea("Resultados acumulados", 400, "591"), linea("Pérdida de octubre", -200, "resultado_mes")])];
    const filas = informeDelBalance({ grupos: ahora, partes: [], comparadas: [{ etiqueta: "Oct", grupos: antes }], etiquetaActual: "Nov" }).filas;
    const delPatrimonio = filas.filter((f) => f.clave.startsWith("tuyo-"));
    expect(delPatrimonio.map((f) => f.clave)).toEqual(["tuyo-50", "tuyo-591", "tuyo-resultado_mes"]);
    expect(delPatrimonio.reduce((a, f) => a + f.valores[0]!, 0)).toBe(filas.find((f) => f.clave === "total-tuyo")!.valores[0]);
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

// ADR-0620: el arranque resta el saldo a favor contra el IGV por pagar.
describe("el IGV a favor", () => {
  const lineaIgv = (seccion: LineaBalance["seccion"], monto: number): LineaBalance => ({ seccion, cuenta: "4011", nombre: "IGV — cuenta corriente", monto, orden: 8, detalle: {} });

  it("a favor va aparte, con su nombre, y no entra a Impuestos", () => {
    const linea = lineaIgv("activo", 40000);
    expect(nombreLinea(linea)).toBe("Crédito fiscal de IGV (SUNAT le debe a CAYLA)");
    const grupos = gruposDelBalance([linea]);
    expect(grupos.map((x) => [x.clave, x.monto])).toEqual([["credito", 40000]]);
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
      ["101", "activo", 2000], ["104", "activo", 5000], ["1413", "activo", 6000], ["201", "activo", 80000], ["231", "activo", 1000], ["241", "activo", 200],
      ["332", "activo", 600], ["333", "activo", 15000], ["335", "activo", 1000], ["336", "activo", 40000], ["391", "activo", 12000], ["122", "pasivo", 100],
      ["41", "pasivo", 10000], ["4011", "pasivo", -40000], ["50", "patrimonio", 198700], ["591", "patrimonio", -30000],
    ] as const;
    expect(cuadreArranque(lineas.map(([cuenta, tipo, monto]) => ({ cuenta, tipo, monto }))).cuadra).toBe(true);
    expect(leerMontoArranque("-40000")).toBe(-40000);
    expect(leerMontoArranque("−40000")).toBe(-40000);
  });
});

describe("el puente con Ganancias: los sueldos que el libro todavía no tiene (ADR-0621, decisión 4)", () => {
  const conResultado = (monto: number): GrupoBalance[] => [{ clave: "tuyo", nombre: "Lo tuyo", lado: "tuyo", clase: "", monto: 100000 + monto, lineas: [{ nombre: "Capital", monto: 100000, cuenta: "50" }, { nombre: "Utilidad de noviembre", monto, cuenta: "resultado_mes" }] }];
  it("sin sueldos estimados (un mes con planilla pagada), no dice nada", () => {
    expect(avisoSueldosDelBalance(conResultado(5000), 0)).toBeNull();
    expect(avisoSueldosDelBalance(conResultado(5000), 0.4)).toBeNull();
  });
  it("dice cuánto falta restar y que el Pasivo tampoco lo trae", () => {
    expect(avisoSueldosDelBalance(conResultado(9000), 2000)).toBe(`Sin sueldos provisionados: aún falta restar ${solesCentimos(2000)} que Dynamic no paga. El Pasivo tampoco los incluye.`);
  });
  it("si al restarlos el signo cambia, dice que la utilidad queda en pérdida", () => {
    expect(avisoSueldosDelBalance(conResultado(5000), 16000)).toBe(`Sin sueldos provisionados: aún falta restar ${solesCentimos(16000)} que Dynamic no paga. Restados, la utilidad queda en pérdida de ${solesCentimos(11000)}. El Pasivo tampoco los incluye.`);
  });
  it("una pérdida que ya lo era no se anuncia como si cambiara de signo", () => {
    expect(avisoSueldosDelBalance(conResultado(-300), 1000)).not.toContain("queda en pérdida");
  });
  it("la fila del resultado lleva el aviso, se llame «Utilidad de noviembre» o «Resultado del mes»", () => {
    const ahora = conResultado(5000);
    const sola = informeDelBalance({ grupos: ahora, partes: [], comparadas: [], etiquetaActual: "Nov", avisoResultado: "OJO" }).filas.find((x) => x.clave === "tuyo-resultado_mes")!;
    expect(sola).toMatchObject({ nombre: "Utilidad de noviembre", aviso: "OJO" });
    const conAntes = informeDelBalance({ grupos: ahora, partes: [], comparadas: [{ etiqueta: "Oct", grupos: conResultado(100) }], etiquetaActual: "Nov", avisoResultado: "OJO" }).filas.find((x) => x.clave === "tuyo-resultado_mes")!;
    expect(conAntes).toMatchObject({ nombre: "Resultado del mes", aviso: "OJO" });
  });
  it("las demás filas no lo llevan", () => {
    const filas = informeDelBalance({ grupos: conResultado(5000), partes: [], comparadas: [], etiquetaActual: "Nov", avisoResultado: "OJO" }).filas;
    expect(filas.filter((f) => f.aviso).map((f) => f.clave)).toEqual(["tuyo-resultado_mes"]);
  });
});
