import { describe, expect, it } from "vitest";
import type { TipoInsumo } from "./insumos-reglas";
import { sugerirInsumo } from "./sugerencias-insumos";

const TIPOS: TipoInsumo[] = ["tela", "avio"];

describe("sugerirInsumo (los ejemplos siguen lo que la persona eligió)", () => {
  it("con el catálogo vacío, cada tipo da su primer ejemplo, de su propio vocabulario", () => {
    expect(sugerirInsumo("tela", [])).toMatchObject({ codigo: "LIN-01", nombre: "Lino lavado crudo", origen: "tabla" });
    expect(sugerirInsumo("avio", [])).toMatchObject({ codigo: "BOT-01", nombre: "Botón nácar 18 mm", origen: "tabla" });
  });

  it("totalidad y sin contradicción: ninguna tela se sugiere con ejemplo de avío ni al revés, ni la nota de una en la otra", () => {
    const t = sugerirInsumo("tela", []);
    const a = sugerirInsumo("avio", []);
    expect(t.nombre).not.toBe(a.nombre);
    expect(t.nota).toMatch(/Ancho/);
    expect(a.nota).not.toMatch(/Ancho|composición/);
    for (const tipo of TIPOS) expect(sugerirInsumo(tipo, [])).toEqual(sugerirInsumo(tipo, []));
  });

  it("sigue al control: tela → avío → tela vuelve al mismo texto (estable, sin azar)", () => {
    const antes = sugerirInsumo("tela", []);
    sugerirInsumo("avio", []);
    expect(sugerirInsumo("tela", [])).toEqual(antes);
  });

  it("evita lo que ya existe: un código o un nombre en uso (sin tildes ni mayúsculas) pasa al siguiente ejemplo", () => {
    expect(sugerirInsumo("tela", [{ codigo: "lin-01", nombre: "Otra cosa" }]).codigo).toBe("POP-01");
    expect(sugerirInsumo("tela", [{ codigo: "XX", nombre: "LINO LAVADO CRUDO" }]).codigo).toBe("POP-01");
    expect(sugerirInsumo("avio", [{ codigo: "BOT-01", nombre: "x" }, { codigo: "y", nombre: "Cierre invisible 40 cm" }]).codigo).toBe("HIL-01");
  });

  it("si todos los ejemplos ya están usados, un texto neutro que no promete nada", () => {
    const todos = ["LIN-01", "POP-01", "GAB-01", "SAT-01", "JER-01"].map((codigo) => ({ codigo, nombre: codigo }));
    expect(sugerirInsumo("tela", todos)).toMatchObject({ origen: "neutro", codigo: "Código de la tela", nombre: "Nombre de la tela" });
  });

  it("cabe en una caja de celular: ningún ejemplo pasa de 28 letras", () => {
    for (const tipo of TIPOS) for (let usados = 0; usados <= 5; usados++) {
      const ocupados = Array.from({ length: usados }, (_, i) => ({ codigo: `${tipo}-${i}`, nombre: `${tipo}-${i}` }));
      const s = sugerirInsumo(tipo, ocupados);
      expect(s.nombre.length).toBeLessThanOrEqual(28);
      expect(s.codigo.length).toBeLessThanOrEqual(20);
    }
  });
});
