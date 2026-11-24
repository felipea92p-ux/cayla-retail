import { describe, expect, it } from "vitest";
import { interpretarFicha, type Ficha } from "./ficha";
import { comoJsonLd } from "./seo";
import { descripcionDeFicha, disponibilidad, jsonLdDeFicha } from "./seo-ficha";

const TRU = "f775651f-62c8-4ff4-a414-b5614026d0cd";
const LIM = "2d97d322-8a0a-4cd5-99c4-70e52b9c01db";
const TALLA = { S: "96c0560a-1612-4fde-8ef7-d6aeab8c75c8", M: "1cfc459c-03e1-42d4-b950-a2a744da887a" };
const FOTO = "https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/a.png";
const CAMPANA = { id: "5a5a5a5a-1111-4222-8333-444444444444", nombre: "Aniversario", pct: 20, hasta: "2026-12-21" };

const variante = (id: string, talla: string, precioFinal: number, tru: unknown, lim: unknown, campana: unknown = null) => ({
  id,
  color: "NEG",
  talla,
  precio: 79.9,
  precio_final: precioFinal,
  campana,
  stock: { [TRU]: tru, [LIM]: lim },
  total: tru === "hay" || lim === "hay" ? "hay" : 0,
});

/** Una ficha como la devuelve `retail.tienda_ficha`, con lo que cada caso cambie. */
function ficha(cambios: { sede?: string | null; prenda?: Record<string, unknown>; variantes?: unknown[] } = {}): Ficha {
  const f = interpretarFicha({
    sede: cambios.sede === undefined ? TRU : cambios.sede,
    umbral: 3,
    sedes: [
      { id: LIM, nombre: "Lima" },
      { id: TRU, nombre: "Trujillo" },
    ],
    prenda: {
      id: "3f0e8a8e-2f1b-4c3e-9a55-111111111111",
      codigo: "BLU-0001",
      nombre: "Blusa Emma",
      descripcion: null,
      categoria: { nombre: "Blusas", prefijo: "BLU" },
      precio: 79.9,
      precio_final: 79.9,
      desde: false,
      campana: null,
      insignias: [],
      colores: [{ codigo: "NEG", nombre: "Negro", hex: "#111111", foto: null }],
      tallas: [
        { id: TALLA.S, nombre: "S" },
        { id: TALLA.M, nombre: "M" },
      ],
      fotos: [{ url: FOTO, color: "NEG" }],
      variantes: cambios.variantes ?? [
        variante("00000000-0000-4000-8000-000000000001", TALLA.S, 79.9, "hay", 0),
        variante("00000000-0000-4000-8000-000000000002", TALLA.M, 79.9, 2, 0),
      ],
      ...cambios.prenda,
    },
  });
  if (!f || f === "no_esta") throw new Error("la ficha de prueba no se pudo leer");
  return f;
}

const TRUJILLO = { nombre: "Trujillo", direccion: "Jr. Pizarro 123, Trujillo" };

describe("la frase de la ficha bajo el enlace (ADR-0696)", () => {
  it("sin descripción: el nombre, el precio en soles y la tienda; dice «en CAYLA», nunca «de CAYLA» (D3)", () => {
    expect(descripcionDeFicha(ficha(), TRUJILLO)).toBe("Blusa Emma a S/ 79.90 en CAYLA Trujillo. Sepárala online sin pagar y recógela en la tienda.");
    expect(descripcionDeFicha(ficha(), null)).toBe("Blusa Emma a S/ 79.90 en CAYLA. Sepárala online sin pagar y recógela en la tienda.");
    expect(descripcionDeFicha(ficha(), TRUJILLO)).not.toMatch(/de CAYLA/);
  });

  it("con precios distintos por talla dice «desde»", () => {
    const f = ficha({ prenda: { desde: true, precio_final: 63.9 } });
    expect(descripcionDeFicha(f, TRUJILLO)).toContain("desde S/ 63.90");
  });

  it("con descripción: la suya, en una línea y cortada en una palabra entera si es larga", () => {
    expect(descripcionDeFicha(ficha({ prenda: { descripcion: "Blusa de lino\n con  manga globo." } }), TRUJILLO)).toBe("Blusa de lino con manga globo.");
    const larga = "Una blusa de lino lavado con manga globo, cuello redondo y botones de nácar ".repeat(4);
    const corta = descripcionDeFicha(ficha({ prenda: { descripcion: larga } }), TRUJILLO);
    expect(corta.length).toBeLessThanOrEqual(155);
    expect(corta.endsWith("…")).toBe(true);
    expect(corta).not.toMatch(/\s…$/);
  });
});

