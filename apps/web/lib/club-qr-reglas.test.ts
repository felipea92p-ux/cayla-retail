import { describe, expect, it } from "vitest";
import { cartelesDelClub, clubEnElTicket } from "./club-qr-reglas";
import type { ResumenClientaCaja } from "./club-acciones";

// ADR-0288 act. g, G-1: un solo QR por tienda —el del cartel— que abre su página de registro; el ticket lleva el mismo.
const TIENDA = "3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c";
const OTRA = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const ORIGEN = "https://retail.cayla.pe";

const resumen = (parte: Partial<Pick<ResumenClientaCaja, "esSocia" | "codigoClub" | "conPublicidad">> = {}) => ({
  esSocia: false,
  codigoClub: null,
  conPublicidad: false,
  ...parte,
});

describe("el QR al pie del ticket impreso", () => {
  it("venta sin clienta o a una que no es socia: la página de registro de la tienda de la venta", () => {
    for (const r of [null, resumen()]) {
      expect(clubEnElTicket({ origen: ORIGEN, ubicacionId: TIENDA, resumen: r })).toEqual({
        enlace: `${ORIGEN}/club/${TIENDA}`,
        titulo: "Club CAYLA",
        linea: "Únete al Club CAYLA: escanea y regístrate",
      });
    }
  });

  it("socia sin WhatsApp de promociones: el mismo QR, con su código, para activarlo si quiere", () => {
    const t = clubEnElTicket({ origen: ORIGEN, ubicacionId: TIENDA, resumen: resumen({ esSocia: true, codigoClub: "c-0142" }) });
    expect(t).toEqual({ enlace: `${ORIGEN}/club/${TIENDA}`, titulo: "Club CAYLA · Socia C-0142", linea: "¿Novedades por WhatsApp? Escanea y actívalas." });
  });

  it("socia que ya recibe novedades: el ticket no le pide nada", () => {
    expect(clubEnElTicket({ origen: ORIGEN, ubicacionId: TIENDA, resumen: resumen({ esSocia: true, codigoClub: "C-0142", conPublicidad: true }) })).toBeNull();
  });

  it("no depende del WhatsApp de la tienda; sin una tienda o un origen que sirvan, no hay QR", () => {
    expect(clubEnElTicket({ origen: ORIGEN, ubicacionId: null, resumen: null })).toBeNull();
    expect(clubEnElTicket({ origen: ORIGEN, ubicacionId: "tienda-tru", resumen: null })).toBeNull();
    expect(clubEnElTicket({ origen: "", ubicacionId: TIENDA, resumen: null })).toBeNull();
  });

  it("el enlace es corto: el QR de 30 mm sale holgado en la térmica", () => {
    expect(clubEnElTicket({ origen: ORIGEN, ubicacionId: TIENDA, resumen: null })!.enlace.length).toBeLessThan(80);
  });
});

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
