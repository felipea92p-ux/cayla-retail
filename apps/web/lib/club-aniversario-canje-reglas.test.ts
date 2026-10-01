import { describe, expect, it } from "vitest";
import {
  avisoValeApagado,
  ayudaPieVale,
  filaDelVale,
  montoDelVale,
  rechazoDelVale,
  repartirVale,
  solesDelVale,
  TEXTO_PIE_VALE,
  textoValeCobrado,
  textoValeEnElRecibo,
  ticketConVale,
  valeEnCaja,
  valeSinConexion,
  type LineaParaVale,
  type ResumenVale,
} from "./club-aniversario-canje-reglas";
import { descuentosParaRegistrar } from "./club-cumple-canje-reglas";

const linea = (precioUnitario: number, descuentoUnitario = 0, cantidad = 1): LineaParaVale => ({ precioUnitario, descuentoUnitario, cantidad });
/** Σ parte × cantidad, en céntimos exactos. */
const usadoEnCentimos = (lineas: readonly LineaParaVale[], partes: number[]) =>
  partes.reduce((acc, p, i) => acc + Math.round(p * 100) * Math.trunc(lineas[i]!.cantidad), 0);
const netoEnCentimos = (l: LineaParaVale) => Math.round(l.precioUnitario * 100) - Math.round(l.descuentoUnitario * 100);

describe("repartirVale: proporcional al neto, por unidad y en céntimos", () => {
  it("el ejemplo del contrato: 79.90 y 40.10 con S/ 30 → 19.98 y 10.02 (suma exacta)", () => {
    const lineas = [linea(79.9), linea(40.1)];
    const partes = repartirVale(lineas, 30);
    expect(partes).toEqual([19.98, 10.02]);
    expect(usadoEnCentimos(lineas, partes)).toBe(3000);
  });

  it("reparte sobre lo que cada prenda COBRA (su descuento sin el club ya restado)", () => {
    // 100 al 50 % cobra 50; 50 sin descuento cobra 50: mitad y mitad.
    expect(repartirVale([linea(100, 50), linea(50)], 20)).toEqual([10, 10]);
  });

  it("nunca más que el total: un vale mayor que la compra la deja en 0, sin pasar el neto de ninguna prenda", () => {
    const lineas = [linea(15.5), linea(9.5, 0, 1)];
    const partes = repartirVale(lineas, 30);
    expect(partes).toEqual([15.5, 9.5]);
    const t = ticketConVale(lineas, 30);
    expect(t.totalVale).toBe(25);
    expect(t.total).toBe(0);
  });

  it("con cantidades, la parte es por unidad y suma exacta si se puede", () => {
    const lineas = [linea(59.9, 0, 2)];
    expect(repartirVale(lineas, 30)).toEqual([15]);
    // Dos líneas de 2 y 3 unidades: el resto (2 céntimos) no le cabe a la de 3 y va a la de 2, aunque tenga menos fracción.
    const otra = [linea(30, 0, 2), linea(50.01, 0, 3)];
    expect(usadoEnCentimos(otra, repartirVale(otra, 40))).toBe(4000);
    // La regla es la del contrato, no un óptimo: con 1 céntimo de resto y líneas de 2 y 3 unidades, queda 1 sin dar
    // (habría cuadrado sumando a la de 3, pero la de 2 va antes por su fracción). Nunca se pasa.
    const corta = [linea(33.33, 0, 2), linea(41.11, 0, 3)];
    expect(usadoEnCentimos(corta, repartirVale(corta, 40))).toBe(3999);
  });

  it("si el resto no se puede repartir por unidades, se queda corto y nunca se pasa (S/ 20 entre 3 unidades)", () => {
    const lineas = [linea(100, 0, 3)];
    const partes = repartirVale(lineas, 20);
    expect(partes).toEqual([6.66]);
    expect(usadoEnCentimos(lineas, partes)).toBe(1998);
  });

  it("una prenda que ya no cobra nada (100 % de descuento) no lleva parte del vale", () => {
    expect(repartirVale([linea(80, 80), linea(60)], 20)).toEqual([0, 20]);
  });

  it("vale 0 o ticket sin nada que cobrar: 0 en todo", () => {
    expect(repartirVale([linea(80)], 0)).toEqual([0]);
    expect(repartirVale([linea(80, 80)], 20)).toEqual([0]);
    expect(repartirVale([], 20)).toEqual([]);
  });

  it("es determinista: a igual fracción, el resto va primero a la línea de arriba", () => {
    // Tres prendas iguales y S/ 20: 666.67 cada una → 6.67, 6.67, 6.66.
    expect(repartirVale([linea(50), linea(50), linea(50)], 20)).toEqual([6.67, 6.67, 6.66]);
  });

  it("en 2 000 tickets al azar (con semilla): nunca pasa el neto ni el vale, y con prendas de a una suma exacto", () => {
    let semilla = 20261001;
    const azar = (n: number) => {
      semilla = (semilla * 1103515245 + 12345) % 2147483648;
      return semilla % n;
    };
    for (let k = 0; k < 2000; k++) {
      const deAUna = k % 2 === 0;
      const lineas = Array.from({ length: 1 + azar(6) }, () => {
        const precio = (1000 + azar(30000)) / 100;
        const descuento = azar(3) === 0 ? Math.floor(precio * 100 * (azar(50) / 100)) / 100 : 0;
        return linea(precio, descuento, deAUna ? 1 : 1 + azar(4));
      });
      const monto = [20, 30, 40, 50, 60, 12.35][azar(6)]!;
      const partes = repartirVale(lineas, monto);
      const total = lineas.reduce((acc, l) => acc + netoEnCentimos(l) * l.cantidad, 0);
      const esperado = Math.min(Math.round(monto * 100), total);
      const usado = usadoEnCentimos(lineas, partes);
      partes.forEach((p, i) => expect(Math.round(p * 100)).toBeLessThanOrEqual(netoEnCentimos(lineas[i]!)));
      expect(usado).toBeLessThanOrEqual(esperado);
      if (deAUna) expect(usado).toBe(esperado);
      else {
        // Lo que falta es menos que las unidades de cualquier línea que todavía podía recibir.
        const abiertas = lineas.filter((l, i) => Math.round(partes[i]! * 100) < netoEnCentimos(l)).map((l) => l.cantidad);
        if (esperado > usado) expect(esperado - usado).toBeLessThan(Math.min(...abiertas));
      }
    }
  });
});

