import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Cuentas y dinero ▸ Dónde está decía «¿Cuánta plata tiene Taller hoy? S/ 209» con la plata de Lima (2026-10-28): la cifra grande
// (`CifraAnimada`) guarda el número que muestra en su estado, y al pasar a un valor 0 su efecto no anima y nadie lo actualizaba. No hay
// cómo montar un componente en estas pruebas (sin DOM), así que se vigila lo que lo impide: que la pieza de afuera arme la de adentro de
// nuevo con cada valor (`key={valor}`). Quien quite ese `key` vuelve a mostrar la plata de la sede anterior.
const fuente = readFileSync(join(__dirname, "..", "components", "ui", "CifraAnimada.tsx"), "utf8");

describe("CifraAnimada", () => {
  it("la pieza que se exporta arma de nuevo la de adentro con cada valor, para que nunca muestre el de la sede anterior", () => {
    expect(fuente).toMatch(/export function CifraAnimada\(props: Props\) \{\s*return <CifraAnimadaDe key=\{props\.valor\} \{\.\.\.props\} \/>;\s*\}/);
  });

  it("la de adentro no se exporta: nadie la usa sin el key", () => {
    expect(fuente).not.toMatch(/export function CifraAnimadaDe/);
  });
});
