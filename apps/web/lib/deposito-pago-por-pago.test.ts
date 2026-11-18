import { describe, expect, it } from "vitest";
import type { CuentaDinero, LotePendiente } from "./cuentas-dinero-reglas";
import type { PagoMaquina } from "./emparejar-maquinas";
import {
  alternarDia,
  alternarPago,
  armarDias,
  desdeDePagos,
  eleccionPorDefecto,
  esPorPagos,
  estadoDia,
  llavePago,
  pagosQueCalzan,
  resumenDeposito,
  soloEstosPagos,
  textoCuantosPagos,
  textoLlega,
  textoPago,
  validarDeposito,
  type EleccionDeposito,
} from "./deposito-pago-por-pago";

const cuenta = (c: Pick<CuentaDinero, "id" | "tipo">): CuentaDinero => ({
  nombre: c.id,
  cuentaContable: "104",
  ubicacionId: null,
  ubicacionNombre: null,
  numero: null,
  saldo: 0,
  archivada: false,
  soloDestino: false,
  cajaId: null,
  cajaAbierta: false,
  saldoDesde: null,
  ultimaConciliacion: null,
  ultimoAbono: null,
  orden: 0,
  ...c,
});
const ctx = {
  cuentas: [cuenta({ id: "izi", tipo: "por_abonar" }), cuenta({ id: "ibk", tipo: "banco" })],
  hoy: "2026-11-10",
};
const base = {
  origen: "izi",
  destino: "ibk",
  monto: "",
  referencia: "",
  fecha: "2026-11-10",
};

const QR9 = "cobros:2026-11-09:u-tru:qr";
const QR10 = "cobros:2026-11-10:u-tru:qr";
const TJ9 = "cobros:2026-11-09:u-lim:tarjeta";
const lote = (clave: string, bruto: number, esperado: number | null): LotePendiente => {
  const [, fecha, ubicacionId, medio] = clave.split(":");
  return {
    clave,
    fecha: fecha!,
    ubicacionId: ubicacionId!,
    ubicacionNombre: ubicacionId === "u-tru" ? "Tienda TRU" : "Tienda LIM",
    medio: medio as "qr" | "tarjeta",
    bruto,
    dias: 1,
    nPagos: 1,
    esperado,
    diasHabiles: 1,
    atrasado: false,
    yaDepositado: 0,
  };
};
const pago = (id: string, clave: string, hora: string, monto: number, neto: number | null, extra: Partial<PagoMaquina> = {}): PagoMaquina => ({
  origen: "venta_pago",
  origenId: id,
  clave,
  fecha: clave.split(":")[1]!,
  hora,
  ubicacionId: clave.split(":")[2]!,
  ubicacionNombre: "",
  medio: clave.endsWith("qr") ? "qr" : "tarjeta",
  montoCentimos: Math.round(monto * 100),
  netoCentimos: neto === null ? null : Math.round(neto * 100),
  netoTarjetaCentimos: null,
  depositado: false,
  diaSinDetalle: false,
  ...extra,
});

// El día del QR de TRU del 9: tres pagos (uno ya depositado aparte), gratis por la tarifa; el 10, dos más; la tarjeta de LIM, sin pagos.
const pagos = [
  pago("a", QR9, "2026-11-09T15:10:00Z", 21, 21),
  pago("b", QR9, "2026-11-09T19:45:00Z", 100, 100),
  pago("c", QR9, "2026-11-09T21:00:00Z", 50, 50, { depositado: true }),
  pago("d", QR10, "2026-11-10T14:00:00Z", 21, 21),
  pago("e", QR10, "2026-11-10T16:00:00Z", 79.9, 79.9),
];
const lotes = [lote(QR9, 121, 0), lote(TJ9, 135, 3.79), lote(QR10, 100.9, 0)];
const dias = armarDias(lotes, pagos);
const [d9, dTj] = dias as [(typeof dias)[0], (typeof dias)[0]];

