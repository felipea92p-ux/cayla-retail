import { describe, expect, it } from "vitest";
import { cartelesDelClub, DIRECCION_TIENDA_ONLINE, ENLACE_DEL_CARTEL } from "./club-qr-reglas";

// ADR-0288 act. g, G-1: un solo QR por tienda, el del cartel. Desde el 2026-10-16 (Felipe: «al escanear el cartel lleva al link
// tienda.cayla.pe») abre la tienda online, donde se crea la cuenta y se entra al Club. El ticket no lleva QR del club (act. j).
const TIENDA = "3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c";
const OTRA = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

describe("el cartel del mostrador", () => {
  it("la dirección es la de la tienda online, completa (un QR con una ruta suelta no abre nada en el celular)", () => {
    expect(DIRECCION_TIENDA_ONLINE).toBe("https://tienda.cayla.pe");
  });

  it("un cartel por tienda, todos con el QR a la tienda online; el WhatsApp solo para la vista previa, y sin él igual hay cartel", () => {
    const carteles = cartelesDelClub([
      { id: TIENDA, nombre: "Tienda TRU", whatsappNumero: "953 585 537" },
      { id: OTRA, nombre: "Tienda AQP", whatsappNumero: null },
    ]);
    expect(carteles).toEqual([
      { id: TIENDA, tienda: "Tienda TRU", numero: "953585537", enlace: ENLACE_DEL_CARTEL },
      { id: OTRA, tienda: "Tienda AQP", numero: null, enlace: ENLACE_DEL_CARTEL },
    ]);
  });

  it("sin tiendas no hay carteles", () => {
    expect(cartelesDelClub([])).toEqual([]);
  });
});
