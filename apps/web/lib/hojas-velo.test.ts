import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Candado del velo de las hojas (ADR-0715, Felipe 2026-11-27: «Llegó una compra» demoraba en abrir y en cerrar en Safari).
// El `Dialog.Overlay` de Radix bloquea el desplazamiento de atrás con react-remove-scroll: al abrir agrega una hoja de estilos y marca
// el `<body>` con una variable CSS; al cerrar la quita. En Safari, quitar una hoja de estilos rehace las ~6.300 reglas del ERP y
// recalcula cada elemento: cada hoja quedaba ~0,1 s congelada al cerrarse (más en una pantalla larga). El velo es nuestro
// (`components/ui/VeloDeHoja.tsx`) y bloquea con una sola propiedad de `<html>` (`lib/candado-de-scroll.ts`).
//
// Contrato (3 líneas). PROMETE: que ningún archivo de la web usa `Dialog.Overlay` ni importa react-remove-scroll, y que `<Modal>` y
// `<Cajon>` dibujan su velo con `VeloDeHoja`. ASUME: el código vive en `components/`, `app/` y `lib/`. NO PROMETE: que otra librería
// no agregue y quite hojas de estilos por su cuenta; medir en WebKit (el motor de Safari) sigue siendo la prueba final.

const RAICES = ["components", "app", "lib"];

const ARCHIVOS = RAICES.flatMap((raiz) => {
  const dir = new URL(`../${raiz}/`, import.meta.url);
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => /\.(tsx?|mjs)$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => ({ ruta: `${raiz}/${f}`, fuente: readFileSync(new URL(f, dir), "utf8") }));
});

const leer = (ruta: string) => ARCHIVOS.find((a) => a.ruta === ruta)?.fuente ?? "";

describe("el velo de las hojas no congela Safari", () => {
  it("encuentra el código (no mira una carpeta vacía)", () => {
    expect(ARCHIVOS.map((a) => a.ruta)).toContain("components/ui/Modal.tsx");
  });

  it("nadie usa el Dialog.Overlay de Radix ni importa react-remove-scroll", () => {
    // Se busca el uso (`<Dialog.Overlay`), no la palabra: los comentarios que explican por qué no se usa la nombran.
    const conOverlay = ARCHIVOS.filter(({ fuente }) => /<(Dialog|DialogPrimitive)\.Overlay\b/.test(fuente) || /from ["']react-remove-scroll/.test(fuente)).map((a) => a.ruta);
    expect(conOverlay, "el velo es <VeloDeHoja>: el de Radix agrega y quita una hoja de estilos (ADR-0715)").toEqual([]);
  });

  it.each(["components/ui/Modal.tsx", "components/ui/Cajon.tsx"])("%s dibuja su velo con VeloDeHoja", (ruta) => {
    expect(leer(ruta)).toContain("<VeloDeHoja");
  });

  it("el velo pide el candado y se deja tocar mientras Radix apaga los clics del body", () => {
    const velo = leer("components/ui/VeloDeHoja.tsx");
    expect(velo).toContain("bloquearLoDeAtras()");
    expect(velo).toMatch(/pointerEvents:\s*"auto"/);
  });

  it("el velo lleva la marca de la que cuelga su vidrio (sin ella se ve casi transparente)", () => {
    expect(leer("components/ui/VeloDeHoja.tsx")).toContain('data-state="open"');
    // Si el vidrio del velo deja de colgar de esa marca, esta prueba ya no protege nada: hay que mirarla de nuevo.
    const hoja = readFileSync(new URL("../app/estilos/vidrio/hoja.css", import.meta.url), "utf8");
    expect(hoja).toMatch(/\[data-state="open"\]\):has\(\+ div > :is\(\.hoja-serena/);
  });
});