describe("el depósito de la máquina pago por pago (ADR-0629, Fase B)", () => {
  it("un día se abre en pagos solo si sus pagos sin depositar suman lo que el día espera", () => {
    expect(d9.conDetalle).toBe(true);
    expect(d9.pagos.map((p) => p.origenId)).toEqual(["a", "b"]);
    expect(dTj.conDetalle).toBe(false);
    expect(armarDias(lotes, null).every((d) => !d.conDetalle)).toBe(true);
    // Si no suman lo mismo (la venta cambió, o un depósito por día cubrió parte), no se adivina: va entero.
    expect(armarDias([lote(QR9, 150, 0)], pagos)[0]!.conDetalle).toBe(false);
    // Un día con un depósito sin detalle no se abre aunque sume.
    expect(
      armarDias(
        lotes,
        pagos.map((p) => (p.clave === QR9 ? { ...p, diaSinDetalle: true } : p)),
      )[0]!.conDetalle,
    ).toBe(false);
  });

  it("viene marcado lo de siempre (`lotesPorDefecto`): el QR hasta el día del depósito, la tarjeta hasta el día anterior", () => {
    // La tarjeta de LIM del 9 llega al día siguiente: un depósito del 9 no la trae marcada; uno del 10, sí.
    expect(eleccionPorDefecto(dias, "2026-11-09")).toEqual({ dias: [QR9], pagos: [] });
    expect(eleccionPorDefecto(dias, "2026-11-10").dias).toEqual([QR9, TJ9, QR10]);
    // Con un día sin pagos a la vista (la tarjeta de LIM) todo va por días, como siempre.
    expect(esPorPagos(dias, eleccionPorDefecto(dias, "2026-11-10"))).toBe(false);
    // Si todo lo marcado tiene sus pagos a la vista, va por pagos aunque los días vayan enteros: así no quedan «sin detalle».
    expect(esPorPagos(dias, { dias: [QR9, QR10], pagos: [] })).toBe(true);
    expect(esPorPagos(dias, { dias: [], pagos: [] })).toBe(false);
  });

  it("desmarcar un pago de un día entero lo deja a medias; marcarlo de vuelta lo vuelve entero", () => {
    const e0: EleccionDeposito = { dias: [QR9], pagos: [] };
    const e1 = alternarPago(d9, d9.pagos[1]!, e0);
    expect(e1).toEqual({ dias: [], pagos: ["venta_pago:a"] });
    expect(estadoDia(d9, e1)).toBe("parte");
    expect(esPorPagos(dias, e1)).toBe(true);
    const e2 = alternarPago(d9, d9.pagos[1]!, e1);
    expect(e2).toEqual({ dias: [QR9], pagos: [] });
    expect(estadoDia(d9, alternarPago(d9, d9.pagos[0]!, e1))).toBe("nada");
  });

  it("la casilla del día a medias lo marca entero; entera, lo quita", () => {
    const parte = { dias: [], pagos: ["venta_pago:a"] };
    expect(alternarDia(d9, parte)).toEqual({ dias: [QR9], pagos: [] });
    expect(alternarDia(d9, { dias: [QR9], pagos: [] })).toEqual({
      dias: [],
      pagos: [],
    });
  });

  it("la cuenta suma los días enteros por su lote y los sueltos pago por pago", () => {
    const e = { dias: [TJ9], pagos: ["venta_pago:a"] };
    expect(resumenDeposito(dias, e, "")).toEqual({
      dias: 2,
      pagosSueltos: 1,
      bruto: 156,
      neto: null,
      comision: null,
      esperado: 3.79,
    });
    expect(resumenDeposito(dias, soloEstosPagos(dias, [d9.pagos[0]!]), "21")).toEqual({
      dias: 1,
      pagosSueltos: 1,
      bruto: 21,
      neto: 21,
      comision: 0,
      esperado: 0,
    });
    expect(resumenDeposito(dias, { dias: [], pagos: [] }, "21").esperado).toBeNull();
  });

  it("«llegaron S/ 21» propone los pagos que dejan justo eso, del más viejo al más nuevo", () => {
    const todo = eleccionPorDefecto(dias, "2026-11-10");
    expect(pagosQueCalzan(dias, todo, "21", "2026-11-10").map((p) => p.origenId)).toEqual(["a", "d"]);
    // Un pago posterior a la fecha del depósito no se propone.
    expect(pagosQueCalzan(dias, todo, "21", "2026-11-09").map((p) => p.origenId)).toEqual(["a"]);
    expect(pagosQueCalzan(dias, todo, "33", "2026-11-10")).toEqual([]);
    expect(pagosQueCalzan(dias, todo, "", "2026-11-10")).toEqual([]);
    // Ya marcado justo uno de ellos: no se vuelve a proponer.
    expect(pagosQueCalzan(dias, soloEstosPagos(dias, [d9.pagos[0]!]), "21", "2026-11-10")).toEqual([]);
    // El atajo marca igual que a mano: el único pago de un día lo deja entero.
    const unico = armarDias([lote(QR10, 21, 0)], [pago("z", QR10, "2026-11-10T14:00:00Z", 21, 21)]);
    expect(soloEstosPagos(unico, unico[0]!.pagos)).toEqual({
      dias: [QR10],
      pagos: [],
    });
  });

  it("un día entero con sus pagos a la vista viaja por pagos, para no quedar «sin detalle»", () => {
    const v = validarDeposito({ ...base, monto: "121" }, dias, { dias: [QR9], pagos: [] }, ctx);
    expect(v).toMatchObject({
      ok: true,
      valor: {
        rpc: "registrar_abono_pos_pagos",
        valor: { p_pagos: [{ origen_id: "a" }, { origen_id: "b" }] },
      },
    });
  });

  it("con un día sin pagos a la vista viaja lo de siempre a registrar_abono_pos", () => {
    const v = validarDeposito({ ...base, monto: "252.11" }, dias, { dias: [QR9, TJ9], pagos: [] }, ctx);
    expect(v).toMatchObject({
      ok: true,
      valor: {
        rpc: "registrar_abono_pos",
        valor: { p_claves: [QR9, TJ9], p_neto: 252.11 },
      },
    });
  });

  it("con un día a medias viajan los pagos a registrar_abono_pos_pagos, con los de los días enteros", () => {
    const e = { dias: [QR10], pagos: ["venta_pago:a"] };
    const v = validarDeposito({ ...base, monto: "121.90", referencia: " op 551 " }, dias, e, ctx);
    expect(v).toEqual({
      ok: true,
      valor: {
        rpc: "registrar_abono_pos_pagos",
        valor: {
          p_cuenta_id: "izi",
          p_banco_id: "ibk",
          p_fecha: "2026-11-10",
          p_neto: 121.9,
          p_pagos: [
            { origen: "venta_pago", origen_id: "a" },
            { origen: "venta_pago", origen_id: "d" },
            { origen: "venta_pago", origen_id: "e" },
          ],
          p_referencia: "op 551",
        },
      },
    });
  });

  it("lo que la base rechazaría se dice antes", () => {
    const suelto = { dias: [], pagos: ["venta_pago:a"] };
    // Un día que no se separa en pagos no puede ir junto con pagos sueltos.
    expect(validarDeposito({ ...base, monto: "21" }, dias, { dias: [TJ9], pagos: ["venta_pago:a"] }, ctx)).toMatchObject({ ok: false });
    expect((validarDeposito({ ...base, monto: "21" }, dias, { dias: [TJ9], pagos: ["venta_pago:a"] }, ctx) as { error: string }).error).toMatch(/9 nov/);
    expect(
      (
        validarDeposito({ ...base, monto: "30" }, dias, suelto, ctx) as {
          error: string;
        }
      ).error,
    ).toMatch(/no puede ser mayor que lo cobrado/);
    expect(validarDeposito({ ...base, monto: "21", fecha: "2026-11-08" }, dias, suelto, ctx)).toMatchObject({
      ok: false,
      error: "El depósito no puede ser anterior al último pago que cubre (9 nov).",
    });
    expect(validarDeposito({ ...base, monto: "21", fecha: "2026-11-11" }, dias, suelto, ctx)).toMatchObject({
      ok: false,
      error: "La fecha no puede ser futura.",
    });
    expect(validarDeposito({ ...base, destino: "izi", monto: "21" }, dias, suelto, ctx)).toMatchObject({ ok: false, error: "Elige a qué banco llegó." });
    // La comisión rara se pregunta igual que por días: S/ 21 cobrados y S/ 10 llegados en un día gratis.
    expect(
      (
        validarDeposito({ ...base, monto: "10" }, dias, suelto, ctx) as {
          error: string;
        }
      ).error,
    ).toMatch(/confirma/);
    expect(
      validarDeposito({ ...base, monto: "10" }, dias, suelto, {
        ...ctx,
        comisionConfirmada: true,
      }).ok,
    ).toBe(true);
  });

  it("cada pago se lee con su hora de Lima y lo que deja en el banco", () => {
    expect(textoPago({ hora: "2026-11-09T15:10:00Z", origen: "venta_pago" })).toBe("10:10 · venta");
    expect(textoLlega({ netoCentimos: 2050 })?.replace(/ /g, " ")).toBe("llega ≈ S/ 20.50");
    expect(textoLlega({ netoCentimos: null })).toBeNull();
    expect(llavePago({ origen: "cambio", origenId: "x" })).toBe("cambio:x");
  });
});

describe("el botón de los pagos de un día", () => {
  it("dice cuántos son y, a medias, cuántos van", () => {
    expect(textoCuantosPagos(d9, { dias: [QR9], pagos: [] })).toBe("2 pagos");
    expect(textoCuantosPagos(d9, { dias: [], pagos: ["venta_pago:a"] })).toBe("1 de 2 pagos");
    expect(desdeDePagos("2026-11-10")).toBe("2026-09-09");
  });
});
