import { describe, expect, it } from "vitest";
import { calcularCoberturaPiso, calcularRitmoReciente, diasExposicionComercial, type EventoPiso } from "./existencias-ritmo";
import { politicaDe } from "./politica-operativa-inventario";

const MIN_DIAS = politicaDe("test").minDiasExposicionRitmo;

// Instantes UTC de la medianoche de Lima (UTC−5) de cada día, para construir eventos legibles.
const MEDIANOCHE_LIMA: Record<string, string> = {
  "18": "2026-09-18T05:00:00.000Z",
  "19": "2026-09-19T05:00:00.000Z",
  "20": "2026-09-20T05:00:00.000Z",
  "21": "2026-09-21T05:00:00.000Z",
  "22": "2026-09-22T05:00:00.000Z",
  "23": "2026-09-23T05:00:00.000Z",
  "24": "2026-09-24T05:00:00.000Z",
  "25": "2026-09-25T05:00:00.000Z",
  "26": "2026-09-26T05:00:00.000Z",
  "27": "2026-09-27T05:00:00.000Z",
};
const d = (dia: string) => new Date(MEDIANOCHE_LIMA[dia]);

function evento(ts: string, delta: number, opts: Partial<Pick<EventoPiso, "esVenta" | "esMovimientoInterno">> = {}): EventoPiso {
  return { ts, delta, esVenta: opts.esVenta ?? false, esMovimientoInterno: opts.esMovimientoInterno ?? false };
}

describe("diasExposicionComercial", () => {
  it("Caso A — 1 día de exposición: llega y se vende todo el mismo día", () => {
    const eventos = [
      evento(MEDIANOCHE_LIMA["24"], 3), // llega con 3 unidades
      evento("2026-09-24T18:00:00.000Z", -3, { esVenta: true }), // se vende todo, mismo día
    ];
    const dias = diasExposicionComercial(eventos, d("24"), d("25"));
    expect(dias).toEqual([{ fecha: "2026-09-24", ventas: 3 }]);
  });

  it("Caso B — 2 días de exposición: D1 vende 3, D2 llega 1 y se vende", () => {
    const eventos = [
      evento(MEDIANOCHE_LIMA["24"], 3),
      evento("2026-09-24T18:00:00.000Z", -3, { esVenta: true }),
      evento(MEDIANOCHE_LIMA["25"], 1),
      evento("2026-09-25T18:00:00.000Z", -1, { esVenta: true }),
    ];
    const dias = diasExposicionComercial(eventos, d("24"), d("26"));
    expect(dias).toEqual([
      { fecha: "2026-09-24", ventas: 3 },
      { fecha: "2026-09-25", ventas: 1 },
    ]);
  });

  it("Caso E — almacén intermedio: 1 día en piso, 2 días en almacén, 1 día en piso = 2 días de evidencia, NUNCA 4", () => {
    const eventos = [
      evento(MEDIANOCHE_LIMA["20"], 3), // día comercial 1: llega a piso
      evento(MEDIANOCHE_LIMA["21"], -3, { esMovimientoInterno: true }), // pausa: se mueve a almacén
      evento(MEDIANOCHE_LIMA["23"], 3, { esMovimientoInterno: true }), // reanuda: vuelve a piso — día comercial 2
    ];
    const dias = diasExposicionComercial(eventos, d("20"), d("24"));
    expect(dias.map((f) => f.fecha)).toEqual(["2026-09-20", "2026-09-23"]);
    // Los días 21 y 22 (en almacén) NO son días de evidencia comercial.
    expect(dias).toHaveLength(2);
  });

  it("Caso D — días sin piso: 7 días calendario, solo 5 con stock en piso, 4 ventas → ritmo 4/5, NUNCA 4/7", () => {
    const eventos = [
      evento(MEDIANOCHE_LIMA["18"], 5), // llega con 5, día comercial 1
      evento("2026-09-19T15:00:00.000Z", -2, { esVenta: true }), // vende 2 el día 2
      evento(MEDIANOCHE_LIMA["21"], -3, { esMovimientoInterno: true }), // pausa: a almacén (días 21-22 sin piso)
      evento(MEDIANOCHE_LIMA["23"], 4, { esMovimientoInterno: true }), // reanuda: vuelve a piso
      evento("2026-09-24T20:00:00.000Z", -2, { esVenta: true }), // vende 2 el último día
    ];
    const dias = diasExposicionComercial(eventos, d("18"), d("25"));
    expect(dias.map((f) => f.fecha)).toEqual(["2026-09-18", "2026-09-19", "2026-09-20", "2026-09-23", "2026-09-24"]);
    expect(dias).toHaveLength(5);
    const totalVentas = dias.reduce((acc, f) => acc + f.ventas, 0);
    expect(totalVentas).toBe(4);
    const ritmo = calcularRitmoReciente(dias, MIN_DIAS);
    expect(ritmo).toEqual({ tipo: "medida", dias, unidadesDia: 0.8 });
  });

  it("Caso H — liquidación dañada (esVenta=false) NO suma a las ventas del día", () => {
    const eventos = [
      evento(MEDIANOCHE_LIMA["24"], 5),
      evento("2026-09-24T12:00:00.000Z", -2, { esVenta: false }), // liquidación dañada: sale del piso, no es venta
    ];
    const dias = diasExposicionComercial(eventos, d("24"), d("25"));
    expect(dias).toEqual([{ fecha: "2026-09-24", ventas: 0 }]);
  });

  it("Caso I — movimiento interno (almacén → piso) NO suma a las ventas, aunque sí abre exposición", () => {
    const eventos = [evento(MEDIANOCHE_LIMA["24"], 6, { esMovimientoInterno: true })];
    const dias = diasExposicionComercial(eventos, d("24"), d("25"));
    expect(dias).toEqual([{ fecha: "2026-09-24", ventas: 0 }]);
  });

  it("un día entero sin nada en piso no aparece ni como día ni como cero", () => {
    const eventos = [
      evento(MEDIANOCHE_LIMA["24"], 3),
      evento(MEDIANOCHE_LIMA["25"], -3, { esMovimientoInterno: true }), // a las 00:00 del día 25 ya no queda nada en piso
      evento(MEDIANOCHE_LIMA["26"], 2, { esMovimientoInterno: true }), // vuelve a piso a las 00:00 del día 26
    ];
    const dias = diasExposicionComercial(eventos, d("24"), d("27"));
    // Día 25 estuvo en almacén las 24 horas: no aparece ni como día ni como «0 ventas».
    expect(dias.map((f) => f.fecha)).toEqual(["2026-09-24", "2026-09-26"]);
  });
});

