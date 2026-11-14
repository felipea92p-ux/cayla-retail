import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Una foto que «Catálogo con IA» está preparando no se pierde si la persona cambia de paso (Felipe 2026-11-14). Pasaba porque las fotos en
// proceso vivían dentro de «Fotos y colores», que se desmonta al ir a otro paso: la IA respondía (ya pagada) a una pieza que no estaba. Ahora
// las guarda la PANTALLA con `useFotosEnCurso`. Esta prueba falla si vuelven a vivir dentro de la pieza o si una pantalla no las guarda.

const WEB = join(__dirname, "..");
const leer = (ruta: string) => readFileSync(join(WEB, ruta), "utf8");

describe("las fotos en proceso las guarda la pantalla, no el paso", () => {
  it("«Fotos y colores» no tiene su propio estado de fotos en proceso", () => {
    const fuente = leer("components/alta-producto/FotosYColores.tsx");
    const pieza = fuente.slice(fuente.indexOf("export function FotosYColores("));
    expect(pieza).not.toMatch(/useState<Pendiente\[\]>/);
    expect(pieza).not.toMatch(/useRef<Promise<void>>/);
    expect(pieza).toMatch(/enCurso: FotosEnCurso/);
  });

  it.each(["components/NuevoProductoForm.tsx", "components/recepcion-envio/HojaPrenda.tsx"])("%s las guarda y se las pasa", (ruta) => {
    const fuente = leer(ruta);
    expect(fuente).toMatch(/const fotosEnCurso = useFotosEnCurso\(\);/);
    expect(fuente).toMatch(/enCurso=\{fotosEnCurso\}/);
    // Lo que frena crear sale de las mismas fotos en proceso, no de un número que la pieza informaba al desmontarse.
    expect(fuente).toMatch(/const fotosSinColor = fotosEnCurso\.pendientes\.length;/);
  });
});
