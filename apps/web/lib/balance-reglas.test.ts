import { describe, expect, it } from "vitest";
import {
  agrupar,
  arranquePropuesto,
  cambiosDelSistema,
  causaCorta,
  cifraChequeo,
  cortesDisponibles,
  csvBalance,
  cuadreArranque,
  cuentaLinea,
  diaAnterior,
  enlaceDeCausa,
  iconoChequeo,
  ladoDeCuenta,
  leerChequeo,
  leerCorte,
  leerLinea,
  leerMontoArranque,
  leerPropuesta,
  leerUnidad,
  lineasParaRegistrar,
  motivoNoCuadra,
  nombreDeCuenta,
  nombreLinea,
  notaLinea,
  situacion,
  solesBalance,
  textoRinde,
  tituloChequeo,
  tituloCorte,
  valoresIniciales,
  type Chequeo,
  type LineaBalance,
  type LineaPropuesta,
} from "./balance-reglas";

const ch = (x: Partial<Chequeo>): Chequeo => ({
  orden: 10,
  clave: "101",
  titulo: "Caja",
  contra: "contra lo que dice cada caja",
  diario: 125,
  otro: 125,
  diferencia: 0,
  estado: "ok",
  bloquea: true,
  causas: [],
  arranque: "2024-03-01",
  corte: "2024-03-31",
  ...x,
});
const linea = (x: Partial<LineaBalance>): LineaBalance => ({ seccion: "activo", cuenta: "101", nombre: "Caja", monto: 0, orden: 1, detalle: {}, ...x });
const prop = (x: Partial<LineaPropuesta>): LineaPropuesta => ({
  cuenta: "101",
  nombre: "Caja",
  tipo: "activo",
  monto: 0,
  origen: "sistema",
  detalle: "",
  vigente: null,
  orden: 1,
  ...x,
});

describe("lo que llega de la base", () => {
  it("una fila de la comprobación: los numeric vienen como texto y las causas como jsonb", () => {
    const c = leerChequeo({
      orden: "11",
      clave: "104",
      titulo: "Bancos",
      contra: "contra Cuentas y dinero",
      diario: "4515.00",
      otro: "4815.00",
      diferencia: "-300.00",
      estado: "nota",
      bloquea: true,
      causas: [{ clave: "sin_cuenta", texto: "Sin cuenta", monto: -300, acepta: true }],
      arranque: "2024-03-01",
      corte: "2024-03-31",
    });
    expect(c.diario).toBe(4515);
    expect(c.diferencia).toBe(-300);
    expect(c.causas[0]).toEqual({ clave: "sin_cuenta", texto: "Sin cuenta", monto: -300, acepta: true });
    // Un estado que la pantalla no conoce se toma como que no cuadra (nunca como que cuadra).
    expect(leerChequeo({ estado: "raro" }).estado).toBe("no_cuadra");
    expect(leerChequeo({ diario: null }).diario).toBeNull();
  });

  it("una línea, una tienda y una línea de la propuesta", () => {
    expect(leerLinea({ seccion: "pasivo", cuenta: "421", nombre: "Facturas", monto: "680.00", orden: 11, detalle: null })).toMatchObject({
      seccion: "pasivo",
      monto: 680,
      detalle: {},
    });
    const u = leerUnidad({ ubicacion_id: "t", nombre: "Tienda Trujillo", tipo: "tienda", caja: null, mercaderia: "400", rinde: "0.1274", planilla_visible: false });
    expect(u.caja).toBeNull();
    expect(u.rinde).toBeCloseTo(0.1274);
    expect(leerPropuesta({ cuenta: "50", tipo: "patrimonio", monto: "0", origen: "manual", vigente: null }).origen).toBe("manual");
  });
});

describe("¿se dibuja? (ADR-0109: un número falso es peor que ninguno)", () => {
  it("sin saldos de arranque no hay Balance", () => {
    expect(situacion([ch({ clave: "arranque", estado: "falta", diario: null, otro: null })]).tipo).toBe("sin_arranque");
    expect(situacion([]).tipo).toBe("sin_arranque");
  });
  it("antes del día de arranque no hay Balance", () => {
    expect(situacion([ch({ clave: "corte", estado: "falta", arranque: "2024-03-01" })])).toEqual({ tipo: "antes_del_arranque", arranque: "2024-03-01" });
  });
  it("una cuenta que no cuadra bloquea; la nota y el IGV para revisar, no", () => {
    const s = situacion([ch({}), ch({ clave: "104", estado: "nota" }), ch({ clave: "4011", estado: "revisar", bloquea: false })]);
    expect(s.tipo).toBe("cuadra");
    if (s.tipo === "cuadra") expect(s.notas.map((c) => c.clave)).toEqual(["104", "4011"]);
    const no = situacion([ch({}), ch({ clave: "421", estado: "no_cuadra" })]);
    expect(no.tipo).toBe("no_cuadra");
  });
  it("lo que no bloquea no impide dibujar aunque diga «no cuadra»", () => {
    expect(situacion([ch({ clave: "4011", estado: "no_cuadra", bloquea: false })]).tipo).toBe("cuadra");
  });
});

