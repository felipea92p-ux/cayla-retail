import { describe, expect, it } from "vitest";
import type { MesIgv, PanelImpuestos } from "./impuestos-reglas";
import { sobresIgv } from "./impuestos-sobres-reglas";
import { pendientesCompactos } from "./impuestos-antes-reglas";
import { solesRedondo } from "./gastos-reglas";
import { barrasMeses, cuentaImpuestos, limiteImpuestos, milesCortos, tasaEnTexto } from "./impuestos-cuenta-reglas";

const mes = (p: Partial<MesIgv>): MesIgv => ({
  mes: "2026-09", comprobantes: 214, baseVentas: 122000, igvVentas: 21960, igvNotasCredito: 0, debito: 21960,
  creditoMercaderia: 11300, creditoGastos: 1900, creditoActivos: 600, creditoTaller: 1000, creditoNotas: 240, credito: 14560,
  saldoAnterior: 0, aPagar: 7400, saldoAFavor: 0, ...p,
});
const PANEL: PanelImpuestos = {
  hoy: "2026-10-15", mes: "2026-09", mesActual: "2026-10", foco: mes({}), historial: [],
  parametros: { igv: { valor: 0.18, provisional: false }, uit: { valor: 5500, provisional: false, anio: 2026 }, umbralUit: { valor: 300, provisional: false }, regimen: { texto: "rmt", provisional: false }, renta: { valor: 0.015, provisional: true }, avisoUmbralUit: { valor: 250, provisional: false } },
  umbral: {
    anio: 2026, ventasAnio: 1237500, ventasAnioErp: 1237500, ajuste: 0, umbralSoles: 1650000, avance: 0.75, cruzado: false, primerMes: "2026-01",
    ventasMeses: [
      { mes: "2026-01", base: 100000 }, { mes: "2026-02", base: 110000 }, { mes: "2026-03", base: 120000 }, { mes: "2026-04", base: 130000 }, { mes: "2026-05", base: 140000 },
      { mes: "2026-06", base: 135000 }, { mes: "2026-07", base: 150000 }, { mes: "2026-08", base: 130000 }, { mes: "2026-09", base: 122000 },
    ],
    avisoSoles: 1375000, avisoAlcanzado: false,
  },
  renta: { base: 122000, tasa: 0.015, monto: 1830 },
  revisar: {
    boletas: { n: 3, total: 640, gastos: 3, proveedores: [] },
    sinAceptar: { n: 0, total: 0 },
    rechazados: { n: 1, total: 350 },
    sinComprobante: { n: 2, total: 1180, alegra: 0 },
    honorarios: { n: 2, total: 1600, mayores: 1 },
    igvPerdido: { n: 1, igv: 360 },
  },
};

