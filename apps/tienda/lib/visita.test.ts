import { describe, expect, it } from "vitest";
import { caminoDe, esRobot, esVisitaNueva, leerPasos, regionDe, TOPE_DE_PASOS } from "./visita";

const DOMINIO = "tienda.cayla.pe";
const camino = (referente: string, busqueda = "") => caminoDe({ referente, busqueda, dominio: DOMINIO });

describe("caminoDe: por dónde llegó la persona", () => {
  it("la marca del enlace gana a la página de origen", () => {
    expect(camino("https://l.instagram.com/", "?utm_source=qr")).toBe("qr");
    expect(camino("", "?utm_source=WhatsApp&utm_medium=x")).toBe("whatsapp");
    expect(camino("", "?utm_source=ig")).toBe("instagram");
    expect(camino("", "?utm_source=boletin")).toBe("otros");
  });

  it("sin marca, la página de origen", () => {
    expect(camino("https://l.instagram.com/")).toBe("instagram");
    expect(camino("https://www.instagram.com/caylaperu/")).toBe("instagram");
    expect(camino("https://www.tiktok.com/@cayla")).toBe("tiktok");
    expect(camino("https://wa.me/51999999999")).toBe("whatsapp");
    expect(camino("https://web.whatsapp.com/")).toBe("whatsapp");
    expect(camino("https://www.google.com/")).toBe("google");
    expect(camino("https://www.google.com.pe/")).toBe("google");
    expect(camino("https://m.facebook.com/")).toBe("otros");
  });

  it("sin página de origen, o desde la misma tienda, es «Directo»", () => {
    expect(camino("")).toBe("directo");
    expect(camino("no es una dirección")).toBe("directo");
    expect(camino("https://tienda.cayla.pe/catalogo")).toBe("directo");
  });

  it("un dominio que solo se parece no engaña", () => {
    expect(camino("https://instagram.com.estafa.pe/")).toBe("otros");
    expect(camino("https://notgoogle.com/")).toBe("otros");
  });
});

describe("regionDe: el departamento aproximado, nunca la ciudad", () => {
  it("en el Perú, el departamento ISO 3166-2", () => {
    expect(regionDe("PE", "LAL")).toBe("PE-LAL");
    expect(regionDe("pe", "are")).toBe("PE-ARE");
    expect(regionDe("PE", "PE-LMA")).toBe("PE-LMA");
  });
  it("en el Perú sin departamento claro, solo el país", () => {
    expect(regionDe("PE", null)).toBe("PE");
    expect(regionDe("PE", "Trujillo")).toBe("PE");
  });
  it("fuera del Perú, solo el país", () => {
    expect(regionDe("US", "CA")).toBe("US");
  });
  it("sin cabeceras (en local) no hay departamento", () => {
    expect(regionDe(null, null)).toBeNull();
    expect(regionDe("Perú", "LAL")).toBeNull();
  });
});

describe("leerPasos: lo que acepta la ruta", () => {
  it("acepta «entró» con su camino", () => {
    expect(leerPasos({ pasos: [{ paso: 0, camino: "tiktok" }] })).toEqual([{ paso: 0, camino: "tiktok", hace_ms: 0 }]);
    expect(leerPasos({ pasos: [{ paso: 0, camino: "qr", hace_ms: 1500 }] })).toEqual([{ paso: 0, camino: "qr", hace_ms: 1500 }]);
  });
  it("descarta el paso que no calza y se queda con el resto", () => {
    expect(
      leerPasos({ pasos: [{ paso: 0, camino: "facebook" }, "hola", null, { paso: 0, camino: "directo", hace_ms: -5 }, { paso: 0, camino: "google" }] }),
    ).toEqual([{ paso: 0, camino: "google", hace_ms: 0 }]);
  });
  it("acepta «vio prenda» y «eligió talla» con sus ids de la base", () => {
    const prenda = "11111111-1111-4111-8111-111111111111";
    const talla = "22222222-2222-4222-8222-222222222222";
    expect(leerPasos({ pasos: [{ paso: 1, producto: prenda, hace_ms: 20 }, { paso: 2, producto: prenda, variante: talla }] })).toEqual([
      { paso: 1, producto: prenda, hace_ms: 20 },
      { paso: 2, producto: prenda, variante: talla, hace_ms: 0 },
    ]);
    expect(leerPasos({ pasos: [{ paso: 1, producto: "BLZ-0001" }, { paso: 2, producto: prenda }] })).toEqual([]);
  });
  it("lo que anota el servidor («a la bolsa», «separó») no entra por aquí", () => {
    expect(leerPasos({ pasos: [{ paso: 3 }, { paso: 4, pedido: "x" }] })).toEqual([]);
  });
  it("un cuerpo que no es la lista, o con más de 20, se rechaza entero", () => {
    expect(leerPasos(null)).toBeNull();
    expect(leerPasos([])).toBeNull();
    expect(leerPasos({ pasos: "0" })).toBeNull();
    expect(leerPasos({ pasos: Array.from({ length: TOPE_DE_PASOS + 1 }, () => ({ paso: 0, camino: "directo" })) })).toBeNull();
  });
});

describe("esRobot: quien no es una persona no se cuenta", () => {
  it("buscadores, vistas previas y navegadores automáticos", () => {
    expect(esRobot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(esRobot("facebookexternalhit/1.1")).toBe(true);
    expect(esRobot("Mozilla/5.0 HeadlessChrome/120")).toBe(true);
    expect(esRobot(null)).toBe(true);
  });
  it("un celular, el navegador de Instagram o uno de escritorio sí son personas", () => {
    expect(esRobot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0")).toBe(false);
    expect(esRobot("Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36")).toBe(false);
    expect(esRobot("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36")).toBe(false);
  });
});

describe("esVisitaNueva: una visita dura mientras la persona vuelve antes de 30 minutos", () => {
  const ahora = Date.UTC(2026, 9, 23, 21, 0, 0);
  it("la primera vez, sí", () => expect(esVisitaNueva(null, ahora)).toBe(true));
  it("29 minutos después, sigue la misma", () => expect(esVisitaNueva(ahora - 29 * 60_000, ahora)).toBe(false));
  it("31 minutos después, es otra", () => expect(esVisitaNueva(ahora - 31 * 60_000, ahora)).toBe(true));
  it("si el reloj va para atrás o el dato está roto, es otra", () => {
    expect(esVisitaNueva(ahora + 60_000, ahora)).toBe(true);
    expect(esVisitaNueva(Number.NaN, ahora)).toBe(true);
  });
});