describe("cómo se escribe cada chequeo", () => {
  it("las cuentas llevan su código; las comprobaciones generales, no", () => {
    expect(tituloChequeo(ch({ clave: "201", titulo: "Mercaderías" }))).toBe("201 Mercaderías");
    expect(tituloChequeo(ch({ clave: "diario", titulo: "El diario cuadra" }))).toBe("El diario cuadra");
  });
  it("la cifra: si cuadra, una; si no, «a ≠ b»; el diario dice si cuadra", () => {
    expect(cifraChequeo(ch({ diario: 5420, otro: 5420 }))).toBe("S/ 5,420");
    expect(cifraChequeo(ch({ estado: "no_cuadra", diario: 64300, otro: 63880 }))).toBe("S/ 64,300 ≠ S/ 63,880");
    expect(cifraChequeo(ch({ clave: "diario", diario: null, otro: null, diferencia: 0 }))).toBe("cuadra");
    expect(cifraChequeo(ch({ clave: "diario", estado: "no_cuadra", diario: null, otro: null, diferencia: -10 }))).toBe("−S/ 10 de diferencia");
    expect(cifraChequeo(ch({ estado: "falta" }))).toBe("falta");
    // Con una aclaración cuadra: va la cifra del diario (la del Balance); la aclaración, debajo.
    expect(cifraChequeo(ch({ clave: "104", estado: "nota", diario: 4515, otro: 4815 }))).toBe("S/ 4,515");
  });
  it("el ícono: ✓ verde, ✓ ámbar con aclaración, ? para revisar, ! rojo", () => {
    expect(iconoChequeo("ok")).toMatchObject({ signo: "✓", tono: "verde" });
    expect(iconoChequeo("nota")).toMatchObject({ signo: "✓", tono: "ambar" });
    expect(iconoChequeo("revisar")).toMatchObject({ signo: "?", tono: "ambar" });
    expect(iconoChequeo("no_cuadra")).toMatchObject({ signo: "!", tono: "rojo" });
  });
  it("la franja dice la causa sin su aclaración entre paréntesis", () => {
    expect(causaCorta("Egresos de caja sin clasificar (en Gastos ▸ Egresos por clasificar)")).toBe("Egresos de caja sin clasificar");
    expect(causaCorta("Sin explicar todavía")).toBe("Sin explicar todavía");
  });
  it("cada causa lleva a donde se arregla", () => {
    expect(enlaceDeCausa("sin_clasificar")?.href).toContain("tab=egresos");
    expect(enlaceDeCausa("antes_del_arranque")).toEqual({ texto: "Corregir los saldos de arranque", accion: "arranque" });
    expect(enlaceDeCausa("sin_cuenta")?.href).toBe("/finanzas/dinero");
    expect(enlaceDeCausa("sin_explicar")).toBeNull();
  });
  it("la guía dice qué cuenta no cuadra, contra qué y su causa más probable (no la que se acepta)", () => {
    const m = motivoNoCuadra([
      ch({
        clave: "421",
        titulo: "Facturas por pagar",
        contra: "contra el saldo de cada factura de proveedor",
        estado: "no_cuadra",
        diario: 680,
        otro: 916,
        diferencia: -236,
        causas: [
          { clave: "sin_cuenta", texto: "Sin cuenta", monto: 1, acepta: true },
          { clave: "antes_del_arranque", texto: "Cambió lo que había al arrancar", monto: -236, acepta: false },
        ],
      }),
      ch({ clave: "101", estado: "no_cuadra" }),
    ]);
    expect(m.texto).toBe("La cuenta 421 (facturas por pagar) dice S/ 680, pero la suma de las facturas da S/ 916.");
    expect(m.causa?.clave).toBe("antes_del_arranque");
    expect(m.enlace?.accion).toBe("arranque");
    expect(m.otros).toBe(1);
  });
});

