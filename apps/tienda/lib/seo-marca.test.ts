import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REDES } from "./redes";
import { horarioParaGoogle, jsonLdDeLaMarca, jsonLdDeTiendas, type TiendaParaGoogle } from "./seo-marca";

const SEMANA_TRUJILLO = [
  { abre: 600, cierra: 1200 },
  { abre: 600, cierra: 1200 },
  { abre: 600, cierra: 1200 },
  { abre: 600, cierra: 1200 },
  { abre: 600, cierra: 1200 },
  { abre: 600, cierra: 1260 },
  null,
];

const TRUJILLO: TiendaParaGoogle = {
  nombre: "Trujillo",
  direccion: "Jr. Pizarro 123, Trujillo",
  whatsapp: "922222222",
  mapa: "https://maps.app.goo.gl/abc",
  foto: "https://x.supabase.co/storage/v1/object/public/tiendas/trujillo.jpg",
  dias: SEMANA_TRUJILLO,
};

describe("la marca para Google (ADR-0696)", () => {
  it("Organization con su logo de la app y las redes del pie; WebSite en español del Perú", () => {
    const [marca, sitio] = jsonLdDeLaMarca()["@graph"] as Record<string, unknown>[];
    expect(marca).toMatchObject({ "@type": "Organization", name: "CAYLA", url: "https://cayla.pe", logo: "https://cayla.pe/cayla-app-512.png" });
    expect(marca.sameAs).toEqual(REDES.map((r) => r.url));
    expect(sitio).toMatchObject({ "@type": "WebSite", inLanguage: "es-PE", publisher: { "@id": "https://cayla.pe/#marca" } });
  });

  it("el logo es un archivo que existe en la tienda", () => {
    expect(existsSync(path.join(__dirname, "..", "public", "cayla-app-512.png"))).toBe(true);
  });
});

describe("las tiendas para Google (ADR-0696)", () => {
  it("una ClothingStore por tienda, con dirección, WhatsApp en +51, mapa, foto y su Inicio", () => {
    const [tienda] = jsonLdDeTiendas([TRUJILLO])?.["@graph"] as Record<string, unknown>[];
    expect(tienda).toMatchObject({
      "@type": "ClothingStore",
      "@id": "https://cayla.pe/tiendas#trujillo",
      name: "CAYLA Trujillo",
      url: "https://cayla.pe/inicio?sede=trujillo",
      address: { "@type": "PostalAddress", streetAddress: "Jr. Pizarro 123, Trujillo", addressCountry: "PE" },
      telephone: "+51922222222",
      hasMap: "https://maps.app.goo.gl/abc",
      image: "https://x.supabase.co/storage/v1/object/public/tiendas/trujillo.jpg",
      parentOrganization: { "@id": "https://cayla.pe/#marca" },
    });
  });

  it("el horario junta los días que abren igual, en el orden de la semana, y salta los cerrados", () => {
    expect(horarioParaGoogle(SEMANA_TRUJILLO)).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "10:00", closes: "20:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Saturday"], opens: "10:00", closes: "21:00" },
    ]);
  });

  it("la medianoche del cierre es 23:59; sin horas, sin horario", () => {
    expect(horarioParaGoogle([{ abre: 540, cierra: 1440 }, null, null, null, null, null, null])).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday"], opens: "09:00", closes: "23:59" },
    ]);
    const sinHoras = jsonLdDeTiendas([{ ...TRUJILLO, dias: Array(7).fill(null), mapa: null, foto: "/relativa.jpg" }])?.["@graph"] as Record<string, unknown>[];
    expect(sinHoras[0]).not.toHaveProperty("openingHoursSpecification");
    expect(sinHoras[0]).not.toHaveProperty("hasMap");
    expect(sinHoras[0]).not.toHaveProperty("image");
  });

  it("sin tiendas (la base no respondió), nada", () => {
    expect(jsonLdDeTiendas([])).toBeNull();
  });
});
