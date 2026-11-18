import { describe, expect, it } from "vitest";
import { soles } from "./compras-reglas";
import { avisoDeFaltante, type FaltanteDePedido } from "./faltante-por-pagar-reglas";

// P02 del «Análisis del Taller», opción B (Felipe, 2-nov-2026): Por pagar no cambia la deuda, pero avisa que el pedido de esa factura cerró con mercadería que no llegó.
// El cierre cuelga del PEDIDO (no de una factura), así que el aviso habla del pedido.

const pedido = (neto: number, orden = "OI-000420"): FaltanteDePedido => ({ orden, netoSinIgv: neto, cierres: 1 });
const factura = { subtotal: 17000, igv: 3060, saldo: 20055.28 };

describe("avisoDeFaltante", () => {
  it("sin pedido, sin cierres o con faltante en cero no hay aviso", () => {
    expect(avisoDeFaltante(undefined, factura)).toBeNull();
    expect(avisoDeFaltante(pedido(0), factura)).toBeNull();
    expect(avisoDeFaltante(pedido(-5), factura)).toBeNull();
  });

  it("dice cuánto faltó (sin IGV y con IGV al ritmo de la factura) y de qué pedido, sin decir que es de ESTA factura", () => {
    const a = avisoDeFaltante(pedido(2000), factura)!;
    expect(a.chip).toBe(`Faltó mercadería · ${soles(2000)}`);
    expect(a.detalle).toContain("OI-000420");
    expect(a.detalle).toContain(soles(2000));
    expect(a.detalle).toContain(soles(2360)); // 2,000 × (17,000 + 3,060) / 17,000
    expect(a.detalle).not.toMatch(/de esta factura/i);
    expect(a.casiTodo).toBe(false);
  });

  it("si lo que faltó (con IGV) alcanza o pasa lo que queda por pagar, avisa fuerte: pagar entera esa factura es pagar lo que no llegó", () => {
    const a = avisoDeFaltante(pedido(16820), factura)!; // 16,820 × 1.18 = 19,847.60 de 20,055.28
    expect(a.casiTodo).toBe(false);
    const b = avisoDeFaltante(pedido(17000), factura)!; // 20,060 ≥ 20,055.28
    expect(b.casiTodo).toBe(true);
    expect(b.titulo).toMatch(/casi todo|todo lo que queda/i);
  });

  it("sin el número del pedido (el rol no lee esa tabla) dice «el pedido al que pertenece esta factura», sin inventar un número", () => {
    const a = avisoDeFaltante({ orden: null, netoSinIgv: 500, cierres: 1 }, factura)!;
    expect(a.detalle).toContain("El pedido al que pertenece esta factura cerró con");
    expect(a.detalle).not.toContain("OI-");
  });

  it("sin subtotal en la factura usa el 18 % de IGV, sin dividir entre cero", () => {
    const a = avisoDeFaltante(pedido(100), { subtotal: 0, igv: 0, saldo: 500 })!;
    expect(a.detalle).toContain(soles(118));
  });
});
