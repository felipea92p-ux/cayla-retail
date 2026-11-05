import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado de los flujos guiados (Cambios y Devoluciones; ADR-0185, act. 2026-11-05). Entrar a un flujo, cambiar de paso o salir de él es
// cambiar de VISTA en la misma URL, y <PaginaEstable> lo confunde con «un bloque que se acortó bajo el dedo»: reserva aire y devuelve la vista
// adonde estaba el botón. A 375 px eso dejaba la pantalla en blanco al registrar una devolución (1205 px de aire, el aviso de éxito 970 px más
// arriba) y al entrar desde abajo de una lista (1977 px). Esta prueba no ve el navegador: cuida que cada flujo declare su cambio de vista.

const raizWeb = join(__dirname, "..");
const leer = (ruta: string) => readFileSync(join(raizWeb, ruta), "utf8");

const componentes = (readdirSync(join(raizWeb, "components"), { recursive: true }) as string[])
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => join("components", f));
const flujos = componentes.filter((f) => /<EncabezadoFlujo\b/.test(leer(f)));

describe("un flujo guiado cambia de vista sin dejar la pantalla en aire", () => {
  it("la vista se suelta antes de pintar, al entrar, con cada paso y al salir", () => {
    const pieza = leer("components/FlujoGuiado.tsx");
    const hook = pieza.slice(pieza.indexOf("export function useVistaDelPaso"));
    expect(hook, "useVistaDelPaso desapareció de FlujoGuiado").toMatch(/^export function useVistaDelPaso/);
    expect(hook).toMatch(/useLayoutEffect\(\(\) => \{\s*soltarPaginaEstable\(\);\s*return soltarPaginaEstable;\s*\}, \[paso\]\);/);
  });

  it("el foco espera al loader: con la página inerte, `focus()` no hace nada", () => {
    const pieza = leer("components/FlujoGuiado.tsx");
    const inicio = pieza.indexOf("export function useFocoAlCambiarDePaso");
    const hook = pieza.slice(inicio, pieza.indexOf("\n}\n", inicio));
    expect(hook).toMatch(/if \(!esperaOcupada\(\)\)/);
    expect(hook).toMatch(/suscribirEspera\(/);
  });

  it("encuentra los flujos: si esta lista queda vacía, la prueba ya no cuida nada", () => {
    expect(flujos.map((f) => f.replace(/^components\//, "")).sort()).toEqual(expect.arrayContaining(["CambiosFlujo.tsx", "DevolucionesFlujo.tsx"]));
  });

  it("todo flujo con pasos lo declara", () => {
    for (const f of flujos) expect(leer(f), `${f} dibuja pasos sin useVistaDelPaso(paso)`).toMatch(/\buseVistaDelPaso\(paso\);/);
  });
});
