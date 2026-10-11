import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Lo que la revisión del 2026-10-11 encontró y que ninguna prueba de lógica pura ve, porque vive en el fuente de los componentes de Plan del piso ▸ Propuesta.

const carpeta = new URL("../components/plan-piso/", import.meta.url);
const archivos = readdirSync(carpeta).filter((f) => f.endsWith(".tsx"));
const fuente = (f: string) => readFileSync(new URL(f, carpeta), "utf8");
/** El fuente sin comentarios: lo que se escribe en un comentario no se ve en pantalla. */
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("Plan del piso ▸ Propuesta: lo que se ve en pantalla", () => {
  it("las siluetas se dibujan UNA vez por pantalla: dos montajes dejaban los 10 ids de los símbolos duplicados (HTML inválido)", () => {
    const montajes = sinComentarios(fuente("PropuestaDelMix.tsx")).match(/<SiluetasDelPlan\b/g) ?? [];
    expect(montajes).toHaveLength(1);
    // y nadie más las monta: la tarjeta, la mancuerna y la pieza del «¿Por qué?» las usan, no las dibujan
    for (const f of archivos.filter((a) => a !== "PropuestaDelMix.tsx" && a !== "SiluetasDelPlan.tsx")) expect(sinComentarios(fuente(f)), f).not.toMatch(/<SiluetasDelPlan\b/);
  });

  it("la pantalla habla con las mismas palabras en la tarjeta, la mancuerna, la tabla y el panel: «punto de partida» y «tus ventas», no «industria» ni «venta propia»", () => {
    for (const f of archivos) {
      const texto = sinComentarios(fuente(f)).toLowerCase();
      expect(texto, `${f}: «industria»`).not.toContain("industria");
      expect(texto, `${f}: «venta propia»`).not.toContain("venta propia");
    }
  });

  it("los títulos de la pantalla son encabezados (quien navega por encabezados encuentra el riel, lo de fuera del riel y el detalle)", () => {
    const mix = sinComentarios(fuente("PropuestaDelMix.tsx"));
    expect(mix).toContain('<h2 className="pp-etq">Fuera del riel</h2>');
    expect(mix).toContain('<h2 className="pp-etq">El detalle, grupo por grupo</h2>');
    const tarjeta = sinComentarios(fuente("TarjetaDelRiel.tsx"));
    expect(tarjeta).toContain('<h3 className="pp-etq">Hoy</h3>');
    expect(tarjeta).toContain('<h3 className="pp-etq">Cómo quedaría</h3>');
  });

  it("«cómo se calcula» sigue a un toque aunque la sede no tenga la capacidad medida (la pieza `PorQue` no depende del riel)", () => {
    const mix = sinComentarios(fuente("PropuestaDelMix.tsx"));
    expect(mix).toMatch(/<PorQue\b/);
    expect(sinComentarios(fuente("TarjetaDelRiel.tsx"))).toMatch(/<PorQue\b/);
  });

  it("«Fuera del riel» no depende de que haya riel que dibujar", () => {
    const mix = sinComentarios(fuente("PropuestaDelMix.tsx"));
    const dentroDeLaTarjeta = mix.slice(mix.indexOf("{dibujaTarjeta && ("), mix.indexOf("{dibujaFuera && ("));
    expect(dentroDeLaTarjeta).not.toContain("Fuera del riel");
  });
});
