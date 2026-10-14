import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DIAS_PLAZO_CAMBIO } from "./cambios-reglas";

// El plazo de cambio vive en DOS lugares a propósito: la pantalla lo anticipa (`DIAS_PLAZO_CAMBIO`, también impreso en la
// boleta y el ticket) y la base lo hace cumplir (`retail.fn_dias_plazo_cambio()`, 20261012222000). Si alguien cambia uno
// solo, la boleta diría «15 días» y `registrar_cambio` aceptaría otro número (o al revés). Esta prueba los ata.

const DIR = new URL("../../../supabase/migrations/", import.meta.url);
const DEFINICION = /create or replace function retail\.fn_dias_plazo_cambio\(\)[\s\S]*?\$\$\s*select\s+(\d+)\s*;\s*\$\$/i;

/** La ÚLTIMA migración que define la función manda (la vigente). */
function diasDeLaBase(): number | null {
  const archivos = readdirSync(DIR).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  let dias: number | null = null;
  for (const archivo of archivos) {
    const m = readFileSync(new URL(archivo, DIR), "utf8").match(DEFINICION);
    if (m) dias = Number(m[1]);
  }
  return dias;
}

describe("plazo de cambio: la base y la pantalla dicen lo mismo", () => {
  it("retail.fn_dias_plazo_cambio() devuelve DIAS_PLAZO_CAMBIO", () => {
    expect(diasDeLaBase()).toBe(DIAS_PLAZO_CAMBIO);
  });
});
