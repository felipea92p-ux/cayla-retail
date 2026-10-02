import { describe, expect, it } from "vitest";
import { cartelesDelClub } from "./club-qr-reglas";

// ADR-0288 act. g, G-1: un solo QR por tienda —el del cartel— que abre su página de registro. El ticket no lleva QR del club (act. j).
const TIENDA = "3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c";
const OTRA = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const ORIGEN = "https://retail.cayla.pe";

describe("el cartel del mostrador", () => {
  it("un cartel por tienda, cada QR a SU registro; el WhatsApp solo para el pie, y sin él igual hay cartel", () => {
    const carteles = cartelesDelClub(`${ORIGEN}/`, [
      { id: TIENDA, nombre: "Tienda TRU", whatsappNumero: "953 585 537" },
      { id: OTRA, nombre: "Tienda AQP", whatsappNumero: null },
    ]);
    expect(carteles).toEqual([
      { id: TIENDA, tienda: "Tienda TRU", numero: "953585537", enlace: `${ORIGEN}/club/${TIENDA}` },
      { id: OTRA, tienda: "Tienda AQP", numero: null, enlace: `${ORIGEN}/club/${OTRA}` },
    ]);
  });

  it("sin un origen completo no se arma ningún QR (un QR con una ruta suelta no abre nada)", () => {
    expect(cartelesDelClub("/", [{ id: TIENDA, nombre: "Tienda TRU", whatsappNumero: null }])).toEqual([]);
  });
});
