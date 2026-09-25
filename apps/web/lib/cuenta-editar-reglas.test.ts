import { describe, expect, it } from "vitest";
import { cambiosDeCuenta, formInicial, leerDetalleCuenta, salidaDeCuenta, textoRecibeHoy, textoUsos, type DetalleCuenta } from "./cuenta-editar-reglas";

// «Editar cuenta» (ADR-0195 F3, 2026-09-25): cómo se lee lo que dice la base, cómo se cuenta en palabras y qué se manda al
// guardar. Las reglas de fondo (qué se puede cambiar) las prueba la base: scripts/pruebas/editar_cuentas.mjs.

const HOY = "2026-09-25";

const base = (x: Partial<DetalleCuenta> = {}): DetalleCuenta => ({
  id: "c1",
  nombre: "BCP",
  tipo: "banco",
  numero: "1232131",
  saldoInicial: 0,
  saldoDesde: "2026-09-25",
  archivada: false,
  automatica: false,
  usos: [],
  usada: false,
  recibe: [],
  puedeEliminar: true,
  puedeCambiarTipo: true,
  puedeCambiarSaldo: true,
  motivoSaldo: null,
  ...x,
});

describe("leerDetalleCuenta", () => {
  it("lee lo que devuelve la base y suma una tabla que llega dos veces (origen y destino)", () => {
    const d = leerDetalleCuenta({
      id: "c1",
      nombre: "BCP",
      tipo: "banco",
      numero: null,
      saldo_inicial: "1200.50",
      saldo_desde: "2026-09-01",
      archivada: false,
      automatica: false,
      usos: [
        { tabla: "movimientos_dinero", n: 2 },
        { tabla: "venta_pagos", n: 3 },
        { tabla: "movimientos_dinero", n: 1 },
      ],
      usada: true,
      recibe: [{ tienda: "Tienda TRU", medio: "yape" }],
      puede_eliminar: false,
      puede_cambiar_tipo: false,
      puede_cambiar_saldo: true,
      motivo_saldo: null,
    });
    expect(d?.saldoInicial).toBe(1200.5);
    expect(d?.usos).toEqual([
      { tabla: "movimientos_dinero", n: 3 },
      { tabla: "venta_pagos", n: 3 },
    ]);
    expect(d?.recibe).toEqual([{ tienda: "Tienda TRU", medio: "yape" }]);
    expect(d?.puedeEliminar).toBe(false);
  });
  it("sin datos, nulo", () => {
    expect(leerDetalleCuenta(null)).toBeNull();
  });
});

describe("textoUsos y textoRecibeHoy", () => {
  it("cuenta en palabras, en singular y plural, y une con «y»", () => {
    expect(
      textoUsos([
        { tabla: "venta_pagos", n: 3 },
        { tabla: "movimientos_dinero", n: 1 },
        { tabla: "medios_de_cobro", n: 12 },
      ])
    ).toBe("3 cobros de ventas, 1 movimiento de dinero y 12 cambios en «A qué cuenta entra cada cobro»");
    expect(textoUsos([{ tabla: "gastos", n: 1 }])).toBe("1 gasto");
  });
  it("una tabla nueva igual se cuenta; sin usos, nulo", () => {
    expect(textoUsos([{ tabla: "tabla_nueva", n: 2 }])).toBe("2 registros en tabla_nueva");
    expect(textoUsos([])).toBeNull();
  });
  it("qué cobros entran hoy", () => {
    expect(
      textoRecibeHoy([
        { tienda: "Tienda TRU", medio: "yape" },
        { tienda: "Tienda LIM", medio: "tarjeta" },
      ])
    ).toBe("Yape de Tienda TRU y Tarjeta de Tienda LIM");
    expect(textoRecibeHoy([])).toBeNull();
  });
});

describe("formInicial", () => {
  it("la tarjeta de crédito muestra lo que se debe en positivo", () => {
    expect(formInicial(base({ tipo: "tarjeta_credito", saldoInicial: -800.5 })).saldo).toBe("800.5");
    expect(formInicial(base({ saldoInicial: 0 })).saldo).toBe("0");
    expect(formInicial(base({ numero: null })).numero).toBe("");
  });
});

