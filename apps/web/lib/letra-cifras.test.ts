import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// REGLA (ADR-0691): DM Sans no trae cifras de ancho fijo, así que una columna de dinero no cuadraba dígito por dígito aunque pidiera
// `tabular-nums`. Los diez dígitos salen de otra letra, que va primera en `--font-sans`; las letras siguen en DM Sans. Esto cuida las
// tres cosas que lo hacen funcionar: que esa letra SOLO tenga dígitos, que vaya primera y que el papel que se imprime no cambie.
const sinComentar = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("las cifras salen de una letra con ancho fijo", () => {
  const letra = readFileSync("lib/letra-cifras.ts", "utf8");
  const globals = sinComentar(readFileSync("app/globals.css", "utf8"));
  const cifras = sinComentar(readFileSync("app/estilos/cifras.css", "utf8"));

  it("la letra de las cifras solo tiene los diez dígitos: si tuviera letras, todo el ERP cambiaría de letra", () => {
    expect(letra).toMatch(/\{ prop: "unicode-range", value: "U\+0030-0039" \}/);
  });

  it("su archivo existe en el paquete del que sale", () => {
    const ruta = letra.match(/src: "\.\.\/(node_modules\/[^"]+\.woff2)"/)?.[1];
    expect(ruta, "la ruta del archivo en lib/letra-cifras.ts").toBeTruthy();
    expect(existsSync(ruta!), ruta).toBe(true);
  });

  it("va PRIMERA en la letra del sistema, antes de DM Sans", () => {
    expect(globals).toMatch(/--font-sans:\s*var\(--font-cifras\),\s*var\(--font-dm-sans\),/);
  });

  it("la serif no la lleva: EB Garamond ya trae cifras de ancho fijo", () => {
    expect(globals.match(/--font-serif:\s*([^;]+);/)?.[1]).not.toContain("--font-cifras");
  });

  it("el <html> declara su variable", () => {
    expect(readFileSync("app/layout.tsx", "utf8")).toMatch(/<html[^>]*\$\{letraCifras\.variable\}/);
  });

  it("el papel conserva sus dígitos: al imprimir, y en pantalla lo que se ve como saldrá impreso", () => {
    expect(cifras).toMatch(/@media print\s*\{\s*:root\s*\{\s*--font-sans:\s*var\(--font-dm-sans\),/);
    expect(cifras).toMatch(/\.papel-fijo,\s*\[data-papel\]\s*\{\s*--font-sans:\s*var\(--font-dm-sans\),/);
    expect(cifras).not.toContain("--font-cifras");
  });
});