describe("calcularRitmoReciente", () => {
  it("Caso A/B/N — menos de 3 jornadas de exposición: «insuficiente», nunca una tasa", () => {
    expect(calcularRitmoReciente([{ fecha: "2026-09-24", ventas: 3 }], MIN_DIAS)).toEqual({ tipo: "insuficiente", dias: [{ fecha: "2026-09-24", ventas: 3 }] });
    const dosDias = [
      { fecha: "2026-09-24", ventas: 3 },
      { fecha: "2026-09-25", ventas: 1 },
    ];
    expect(calcularRitmoReciente(dosDias, MIN_DIAS)).toEqual({ tipo: "insuficiente", dias: dosDias });
  });

  it("Caso N — 2 jornadas de exposición, aunque hayan pasado 5 días calendario: todavía «insuficiente»", () => {
    // `diasExposicionComercial` ya deja afuera los días sin piso (Caso E/«un día entero sin nada en
    // piso»): acá solo se confirma que 2 jornadas siguen sin ritmo, sea cual sea el hueco de calendario
    // que las separe — el largo del arreglo es lo único que cuenta, nunca la distancia entre fechas.
    const dosJornadasConHueco = [
      { fecha: "2026-09-20", ventas: 2 },
      { fecha: "2026-09-25", ventas: 1 }, // 5 días de calendario después, pero es la 2.ª jornada, no la 6.ª
    ];
    expect(calcularRitmoReciente(dosJornadasConHueco, MIN_DIAS)).toEqual({ tipo: "insuficiente", dias: dosJornadasConHueco });
  });

  it("Caso C/M — al tercer día de exposición, con ventas: ritmo medido", () => {
    const dias = [
      { fecha: "2026-09-24", ventas: 3 },
      { fecha: "2026-09-25", ventas: 1 },
      { fecha: "2026-09-26", ventas: 2 },
    ];
    expect(calcularRitmoReciente(dias, MIN_DIAS)).toEqual({ tipo: "medida", dias, unidadesDia: 2 });
  });

  it("Caso O — 3+ jornadas de exposición con CERO ventas: «sin_salida», nunca 0.0/día presentado como tasa medida", () => {
    const dias = [
      { fecha: "2026-09-24", ventas: 0 },
      { fecha: "2026-09-25", ventas: 0 },
      { fecha: "2026-09-26", ventas: 0 },
    ];
    expect(calcularRitmoReciente(dias, MIN_DIAS)).toEqual({ tipo: "sin_salida", dias, unidadesDia: 0 });
  });
});

describe("calcularCoberturaPiso", () => {
  it("piso en 0: «agotado», 0 días, sin importar el ritmo", () => {
    const ritmoMedido = calcularRitmoReciente(
      [
        { fecha: "1", ventas: 1 },
        { fecha: "2", ventas: 1 },
        { fecha: "3", ventas: 1 },
      ],
      MIN_DIAS
    );
    expect(calcularCoberturaPiso(0, ritmoMedido)).toEqual({ tipo: "agotado", dias: 0 });
  });

  it("ritmo insuficiente (menos de 3 jornadas): «no_estimable» con razón «insuficiente», nunca una cobertura fabricada", () => {
    const ritmo = calcularRitmoReciente([{ fecha: "1", ventas: 3 }], MIN_DIAS);
    expect(calcularCoberturaPiso(4, ritmo)).toEqual({ tipo: "no_estimable", razon: "insuficiente" });
  });

  it("Caso O — «sin_salida» (ritmo 0.0 medible): «no_estimable» con razón «sin_salida» (ausencia de salida reciente), NUNCA infinito", () => {
    const ritmo = calcularRitmoReciente(
      [
        { fecha: "1", ventas: 0 },
        { fecha: "2", ventas: 0 },
        { fecha: "3", ventas: 0 },
      ],
      MIN_DIAS
    );
    expect(calcularCoberturaPiso(10, ritmo)).toEqual({ tipo: "no_estimable", razon: "sin_salida" });
  });

  it("ritmo medido y piso > 0: cobertura real, piso ÷ ritmo", () => {
    const ritmo = calcularRitmoReciente(
      [
        { fecha: "1", ventas: 2 },
        { fecha: "2", ventas: 1 },
        { fecha: "3", ventas: 1 },
        { fecha: "4", ventas: 0 },
        { fecha: "5", ventas: 0 },
      ],
      MIN_DIAS
    ); // 4 ventas / 5 días = 0.8/día
    expect(calcularCoberturaPiso(4, ritmo)).toEqual({ tipo: "medida", dias: 5 });
  });
});
