import { describe, expect, it } from "vitest";
import { ayudaDeCosto, costoConocido, progresoDeCompra, requisitosDeCompra, type EntradaRequisitos } from "./compra-form-progreso";

const completa: EntradaRequisitos = {
  proveedorId: "prov-1",
  serie: "F001",
  numero: "123",
  lineas: [{ productoId: "p1", cantidad: 2, costoUnitario: "50" }],
  condicion: "contado",
  pagarAhora: false,
  fechaVencimiento: "2026-10-19",
  conIgv: false,
  total: 118,
  sumaPagos: 118,
  indicePagoSinMonto: -1,
};
const con = (cambio: Partial<EntradaRequisitos>): EntradaRequisitos => ({ ...completa, ...cambio });
const pendientes = (e: EntradaRequisitos) => requisitosDeCompra(e).filter((r) => !r.ok).map((r) => r.clave);

describe("requisitosDeCompra", () => {
  it("una compra completa al contado no tiene pendientes y da 4 de 4", () => {
    const r = requisitosDeCompra(completa);
    expect(r.map((x) => x.clave)).toEqual(["proveedor", "documento", "lineas", "pago"]);
    expect(pendientes(completa)).toEqual([]);
    expect(progresoDeCompra(r)).toMatchObject({ listos: 4, total: 4, completo: true, tramos: { documento: true, lineas: true, pago: true } });
  });

  it("sin proveedor pide elegirlo y lleva el cursor al combo", () => {
    const r = requisitosDeCompra(con({ proveedorId: "" }));
    expect(r[0]).toMatchObject({ ok: false, error: { mensaje: "Elige un proveedor.", enfocar: "compra-proveedor" } });
  });

  it("la serie y el número son requisitos aparte, y el aviso enfoca el que falta (serie primero)", () => {
    expect(requisitosDeCompra(con({ serie: "  " }))[1]).toMatchObject({ ok: false, falta: "Falta la serie", error: { enfocar: "compra-serie" } });
    expect(requisitosDeCompra(con({ numero: "" }))[1]).toMatchObject({ ok: false, falta: "Falta el número", error: { enfocar: "compra-numero" } });
    expect(requisitosDeCompra(con({ serie: "", numero: "" }))[1]).toMatchObject({ ok: false, falta: null, error: { enfocar: "compra-serie" } });
  });

  it("las líneas: sin producto no cuenta, con producto y sin costo bloquea y dice cuál", () => {
    expect(pendientes(con({ lineas: [{ productoId: "", cantidad: 1, costoUnitario: "" }] }))).toContain("lineas");
    const sinCosto = requisitosDeCompra(
      con({
        lineas: [
          { productoId: "p1", cantidad: 1, costoUnitario: "10" },
          { productoId: "p2", cantidad: 1, costoUnitario: "" },
        ],
      }),
    )[2];
    expect(sinCosto).toMatchObject({ ok: false, falta: "Falta el costo de la línea 2", error: { enfocar: "compra-linea-1-costo" } });
    expect(sinCosto.error?.mensaje).toContain("sin IGV");
    // un renglón de más, vacío, no estorba mientras haya una línea buena
    expect(pendientes(con({ lineas: [...completa.lineas, { productoId: "", cantidad: 1, costoUnitario: "" }] }))).toEqual([]);
    // costo 0 es válido (muestras, regalos); costo negativo no
    expect(pendientes(con({ lineas: [{ productoId: "p1", cantidad: 1, costoUnitario: "0" }], total: 0, sumaPagos: 0, indicePagoSinMonto: 0 }))).toEqual(["pago"]);
    expect(requisitosDeCompra(con({ lineas: [{ productoId: "p1", cantidad: 1, costoUnitario: "-3" }] }))[2].ok).toBe(false);
  });

  it("la línea dice «con IGV» cuando el precio se tipea con IGV", () => {
    const r = requisitosDeCompra(con({ conIgv: true, lineas: [{ productoId: "p1", cantidad: 1, costoUnitario: "" }] }))[2];
    expect(r.error?.mensaje).toBe("Cada línea necesita su costo unitario (con IGV).");
  });

  describe("pago", () => {
    it("al contado el pago debe sumar el total: faltan o sobran, con el detalle", () => {
      const corto = requisitosDeCompra(con({ sumaPagos: 100 }))[3];
      expect(corto).toMatchObject({ ok: false, texto: "Pago por el total", falta: "Faltan S/ 18.00 para el total", error: { enfocar: "compra-pagos-monto-0" } });
      expect(corto.error?.mensaje).toContain("Al contado el pago debe sumar el total");
      expect(requisitosDeCompra(con({ sumaPagos: 130 }))[3].falta).toBe("Sobran S/ 12.00 sobre el total");
    });

    it("una diferencia de medio centavo se tolera (redondeo)", () => {
      expect(requisitosDeCompra(con({ sumaPagos: 118.004 }))[3].ok).toBe(true);
    });

    it("un medio sin monto lleva el cursor a ESE medio", () => {
      const r = requisitosDeCompra(con({ sumaPagos: 0, indicePagoSinMonto: 1 }))[3];
      expect(r).toMatchObject({ ok: false, error: { mensaje: "Cada medio de pago necesita su monto.", enfocar: "compra-pagos-monto-1" } });
    });

    it("al crédito con pago ahora: puede ser parcial pero no pasarse del total", () => {
      const base = con({ condicion: "credito", pagarAhora: true });
      expect(requisitosDeCompra({ ...base, sumaPagos: 50 })[3]).toMatchObject({ ok: true, texto: "Monto del pago de ahora" });
      const pasado = requisitosDeCompra({ ...base, sumaPagos: 200 })[3];
      expect(pasado).toMatchObject({ ok: false, falta: "Sobran S/ 82.00 sobre el total" });
      expect(pasado.error?.mensaje).toContain("supera el total");
    });

    it("al crédito con pago ahora y sin monto pide escribirlo o desmarcar", () => {
      const r = requisitosDeCompra(con({ condicion: "credito", pagarAhora: true, sumaPagos: 0, indicePagoSinMonto: 0 }))[3];
      expect(r.error?.mensaje).toContain("desmarca 'Registrar un pago ahora'");
    });

    it("al crédito sin pago ahora: «sin pago por ahora», cumplido si lo demás está bien", () => {
      const e = con({ condicion: "credito", pagarAhora: false, sumaPagos: 0, indicePagoSinMonto: 0 });
      expect(requisitosDeCompra(e)[3]).toMatchObject({ ok: true, texto: "Sin pago por ahora (queda por pagar)" });
      expect(progresoDeCompra(requisitosDeCompra(e)).completo).toBe(true);
    });

    it("«sin pago por ahora» NO se marca hecho mientras falte el proveedor, el documento o las líneas", () => {
      const vacio = con({ condicion: "credito", proveedorId: "", serie: "", numero: "", lineas: [{ productoId: "", cantidad: 1, costoUnitario: "" }], total: 0, sumaPagos: 0 });
      const r = requisitosDeCompra(vacio);
      expect(r.map((x) => x.ok)).toEqual([false, false, false, false]);
      expect(progresoDeCompra(r).listos).toBe(0);
    });

    it("al crédito sin vencimiento: pendiente con el aviso de siempre", () => {
      const r = requisitosDeCompra(con({ condicion: "credito", pagarAhora: false, fechaVencimiento: "" }))[3];
      expect(r).toMatchObject({ ok: false, falta: "Falta la fecha de vencimiento", error: { mensaje: "Una compra al crédito necesita fecha de vencimiento.", enfocar: "compra-vence" } });
    });

    it("el detalle del pago no aparece mientras no haya líneas (no tiene sentido «faltan S/ 0.00»)", () => {
      const r = requisitosDeCompra(con({ lineas: [{ productoId: "", cantidad: 1, costoUnitario: "" }], total: 0, sumaPagos: 0, indicePagoSinMonto: 0 }))[3];
      expect(r.ok).toBe(false);
      expect(r.falta).toBeNull();
    });
  });

  it("el primer requisito pendiente es el que avisa al enviar (mismo orden de siempre)", () => {
    const e = con({ proveedorId: "", serie: "", lineas: [{ productoId: "", cantidad: 1, costoUnitario: "" }], sumaPagos: 0, indicePagoSinMonto: 0 });
    expect(requisitosDeCompra(e).find((r) => !r.ok)?.clave).toBe("proveedor");
  });
});