describe("ticketConVale: las líneas y el total con el vale", () => {
  it("sin vale todo queda igual, con la parte del club en 0", () => {
    const t = ticketConVale([{ ...linea(79.9, 16), ref: "a" }], null);
    expect(t.lineas[0]).toMatchObject({ ref: "a", descuentoClubUnitario: 0, precioFinalUnitario: 63.9 });
    expect(t).toMatchObject({ totalSinVale: 63.9, totalVale: 0, total: 63.9 });
  });

  it("con el vale, el total baja exacto y cada ítem viaja con su descuento total y su parte del club", () => {
    const t = ticketConVale([linea(79.9, 16), linea(40.1, 0, 2)], 30);
    expect(t.totalSinVale).toBe(144.1);
    expect(t.totalVale).toBe(30);
    expect(t.total).toBe(114.1);
    const items = t.lineas.map((l) => descuentosParaRegistrar(l.descuentoUnitario, l.descuentoClubUnitario));
    items.forEach((it, i) => expect(it.descuento_club_unitario).toBe(t.lineas[i]!.descuentoClubUnitario));
    expect(items[0]!.descuento_unitario).toBeCloseTo(16 + t.lineas[0]!.descuentoClubUnitario, 10);
  });
});

const resumen = (parte: Partial<ResumenVale> = {}): ResumenVale => ({
  esSocia: true,
  aniversarioDisponible: true,
  aniversarioMonto: 30,
  aniversarioVence: "2026-11-30",
  ...parte,
});
const OCT = new Date("2026-10-15T15:00:00Z");

describe("valeEnCaja: qué muestra la caja de la clienta", () => {
  it("socia con vale disponible: se ofrece; sin conexión, no", () => {
    expect(valeEnCaja(resumen(), true, OCT)).toEqual({ tipo: "disponible", monto: 30, vence: "2026-11-30" });
    expect(valeEnCaja(resumen(), false, OCT)).toEqual({ tipo: "sin_conexion", monto: 30, vence: "2026-11-30" });
  });

  it("sin resumen, sin ser socia, sin vale o sin monto: nada", () => {
    expect(valeEnCaja(null, true, OCT)).toEqual({ tipo: "nada" });
    expect(valeEnCaja(resumen({ esSocia: false }), true, OCT)).toEqual({ tipo: "nada" });
    expect(valeEnCaja(resumen({ aniversarioDisponible: false }), true, OCT)).toEqual({ tipo: "nada" });
    expect(valeEnCaja(resumen({ aniversarioMonto: null }), true, OCT)).toEqual({ tipo: "nada" });
    expect(valeEnCaja(resumen({ aniversarioMonto: 0 }), true, OCT)).toEqual({ tipo: "nada" });
  });

  it("si venció con la pantalla abierta (día de Lima), se apaga; el último día todavía vale", () => {
    expect(valeEnCaja(resumen({ aniversarioVence: "2026-10-14" }), true, OCT)).toEqual({ tipo: "nada" });
    expect(valeEnCaja(resumen({ aniversarioVence: "2026-10-15" }), true, OCT).tipo).toBe("disponible");
    // A las 8 pm de Lima del 15 todavía es el 15 (el servidor ya vive en el 16 UTC).
    expect(valeEnCaja(resumen({ aniversarioVence: "2026-10-15" }), true, new Date("2026-10-16T01:00:00Z")).tipo).toBe("disponible");
  });

  it("sin fecha de vencimiento, manda lo que dijo la base", () => {
    expect(valeEnCaja(resumen({ aniversarioVence: null }), true, OCT)).toEqual({ tipo: "disponible", monto: 30, vence: null });
  });

  it("montoDelVale: solo si la asesora lo tocó y sigue disponible", () => {
    expect(montoDelVale(true, { tipo: "disponible", monto: 30, vence: null })).toBe(30);
    expect(montoDelVale(false, { tipo: "disponible", monto: 30, vence: null })).toBeNull();
    expect(montoDelVale(true, { tipo: "sin_conexion", monto: 30, vence: null })).toBeNull();
    expect(montoDelVale(true, { tipo: "nada" })).toBeNull();
  });
});

