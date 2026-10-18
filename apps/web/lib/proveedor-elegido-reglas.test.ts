import { describe, expect, it } from "vitest";
import { faltaDelProveedor, telefonoDelProveedor } from "./proveedor-elegido-reglas";

const cuenta = { cuentaBancaria: "191-123", cci: null, celularBilletera: null };
const vacia = { cuentaBancaria: null, cci: null, celularBilletera: null };

describe("proveedor elegido en un gasto", () => {
  it("completo: no falta nada", () => {
    expect(faltaDelProveedor({ telefono: "987654321", formaPagoPreferida: null }, cuenta)).toBeNull();
  });
  it("dice qué falta, con el camino para completarlo", () => {
    expect(faltaDelProveedor({ telefono: null, formaPagoPreferida: null }, vacia)).toBe("Falta teléfono / cuenta: complétalo en Compras ▸ Proveedores.");
    expect(faltaDelProveedor({ telefono: "  ", formaPagoPreferida: null }, cuenta)).toBe("Falta teléfono: complétalo en Compras ▸ Proveedores.");
    expect(faltaDelProveedor({ telefono: "987654321", formaPagoPreferida: null }, vacia)).toBe("Falta cuenta: complétalo en Compras ▸ Proveedores.");
  });
  it("Yape/Plin o CCI bastan como cuenta", () => {
    expect(faltaDelProveedor({ telefono: "1", formaPagoPreferida: null }, { ...vacia, celularBilletera: "987654321" })).toBeNull();
    expect(faltaDelProveedor({ telefono: "1", formaPagoPreferida: null }, { ...vacia, cci: "0".repeat(20) })).toBeNull();
  });
  it("quien cobra en efectivo no necesita cuenta", () => {
    expect(faltaDelProveedor({ telefono: "987654321", formaPagoPreferida: "efectivo" }, vacia)).toBeNull();
  });
  it("sin poder leer lo bancario (cargando o sin permiso) no se acusa de que falte la cuenta", () => {
    expect(faltaDelProveedor({ telefono: null, formaPagoPreferida: null }, null)).toBe("Falta teléfono: complétalo en Compras ▸ Proveedores.");
    expect(faltaDelProveedor({ telefono: "987654321", formaPagoPreferida: null }, null)).toBeNull();
  });
  it("el teléfono lleva WhatsApp solo si es un celular peruano", () => {
    expect(telefonoDelProveedor("987 654 321")).toEqual({ texto: "987 654 321", whatsapp: "https://wa.me/51987654321" });
    expect(telefonoDelProveedor("01 444 5555")).toEqual({ texto: "01 444 5555", whatsapp: null });
    expect(telefonoDelProveedor("")).toBeNull();
    expect(telefonoDelProveedor(null)).toBeNull();
  });
});
