import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODALES, MODALES_PENDIENTES_HOY, PANTALLAS, PENDIENTES_HOY, PIEZAS_DE_LA_GUIA } from "./guia-de-foco-pantallas";

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

// MODALES (ADR-0284, actualización f). Un modal es todo archivo de `components/` o `app/(app)/` (fuera de `components/ui/`) que dibuja un
// `<Modal>`, un `<ModalRuta>` o un `Dialog.Content` y tiene campos. La detección es espejo de `scripts/focus/escanear.mjs` (`esModal`,
// `tieneCampos`): si se cambia una, se cambia la otra.
const ES_MODAL = /<Modal\b|<ModalRuta\b|Dialog\.Content/;
const TIENE_CAMPOS = /<(input|textarea|form|Campo\w*|Select\w*|Combo\w*|Desplegable|Segmentado|Interruptor)\b/;

/** Las rutas (bajo `apps/web`) de todos los modales con campos. */
function modalesConCampos(): string[] {
  const out: string[] = [];
  const recorrer = (dir: URL, rel: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const hijo = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (hijo === "components/ui" || e.name === "node_modules") continue;
        recorrer(new URL(`${e.name}/`, dir), hijo);
      } else if (e.name.endsWith(".tsx") && !/\.test\./.test(e.name)) {
        const texto = readFileSync(new URL(e.name, dir), "utf8");
        if (ES_MODAL.test(texto) && TIENE_CAMPOS.test(texto)) out.push(hijo);
      }
    }
  };
  recorrer(new URL("../components/", import.meta.url), "components");
  recorrer(RAIZ_PANTALLAS, "app/(app)");
  return out.sort();
}

describe("guía de foco — cada modal con campos declara su estado", () => {
  const modales = modalesConCampos();

  it("encuentra los modales (la prueba no está mirando una carpeta vacía)", () => {
    expect(modales.length).toBeGreaterThan(50);
    expect(modales).toContain("components/NuevaClientaModal.tsx");
  });

  it("todo modal está en el registro: uno nuevo declara «aplicada» o «no-aplica», no se olvida", () => {
    const sinDeclarar = modales.filter((m) => !(m in MODALES));
    expect(
      sinDeclarar,
      `Modal nuevo sin declarar su guía de foco: ${sinDeclarar.join(", ")}. Agrégalo a MODALES en lib/guia-de-foco-pantallas.ts como «aplicada» (con su guía hecha: useGuiaCampos + CampoGuiado + PieGuia; CLAUDE.md «Guía de foco») o «no-aplica» (con su motivo; un modal de UN solo campo suele serlo). No lo anotes «pendiente»: eso es deuda de antes de la regla.`
    ).toEqual([]);
  });

  it("no queda en el registro un modal que ya no existe (o que ya no tiene campos)", () => {
    const huerfanos = Object.keys(MODALES).filter((m) => !modales.includes(m));
    expect(huerfanos, `Modales del registro sin archivo, sin <Modal> o sin campos: ${huerfanos.join(", ")}`).toEqual([]);
  });

  it("«aplicada» dice dónde y es verdad: cada archivo de su evidencia existe y usa las piezas de la guía", () => {
    for (const [modal, p] of Object.entries(MODALES)) {
      if (p.estado !== "aplicada") continue;
      expect(p.evidencia.length, `${modal}: «aplicada» sin evidencia`).toBeGreaterThan(0);
      for (const archivo of p.evidencia) {
        const url = new URL(archivo, RAIZ_WEB);
        expect(existsSync(url), `${modal}: no existe ${archivo}`).toBe(true);
        expect(
          PIEZAS_DE_LA_GUIA.some((pieza) => readFileSync(url, "utf8").includes(pieza)),
          `${modal}: ${archivo} no usa ninguna pieza de la guía (${PIEZAS_DE_LA_GUIA.join(", ")})`
        ).toBe(true);
      }
    }
  });

  it("«no-aplica» dice por qué, en palabras del negocio", () => {
    for (const [modal, p] of Object.entries(MODALES)) {
      if (p.estado === "no-aplica") expect(p.motivo.trim().length, `${modal}: «no-aplica» sin motivo`).toBeGreaterThanOrEqual(20);
    }
  });

  it("la cuenta de modales pendientes es exacta: baja al avanzar, nunca sube", () => {
    const pendientes = Object.values(MODALES).filter((p) => p.estado === "pendiente").length;
    expect(
      pendientes,
      `Hay ${pendientes} modales pendientes y MODALES_PENDIENTES_HOY dice ${MODALES_PENDIENTES_HOY}. Si terminaste la guía de uno, pásalo a «aplicada» y baja MODALES_PENDIENTES_HOY. Si la cuenta subió, agregaste un modal «pendiente»: un modal nuevo trae su guía o declara por qué no aplica.`
    ).toBe(MODALES_PENDIENTES_HOY);
  });
});