describe("los datos de producto de la ficha (ADR-0696)", () => {
  it("cuánto hay en la tienda de la página: hay → en stock, 1 a 3 → pocas, 0 → agotado", () => {
    expect(disponibilidad(ficha())).toBe("https://schema.org/InStock");
    const pocas = ficha({ variantes: [variante("00000000-0000-4000-8000-000000000001", TALLA.S, 79.9, 2, "hay")] });
    expect(disponibilidad(pocas)).toBe("https://schema.org/LimitedAvailability");
    const agotada = ficha({ variantes: [variante("00000000-0000-4000-8000-000000000001", TALLA.S, 79.9, 0, "hay")] });
    expect(disponibilidad(agotada)).toBe("https://schema.org/OutOfStock");
    // En Lima, la misma prenda sí hay.
    expect(disponibilidad(ficha({ sede: LIM, variantes: [variante("00000000-0000-4000-8000-000000000001", TALLA.S, 79.9, 0, "hay")] }))).toBe(
      "https://schema.org/InStock",
    );
  });

  it("el Product con su Offer: precio en soles con dos decimales, sin marca, recojo en la tienda", () => {
    const dato = jsonLdDeFicha(ficha(), TRUJILLO, "trujillo") as { "@graph": Record<string, unknown>[] };
    const [producto, ruta] = dato["@graph"];
    expect(producto).toMatchObject({
      "@type": "Product",
      name: "Blusa Emma",
      sku: "BLU-0001",
      category: "Blusas",
      image: [FOTO],
      offers: {
        "@type": "Offer",
        price: "79.90",
        priceCurrency: "PEN",
        availability: "https://schema.org/InStock",
        availableDeliveryMethod: "https://schema.org/OnSitePickup",
        url: "https://cayla.pe/catalogo/3f0e8a8e-2f1b-4c3e-9a55-111111111111?sede=trujillo",
        availableAtOrFrom: { "@type": "Place", name: "CAYLA Trujillo", address: "Jr. Pizarro 123, Trujillo" },
      },
    });
    expect(producto).not.toHaveProperty("brand");
    expect(producto).not.toHaveProperty("description");
    expect(ruta).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { position: 1, name: "Inicio", item: "https://cayla.pe/inicio?sede=trujillo" },
        { position: 2, name: "Blusas", item: "https://cayla.pe/catalogo?sede=trujillo&categoria=BLU" },
        { position: 3, name: "Blusa Emma", item: "https://cayla.pe/catalogo/3f0e8a8e-2f1b-4c3e-9a55-111111111111?sede=trujillo" },
      ],
    });
  });

  it("con precios distintos por talla, un rango (AggregateOffer); con campaña con fecha, hasta cuándo vale", () => {
    const f = ficha({
      prenda: { precio_final: 63.9, desde: true, campana: CAMPANA },
      variantes: [
        variante("00000000-0000-4000-8000-000000000001", TALLA.S, 63.9, "hay", 0, CAMPANA),
        variante("00000000-0000-4000-8000-000000000002", TALLA.M, 79.9, "hay", 0),
      ],
    });
    const oferta = (jsonLdDeFicha(f, TRUJILLO, "trujillo") as { "@graph": { offers: Record<string, unknown> }[] })["@graph"][0].offers;
    expect(oferta).toMatchObject({ "@type": "AggregateOffer", lowPrice: "63.90", highPrice: "79.90", offerCount: 2, priceValidUntil: "2026-12-21" });
  });

  it("sin foto, sin código y sin tienda, no inventa nada", () => {
    const f = ficha({ prenda: { fotos: [], codigo: null } });
    const producto = (jsonLdDeFicha(f, null, null) as { "@graph": Record<string, unknown>[] })["@graph"][0];
    expect(producto).not.toHaveProperty("image");
    expect(producto).not.toHaveProperty("sku");
    expect(producto.offers).not.toHaveProperty("availableAtOrFrom");
    expect((producto.offers as { url: string }).url).toBe("https://cayla.pe/catalogo/3f0e8a8e-2f1b-4c3e-9a55-111111111111");
  });

  it("un texto del equipo no puede cerrar el <script>", () => {
    const f = ficha({ prenda: { nombre: "Blusa </script><script>alert(1)</script>", descripcion: "<b>linda</b>" } });
    const texto = comoJsonLd(jsonLdDeFicha(f, TRUJILLO, "trujillo"));
    expect(texto).not.toContain("<");
    expect(JSON.parse(texto)["@graph"][0].name).toBe("Blusa </script><script>alert(1)</script>");
  });
});
