import { describe, expect, it } from "vitest";
import { cantidadesDeEmpresa, soloUnidadesDe } from "./existencias-empresa-reglas";

const fila = (varianteId: string) => ({ varianteId, total: 8, piso: 5, almacen: 3, danado: 0, apartado: 1, disponible: 7, pisoDisponible: 4, almacenDisponible: 3, referencia: "Blusa" });

describe("Existencias con una empresa elegida (ADR-0683)", () => {
  const deClaure = cantidadesDeEmpresa([{ variante_id: "a", cantidad: 2, cantidad_apartada: 1, tipo: "piso_venta" }, { variante_id: "x", cantidad: "raro" }, { cantidad: 4 }]);
  it("suma las unidades de la dueña lugar por lugar, con la regla de siempre", () => {
    expect(deClaure.get("a")).toMatchObject({ total: 2, piso: 2, almacen: 0, apartado: 1, disponible: 1, pisoDisponible: 1 });
  });
  it("deja solo las tallas con unidades suyas, con SUS cantidades y lo demás de la fila igual", () => {
    const filas = soloUnidadesDe([fila("a"), fila("b")], deClaure);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ varianteId: "a", referencia: "Blusa", total: 2, piso: 2, almacen: 0, apartado: 1, disponible: 1 });
  });
  it("una talla cuya parte es cero no sale", () => {
    expect(soloUnidadesDe([fila("x")], deClaure)).toEqual([]);
  });
});