describe("filaDelVale: la fila de la caja", () => {
  const disponible = { tipo: "disponible" as const, monto: 30, vence: "2026-11-30" };

  it("«Vale de aniversario · S/ 30 · hasta el 30 nov» con «Usar vale»; puesto, «Quitar»", () => {
    const f = filaDelVale(disponible, false, false)!;
    expect(`${f.destacado} · ${f.resto}`).toBe("Vale de aniversario · S/ 30 · hasta el 30 nov");
    expect(f.boton).toEqual({ texto: "Usar vale", primario: true, accion: "usar" });
    expect(f.pildora).toEqual({ texto: "Usar vale S/ 30", accion: "usar" });
    const puesto = filaDelVale(disponible, true, false)!;
    expect(puesto.boton).toEqual({ texto: "Quitar", primario: false, accion: "quitar" });
    expect(puesto.pildora).toEqual({ texto: "Quitar vale", accion: "quitar" });
  });

  it("sin conexión: «Sin conexión», apagado", () => {
    const f = filaDelVale({ ...disponible, tipo: "sin_conexion" }, false, false)!;
    expect(f.boton).toEqual({ texto: "Sin conexión", primario: false, accion: null });
    expect(f.pildora.accion).toBeNull();
  });

  it("con el cumpleaños puesto, se apaga y dice por qué (una ventaja por compra)", () => {
    const f = filaDelVale(disponible, false, true)!;
    expect(f.boton.accion).toBeNull();
    expect(f.pildora.accion).toBeNull();
    expect(f.bajada).toMatch(/una sola ventaja del club por compra/);
  });

  it("sin vale no hay fila; sin fecha, solo el monto", () => {
    expect(filaDelVale({ tipo: "nada" }, false, false)).toBeNull();
    expect(filaDelVale({ ...disponible, vence: null, monto: 30.5 }, false, false)!.resto).toBe("S/ 30.50");
  });
});

describe("los textos", () => {
  it("el monto del vale y las líneas del pie, de «Venta registrada» y del papel", () => {
    expect(solesDelVale(30)).toBe("S/ 30");
    expect(solesDelVale(30.5)).toBe("S/ 30.50");
    expect(TEXTO_PIE_VALE).toBe("Vale de aniversario del club");
    expect(ayudaPieVale(30, 30, 144.1)).toMatch(/S\/ 30 sobre toda la compra \(S\/144\.10\)/);
    expect(ayudaPieVale(30, 25, 25)).toMatch(/se usa S\/25\.00 y no queda saldo/);
    expect(textoValeCobrado(30)).toMatch(/^Vale de aniversario usado \(−S\/30\.00\)/);
    expect(textoValeEnElRecibo(30)).toBe("Incluye vale de aniversario del club: -30.00");
  });

  it("cuando se apaga solo o se corta la conexión, lo dice", () => {
    expect(avisoValeApagado("sin_conexion", 30).titulo).toBe("Se quitó el vale de aniversario (S/ 30)");
    expect(avisoValeApagado("no_disponible", 30).detalle).toMatch(/volvió a su precio/);
    expect(valeSinConexion().detalle).toMatch(/no la duplica/);
  });
});

describe("rechazoDelVale: lo apaga siempre, y relee cuando la base sabe algo que la caja no", () => {
  it("los cuatro hints del contrato", () => {
    expect(rechazoDelVale("aniversario_ya_canjeado")).toMatchObject({ releer: true });
    expect(rechazoDelVale("aniversario_no_disponible")).toMatchObject({ releer: true });
    expect(rechazoDelVale("club_un_cupon_por_compra")).toMatchObject({ releer: true });
    expect(rechazoDelVale("aniversario_sin_monto")).toMatchObject({ releer: false });
    expect(rechazoDelVale("aniversario_ya_canjeado")!.detalle).toMatch(/^La venta no se guardó\./);
  });

  it("otro rechazo no es del vale", () => {
    expect(rechazoDelVale("cumple_ya_canjeado")).toBeNull();
    expect(rechazoDelVale(null)).toBeNull();
  });
});
