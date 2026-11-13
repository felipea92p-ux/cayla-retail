import { describe, expect, it } from "vitest";
import type { DescuentoForm, ItemCarrito } from "@/components/PuntoDeVenta";
import { AYUDA_MODO_DESCUENTO, cuentaDelDescuento } from "./descuento-cuenta-reglas";

const linea = (clave: string, precio: number, resto: Partial<ItemCarrito> = {}): ItemCarrito => ({
  claveLinea: clave,
  varianteId: clave,
  referencia: `Prenda ${clave}`,
  sku: clave,
  codigo: null,
  cantidad: 1,
  precioUnitario: precio,
  descuentoUnitario: 0,
  stockAqui: 5,
  razonDescuento: "",
  razonDescuentoOtro: "",
  argumentoDescuento: "",
  ...resto,
});

const vacio: DescuentoForm = { modo: "porcentaje", pct: "", monto: "", elegidas: null, razon: "", razonOtro: "", argumento: "" };
const ticket = [linea("a", 100), linea("b", 200)];

describe("cuentaDelDescuento — lo que el apartado «Descuento» dice de lo que se está armando", () => {
  it("sin valor: no es válido, falta elegir cuánto y el primer paso es el valor", () => {
    const c = cuentaDelDescuento(vacio, ticket, null);
    expect(c.valorValido).toBe(false);
    expect(c.motivoDescuento).toBe("Elige un porcentaje entre 1 y 100.");
    expect(c.pasoDescuento).toBe("valor");
    expect(c.hecho).toEqual({ prendas: true, cuanto: false, porque: false });
  });

  it("en %: 10 % a todo el ticket deja 90 + 180 = 270", () => {
    const c = cuentaDelDescuento({ ...vacio, pct: "10", razon: "cerrar_venta" }, ticket, null);
    expect(c.valorValido).toBe(true);
    expect(c.totalConDescuento).toBe(270);
    expect(c.motivoDescuento).toBeNull();
    expect(c.pasoDescuento).toBe("listo");
    expect(c.hecho).toEqual({ prendas: true, cuanto: true, porque: true });
  });

  it("en S/: el monto es del total de lo elegido y se reparte (30 sobre 300 deja 270)", () => {
    const c = cuentaDelDescuento({ ...vacio, modo: "monto", monto: "30", razon: "cerrar_venta" }, ticket, null);
    expect(c.porMonto).toBe(true);
    expect(c.totalConDescuento).toBe(270);
  });

  it("pasar el 15 % pide el argumento escrito; 15 % exacto no", () => {
    const quince = cuentaDelDescuento({ ...vacio, pct: "15", razon: "cerrar_venta" }, ticket, null);
    expect(quince.mostrarArgumento).toBe(false);
    const veinte = cuentaDelDescuento({ ...vacio, pct: "20", razon: "cerrar_venta" }, ticket, null);
    expect(veinte.mostrarArgumento).toBe(true);
    expect(veinte.motivoDescuento).toBe("Este descuento pasa el 15 %: escribe el argumento.");
    expect(cuentaDelDescuento({ ...vacio, pct: "20", razon: "cerrar_venta", argumento: "Clienta frecuente" }, ticket, null).motivoDescuento).toBeNull();
  });

  it("el motivo «Otro» pide su texto antes de poder aplicar", () => {
    const c = cuentaDelDescuento({ ...vacio, pct: "10", razon: "otro" }, ticket, null);
    expect(c.motivoDescuento).toBe('Cuenta en una línea por qué es "Otro".');
    expect(c.hecho.porque).toBe(false);
    expect(cuentaDelDescuento({ ...vacio, pct: "10", razon: "otro", razonOtro: "Lo pidió la encargada" }, ticket, null).hecho.porque).toBe(true);
  });

  it("solo las prendas elegidas reciben el descuento; ninguna marcada no se puede aplicar", () => {
    const soloA = cuentaDelDescuento({ ...vacio, pct: "10", razon: "cerrar_venta", elegidas: ["a"] }, ticket, null);
    expect(soloA.alcanzadas.map((l) => l.claveLinea)).toEqual(["a"]);
    expect(soloA.totalConDescuento).toBe(290);
    expect(soloA.alcanza("b")).toBe(false);
    const ninguna = cuentaDelDescuento({ ...vacio, pct: "10", razon: "cerrar_venta", elegidas: [] }, ticket, null);
    expect(ninguna.elegidasCuenta).toBe(0);
    expect(ninguna.motivoDescuento).toBe("Elige al menos una prenda.");
    expect(ninguna.hecho.prendas).toBe(false);
  });

  it("«Todo el ticket» cuenta como marcado también cuando las prendas se eligieron a mano y son todas", () => {
    expect(cuentaDelDescuento(vacio, ticket, null).todasLasPrendas).toBe(true);
    expect(cuentaDelDescuento({ ...vacio, elegidas: ["a", "b"] }, ticket, null).todasLasPrendas).toBe(true);
    expect(cuentaDelDescuento({ ...vacio, elegidas: ["a"] }, ticket, null).todasLasPrendas).toBe(false);
    expect(cuentaDelDescuento({ ...vacio, elegidas: [] }, ticket, null).todasLasPrendas).toBe(false);
    expect(cuentaDelDescuento(vacio, [], null).todasLasPrendas).toBe(false);
  });

  it("«Quitar descuento» solo se ofrece si hay uno puesto a mano en lo alcanzado, no el de campaña", () => {
    expect(cuentaDelDescuento(vacio, ticket, null).hayDescuentoEnAlcance).toBe(false);
    const manual = [linea("a", 100, { descuentoUnitario: 10, razonDescuento: "cerrar_venta" })];
    expect(cuentaDelDescuento(vacio, manual, null).hayDescuentoEnAlcance).toBe(true);
  });

  it("con un cupón del Club puesto, «Quedaría en» ya viene sin la parte del cupón", () => {
    const c = cuentaDelDescuento({ ...vacio, pct: "10", razon: "cerrar_venta" }, ticket, { vale: 20 });
    expect(c.totalConDescuento).toBe(250);
  });

  it("las dos ayudas dicen sobre qué se calcula cada modo", () => {
    expect(AYUDA_MODO_DESCUENTO.porcentaje).toMatch(/precio de cada prenda/);
    expect(AYUDA_MODO_DESCUENTO.monto).toMatch(/se reparte/);
  });
});