describe("cambiosDeCuenta", () => {
  it("sin cambios: no hay nada que guardar", () => {
    const d = base();
    const r = cambiosDeCuenta(d, formInicial(d), HOY);
    expect(r.ok && r.valor.hayCambios).toBe(false);
  });
  it("el nombre se recorta; lo que no cambia va nulo", () => {
    const d = base();
    const r = cambiosDeCuenta(d, { ...formInicial(d), nombre: "  BCP · Cta. corriente " }, HOY);
    expect(r.ok && r.valor).toEqual({
      hayCambios: true,
      payload: { p_cuenta_id: "c1", p_nombre: "BCP · Cta. corriente", p_numero: "1232131", p_tipo: null, p_saldo_inicial: null, p_saldo_desde: null },
    });
  });
  it("vaciar el número lo borra", () => {
    const d = base();
    const r = cambiosDeCuenta(d, { ...formInicial(d), numero: "  " }, HOY);
    expect(r.ok && r.valor.payload.p_numero).toBeNull();
    expect(r.ok && r.valor.hayCambios).toBe(true);
  });
  it("pasar a tarjeta de crédito guarda lo que se debe en negativo", () => {
    const d = base();
    const r = cambiosDeCuenta(d, { ...formInicial(d), tipo: "tarjeta_credito", saldo: "500" }, HOY);
    expect(r.ok && r.valor.payload).toMatchObject({ p_tipo: "tarjeta_credito", p_saldo_inicial: -500, p_saldo_desde: "2026-09-25" });
  });
  it("mismo saldo escrito pero otro signo por el tipo: cambia el saldo", () => {
    const d = base({ saldoInicial: 500 });
    const r = cambiosDeCuenta(d, { ...formInicial(d), tipo: "tarjeta_credito" }, HOY);
    expect(r.ok && r.valor.payload.p_saldo_inicial).toBe(-500);
  });
  it("si la base no deja cambiar el tipo o el saldo, no se mandan aunque el formulario diga otra cosa", () => {
    const d = base({ puedeCambiarTipo: false, puedeCambiarSaldo: false, saldoInicial: 100 });
    const r = cambiosDeCuenta(d, { ...formInicial(d), tipo: "por_abonar", saldo: "999", desde: "2026-01-01" }, HOY);
    expect(r.ok && r.valor.payload).toMatchObject({ p_tipo: null, p_saldo_inicial: null, p_saldo_desde: null });
    expect(r.ok && r.valor.hayCambios).toBe(false);
  });
  it("mover solo la fecha del saldo manda el saldo y la fecha", () => {
    const d = base({ saldoInicial: 100 });
    const r = cambiosDeCuenta(d, { ...formInicial(d), desde: "2026-09-01" }, HOY);
    expect(r.ok && r.valor.payload).toMatchObject({ p_saldo_inicial: 100, p_saldo_desde: "2026-09-01" });
  });
  it("valida nombre, monto y fecha", () => {
    const d = base();
    expect(cambiosDeCuenta(d, { ...formInicial(d), nombre: " " }, HOY)).toEqual({ ok: false, error: "La cuenta necesita un nombre." });
    expect(cambiosDeCuenta(d, { ...formInicial(d), saldo: "abc" }, HOY).ok).toBe(false);
    expect(cambiosDeCuenta(d, { ...formInicial(d), desde: "2026-09-26" }, HOY)).toEqual({ ok: false, error: "La fecha del saldo inicial no puede ser futura." });
    expect(cambiosDeCuenta(d, { ...formInicial(d), desde: "" }, HOY)).toEqual({ ok: false, error: "Di desde qué día cuenta el saldo inicial." });
  });
  it("el cajón solo cambia de nombre: el número y el saldo no se mandan", () => {
    const d = base({ tipo: "cajon", automatica: true, numero: null, saldoDesde: null, puedeCambiarTipo: false, puedeCambiarSaldo: false, puedeEliminar: false });
    const r = cambiosDeCuenta(d, { ...formInicial(d), nombre: "Cajón de Trujillo", numero: "123" }, HOY);
    expect(r.ok && r.valor.payload).toMatchObject({ p_nombre: "Cajón de Trujillo", p_numero: null, p_tipo: null, p_saldo_inicial: null });
  });
});

describe("salidaDeCuenta", () => {
  it("sin uso: se elimina (aunque esté archivada)", () => {
    expect(salidaDeCuenta(base())).toEqual({ accion: "eliminar" });
    expect(salidaDeCuenta(base({ archivada: true }))).toEqual({ accion: "eliminar" });
  });
  it("usada: se archiva; si recibe cobros hoy, dice qué cambiar antes", () => {
    expect(salidaDeCuenta(base({ usada: true, puedeEliminar: false }))).toEqual({ accion: "archivar", bloqueo: null });
    const r = salidaDeCuenta(base({ usada: true, puedeEliminar: false, recibe: [{ tienda: "Tienda TRU", medio: "yape" }] }));
    expect(r?.accion === "archivar" && r.bloqueo).toContain("Yape de Tienda TRU");
  });
  it("usada y archivada: se reactiva; el cajón no tiene salida", () => {
    expect(salidaDeCuenta(base({ usada: true, puedeEliminar: false, archivada: true }))).toEqual({ accion: "reactivar" });
    expect(salidaDeCuenta(base({ tipo: "cajon", automatica: true, puedeEliminar: false }))).toBeNull();
  });
});
