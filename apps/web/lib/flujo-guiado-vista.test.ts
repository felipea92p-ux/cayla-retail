import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado de los flujos guiados (Cambios y Devoluciones; ADR-0185, act. 2026-11-05). Entrar a un flujo, cambiar de paso o salir de él es
// cambiar de VISTA en la misma URL, y <PaginaEstable> lo confunde con «un bloque que se acortó bajo el dedo»: reserva aire y devuelve la vista
// adonde estaba el botón. A 375 px eso dejaba la pantalla en blanco al registrar una devolución (1205 px de aire, el aviso de éxito 970 px más
// arriba) y al entrar desde abajo de una lista (1977 px). En Safari, además, el título quedaba escondido bajo la cabecera fija. Esta prueba no ve el navegador: cuida que cada flujo declare su cambio de vista.

const raizWeb = join(__dirname, "..");
const leer = (ruta: string) => readFileSync(join(raizWeb, ruta), "utf8");

const componentes = (readdirSync(join(raizWeb, "components"), { recursive: true }) as string[])
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => join("components", f));
const flujos = componentes.filter((f) => /<EncabezadoFlujo\b/.test(leer(f)));

describe("un flujo guiado cambia de vista sin dejar la pantalla en aire", () => {
  const pieza = leer("components/FlujoGuiado.tsx");
  const cuerpo = (nombre: string) => {
    const inicio = pieza.indexOf(`function ${nombre}`);
    expect(inicio, `${nombre} desapareció de FlujoGuiado`).toBeGreaterThan(0);
    return pieza.slice(inicio, pieza.indexOf("\n}\n", inicio));
  };

  it("antes de pintar, suelta la reserva y lleva la vista al inicio del flujo; al salir, suelta", () => {
    expect(cuerpo("useVistaDelPaso")).toMatch(
      /useLayoutEffect\(\(\) => \{\s*soltarPaginaEstable\(\);\s*raiz\.current\?\.scrollIntoView\(\{ block: "start", behavior: "instant" \}\);\s*return soltarPaginaEstable;\s*\}, \[paso, raiz\]\);/,
    );
  });

  it("el título recibe el foco sin mover la vista: Safari lo daba por visto a 0 px, escondido bajo la cabecera", () => {
    expect(cuerpo("useVistaDelPaso")).toMatch(/titulo\.current\?\.focus\(\{ preventScroll: true \}\)/);
  });

  it("el foco espera al loader: con la página inerte, `focus()` no hace nada", () => {
    const espera = cuerpo("enfocarAlLiberarse");
    expect(espera).toMatch(/if \(!esperaOcupada\(\)\)/);
    expect(espera).toMatch(/suscribirEspera\(/);
    expect(cuerpo("useFocoAlCambiarDePaso")).toMatch(/enfocarAlLiberarse\(/);
    expect(cuerpo("useVistaDelPaso")).toMatch(/enfocarAlLiberarse\(/);
  });

  it("encuentra los flujos: si esta lista queda vacía, la prueba ya no cuida nada", () => {
    expect(flujos.map((f) => f.replace(/^components\//, "")).sort()).toEqual(expect.arrayContaining(["CambiosFlujo.tsx", "DevolucionesFlujo.tsx"]));
  });

  it("todo flujo con pasos lo declara, con su raíz bajo la cabecera", () => {
    for (const f of flujos) {
      const codigo = leer(f);
      expect(codigo, `${f} dibuja pasos sin useVistaDelPaso(paso, raiz, titulo)`).toMatch(/\buseVistaDelPaso\(paso, raiz, titulo\);/);
      expect(codigo, `${f}: la raíz del flujo lleva scroll-mt-24 para quedar bajo la cabecera fija`).toMatch(/<div ref=\{raiz\} className="scroll-mt-24 space-y-6">/);
    }
  });

  it("el panel no pide un viaje suave: se cortaba al acortarse la página, y en Safari la vista quedaba a medio camino", () => {
    for (const f of ["components/CambiosPanel.tsx", "components/DevolucionesPanel.tsx"]) expect(leer(f), f).not.toMatch(/window\.scrollTo\(/);
  });
});
