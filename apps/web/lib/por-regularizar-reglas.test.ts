import { describe, expect, it } from "vitest";
import {
  cifrasPorRegularizar,
  esVentaSinCargar,
  estaVencida,
  gruposSinCargar,
  lineaSinCargar,
  prendaSinCargar,
  resueltasDesde,
  salidaPrendaSinCargar,
  tipoDiferencia,
  type VentaSinCargar,
} from "./por-regularizar-reglas";

const ahora = new Date("2026-09-23T15:00:00-05:00");

describe("resueltasDesde", () => {
  it("el 1.º del mes anterior a las 00:00 de Lima", () => expect(resueltasDesde(new Date("2026-10-03T15:00:00-05:00"))).toBe("2026-09-01T00:00:00-05:00"));
  it("en enero retrocede a diciembre del año anterior", () => expect(resueltasDesde(new Date("2027-01-15T10:00:00-05:00"))).toBe("2026-12-01T00:00:00-05:00"));
  it("cuenta el mes de Lima: el 31 de octubre a las 22:00 ya es noviembre en UTC, pero en Lima sigue siendo octubre", () =>
    expect(resueltasDesde(new Date("2026-11-01T03:00:00Z"))).toBe("2026-09-01T00:00:00-05:00"));
  it("siempre cubre el mes completo en curso (las cifras «este mes» dependen de eso)", () => {
    const primeroDelMes = Date.parse("2026-10-01T00:00:00-05:00");
    expect(Date.parse(resueltasDesde(new Date("2026-10-01T00:30:00-05:00")))).toBeLessThanOrEqual(primeroDelMes);
  });
});

describe("estaVencida", () => {
  it("un día después, todavía no", () => expect(estaVencida("2026-09-22T15:00:00-05:00", ahora)).toBe(false));
  it("justo a los 2 días, sí", () => expect(estaVencida("2026-09-21T15:00:00-05:00", ahora)).toBe(true));
});

describe("tipoDiferencia", () => {
  it("cobrar menos es descuento no planificado", () => expect(tipoDiferencia(-20)).toBe("descuento"));
  it("cobrar más es sobreprecio", () => expect(tipoDiferencia(10)).toBe("sobreprecio"));
  it("igual al precio oficial", () => expect(tipoDiferencia(0)).toBe("exacto"));
});

describe("cifrasPorRegularizar", () => {
  it("cuenta pendientes y vencidas, y separa descuento y sobreprecio del mes (Lima)", () => {
    const f = (estado: string, vendidoEn: string, diferencia: number | null) => ({ estado, vendidoEn, diferencia });
    expect(
      cifrasPorRegularizar(
        [
          f("pendiente", "2026-09-23T10:00:00-05:00", null),
          f("pendiente", "2026-09-20T10:00:00-05:00", null),
          f("regularizada", "2026-09-10T10:00:00-05:00", -20),
          f("regularizada", "2026-09-11T10:00:00-05:00", 10),
          f("regularizada", "2026-08-31T20:00:00-05:00", -99), // agosto en Lima, aunque en UTC ya es septiembre
          f("anulada", "2026-09-12T10:00:00-05:00", null),
        ],
        ahora,
      ),
    ).toEqual({ pendientes: 2, vencidas: 1, descuentoMes: 20, sobreprecioMes: 10 });
  });
});

// Ajuste ADR-0328 (2026-10-04): una prenda que la sede nunca cargó se resuelve según la carga de ESA sede. Las frases son las de
// `fn_exigir_prenda_cargada_en_sede` al carácter: las mismas cadenas están en `scripts/pruebas/ventas_sin_registrar.mjs` (R6b, R6f, R6h).
describe("prendaSinCargar — la salida depende de si la carga de la sede sigue abierta", () => {
  const ABIERTA = { abierta: true, hastaCorta: null };
  it("abierta sin fecha (AQP y LIM hoy): primero su stock inicial, y lo dice", () =>
    expect(prendaSinCargar("Tienda AQP", ABIERTA)).toBe(
      "Esta prenda todavía no está cargada en Tienda AQP: primero cárgala con su stock inicial (la carga de Tienda AQP sigue abierta), con lo que hay hoy en la tienda sin la vendida, y vuelve a regularizarla.",
    ));
  it("abierta con fecha (TRU hasta el 15-oct): dice hasta cuándo", () =>
    expect(prendaSinCargar("Tienda TRU", { abierta: true, hastaCorta: "15-oct" })).toBe(
      "Esta prenda todavía no está cargada en Tienda TRU: primero cárgala con su stock inicial (la carga de Tienda TRU sigue abierta hasta el 15-oct), con lo que hay hoy en la tienda sin la vendida, y vuelve a regularizarla.",
    ));
  it("cerrada (TRU desde el 16-oct): «cárgala» sería una puerta cerrada; la salida es «Encontré prendas»", () =>
    expect(prendaSinCargar("Tienda TRU", { abierta: false, hastaCorta: "15-oct" })).toBe(
      "La carga de Tienda TRU se cerró el 15-oct y esta prenda nunca se cargó ahí: regístrala con «Encontré prendas» (lo que hay hoy en la tienda, sin la vendida) y después regulariza.",
    ));
  it("sin saber la carga (la lectura falló): la frase de antes, que no afirma nada de ella", () =>
    expect(prendaSinCargar("Tienda AQP")).toBe(
      "Esta prenda todavía no está cargada en Tienda AQP: primero cárgala con su stock inicial (lo que hay hoy en la tienda, sin la vendida) y vuelve a regularizarla.",
    ));
  it("sin nombre de sede, «esta tienda» (como la base)", () => expect(prendaSinCargar("", ABIERTA)).toContain("cargada en esta tienda:"));
});

