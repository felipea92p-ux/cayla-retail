import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Prenda } from "./catalogo";
import { entradasDelMapa, PAGINAS_FIJAS, REGLAS_PARA_BUSCADORES } from "./mapa-del-sitio";

const prenda = (id: string, categoria: { nombre: string; prefijo: string | null } | null, fotos: string[] = []): Prenda => ({
  id,
  codigo: null,
  nombre: `Prenda ${id}`,
  categoria,
  empresa: null,
  precio: 79.9,
  precioFinal: 79.9,
  desde: false,
  campana: null,
  colores: [],
  fotos,
  stock: null,
  nuevo: null,
  vendidos: null,
  insignias: [],
});

const BLUSAS = { nombre: "Blusas", prefijo: "BLU" };
const FALDAS = { nombre: "Faldas", prefijo: "FAL" };

describe("el mapa del sitio (ADR-0696)", () => {
  const mapa = entradasDelMapa(
    {
      prendas: [
        prenda("a1", BLUSAS, ["https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/a.png"]),
        prenda("a2", BLUSAS, ["/fotos/relativa.png"]),
        prenda("b1", FALDAS),
      ],
      looks: ["l1"],
    },
    "trujillo",
  );
  const urls = mapa.map((e) => e.url);

  it("cada dirección del catálogo es la canónica, con la tienda principal, en cayla.pe", () => {
    expect(urls).toContain("https://cayla.pe/inicio?sede=trujillo");
    expect(urls).toContain("https://cayla.pe/catalogo?sede=trujillo");
    expect(urls).toContain("https://cayla.pe/catalogo?sede=trujillo&amp;lista=ofertas");
    expect(urls).toContain("https://cayla.pe/catalogo?sede=trujillo&amp;categoria=BLU");
    expect(urls).toContain("https://cayla.pe/catalogo/b1?sede=trujillo");
    expect(urls).toContain("https://cayla.pe/looks/l1?sede=trujillo");
    expect(urls.every((u) => u.startsWith("https://cayla.pe/"))).toBe(true);
  });

  it("el & va escapado: Next escribe <loc> tal cual y un & suelto deja el XML inválido", () => {
    expect(urls.some((u) => /&(?!amp;)/.test(u))).toBe(false);
  });

  it("una ficha por prenda y una lista por categoría, sin repetir", () => {
    expect(urls.filter((u) => /\/catalogo\/[^?]+\?/.test(u))).toHaveLength(3);
    expect(urls.filter((u) => u.includes("categoria="))).toHaveLength(2);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("la foto de una ficha solo si es una dirección completa", () => {
    expect(mapa.find((e) => e.url.includes("/catalogo/a1"))?.images).toEqual([
      "https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/a.png",
    ]);
    expect(mapa.find((e) => e.url.includes("/catalogo/a2"))?.images).toBeUndefined();
  });

  it("sin la base, las páginas fijas y las del catálogo que no dependen de ella", () => {
    const corto = entradasDelMapa({ prendas: null, looks: null }, "trujillo").map((e) => e.url);
    expect(corto).toContain("https://cayla.pe/tiendas");
    expect(corto).toContain("https://cayla.pe/inicio?sede=trujillo");
    expect(corto.some((u) => /\/catalogo\/[^?]/.test(u))).toBe(false);
  });

  it("las páginas fijas del mapa existen y ninguna es de la cuenta, la bolsa o entrar", () => {
    for (const ruta of PAGINAS_FIJAS) {
      expect(existsSync(path.join(__dirname, "..", "app", ruta, "page.tsx")), ruta).toBe(true);
      expect(ruta).not.toMatch(/^\/(cuenta|bolsa|entrar|crear-cuenta|notificaciones)/);
    }
  });
});

describe("las reglas para los buscadores (ADR-0696)", () => {
  it("todo se lee menos /api/ y /auth/, y el mapa está en cayla.pe", () => {
    expect(REGLAS_PARA_BUSCADORES.sitemap).toBe("https://cayla.pe/sitemap.xml");
    const reglas = Array.isArray(REGLAS_PARA_BUSCADORES.rules) ? REGLAS_PARA_BUSCADORES.rules : [REGLAS_PARA_BUSCADORES.rules];
    expect(reglas).toEqual([{ userAgent: "*", allow: "/", disallow: ["/api/", "/auth/"] }]);
  });

  it("no bloquea lo que dice noindex (si no se puede entrar, no se ve el noindex)", () => {
    const bloqueado = JSON.stringify(REGLAS_PARA_BUSCADORES.rules);
    for (const ruta of ["/cuenta", "/bolsa", "/entrar", "/catalogo", "/_next"]) expect(bloqueado).not.toContain(`"${ruta}`);
  });
});
