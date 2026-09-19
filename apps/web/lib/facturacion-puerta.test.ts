import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado de Facturación (ADR-0124). Dos invariantes que hasta hoy solo sostenía la lectura
// de código, y que la próxima página o el próximo retoque rompen sin ningún error a la vista
// (mismo espíritu que `globals-capas.test.ts`: leer los fuentes y fallar si dejan de cumplirse).
//
// 1) Puerta de líder. Un layout no se vuelve a ejecutar cuando se navega entre sus hijas, así
//    que cada `page.tsx` repite `exigirLider()` como LO PRIMERO que espera (antes de leer nada).
// 2) Los dos modales viven en el shell, una vez cada uno y sin condicional sobre su apertura:
//    el token de idempotencia de «Emitir» es un `useRef` del modal y tiene que vivir tanto como
//    el shell. Un `{modal === "emitir" && <EmitirComprobanteModal … />}` —o una segunda instancia
//    dentro de un panel— daría un token nuevo por apertura y quemaría un correlativo si se corta
//    la red entre dos intentos.

const RAIZ = join(__dirname, "../app/(app)/vender/facturacion");
const COMPONENTES = join(__dirname, "../components");

/** Todos los `layout.tsx` y `page.tsx` bajo la ruta, a cualquier profundidad: una vista nueva
 *  entra sola al candado. */
function archivosDeRuta(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return archivosDeRuta(ruta);
    return e.name === "page.tsx" || e.name === "layout.tsx" ? [ruta] : [];
  });
}

/** Lo primero que espera la función exportada por defecto (`await <esto>`), o null si no espera
 *  nada. Se toma cualquier expresión, no solo llamadas: `await searchParams` antes de la puerta
 *  también es leer antes de comprobar quién es. */
function primerAwait(fuente: string): string | null {
  const inicio = fuente.indexOf("export default async function");
  if (inicio < 0) return null;
  return fuente.slice(inicio).match(/await\s+([\w.]+)/)?.[1] ?? null;
}

function cuenta(fuente: string, patron: RegExp): number {
  return fuente.match(patron)?.length ?? 0;
}

describe("Facturación — puerta de líder", () => {
  const rutas = archivosDeRuta(RAIZ);

  it("encuentra el layout y las cuatro vistas (que el candado no mire el vacío)", () => {
    expect(rutas.length).toBeGreaterThanOrEqual(5);
  });

  for (const ruta of rutas) {
    const nombre = ruta.slice(RAIZ.length).replace(/\\/g, "/");
    it(`${nombre} espera exigirLider() antes que cualquier otra cosa`, () => {
      expect(primerAwait(readFileSync(ruta, "utf8"))).toBe("exigirLider");
    });
  }

  it("el detector sí distingue una página sin la puerta o con la puerta tarde", () => {
    expect(primerAwait("export default async function P() { await exigirLider(); await leer(); }")).toBe("exigirLider");
    expect(primerAwait("export default async function P() { const x = await leer(); await exigirLider(); }")).toBe("leer");
    expect(primerAwait("export default async function P({ searchParams }) { const { m } = await searchParams; await exigirLider(); }")).toBe("searchParams");
    expect(primerAwait("export default function P() { return null; }")).toBeNull();
  });
});

describe("Facturación — los modales viven una sola vez en el shell", () => {
  const shell = readFileSync(join(COMPONENTES, "FacturacionShell.tsx"), "utf8");
  const paneles = ["ComprobantesPanel.tsx", "ProformasPanel.tsx"].map((archivo) => ({ archivo, fuente: readFileSync(join(COMPONENTES, archivo), "utf8") }));

  for (const modal of ["EmitirComprobanteModal", "NuevaProformaModal"]) {
    it(`${modal}: una sola instancia, sin condicional sobre su apertura`, () => {
      expect(cuenta(shell, new RegExp(`<${modal}\\b`, "g"))).toBe(1);
      expect(shell).not.toMatch(new RegExp(`modal\\s*===\\s*"[a-z]+"\\s*(&&|\\?)\\s*<${modal}`));
    });

    it(`${modal}: ningún panel lo dibuja`, () => {
      for (const { archivo, fuente } of paneles) expect(fuente, archivo).not.toContain(modal);
    });
  }

  it("el detector sí ve un modal condicionado a su apertura o repetido", () => {
    const malo = `{modal === "emitir" && <EmitirComprobanteModal abierto />} {x ? <EmitirComprobanteModal /> : null}`;
    expect(cuenta(malo, /<EmitirComprobanteModal\b/g)).toBe(2);
    expect(malo).toMatch(/modal\s*===\s*"[a-z]+"\s*(&&|\?)\s*<EmitirComprobanteModal/);
  });
});
