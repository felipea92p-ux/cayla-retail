import { describe, expect, it } from "vitest";
import fixture from "./resumen-finanzas.fixture.json";
import { estadoDeCaja, type CajaCayla, type CajaProxima } from "./caja-proxima-reglas";
import { debesPronto, leerResumen } from "./resumen-finanzas-reglas";
import { tresRespuestas } from "./tres-respuestas-reglas";

// Las tres respuestas de arriba del Resumen: lo que tienes, lo que debes pagar pronto y lo que te deja el mes. Ninguna calcula plata:
// cada una repite la cifra de donde ya vive, y aquí se prueba que no se desvíen.

const texto = (s: string) => s.replace(/ /g, " ");
const cajaCayla = (extra: Partial<CajaCayla> = {}): CajaProxima =>
  ({
    tipo: "cayla", hoy: "2026-10-15", hasta: "2026-10-29", saldoHoy: 21500, minimo: 15000, entra: 0, sale: 0, queda: 21500, puntos: [], porSemana: false,
    mayores: [], bajaDelMinimo: null, sinPlata: null, masBajo: null, luego: null, titular: "", tono: "verde", provisional: false, faltan: [], sinPlanilla: false,
    ...extra,
  }) as unknown as CajaProxima;
const DEJA = { pregunta: "¿Cuánto te deja septiembre?", valor: 3850, chips: [{ texto: "Provisional: falta registrar cosas", tono: "pizarra" as const }] };
const armar = (caja: CajaProxima, r = leerResumen(fixture.todas)) => tresRespuestas({ r, caja, deja: DEJA, hrefDinero: "/finanzas/dinero", hrefPorPagar: "/finanzas/dinero/por-pagar" });

describe("tresRespuestas", () => {
  it("son tres, siempre en el orden en que una persona se las hace: tiene, debe, gana", () => {
    const [a, b, c] = armar(cajaCayla());
    expect([a.clave, b.clave, c.clave]).toEqual(["tienes", "debes", "deja"]);
    expect(a.pregunta).toBe("¿Cuánto tienes?");
    expect(b.pregunta).toBe("¿Cuánto debes pagar pronto?");
    expect(c.pregunta).toBe("¿Cuánto te deja septiembre?");
  });

  it("«¿Cuánto tienes?» repite el saldo de hoy de la caja y su estado, con las mismas palabras que «Tu caja»", () => {
    const caja = cajaCayla({ tono: "ambar", bajaDelMinimo: { fecha: "2026-10-20", saldo: 9000 } });
    const [t] = armar(caja);
    expect(t.valor).toBe(21500);
    expect(t.chips).toEqual([{ texto: estadoDeCaja(caja as CajaCayla)!.texto, tono: "ambar" }]);
    expect(t.chips[0]!.texto).toBe("Bajo tu mínimo");
    expect(armar(cajaCayla())[0].chips).toEqual([{ texto: "Te alcanza", tono: "verde" }]);
  });

  it("una caja provisional lo dice primero; sin plata gana sobre «bajo tu mínimo»", () => {
    const [t] = armar(cajaCayla({ provisional: true, tono: "rojo", sinPlata: { fecha: "2026-10-18", saldo: -300 }, bajaDelMinimo: { fecha: "2026-10-18", saldo: -300 } }));
    expect(t.chips.map((c) => c.texto)).toEqual(["Provisional", "Sin plata"]);
  });

  it("mirando una sede, pregunta por su efectivo; si la cuenta no lo ve, dice el motivo y nunca un cero", () => {
    const sede = (efectivo: number | null) => ({ tipo: "sede", nombre: "Lima", vende: true, hoy: "2026-10-15", hasta: "2026-10-29", efectivo, entra: 0, sale: 0, mayores: [], titular: "", sinPlanilla: false }) as unknown as CajaProxima;
    expect(armar(sede(1200))[0]).toMatchObject({ pregunta: "¿Cuánto efectivo tienes en Lima?", valor: 1200 });
    expect(armar(sede(null))[0]).toMatchObject({ valor: null, motivo: "Tu cuenta no ve el efectivo de este lugar." });
  });

  it("si la caja falló se dice que no se pudo leer; si no se ve, que la cuenta no la ve", () => {
    expect(armar({ tipo: "falla", mensaje: "x" })[0]).toMatchObject({ valor: null, noSePudoLeer: true });
    const sinVer = armar({ tipo: "oculta" })[0];
    expect(sinVer.valor).toBeNull();
    expect(sinVer.noSePudoLeer).toBeUndefined();
  });

  it("«¿Cuánto debes pagar pronto?» repite lo de `debesPronto` y cuenta lo vencido aparte", () => {
    const r = leerResumen(fixture.todas);
    const d = debesPronto(r)!;
    const [, b] = armar(cajaCayla(), r);
    expect(b.valor).toBe(d.monto);
    expect(b.href).toBe("/finanzas/dinero/por-pagar");
    if (d.vencidas.length) {
      expect(b.chips).toEqual([{ texto: "Hay deudas vencidas", tono: "ambar" }]);
      expect(texto(b.detalle!)).toMatch(/vencidas? \(S\/ [\d,]+\)/);
    }
  });

  it("sin nada que vencer, lo dice en vez de dejar un renglón vacío", () => {
    const r = leerResumen(fixture.todas);
    if (r.porPagar.estado !== "ok") throw new Error("fixture");
    r.porPagar.datos.filas = [];
    if (r.flujo.estado === "ok") r.flujo.datos.salidas = r.flujo.datos.salidas.filter((s) => s.tipo !== "planilla");
    const [, b] = armar(cajaCayla(), r);
    expect(b.valor).toBe(0);
    expect(b.chips).toEqual([{ texto: "Nada por vencer", tono: "verde" }]);
    expect(b.detalle).toMatch(/^No vence nada en los próximos \d+ días\.$/);
  });

  it("si lo que debes no se pudo leer, es null con su motivo y marcado como falla", () => {
    const r = leerResumen(fixture.todas);
    r.porPagar = { estado: "falla", mensaje: "x" } as typeof r.porPagar;
    expect(armar(cajaCayla(), r)[1]).toMatchObject({ valor: null, noSePudoLeer: true });
  });

  it("«¿Cuánto te deja?» es la misma respuesta del mes, con sus chips", () => {
    const [, , c] = armar(cajaCayla());
    expect(c).toMatchObject({ valor: 3850, chips: DEJA.chips });
  });
});
