import { describe, expect, it } from "vitest";
import { enlaceWhatsapp, interpretarSedes, SEDES_SIN_DATOS, whatsappLegible } from "./tiendas";

const TRUJILLO = { id: "f775651f-62c8-4ff4-a414-b5614026d0cd", nombre: "Trujillo", direccion: "Jr. Pizarro 512, Centro", horario: "Lunes a sábado, de 10 a. m. a 9 p. m.", whatsapp: "987654321" };
const LIMA = { id: "2d97d322-8a0a-4cd5-99c4-70e52b9c01db", nombre: "Lima", direccion: "Av. Larco 345, Miraflores", horario: null, whatsapp: "912345678" };

describe("interpretarSedes", () => {
  it("acepta lo que devuelve retail.tienda_sedes(), en su orden y con el horario opcional", () => {
    expect(interpretarSedes({ sedes: [TRUJILLO, LIMA] })).toEqual([TRUJILLO, LIMA]);
    expect(interpretarSedes({ sedes: [] })).toEqual([]);
  });

  it("si la base responde algo raro, no hay tiendas (la página no se cae)", () => {
    for (const raro of [null, undefined, "x", 3, {}, { sedes: "x" }, { sedes: null }]) expect(interpretarSedes(raro)).toEqual(SEDES_SIN_DATOS);
  });

  it("una tienda mal formada se deja fuera, y las demás se muestran igual", () => {
    for (const mala of [
      { ...TRUJILLO, whatsapp: "12345" },
      { ...TRUJILLO, whatsapp: "+51987654321" },
      { ...TRUJILLO, nombre: "  " },
      { ...TRUJILLO, direccion: "" },
      { ...TRUJILLO, id: "uno" },
    ]) {
      expect(interpretarSedes({ sedes: [mala, LIMA] })).toEqual([LIMA]);
    }
  });

  it("un horario vacío o raro no tumba la tienda: sale sin horario", () => {
    for (const horario of ["", "  ", 3]) expect(interpretarSedes({ sedes: [{ ...TRUJILLO, horario }] })).toEqual([{ ...TRUJILLO, horario: null }]);
  });
});

describe("el WhatsApp de cada tienda", () => {
  it("se lee como un celular del Perú", () => {
    expect(whatsappLegible("987654321")).toBe("+51 987 654 321");
  });

  it("el enlace abre un chat con la tienda, sin mensaje armado", () => {
    expect(enlaceWhatsapp("987654321")).toBe("https://wa.me/51987654321");
  });
});
