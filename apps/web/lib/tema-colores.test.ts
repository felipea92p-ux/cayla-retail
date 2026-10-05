import { describe, expect, it } from "vitest";
// El escáner de `pnpm tema:colores` es la ÚNICA definición de «color suelto»: la prueba lo importa en vez de copiarlo.
import { colorSueltosDe, escanearColoresSueltos, sinBloquesTheme } from "../tema/colores-sueltos.mjs";
import { COLORES_A_MANO, DEUDA_DE_COLORES_HOY } from "./tema-colores-archivos";

// REGLA (ADR-0336, Felipe 2026-10-05): la interfaz usa SOLO tokens de color (`bg-papel`, `text-tinta`, `var(--color-…)`). Un hex, un
// `rgb()`, `bg-white` o `bg-gray-100` escrito a mano no cambia con el tema: la pantalla que lo usa se queda clara dentro del modo
// oscuro. Esta prueba es la parte que no depende de que alguien se acuerde: un color suelto NUEVO falla aquí, y la deuda de antes
// (`lib/tema-colores-archivos.ts`) solo puede bajar. Misma idea que `lib/sugerir.test.ts` y `lib/guia-de-foco.test.ts`.

const cuenta = (texto: string, tipo: "ts" | "css" = "ts", nombre = "") => colorSueltosDe(texto, tipo, nombre).cuenta;

describe("escáner de colores sueltos — qué cuenta y qué no", () => {
  it("cuenta hex de 6 y 8 dígitos, los atajos #fff/#000 y las funciones de color", () => {
    expect(cuenta('const a = "#1A1A18";')).toBe(1);
    expect(cuenta('const a = "#1a1a18cc";')).toBe(1);
    expect(cuenta("background: #fff;", "css")).toBe(1);
    expect(cuenta("border-top: 1px solid #000;", "css")).toBe(1);
    expect(cuenta("box-shadow: 0 1px rgb(26 26 24 / 0.1);", "css")).toBe(1);
    expect(cuenta('style={{ color: "rgba(0,0,0,0.5)" }}')).toBe(1);
    expect(cuenta("color: hsl(10 20% 30%);", "css")).toBe(1);
  });

  it("cuenta las utilidades de color que no son tokens (white, black y la paleta por defecto de Tailwind)", () => {
    expect(cuenta('<div className="bg-white p-2" />')).toBe(1);
    expect(cuenta('<div className="text-black/60 border-white" />')).toBe(2);
    expect(cuenta('<div className="bg-gray-100 text-red-500" />')).toBe(2);
    expect(cuenta('<div className="bg-[#f1ece4]" />')).toBe(1);
    expect(cuenta("color: white;", "css")).toBe(1);
  });

  it("NO cuenta los tokens, los colores con var(), ni un color-mix de tokens", () => {
    expect(cuenta('<div className="bg-papel text-tinta/65 border-sand bg-rojo/10" />')).toBe(0);
    expect(cuenta("background: var(--color-papel);", "css")).toBe(0);
    expect(cuenta("background: color-mix(in srgb, var(--color-tinta) 20%, transparent);", "css")).toBe(0);
    expect(cuenta('style={{ background: "color-mix(in oklab, var(--color-hueso) 50%, transparent)" }}')).toBe(0);
  });

  it("NO confunde con un color lo que no lo es (ids, anclas, números de pedido, ejemplos en texto)", () => {
    expect(cuenta('<a href="#">x</a>')).toBe(0);
    expect(cuenta('const id = "#etiquetas-precio-print";')).toBe(0);
    expect(cuenta("<p>Pedido #1234 listo</p>")).toBe(0);
    expect(cuenta('<span className="text-whitespace-nowrap whitespace-nowrap" />')).toBe(0);
    expect(cuenta("white-space: nowrap;", "css")).toBe(0);
  });

  it("ignora lo que está en un comentario", () => {
    expect(cuenta('// el rojo es #b8412d\nconst x = 1;')).toBe(0);
    expect(cuenta("/* antes era rgb(26 26 24 / 0.1) */\n.a { color: red; }", "css")).toBe(0);
    expect(cuenta("{/* #1a1a18 */}\n<p />")).toBe(0);
  });

  it("no confunde una URL (//) con un comentario: lo que viene después de una URL sí se mira", () => {
    expect(cuenta('const u = "https://x.test/a"; const c = "#1a1a18";')).toBe(1);
  });

  it("`tema-fijo:` exime esa línea, pero solo con un motivo de verdad", () => {
    expect(cuenta('const c = "#1a1a18"; // tema-fijo: el rojo de la marca, muestreado del logo')).toBe(0);
    expect(cuenta("background: #fff; /* tema-fijo: el papel de la etiqueta, sale blanco */", "css")).toBe(0);
    expect(cuenta('const c = "#1a1a18"; // tema-fijo: sí')).toBe(1); // motivo demasiado corto
    expect(cuenta('const c = "#1a1a18"; // tema-fijo:')).toBe(1);
  });

  it("en globals.css no cuenta los bloques @theme (ahí viven las definiciones de los tokens)", () => {
    const css = "@theme {\n  --color-rojo: #b8412d;\n  --shadow: 0 1px rgb(26 26 24 / 0.1);\n}\n.a { color: #b8412d; }";
    expect(colorSueltosDe(css, "css", "app/globals.css").cuenta).toBe(1);
    expect(colorSueltosDe(css, "css", "otro.css").cuenta).toBe(3); // fuera de globals.css, el @theme sí cuenta
    expect(sinBloquesTheme(css).split("\n")).toHaveLength(css.split("\n").length); // los números de línea siguen siendo los reales
  });

  it("reporta el número de línea real", () => {
    const r = colorSueltosDe('a\nb\nconst c = "#1a1a18";\n', "ts");
    expect(r.lineas.map((l: { n: number }) => l.n)).toEqual([3]);
  });
});

