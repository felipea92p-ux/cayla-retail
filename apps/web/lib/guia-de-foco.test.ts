import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PANTALLAS, PENDIENTES_HOY, PIEZAS_DE_LA_GUIA } from "./guia-de-foco-pantallas";

// REGLA (Felipe, 2026-09-29 — CLAUDE.md «Guía de foco», ADR-0284): toda pantalla donde se llenan campos o se avanza por pasos le dice
// a la persona qué está hecho, qué sigue y qué falta. Esta prueba es la parte que no depende de que alguien se acuerde: cada
// `page.tsx` nueva tiene que declarar su estado en `lib/guia-de-foco-pantallas.ts`, y una pantalla NUEVA no puede nacer «pendiente»
// (la cuenta de pendientes es exacta: solo baja). Es la misma idea que `lib/modulos.test.ts` (toda pantalla del menú declara su módulo).

const RAIZ_WEB = new URL("../", import.meta.url);
const RAIZ_PANTALLAS = new URL("../app/(app)/", import.meta.url);

/** Las rutas de todas las `page.tsx` bajo `app/(app)`, como las escribe el registro («/» es Inicio). */
function rutasDePantallas(): string[] {
  return readdirSync(RAIZ_PANTALLAS, { recursive: true })
    .map((f) => String(f).replace(/\\/g, "/"))
    .filter((f) => f === "page.tsx" || f.endsWith("/page.tsx"))
    .map((f) => (f === "page.tsx" ? "/" : `/${f.slice(0, -"/page.tsx".length)}`))
    .sort();
}

describe("guía de foco — cada pantalla declara su estado", () => {
  const rutas = rutasDePantallas();

  it("encuentra las pantallas de la app (la prueba no está mirando una carpeta vacía)", () => {
    expect(rutas.length).toBeGreaterThan(50);
    expect(rutas).toContain("/");
    expect(rutas).toContain("/productos/nuevo");
  });

  it("toda pantalla está en el registro: una nueva declara «aplicada» o «no-aplica», no se olvida", () => {
    const sinDeclarar = rutas.filter((r) => !(r in PANTALLAS));
    expect(
      sinDeclarar,
      `Pantalla nueva sin declarar su guía de foco: ${sinDeclarar.join(", ")}. Agrégala a lib/guia-de-foco-pantallas.ts como «aplicada» (con su guía hecha; CLAUDE.md «Guía de foco») o «no-aplica» (con su motivo). No la anotes «pendiente»: eso es deuda de antes de la regla.`
    ).toEqual([]);
  });

  it("no queda en el registro una pantalla que ya no existe", () => {
    const huerfanas = Object.keys(PANTALLAS).filter((r) => !rutas.includes(r));
    expect(huerfanas, `Rutas del registro sin su page.tsx: ${huerfanas.join(", ")}`).toEqual([]);
  });

  it("«aplicada» dice dónde y es verdad: cada archivo de su evidencia existe y usa las piezas de la guía", () => {
    for (const [ruta, p] of Object.entries(PANTALLAS)) {
      if (p.estado !== "aplicada") continue;
      expect(p.evidencia.length, `${ruta}: «aplicada» sin evidencia`).toBeGreaterThan(0);
      for (const archivo of p.evidencia) {
        const url = new URL(archivo, RAIZ_WEB);
        expect(existsSync(url), `${ruta}: no existe ${archivo}`).toBe(true);
        const texto = readFileSync(url, "utf8");
        expect(
          PIEZAS_DE_LA_GUIA.some((pieza) => texto.includes(pieza)),
          `${ruta}: ${archivo} no usa ninguna pieza de la guía (${PIEZAS_DE_LA_GUIA.join(", ")})`
        ).toBe(true);
      }
    }
  });

  it("«no-aplica» dice por qué, en palabras del negocio", () => {
    for (const [ruta, p] of Object.entries(PANTALLAS)) {
      if (p.estado === "no-aplica") expect(p.motivo.trim().length, `${ruta}: «no-aplica» sin motivo`).toBeGreaterThanOrEqual(20);
    }
  });

  it("la cuenta de pendientes es exacta: baja al avanzar, nunca sube", () => {
    const pendientes = Object.values(PANTALLAS).filter((p) => p.estado === "pendiente").length;
    expect(
      pendientes,
      `Hay ${pendientes} pantallas pendientes y PENDIENTES_HOY dice ${PENDIENTES_HOY}. Si terminaste una guía, pásala a «aplicada» y baja PENDIENTES_HOY. Si la cuenta subió, agregaste una pantalla «pendiente»: una pantalla nueva trae su guía o declara por qué no aplica.`
    ).toBe(PENDIENTES_HOY);
  });
});
