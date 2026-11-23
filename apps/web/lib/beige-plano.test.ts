import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// El escáner de `pnpm tema:beige` es la ÚNICA definición de «beige plano»: la prueba lo importa en vez de copiarlo.
import { beigeDe, escanearBeige } from "../tema/beige-plano.mjs";
import { BEIGE_A_MANO, DEUDA_BEIGE_HOY } from "./beige-plano-archivos";

// REGLA (Felipe 2026-11-19: «ese color plano le quita la estética al sistema, quítalo de donde sea que aparezca»): una superficie, un
// botón o un estado de la interfaz va en vidrio —las clases `vd-*` de `app/estilos/vidrio/rellenos.css` o una receta—, nunca en beige
// plano (`bg-hueso`, `bg-sand`, `background: var(--color-hueso)`). Un beige NUEVO falla aquí y la deuda de antes solo baja.

const cuenta = (texto: string, tipo: "ts" | "css" = "ts") => beigeDe(texto, tipo).cuenta;

describe("escáner del beige plano — qué cuenta y qué no", () => {
  it("cuenta la utilidad con cualquier variante y opacidad", () => {
    expect(cuenta('<div className="rounded-lg bg-hueso px-3" />')).toBe(1);
    expect(cuenta('<div className="bg-sand/40 hover:bg-hueso focus-visible:bg-sand/30 group-hover:bg-sand" />')).toBe(4);
    expect(cuenta('<div className="@min-[880px]:bg-hueso/60" />')).toBe(1);
  });

  it("cuenta el relleno escrito en CSS o en un style, también mezclado", () => {
    expect(cuenta(".a { background: var(--color-hueso); }", "css")).toBe(1);
    expect(cuenta(".a { background-color: color-mix(in srgb, var(--color-sand) 60%, transparent); }", "css")).toBe(1);
    expect(cuenta('style={{ background: "var(--color-sand)" }}')).toBe(1);
  });

  it("NO cuenta un borde, un texto, otro color ni las clases de vidrio", () => {
    expect(cuenta('<div className="border border-sand text-sand bg-papel vd-placa" />')).toBe(0);
    expect(cuenta(".a { border-top: 1px solid var(--color-sand); color: var(--color-hueso); }", "css")).toBe(0);
    expect(cuenta('<div className="bg-hueso-oscuro bg-sandia" />')).toBe(0);
  });

  it("ignora lo que está en un comentario", () => {
    expect(cuenta("// antes era bg-hueso\nconst x = 1;")).toBe(0);
    expect(cuenta("/* background: var(--color-hueso) */\n.a { color: red; }", "css")).toBe(0);
  });

  it("`beige-fijo:` exime esa línea, pero solo con un motivo de verdad", () => {
    expect(cuenta('<div className="h-1.5 bg-sand" /> {/* beige-fijo: la pista de la barra, la escala del dato */}')).toBe(0);
    expect(cuenta(".pista { background: var(--color-sand); } /* beige-fijo: la escala del gráfico */", "css")).toBe(0);
    expect(cuenta('<div className="bg-sand" /> // beige-fijo: sí')).toBe(1);
  });
});

describe("la interfaz va en vidrio: cada beige está declarado y la deuda solo baja", () => {
  const real = escanearBeige();

  it("el escáner mira la web de verdad, y no cuenta lo que es definición", () => {
    expect(real["app/estilos/vidrio/recetas.css"]).toBeUndefined();
    expect(real["app/estilos/vidrio/aguanta.css"]).toBeUndefined();
    expect(readFileSync("app/estilos/vidrio/rellenos.css", "utf8")).toContain(".vd-placa");
  });

  it("ningún archivo tiene beige plano sin estar declarado", () => {
    const sinDeclarar = Object.entries(real)
      .filter(([archivo]) => !BEIGE_A_MANO[archivo])
      .map(([archivo, r]) => `${archivo}: ${r.cuenta} (${r.lineas.slice(0, 2).map((l: { n: number; texto: string }) => `L${l.n} ${l.texto}`).join(" | ")})`);
    expect(
      sinDeclarar,
      "El beige plano le quita la estética al sistema (Felipe 2026-11-19). Usa una clase de vidrio (`vd-placa`, `vd-hundido`, `vd-gota`, " +
        "`vd-gota-chica`, `vd-lente`, `vd-marca`, `vd-pasa`; app/estilos/vidrio/rellenos.css) o una receta. Si no es una superficie (la pista " +
        "de un gráfico, una línea, el papel que se imprime), anótalo con `beige-fijo: <por qué>` en esa línea.",
    ).toEqual([]);
  });

  it("el número declarado es EXACTO: bajó (corre `pnpm --filter web tema:beige:registro`) o subió (apareció beige nuevo)", () => {
    const distintos = Object.entries(BEIGE_A_MANO)
      .filter(([archivo, e]) => real[archivo] && real[archivo].cuenta !== e.cuenta)
      .map(([archivo, e]) => `${archivo}: declarado ${e.cuenta}, hay ${real[archivo].cuenta}`);
    expect(distintos).toEqual([]);
  });

  it("no queda una entrada de un archivo que ya no tiene beige (la deuda se pagó)", () => {
    expect(Object.keys(BEIGE_A_MANO).filter((archivo) => !real[archivo])).toEqual([]);
  });

  it("cada entrada dice su motivo", () => {
    for (const [archivo, e] of Object.entries(BEIGE_A_MANO)) expect(e.motivo.length, archivo).toBeGreaterThanOrEqual(20);
  });

  it("la deuda del beige plano: solo baja (cuenta exacta)", () => {
    // Al migrar un módulo baja este número. Si SUBE, alguien declaró deuda nueva: una pantalla nueva no puede nacer con beige plano.
    expect(DEUDA_BEIGE_HOY).toBe(0);
  });
});