describe("cuentaImpuestos", () => {
  it("a pagar: la cuenta cierra con lo que de verdad se paga y la renta lleva la tasa del parámetro, no una escrita aquí", () => {
    const c = cuentaImpuestos(PANEL, { enCurso: false, pendientes: 5 });
    expect(c.estado).toBe("a_pagar");
    if (c.estado !== "a_pagar") return;
    expect(c.igvVentas).toBe(21960);
    expect(c.igvCompras).toBe(14560);
    expect(c.pagas).toBe(9230); // IGV 7,400 + renta 1,830
    expect(c.renta).toEqual({ monto: 1830, base: 122000, tasa: "1.5 %", provisional: true });
    expect(c.chip).toBe("Se paga en octubre");
    expect(c.frase).toBe("Se paga en octubre: revisar 5 pendientes, descargar y pagar.");
    expect(c.vendiste).toBe(122000);
    expect(c.comprobantes).toBe(214);
    expect(c.tasaIgv).toBe(18);
  });

  it("con otra tasa en el parámetro, cambia el texto y no hay ningún 1 % escrito en la cuenta", () => {
    const c = cuentaImpuestos({ ...PANEL, renta: { base: 122000, tasa: 0.01, monto: 1220 } }, { enCurso: false, pendientes: 0 });
    if (c.estado !== "a_pagar") throw new Error("a pagar");
    expect(c.renta.tasa).toBe("1 %");
    expect(c.frase).toBe("Se paga en octubre: descargar y pagar.");
  });

  it("sin tasa configurada para el año, la renta queda sin porcentaje y la cifra es solo el IGV", () => {
    const c = cuentaImpuestos({ ...PANEL, renta: { base: 122000, tasa: null, monto: null } }, { enCurso: false, pendientes: 0 });
    if (c.estado !== "a_pagar") throw new Error("a pagar");
    expect(c.renta.tasa).toBeNull();
    expect(c.renta.monto).toBeNull();
    expect(c.pagas).toBe(7400);
  });

  it("las compras se desglosan por tipo, con las notas de crédito restando, y suman el IGV de tus compras", () => {
    const c = cuentaImpuestos(PANEL, { enCurso: false, pendientes: 0 });
    if (c.estado !== "a_pagar") throw new Error("a pagar");
    const suma = c.lineasCompras.reduce((a, l) => a + (l.resta ? -l.monto : l.monto), 0);
    expect(Math.round(suma)).toBe(Math.round(c.igvCompras));
    expect(c.lineasCompras.map((l) => l.nombre)).toEqual(["Mercadería", "Gastos", "Máquinas y muebles", "Insumos del Taller", "Notas de crédito"]);
  });

  it("a favor: solo se paga la renta y el saldo pasa al mes que viene", () => {
    const c = cuentaImpuestos({ ...PANEL, foco: mes({ aPagar: 0, saldoAFavor: 9700, saldoAnterior: 1500, debito: 9400, credito: 20600 }) }, { enCurso: false, pendientes: 2 });
    expect(c.estado).toBe("a_favor");
    if (c.estado !== "a_favor") return;
    expect(c.pagas).toBe(1830);
    expect(c.aFavor).toBe(9700);
    expect(c.saldoAnterior).toBe(1500);
    expect(c.frase).toBe("Solo pagas la renta. El IGV a favor pasa a octubre.");
    expect(c.chip).toBe(`IGV a favor ${solesRedondo(9700)} → octubre`);
  });

  it("un mes sin ventas ni compras no dice «a favor S/ 0»", () => {
    const c = cuentaImpuestos({ ...PANEL, foco: mes({ comprobantes: 0, baseVentas: 0, igvVentas: 0, debito: 0, creditoMercaderia: 0, creditoGastos: 0, creditoActivos: 0, creditoTaller: 0, creditoNotas: 0, credito: 0, aPagar: 0, saldoAFavor: 0 }) }, { enCurso: false, pendientes: 0 });
    expect(c).toEqual({ estado: "sin_mes", etiqueta: "Sin movimiento", frase: "Nada que declarar: sin ventas ni compras con factura." });
  });

  it("el mes en curso dice que todavía cambia y no promete fecha de pago", () => {
    const c = cuentaImpuestos(PANEL, { enCurso: true, pendientes: 3 });
    if (c.estado !== "a_pagar") throw new Error("a pagar");
    expect(c.etiqueta).toBe("Pagarás");
    expect(c.chip).toBe("Va a la fecha");
    expect(c.frase).toBe("El mes sigue abierto: la cifra cambia hasta que cierre.");
  });
});

describe("pendientesCompactos", () => {
  it("una línea por tema con su monto, lo que frena primero", () => {
    const l = pendientesCompactos(PANEL);
    expect(l.map((x) => [x.id, x.tono, x.texto, x.monto])).toEqual([
      ["rechazados", "rojo", "1 rechazado por SUNAT", 350],
      ["sin_comprobante", "ambar", "2 ventas sin comprobante", 1180],
      ["boletas", "ambar", "3 compras con boleta", 640],
      ["igv_perdido", "rojo", "IGV que no se descuenta", 360],
      ["honorarios", "gris", "2 recibos de honorarios", 1600],
    ]);
  });

  it("los honorarios se conversan con el contador (sin enlace) y los comprobantes llevan a Comprobantes", () => {
    const l = pendientesCompactos(PANEL);
    expect(l.find((x) => x.id === "honorarios")?.href).toBeNull();
    expect(l.find((x) => x.id === "rechazados")?.href).toBe("/vender/comprobantes");
    expect(l.find((x) => x.id === "boletas")?.href).toBe("/finanzas/gastos?mes=2026-09&ver=todas");
  });

  it("sin nada por revisar, la lista queda vacía", () => {
    const sin = { ...PANEL, revisar: { ...PANEL.revisar, rechazados: { n: 0, total: 0 }, sinComprobante: { n: 0, total: 0, alegra: 0 }, boletas: { n: 0, total: 0, gastos: 0, proveedores: [] }, igvPerdido: { n: 0, igv: 0 }, honorarios: { n: 0, total: 0, mayores: 0 } } };
    expect(pendientesCompactos(sin)).toEqual([]);
  });
});