describe("progresoDeCompra", () => {
  it("cuenta los requisitos cumplidos y marca los tramos", () => {
    const p = progresoDeCompra(requisitosDeCompra(con({ serie: "" })));
    expect(p.listos).toBe(3);
    expect(p.completo).toBe(false);
    expect(p.tramos).toEqual({ documento: false, lineas: true, pago: true });
  });

  it("el tramo de pago no se da por hecho si las líneas no están bien", () => {
    const p = progresoDeCompra(requisitosDeCompra(con({ lineas: [{ productoId: "p1", cantidad: 1, costoUnitario: "" }] })));
    expect(p.tramos.lineas).toBe(false);
    expect(p.tramos.pago).toBe(false);
  });

  it("sin requisitos no hay nada completo", () => {
    expect(progresoDeCompra([])).toEqual({ listos: 0, total: 0, completo: false, tramos: { documento: false, lineas: false, pago: false } });
  });
});

describe("ayudaDeCosto", () => {
  it("sin costo conocido no hay ayuda", () => {
    expect(ayudaDeCosto(null, "10")).toBeNull();
    expect(ayudaDeCosto(0, "10")).toBeNull();
  });
  it("costo sin escribir: ofrece usar el conocido", () => {
    expect(ayudaDeCosto(40, "")).toEqual({ tipo: "usar", ultimo: 40 });
  });
  it("menos de 5 % es «igual»", () => {
    expect(ayudaDeCosto(40, "41.5")).toEqual({ tipo: "igual", ultimo: 40 });
    expect(ayudaDeCosto(40, "40")).toEqual({ tipo: "igual", ultimo: 40 });
  });
  it("sube y baja con su porcentaje redondeado", () => {
    expect(ayudaDeCosto(50, "56")).toEqual({ tipo: "sube", ultimo: 50, pct: 12 });
    expect(ayudaDeCosto(50, "40")).toEqual({ tipo: "baja", ultimo: 50, pct: 20 });
  });
});

describe("costoConocido", () => {
  const vs = [
    { varianteId: "a", costo: 30 },
    { varianteId: "b", costo: 34 },
  ];
  it("con variante elegida, el de esa variante", () => {
    expect(costoConocido(vs, "b")).toBe(34);
  });
  it("una variante sin costo (0) o desconocida no da costo", () => {
    expect(costoConocido([{ varianteId: "a", costo: 0 }], "a")).toBeNull();
    expect(costoConocido(vs, "zzz")).toBeNull();
  });
  it("sin desglose: solo si todas las variantes cuestan lo mismo", () => {
    expect(costoConocido(vs, "")).toBeNull();
    expect(costoConocido([{ varianteId: "a", costo: 30 }, { varianteId: "b", costo: 30 }], "")).toBe(30);
    expect(costoConocido([], "")).toBeNull();
  });
});
