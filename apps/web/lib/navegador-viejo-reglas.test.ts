import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ATRIBUTO_NAVEGADOR_VIEJO, SCRIPT_NAVEGADOR_VIEJO } from "./navegador-viejo-reglas";

// ADR-0674 · «Actualiza el navegador»: el aviso que sale donde el ERP no puede pintarse bien.

/** Corre el script en un navegador de mentira: `entiende` dice si sabe `color-mix()`; `css: false` es un navegador sin `window.CSS`. */
function correr({ entiende, css = true, android = false }: { entiende: boolean | "lanza"; css?: boolean; android?: boolean }) {
  const atributos = new Map<string, string>();
  const document = { documentElement: { setAttribute: (k: string, v: string) => atributos.set(k, v) } };
  const CSS = {
    supports: (prop: string, valor: string) => {
      if (entiende === "lanza") throw new Error("roto");
      return prop === "color" && valor.startsWith("color-mix(") && entiende;
    },
  };
  const navigator = { userAgent: android ? "Mozilla/5.0 (Linux; Android 9; SM-J610G) Chrome/90" : "Mozilla/5.0 (Windows NT 10.0) Chrome/100" };
  new Function("window", "CSS", "document", "navigator", SCRIPT_NAVEGADOR_VIEJO)(css ? { CSS } : {}, css ? CSS : undefined, document, navigator);
  return atributos.get(ATRIBUTO_NAVEGADOR_VIEJO);
}

describe("el script que detecta el navegador viejo", () => {
  it("en un navegador al día no marca nada", () => {
    expect(correr({ entiende: true })).toBeUndefined();
    expect(correr({ entiende: true, android: true })).toBeUndefined();
  });

  it("sin `color-mix()` marca <html>: «android» (lleva a la Play Store) o «si»", () => {
    expect(correr({ entiende: false, android: true })).toBe("android");
    expect(correr({ entiende: false })).toBe("si");
  });

  it("sin `window.CSS` o si preguntar lanza, también marca (no sabemos si pinta bien)", () => {
    expect(correr({ entiende: false, css: false })).toBe("si");
    expect(correr({ entiende: "lanza" })).toBe("si");
  });

  it("es JavaScript de los viejos: sin flechas, `let`, `const` ni plantillas", () => {
    expect(SCRIPT_NAVEGADOR_VIEJO).not.toMatch(/=>|\blet\b|\bconst\b|`|\?\?|\?\./);
  });

  it("va en el <head> de la app, después del modo liviano, y el aviso es lo primero del <body>", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toMatch(/SCRIPT_LIVIANO_ANTES_DE_PINTAR \}\} \/>[\s\S]*?SCRIPT_NAVEGADOR_VIEJO \}\} \/>\s*<\/head>/);
    expect(layout).toMatch(/<body[^>]*>\s*\{\/\*[\s\S]*?\*\/\}\s*<AvisoNavegadorViejo \/>/);
  });
});

describe("el aviso y su CSS", () => {
  const css = readFileSync("app/estilos/navegador-viejo.css", "utf8");
  const globals = readFileSync("app/globals.css", "utf8");
  const aviso = readFileSync("components/AvisoNavegadorViejo.tsx", "utf8");
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");

  it("escondido de fábrica; se muestra solo con la marca, y el enlace solo en Android", () => {
    expect(sinComentarios).toMatch(/^\.aviso-navegador-viejo \{\s*display: none;/m);
    expect(sinComentarios).toMatch(/:root\[data-navegador-viejo\] \.aviso-navegador-viejo \{\s*display: block;/);
    expect(sinComentarios).toMatch(/:root\[data-navegador-viejo="android"\] \.aviso-navegador-viejo-enlace \{\s*display: inline-block;\s*min-height: 44px;/);
  });

  it("es CSS de los viejos: fuera de toda capa, sin `color-mix()`, y cada color con su respaldo igual al token", () => {
    expect(sinComentarios).not.toMatch(/@layer|color-mix|@media|@supports/);
    const token = (n: string) => globals.match(new RegExp(`--color-${n}:\\s*(#[0-9a-f]{6})`))?.[1];
    expect(css).toContain(`var(--color-tinta, ${token("tinta")})`);
    expect(css).toContain(`var(--color-crema, ${token("crema")})`);
    expect(globals).toMatch(/@import "\.\/estilos\/navegador-viejo\.css";/);
  });

  it("el aviso es del servidor: sin `use client` ni nada que necesite JavaScript", () => {
    expect(aviso).not.toMatch(/"use client"|useState|useEffect|onClick/);
  });
});