describe("cifras, fechas y nombres", () => {
  it("soles como el spike: sin céntimos, el menos de verdad, céntimos solo en lo chico", () => {
    expect(solesBalance(289901)).toBe("S/ 289,901");
    expect(solesBalance(-1778)).toBe("−S/ 1,778");
    expect(solesBalance(199.01)).toBe("S/ 199");
    expect(solesBalance(-0.4)).toBe("−S/ 0.40");
    expect(solesBalance(0)).toBe("S/ 0");
    expect(solesBalance(-0.2)).toBe("−S/ 0.20");
  });
  it("cuánto rinde, con coma decimal", () => {
    expect(textoRinde(0.0721)).toBe("7,2 % al mes");
    expect(textoRinde(-0.05)).toBe("−5,0 % al mes");
    expect(textoRinde(null)).toBe("—");
  });
  it("el título de la fecha", () => {
    expect(tituloCorte("2026-09-24", "2026-09-24")).toBe("Hoy, 24 de septiembre");
    expect(tituloCorte("2026-08-31", "2026-09-24")).toBe("Al 31 de agosto");
    expect(tituloCorte("2024-03-31", "2026-09-24")).toBe("Al 31 de marzo de 2024");
  });
  it("el nombre de cada línea como lo lee quien decide", () => {
    expect(nombreLinea(linea({ cuenta: "104", nombre: "Cuentas corrientes (banco)" }))).toBe("Bancos y billeteras");
    expect(nombreLinea(linea({ cuenta: "4011", seccion: "pasivo" }))).toBe("IGV por pagar");
    expect(nombreLinea(linea({ cuenta: "4011", seccion: "activo" }))).toContain("Crédito fiscal");
    expect(nombreLinea(linea({ cuenta: "resultado_mes", seccion: "patrimonio", monto: 3060, detalle: { desde: "2026-08-01" } }))).toBe("Utilidad de agosto");
    expect(nombreLinea(linea({ cuenta: "resultado_mes", seccion: "patrimonio", monto: -20, detalle: { desde: "2024-04-01" } }))).toBe("Pérdida de abril");
    expect(nombreLinea(linea({ cuenta: "999", nombre: "Otra" }))).toBe("Otra");
    expect(cuentaLinea(linea({ cuenta: "resultado_mes" }))).toBe("");
    expect(nombreDeCuenta("4011", "IGV — cuenta corriente")).toBe("IGV por pagar");
    expect(nombreDeCuenta("999", "Otra")).toBe("Otra");
  });
  it("la mercadería dice lo que está por recibir y en camino; el IGV, que todavía no baja", () => {
    expect(notaLinea(linea({ cuenta: "201", detalle: { por_recibir: 400, en_transito: 0 } }))).toBe("incluye S/ 400 facturado por recibir");
    expect(notaLinea(linea({ cuenta: "201", detalle: { por_recibir: 0, en_transito: 0 } }))).toBeNull();
    expect(notaLinea(linea({ cuenta: "4011", seccion: "pasivo" }))).toContain("SUNAT");
  });
  it("agrupa y suma: lo que tiene contra lo que debe + lo tuyo", () => {
    const g = agrupar([
      linea({ cuenta: "201", monto: 1200, orden: 4 }),
      linea({ cuenta: "101", monto: 125, orden: 1 }),
      linea({ cuenta: "391", monto: -20, orden: 34 }),
      linea({ seccion: "pasivo", cuenta: "421", monto: 680, orden: 11 }),
      linea({ seccion: "patrimonio", cuenta: "50", monto: 605, orden: 12 }),
    ]);
    expect(g.tiene.map((l) => l.cuenta)).toEqual(["101", "201", "391"]);
    expect(g.totalTiene).toBe(1305);
    expect(g.totalDebe + g.totalTuyo).toBe(1285);
  });
  it("la fecha del Balance: una que no pase de hoy, o hoy", () => {
    expect(leerCorte("2026-08-31", "2026-09-24")).toBe("2026-08-31");
    expect(leerCorte("2026-10-01", "2026-09-24")).toBe("2026-09-24");
    expect(leerCorte("31/08/2026", "2026-09-24")).toBe("2026-09-24");
    expect(leerCorte(undefined, "2026-09-24")).toBe("2026-09-24");
  });
  it("las fechas que se ofrecen: hoy y cada fin de mes, sin pasar del día anterior al arranque", () => {
    const todas = cortesDisponibles("2026-09-24", null);
    expect(todas).toHaveLength(13);
    expect(todas[0]).toEqual({ valor: "2026-09-24", texto: "Hoy, 24 sep" });
    expect(todas[1]).toEqual({ valor: "2026-08-31", texto: "Al 31 ago" });
    expect(todas[12].valor).toBe("2025-09-30");
    expect(cortesDisponibles("2026-09-24", "2026-07-01").map((c) => c.valor)).toEqual(["2026-09-24", "2026-08-31", "2026-07-31", "2026-06-30"]);
    expect(cortesDisponibles("2026-09-24", "2026-09-10").map((c) => c.valor)).toEqual(["2026-09-24"]);
    expect(cortesDisponibles("2024-03-15", null)[1].valor).toBe("2024-02-29");
    expect(diaAnterior("2024-03-01")).toBe("2024-02-29");
  });
});

