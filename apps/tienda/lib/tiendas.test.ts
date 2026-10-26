import { describe, expect, it } from "vitest";
import { columnasDeTiendas, enlaceMapa, enlaceWhatsapp, interpretarSedes, SEDES_SIN_DATOS, whatsappLegible } from "./tiendas";

const TRUJILLO = { id: "f775651f-62c8-4ff4-a414-b5614026d0cd", nombre: "Trujillo", direccion: "Jr. Pizarro 512, Centro", horario: "Lunes a sábado, de 10 a. m. a 9 p. m.", whatsapp: "987654321", mapa: null, foto: null };
const LIMA = { id: "2d97d322-8a0a-4cd5-99c4-70e52b9c01db", nombre: "Lima", direccion: "Av. Larco 345, Miraflores", horario: null, whatsapp: "912345678", mapa: null, foto: null };

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

describe("«Cómo llegar» a cada tienda", () => {
  it("busca la dirección en Google Maps, con la ciudad (el nombre web de la tienda) y el país", () => {
    const url = new URL(enlaceMapa(LIMA));
    expect(`${url.origin}${url.pathname}`).toBe("https://www.google.com/maps/search/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("query")).toBe("Av. Larco 345, Miraflores, Lima, Perú");
  });

  it("una dirección con signos raros no rompe el enlace: todo va dentro de la búsqueda", () => {
    const url = new URL(enlaceMapa({ nombre: "Trujillo", direccion: "Jr. Pizarro 512 #2 & Of. 3? (Centro)" }));
    expect([...url.searchParams.keys()]).toEqual(["api", "query"]);
    expect(url.searchParams.get("query")).toBe("Jr. Pizarro 512 #2 & Of. 3? (Centro), Trujillo, Perú");
    expect(url.hash).toBe("");
  });
});

describe("«Cómo llegar» con el mapa que pegó la tienda", () => {
  it("con su enlace de Google Maps, abre ese lugar exacto", () => {
    expect(enlaceMapa({ ...LIMA, mapa: "https://maps.app.goo.gl/AbC123" })).toBe("https://maps.app.goo.gl/AbC123");
  });
  it("sin enlace, o con uno que no es de Google Maps, sigue buscando la dirección", () => {
    const buscada = enlaceMapa(LIMA);
    expect(enlaceMapa({ ...LIMA, mapa: null })).toBe(buscada);
    expect(enlaceMapa({ ...LIMA, mapa: "https://evil.com/maps" })).toBe(buscada);
    expect(enlaceMapa({ ...LIMA, mapa: "javascript:alert(1)" })).toBe(buscada);
  });
  it("lo que llega de la base se acepta con su mapa; uno raro no tumba a la tienda: queda sin mapa", () => {
    const [t, l] = interpretarSedes({ sedes: [{ ...TRUJILLO, mapa: "https://maps.app.goo.gl/AbC123" }, { ...LIMA, mapa: "https://evil.com" }] });
    expect(t?.mapa).toBe("https://maps.app.goo.gl/AbC123");
    expect(l?.mapa).toBeNull();
    expect(interpretarSedes({ sedes: [{ id: LIMA.id, nombre: "Lima", direccion: "Av. Larco 345", whatsapp: "912345678" }] })[0]?.mapa).toBeNull();
  });
});

describe("la foto de la fachada de cada tienda", () => {
  const ORIGEN = "https://abc.supabase.co";
  const RUTA = `tiendas/${TRUJILLO.id}/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.webp`;
  it("con la ruta que subió el ERP y el origen del almacén, sale su dirección pública", () => {
    const [t] = interpretarSedes({ sedes: [{ ...TRUJILLO, foto: RUTA }] }, ORIGEN);
    expect(t?.foto).toBe(`${ORIGEN}/storage/v1/object/public/retail-tiendas/${RUTA}`);
  });
  it("sin foto, sin origen o con una ruta que el ERP no pudo subir, la tarjeta sale sin foto (la tienda no se cae)", () => {
    expect(interpretarSedes({ sedes: [TRUJILLO] }, ORIGEN)[0]?.foto).toBeNull();
    expect(interpretarSedes({ sedes: [{ ...TRUJILLO, foto: RUTA }] })[0]?.foto).toBeNull();
    expect(interpretarSedes({ sedes: [{ ...TRUJILLO, foto: "https://evil.com/x.png" }] }, ORIGEN)[0]?.foto).toBeNull();
    expect(interpretarSedes({ sedes: [{ ...TRUJILLO, foto: "tiendas/../../x" }] }, ORIGEN)[0]?.foto).toBeNull();
  });
});

describe("«Nuestras tiendas» queda pareja con cualquier cantidad", () => {
  it("una ocupa todo el ancho; dos y cuatro, de a dos; tres y desde cinco, de a tres", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 9].map(columnasDeTiendas)).toEqual([1, 1, 2, 3, 2, 3, 3, 3, 3]);
  });

  it("con dos, tres, cuatro o seis tiendas, ninguna fila queda a medias", () => {
    for (const n of [2, 3, 4, 6]) expect(n % columnasDeTiendas(n), `${n} tiendas`).toBe(0);
  });
});
