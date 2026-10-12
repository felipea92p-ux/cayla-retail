import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { avisoStockDescartado, VISITA_DE_STOCK_INICIAL } from "./ficha-cambio-de-sede";

// Cambiar de sede con el selector de la cabecera hace `router.refresh()`: la ruta no cambia y React conserva el estado de la ficha.
// El stock tocado en Editar producto son DIFERENCIAS por talla (+2, −1): al pasar de Lima a Trujillo, la ficha releía el stock de
// Trujillo pero seguía sumándole las de Lima, y `ajustar_inventario` las aplicaba en Trujillo (reproducido el 2026-10-11: S 4 → 6
// contado en Lima salió como +2 «conteo físico» en Trujillo). Felipe, 2026-10-11: el stock tocado se descarta con un aviso; los
// demás cambios de la ficha (nombre, precio, fotos) se quedan.

const HOOK = join(__dirname, "..", "components", "ficha-producto", "useStockFicha.ts");

describe("Editar producto: el stock tocado es de su sede", () => {
  const fuente = readFileSync(HOOK, "utf8");
  const inicio = fuente.indexOf("if (ubicacionId !== sedeDelStock.ubicacionId)");
  const bloque = inicio === -1 ? "" : fuente.slice(inicio, fuente.indexOf("\n  }\n", inicio));

  it("al cambiar de sede, el hook suelta lo tocado en el mismo render (sin un cuadro con el stock nuevo y las diferencias viejas)", () => {
    expect(fuente).toMatch(/const \[sedeDelStock, setSedeDelStock\] = useState\(/);
    expect(inicio).toBeGreaterThan(-1);
    for (const paso of ["setPendientes({})", "setNuevas({})", "setVariantes(null)", "setFaltantes(new Map())"]) expect(bloque).toContain(paso);
  });

  it("la visita vuelve a empezar: motivo, nota y lugar de fábrica (el «Encontré prendas» de Lima no viaja a Trujillo)", () => {
    expect(bloque).toContain("setMotivo(VISITA_DE_STOCK_INICIAL.motivo)");
    expect(bloque).toContain("setNota(VISITA_DE_STOCK_INICIAL.nota)");
    expect(bloque).toContain("setUbicado(VISITA_DE_STOCK_INICIAL.ubicado)");
  });

  it("lo descartado se dice con su sede", () => {
    expect(bloque).toContain("avisoStockDescartado(");
    expect(fuente).toMatch(/avisar\.aviso\(descartado\.texto/);
  });

  it("los valores de fábrica son los mismos con que arranca el hook", () => {
    expect(fuente).toContain('useState<MotivoAjuste>(VISITA_DE_STOCK_INICIAL.motivo)');
    expect(fuente).toContain("useState(VISITA_DE_STOCK_INICIAL.nota)");
    expect(fuente).toContain('useState<"piso" | "almacen">(VISITA_DE_STOCK_INICIAL.ubicado)');
    expect(VISITA_DE_STOCK_INICIAL).toEqual({ motivo: "conteo_fisico", nota: "", ubicado: "almacen" });
  });
});

describe("el aviso del stock descartado", () => {
  const S = { varianteId: "v1", talla: "S", color: "Negro", antes: 4, despues: 6 };
  const M = { varianteId: "v2", talla: "M", color: "Negro", antes: 2, despues: 1 };

  it("sin nada tocado no hay aviso", () => {
    expect(avisoStockDescartado({ etiqueta: "Tienda Lima", cambios: [], nuevasConStock: 0 })).toBeNull();
  });

  it("nombra la sede y cada talla como la hoja de «Revisar y guardar»", () => {
    const a = avisoStockDescartado({ etiqueta: "Tienda Lima", cambios: [S, M], nuevasConStock: 0 });
    expect(a?.texto).toBe("No se guardó el stock que tocaste en Tienda Lima");
    expect(a?.detalle).toContain("S · Negro 4 → 6 y M · Negro 2 → 1");
    expect(a?.detalle).toContain("Vuelve a Tienda Lima");
    expect(a?.detalle).toContain("El resto de la ficha sigue como lo dejaste");
  });

  it("una talla sin color ni talla se llama «Única», como en la hoja", () => {
    const a = avisoStockDescartado({ etiqueta: "Tienda Lima", cambios: [{ varianteId: "v", talla: null, color: null, antes: 0, despues: 3 }], nuevasConStock: 0 });
    expect(a?.detalle).toContain("Única 0 → 3");
  });

  it("también el stock puesto en variantes nuevas (todavía sin guardar)", () => {
    expect(avisoStockDescartado({ etiqueta: "Tienda Lima", cambios: [], nuevasConStock: 2 })?.detalle).toContain("el stock de 2 variantes nuevas");
    expect(avisoStockDescartado({ etiqueta: "Tienda Lima", cambios: [S], nuevasConStock: 1 })?.detalle).toContain("S · Negro 4 → 6 y el stock de 1 variante nueva");
  });

  it("con muchas tallas, cuatro y cuántas más", () => {
    const muchas = ["XS", "S", "M", "L", "XL", "XXL"].map((t, i) => ({ varianteId: t, talla: t, color: null, antes: i, despues: i + 1 }));
    const d = avisoStockDescartado({ etiqueta: "Tienda Lima", cambios: muchas, nuevasConStock: 0 })?.detalle ?? "";
    expect(d).toContain("XS 0 → 1, S 1 → 2, M 2 → 3, L 3 → 4 y 2 tallas más");
    expect(d).not.toContain("XXL");
  });
});