describe("los saldos de arranque (el modal)", () => {
  it("de qué lado va cada cuenta; la depreciación resta en lo que tiene", () => {
    expect(ladoDeCuenta("101", "activo")).toBe("tiene");
    expect(ladoDeCuenta("391", "activo")).toBe("tiene");
    expect(ladoDeCuenta("421", "pasivo")).toBe("debe");
    expect(ladoDeCuenta("50", "patrimonio")).toBe("tuyo");
  });
  it("cuadra solo si lo que tenía = lo que debía + lo tuyo (la depreciación resta)", () => {
    const base = [
      { cuenta: "101", tipo: "activo", monto: 150 },
      { cuenta: "104", tipo: "activo", monto: 5000 },
      { cuenta: "335", tipo: "activo", monto: 1200 },
      { cuenta: "391", tipo: "activo", monto: 200 },
      { cuenta: "421", tipo: "pasivo", monto: 680 },
      { cuenta: "591", tipo: "patrimonio", monto: 1000 },
    ];
    expect(cuadreArranque([...base, { cuenta: "50", tipo: "patrimonio", monto: 4470 }])).toMatchObject({ tiene: 6150, debe: 680, tuyo: 5470, cuadra: true });
    const falta = cuadreArranque([...base, { cuenta: "50", tipo: "patrimonio", monto: 4000 }]);
    expect(falta.cuadra).toBe(false);
    expect(falta.diferencia).toBe(470);
  });
  it("lee lo que escribe el líder", () => {
    expect(leerMontoArranque("1,250.50")).toBe(1250.5);
    expect(leerMontoArranque("−300")).toBe(-300);
    expect(leerMontoArranque("")).toBe(0);
    expect(leerMontoArranque("abc")).toBeNull();
    expect(leerMontoArranque("1.234")).toBeNull();
  });
  it("la primera vez manda lo del sistema y lo escrito (sin las manuales en cero)", () => {
    const p = [prop({ cuenta: "101", monto: 150 }), prop({ cuenta: "421", tipo: "pasivo", monto: 0 }), prop({ cuenta: "50", tipo: "patrimonio", origen: "manual" }), prop({ cuenta: "41", tipo: "pasivo", origen: "manual" })];
    const v = { ...valoresIniciales(p, false), "50": 150 };
    expect(lineasParaRegistrar(p, v, false)).toEqual([
      { cuenta: "101", monto: 150, origen: "sistema" },
      { cuenta: "421", monto: 0, origen: "sistema" },
      { cuenta: "50", monto: 150, origen: "manual" },
    ]);
  });
  it("una corrección manda solo lo que cambió contra lo registrado", () => {
    const p = [prop({ cuenta: "421", tipo: "pasivo", monto: 236, vigente: 0 }), prop({ cuenta: "591", tipo: "patrimonio", origen: "manual", monto: 1000, vigente: 1000 }), prop({ cuenta: "101", monto: 150, vigente: 150 })];
    const v = valoresIniciales(p, true);
    expect(v).toEqual({ "421": 0, "591": 1000, "101": 150 });
    expect(lineasParaRegistrar(p, { ...v, "421": 236, "591": 764 }, true)).toEqual([
      { cuenta: "421", monto: 236, origen: "sistema" },
      { cuenta: "591", monto: 764, origen: "manual" },
    ]);
    expect(lineasParaRegistrar(p, v, true)).toEqual([]);
  });
  it("avisa las líneas del sistema que ya no son lo registrado", () => {
    expect(cambiosDelSistema([prop({ cuenta: "421", monto: 236, vigente: 0 }), prop({ cuenta: "101", monto: 150, vigente: 150 }), prop({ cuenta: "50", origen: "manual", monto: 1, vigente: 0 })]).map((c) => c.cuenta)).toEqual(["421"]);
  });
  it("el arranque que se propone es el primer día del mes", () => {
    expect(arranquePropuesto("2026-09-24")).toBe("2026-09-01");
  });
});

describe("descargar Excel", () => {
  it("un CSV con BOM, separado por «;», con el Balance, la comprobación y las tiendas", () => {
    const csv = csvBalance(
      [linea({ cuenta: "101", monto: 125 }), linea({ seccion: "patrimonio", cuenta: "50", monto: 125, orden: 12 })],
      [ch({})],
      [leerUnidad({ ubicacion_id: "t", nombre: "Tienda Trujillo", tipo: "tienda", caja: 125, invertido: 895, utilidad_mes: 113.99, rinde: 0.1274 })],
      "2024-03-31",
    );
    expect(csv.startsWith("﻿Balance al;2024-03-31")).toBe(true);
    expect(csv).toContain("Lo que tiene;101;Caja (cajones, cajas fuertes y lo entregado al líder);125.00");
    expect(csv).toContain("101 Caja;contra lo que dice cada caja;125.00;125.00;0.00;cuadra");
    expect(csv).toContain("Tienda Trujillo;125.00;0.00;0.00;0.00;895.00;113.99;12,7 % al mes");
  });
});