describe("salidaPrendaSinCargar — el enlace que corresponde", () => {
  it("abierta (o sin saber): cargar su stock inicial; cerrada: «Encontré prendas»", () => {
    expect(salidaPrendaSinCargar({ carga: { abierta: true, hastaCorta: null }, sede: "Tienda AQP", enOtraSede: false })).toEqual({ texto: "Cargar su stock inicial", antes: null });
    expect(salidaPrendaSinCargar({ carga: null, sede: "Tienda AQP", enOtraSede: false }).texto).toBe("Cargar su stock inicial");
    expect(salidaPrendaSinCargar({ carga: { abierta: false, hastaCorta: "15-oct" }, sede: "Tienda TRU", enOtraSede: false }).texto).toBe(
      "Registrarla con «Encontré prendas»",
    );
  });
  it("la ficha trabaja sobre la sede activa: si la venta es de otra, lo dice antes de irse", () =>
    expect(salidaPrendaSinCargar({ carga: null, sede: "Tienda AQP", enOtraSede: true }).antes).toBe(
      "La ficha trabaja sobre tu sede activa: cámbiala a Tienda AQP antes.",
    ));
});

describe("gruposSinCargar / lineaSinCargar — una línea por sede, no un aviso por fila", () => {
  const ABIERTA = { abierta: true, hastaCorta: null };
  const CERRADA = { abierta: false, hastaCorta: "15-oct" };
  const venta = (id: string, ubicacionId: string, sede: string) => ({ id, ubicacionId, sede });
  const sinPista = () => false;

  it("AQP sin cargar: sus ~170 ventas pendientes son UNA línea («N ventas de prendas sin cargar: carga primero el catálogo de AQP»)", () => {
    const filas = Array.from({ length: 170 }, (_, i) => venta(`v${i}`, "aqp", "Tienda AQP"));
    const porVenta: Record<string, VentaSinCargar> = Object.fromEntries(filas.map((f, i) => [f.id, { sinCargar: i >= 2, carga: ABIERTA }]));
    const grupos = gruposSinCargar(filas, porVenta, sinPista);
    expect(grupos).toEqual([{ ubicacionId: "aqp", sede: "Tienda AQP", carga: ABIERTA, ventas: 168 }]);
    expect(lineaSinCargar(grupos[0]!)).toBe("168 ventas de prendas sin cargar: carga primero el catálogo de Tienda AQP.");
  });

  it("una venta con otra pista (una candidata, o la categoría que la caja escribió) no va a la línea", () => {
    const porVenta = { a: { sinCargar: true, carga: ABIERTA }, b: { sinCargar: true, carga: ABIERTA } };
    const conPista = (id: string) => id === "b";
    expect(esVentaSinCargar("a", porVenta, conPista)).toBe(true);
    expect(esVentaSinCargar("b", porVenta, conPista)).toBe(false);
    expect(esVentaSinCargar("c", porVenta, conPista)).toBe(false); // la base no la trajo: la fila queda como siempre
    expect(gruposSinCargar([venta("a", "aqp", "Tienda AQP"), venta("b", "aqp", "Tienda AQP")], porVenta, conPista)[0]?.ventas).toBe(1);
  });

  it("el líder con varias sedes: una línea por sede, la de más ventas primero, cada una con SU carga", () => {
    const filas = [venta("t1", "tru", "Tienda TRU"), venta("a1", "aqp", "Tienda AQP"), venta("a2", "aqp", "Tienda AQP")];
    const porVenta = { t1: { sinCargar: true, carga: CERRADA }, a1: { sinCargar: true, carga: ABIERTA }, a2: { sinCargar: true, carga: ABIERTA } };
    const grupos = gruposSinCargar(filas, porVenta, sinPista);
    expect(grupos.map((g) => [g.sede, g.ventas, g.carga.abierta])).toEqual([
      ["Tienda AQP", 2, true],
      ["Tienda TRU", 1, false],
    ]);
    expect(lineaSinCargar(grupos[1]!)).toBe(
      "1 venta de una prenda sin cargar en Tienda TRU: su carga se cerró el 15-oct. Regístrala con «Encontré prendas» y después regulariza.",
    );
  });

  it("las frases según la carga: abierta con fecha, cerrada en plural, y una sola", () => {
    expect(lineaSinCargar({ sede: "Tienda TRU", carga: { abierta: true, hastaCorta: "15-oct" }, ventas: 3 })).toBe(
      "3 ventas de prendas sin cargar: carga primero el catálogo de Tienda TRU (la carga sigue abierta hasta el 15-oct).",
    );
    expect(lineaSinCargar({ sede: "Tienda TRU", carga: CERRADA, ventas: 4 })).toBe(
      "4 ventas de prendas sin cargar en Tienda TRU: su carga se cerró el 15-oct. Regístralas con «Encontré prendas» y después regulariza.",
    );
    expect(lineaSinCargar({ sede: "Tienda AQP", carga: ABIERTA, ventas: 1 })).toBe("1 venta de una prenda sin cargar: carga primero el catálogo de Tienda AQP.");
  });

  it("sin la lectura (la función no está pegada o falló): ninguna línea", () =>
    expect(gruposSinCargar([venta("a", "aqp", "Tienda AQP")], {}, sinPista)).toEqual([]));
});
