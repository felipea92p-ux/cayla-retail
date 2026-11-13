import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado del asa de la hoja en el celular (ADR-0479). El asa va pegada arriba (`position: sticky`) y desenfoca lo que pasa por detrás: si baja de su lugar,
// se monta sobre el título de TODA hoja. Pasó entre el 2026-11-02 y el 2026-11-05: el navegador mide el pegado desde el borde de adentro del padding,
// así que con `top: 0` la franja quedaba de 25 a 49 px y el título empezaba en 31. Esta prueba no ve el navegador: cuida las tres cuentas que lo evitan.

const leer = (ruta: string) => readFileSync(join(__dirname, "..", ruta), "utf8");
const sinComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function bloque(css: string, selector: string): string {
  const i = css.indexOf(`${selector} {`);
  if (i < 0) throw new Error(`no encontré «${selector}»`);
  return css.slice(i, css.indexOf("}", i));
}

const globals = sinComentarios(leer("app/globals.css"));
const asa = bloque(globals, ".asa-hoja.asa-hoja-fija");
const modal = leer("components/ui/Modal.tsx");

describe("el asa de la hoja queda en el relleno, sin tocar el título", () => {
  it("la hoja tiene el relleno que el asa descuenta", () => {
    expect(modal).toMatch(/hoja-serena"\} p-6 /);
  });

  it("su margen y su pegado descuentan los mismos 1.5rem", () => {
    expect(asa).toMatch(/margin:\s*-1\.5rem -1\.5rem 0;/);
    expect(asa).toMatch(/top:\s*-1\.5rem;/);
  });

  it("mide lo mismo que el relleno: no empuja el título ni lo deja sin aire", () => {
    expect(globals).toMatch(/\.asa-hoja \{\s*position: absolute;[^}]*height:\s*1\.5rem;/);
  });

  it("la × baja a la altura del título, fuera de la franja", () => {
    expect(modal).toMatch(/conAsa \? "max-sm:top-6" : ""/);
  });

  it("la × de la hoja de vidrio y «Cerrar sesión» también bajan bajo la franja", () => {
    expect(sinComentarios(leer("app/estilos/perfil-vidrio.css"))).toMatch(
      /max-width: 639\.98px\) \{\s*\.hoja-vidrio > \.cerrar-hoja,\s*\.vidrio-salir \{ top: 24px; \}/,
    );
  });

  it("tirar del asa mueve la hoja aunque el contenido haya corrido", () => {
    // Las dos mitades hacen falta: sin `pointer-events`, el dedo le llega al campo que pasa por detrás y el gesto nunca ve el asa.
    expect(asa).toMatch(/pointer-events:\s*auto;/);
    expect(leer("components/ui/useHojaArrastre.ts")).toMatch(/objetivo\.closest\("\[data-asa-hoja\]"\) \? null : objetivo/);
  });
});