describe("la interfaz usa tokens: cada color escrito a mano está declarado y la deuda solo baja", () => {
  const real = escanearColoresSueltos();

  it("el escáner mira la web de verdad (no pasa en vacío por una carpeta mal apuntada)", () => {
    expect(Object.keys(real).length).toBeGreaterThan(20);
    expect(real["app/globals.css"]).toBeDefined();
    expect(real["components/BoletaA4.tsx"]).toBeDefined();
    expect(real["app/estilos/tema.css"]).toBeUndefined(); // ahí viven los tokens: no cuenta
  });

  it("ningún archivo tiene colores escritos a mano sin estar declarado", () => {
    const sinDeclarar = Object.entries(real)
      .filter(([archivo]) => !COLORES_A_MANO[archivo])
      .map(([archivo, r]) => `${archivo}: ${r.cuenta} (${r.lineas.slice(0, 2).map((l: { n: number; texto: string }) => `L${l.n} ${l.texto}`).join(" | ")})`);
    expect(
      sinDeclarar,
      "Un hex, un rgb(), bg-white o bg-gray-100 no cambia con el tema. Usa un token (`bg-papel`, `text-tinta`, `var(--color-…)`). " +
        "Si es papel físico o un color de DATO, anótalo con `// tema-fijo: <por qué>` en esa línea o en lib/tema-colores-archivos.ts.",
    ).toEqual([]);
  });

  it("el número declarado es EXACTO: bajó (pagaste deuda: baja el número) o subió (apareció un color nuevo)", () => {
    const distintos = Object.entries(COLORES_A_MANO)
      .filter(([archivo, e]) => real[archivo] && real[archivo].cuenta !== e.cuenta)
      .map(([archivo, e]) => `${archivo}: declarado ${e.cuenta}, hay ${real[archivo].cuenta}`);
    expect(distintos).toEqual([]);
  });

  it("no queda una entrada de un archivo que ya no tiene colores sueltos (bórrala: la deuda se pagó)", () => {
    const viejas = Object.keys(COLORES_A_MANO).filter((archivo) => !real[archivo]);
    expect(viejas).toEqual([]);
  });

  it("cada entrada dice su motivo, y la deuda dice en qué actividad se paga", () => {
    for (const [archivo, e] of Object.entries(COLORES_A_MANO)) {
      expect(e.motivo.length, `${archivo}: motivo`).toBeGreaterThanOrEqual(20);
      if (e.deuda) expect(e.deuda, `${archivo}: deuda`).toMatch(/^actividad \d+$/);
    }
  });

  it("la deuda de colores: solo baja (cuenta exacta, ADR-0336)", () => {
    // Al pagar una, baja este número. Si SUBE, alguien declaró deuda nueva: una pantalla nueva no puede nacer con colores sueltos.
    expect(DEUDA_DE_COLORES_HOY).toBe(21);
  });
});