describe("limiteImpuestos", () => {
  it("lo vendido contra el límite, con el aviso en su lugar y la proyección a diciembre", () => {
    const l = limiteImpuestos(PANEL);
    expect(l.estado).toBe("ok");
    if (l.estado !== "ok") return;
    expect(l.titulo).toBe("El límite de 300 UIT");
    expect(l.vendido).toBe(1237500);
    expect(l.avisoPct).toBe(83); // 250 de 300 UIT
    expect(l.proyectadoPct).toBeGreaterThanOrEqual(75);
    expect(l.frase).toMatch(/^(A este ritmo lo cruzas en [a-záéíóú]+|A este ritmo no lo cruzas este año)\. Cierras el año en S\/\s/);
  });

  it("sin UIT o sin límite, lo dice; con una base vieja, también", () => {
    expect(limiteImpuestos({ ...PANEL, parametros: { ...PANEL.parametros, uit: null } }).estado).toBe("sin_config");
    expect(limiteImpuestos({ ...PANEL, umbral: { ...PANEL.umbral, ventasAnio: null } }).estado).toBe("sin_base");
  });

  it("si ya pasó el límite, manda al contador", () => {
    const l = limiteImpuestos({ ...PANEL, umbral: { ...PANEL.umbral, ventasAnio: 1700000, ventasAnioErp: 1700000, avance: 1.03, cruzado: true } });
    if (l.estado !== "ok") throw new Error("ok");
    expect(l.tono).toBe("rojo");
    expect(l.frase.startsWith("Ya pasaste el límite: habla con el contador.")).toBe(true);
  });
});

describe("barrasMeses", () => {
  const historial = [mes({ mes: "2026-08", aPagar: 8200 }), mes({ mes: "2026-09", aPagar: 7640 }), mes({ mes: "2026-10", aPagar: 3100, comprobantes: 40 })];
  it("una barra por mes: el que miras en tinta, el que se declara en ámbar y el que corre, rayado", () => {
    const { barras, destacada } = barrasMeses(sobresIgv(historial, "2026-10", "2026-09"));
    expect(destacada).toBe("2026-09");
    expect(barras.map((b) => [b.clave, b.etiqueta, b.cifra, b.valor])).toEqual([
      ["2026-08", "Ago", "8.2 mil", 8200],
      ["2026-09", "Sep", "7.6 mil", 7640],
      ["2026-10", "Oct", "3.1 mil", 3100],
    ]);
    expect(barras[1]?.tono).toBe("ambar");
    expect(barras[2]?.rayada).toBe(true);
  });

  it("un mes que quedó a favor va en verde y dice «a favor»", () => {
    const { barras } = barrasMeses(sobresIgv([mes({ mes: "2026-08", aPagar: 0, saldoAFavor: 4300 })], "2026-10", "2026-08"));
    expect(barras[0]?.tono).toBe("verde");
    expect(barras[0]?.tip).toContain("a favor");
  });
});

describe("formatos", () => {
  it("la tasa lleva el punto decimal de es-PE y la cifra de la barra abrevia los miles", () => {
    expect(tasaEnTexto(0.01)).toBe("1 %");
    expect(tasaEnTexto(0.015)).toBe("1.5 %");
    expect(milesCortos(950)).toBe("950");
    expect(milesCortos(8200)).toBe("8.2 mil");
    expect(milesCortos(12000)).toBe("12 mil");
  });
});
