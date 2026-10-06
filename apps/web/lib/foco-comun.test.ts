import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado del foco de teclado común (ADR-0351). Una regla de diseño que solo vive en un documento se olvida; en una prueba no.
//
// Contrato. PROMETE: (1) `globals.css` define UN anillo —tinta, 2 px— y lo aplica a todo `:focus-visible`, a la caja de
// control y a la fila clicable; (2) ninguna caja o fila escribe `outline-none` (una utilidad le gana a la clase de globals.css,
// ADR-0105, y el control se quedaría sin anillo); (3) las piezas compartidas de `components/ui/` no escriben su propio anillo en
// rojo o tinta con transparencia (rojo/60 contra crema = 2,5:1, bajo el 3:1 de WCAG 1.4.11); (4) la deuda de afuera solo baja.
// ASUME: el anillo se escribe con utilidades de Tailwind (`focus-visible:outline-rojo/60`, `…:ring-rojo/30`). NO PROMETE:
// medir el contraste real (eso se mide en el navegador, ADR-0351) ni ver un anillo escrito en CSS aparte.

const WEB = join(__dirname, "..");

/** Un anillo de foco pintado en rojo o tinta CON transparencia: `focus-visible:outline-rojo/60`, `focus:ring-rojo/20`, `group-focus-visible:ring-tinta/30`. */
export const ANILLO_TRANSPARENTE = /(?:group-)?focus(?:-visible|-within)?:(?:outline|ring)-(?:rojo|tinta)\/\d+/g;

export function anillosTransparentes(fuente: string): number {
  return fuente.match(ANILLO_TRANSPARENTE)?.length ?? 0;
}

function tsxBajo(dir: string): string[] {
  return readdirSync(join(WEB, dir), { withFileTypes: true }).flatMap((e) => {
    const ruta = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" ? [] : tsxBajo(ruta);
    return e.name.endsWith(".tsx") ? [ruta] : [];
  });
}

describe("cómo se reconoce un anillo de foco débil", () => {
  it("rojo con transparencia, en cualquier variante de foco", () => {
    expect(anillosTransparentes('class="focus-visible:outline-rojo/60 focus:ring-rojo/20 group-focus-visible:ring-rojo/50"')).toBe(3);
  });
  it("el rojo pleno y el anillo común no cuentan", () => {
    expect(anillosTransparentes('class="focus-visible:outline-rojo focus-visible:outline-tinta hover:text-rojo/60"')).toBe(0);
  });
});

describe("el anillo común vive en globals.css", () => {
  const css = readFileSync(join(WEB, "app/globals.css"), "utf8");
  it("define el anillo con tinta y 2 px", () => {
    expect(css).toMatch(/--foco-color:\s*var\(--color-tinta\)/);
    expect(css).toMatch(/--foco-ancho:\s*2px/);
  });
  it("lo aplica a todo :focus-visible, a la caja (campo con el cursor adentro) y a la fila (hacia adentro)", () => {
    expect(css).toMatch(/:focus-visible\s*\{\s*outline:\s*var\(--foco-ancho\) solid var\(--foco-color\)/);
    expect(css).toMatch(/\.caja-cayla:has\(:focus-visible\)\s*\{/);
    expect(css).toMatch(/\.fila-cayla:focus-visible\s*\{[^}]*outline-offset:\s*calc\(var\(--foco-ancho\) \* -1\)/);
  });
});

describe("una caja o una fila no escribe su propio `outline-none`", () => {
  // ADR-0105: las clases de globals.css viven en `@layer components`, y una utilidad (`outline-none`) le gana a una clase de
  // componente. Un control con `caja-cayla` (o `fila-cayla`) y `outline-none` en la misma línea se quedaría sin su anillo.
  const archivos = [...tsxBajo("components"), ...tsxBajo("app")];
  const mezclas = archivos.flatMap((ruta) =>
    readFileSync(join(WEB, ruta), "utf8")
      .split("\n")
      .map((linea, i) => ({ ruta, linea: i + 1, texto: linea }))
      .filter(({ texto }) => /\b(?:caja|fila)-cayla\b/.test(texto) && /(?:^|[\s"'`:])outline-none\b/.test(texto))
      .map(({ ruta: r, linea }) => `${r}:${linea}`),
  );
  it("ninguna línea mezcla caja-cayla/fila-cayla con outline-none", () => {
    expect(mezclas).toEqual([]);
  });
});

describe("los anillos propios con transparencia (rojo o tinta) solo bajan", () => {
  const archivos = [...tsxBajo("components"), ...tsxBajo("app")];
  const porArchivo = archivos
    .map((ruta) => ({ ruta, n: anillosTransparentes(readFileSync(join(WEB, ruta), "utf8")) }))
    .filter((a) => a.n > 0);

  it("las piezas compartidas de components/ui no escriben el suyo (salvo MuestraColor, ver ADR-0351)", () => {
    const enUi = porArchivo.filter((a) => a.ruta.startsWith("components/ui/") && a.ruta !== "components/ui/MuestraColor.tsx");
    expect(enUi).toEqual([]);
  });

  // Deuda de ANTES de la regla: cada pantalla migra su control al anillo común (borrando su `outline-none` y su anillo rojo)
  // cuando se toque. La cuenta es exacta: si baja, bájala acá; si sube, no entró un control nuevo con el anillo viejo.
  const PENDIENTES_HOY = 63;
  it("la cuenta de afuera de components/ui es exacta y solo baja", () => {
    const total = porArchivo.reduce((s, a) => s + a.n, 0);
    expect(total).toBe(PENDIENTES_HOY);
  });
});
