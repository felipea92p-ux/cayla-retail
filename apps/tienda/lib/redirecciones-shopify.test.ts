import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REDIRECCIONES_DE_SHOPIFY } from "./redirecciones-shopify";

const APP = join(__dirname, "..", "app");

/** ¿Hay una pantalla en `app/` para esta ruta? Las carpetas `(grupo)` no cuentan en la dirección. */
function existeLaRuta(ruta: string): boolean {
  if (ruta === "/") return existsSync(join(APP, "page.tsx")) || existsSync(join(APP, "(catalogo)", "inicio", "page.tsx"));
  const trozos = ruta.split("/").filter(Boolean);
  const buscar = (carpeta: string, resto: string[]): boolean => {
    if (resto.length === 0) return existsSync(join(carpeta, "page.tsx"));
    const [primero, ...cola] = resto;
    if (existsSync(join(carpeta, primero)) && buscar(join(carpeta, primero), cola)) return true;
    return readdirSync(carpeta, { withFileTypes: true }).some((e) => e.isDirectory() && /^\(.+\)$/.test(e.name) && buscar(join(carpeta, e.name), resto));
  };
  return buscar(APP, trozos);
}

describe("redirecciones de la tienda vieja de Shopify (ADR-0595)", () => {
  it("todas son permanentes y llevan a una pantalla que existe", () => {
    for (const r of REDIRECCIONES_DE_SHOPIFY) {
      expect(r.permanent, r.source).toBe(true);
      expect(existeLaRuta(r.destination), `${r.source} → ${r.destination}`).toBe(true);
    }
  });

  it("ningún origen se repite", () => {
    const origenes = REDIRECCIONES_DE_SHOPIFY.map((r) => r.source);
    expect(new Set(origenes).size).toBe(origenes.length);
  });

  it("no pisan una pantalla propia de la tienda", () => {
    for (const r of REDIRECCIONES_DE_SHOPIFY) {
      const base = r.source.split("/:")[0];
      expect(existeLaRuta(base) && base !== "", `${r.source} taparía una pantalla de la tienda`).toBe(false);
    }
  });

  it("las más específicas van antes que las generales", () => {
    const origenes = REDIRECCIONES_DE_SHOPIFY.map((r) => r.source);
    expect(origenes.indexOf("/pages/ubicacion-cayla")).toBeLessThan(origenes.indexOf("/pages/:resto*"));
    expect(origenes.indexOf("/account/login")).toBeLessThan(origenes.indexOf("/account/:resto*"));
    expect(origenes.indexOf("/policies/refund-policy")).toBeLessThan(origenes.indexOf("/policies/:resto*"));
  });
});
