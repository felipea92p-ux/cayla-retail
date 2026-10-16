import { describe, expect, it } from "vitest";
import { avisoTelaSinAnotar, telasSinAnotar } from "./orden-tela-sin-anotar-reglas";
import type { InsumoPagina } from "./orden-pagina-reglas";

const insumo = (parche: Partial<InsumoPagina> = {}): InsumoPagina => ({
  id: "pi-1", insumoId: "i-1", nombre: "Lino lavado", tipo: "tela", unidad: "metro", colorCodigo: "NEG", colorNombre: "Negro", consumoPorPrenda: 1.5, cantidadPlan: 36, usado: 0, saldo: 40, comprometidoOtras: 0, enCamino: 0, atrasado: 0, pedidos: [], ...parche,
});
const avio = (parche: Partial<InsumoPagina> = {}) => insumo({ id: "pi-9", insumoId: "i-9", nombre: "Botón", tipo: "avio", unidad: "unidad", colorCodigo: null, colorNombre: null, cantidadPlan: 96, usado: 0, ...parche });

describe("telasSinAnotar — la tela del plan que todavía no se descontó", () => {
  it("una orden sin tela declarada no avisa nada: es legítimo", () => {
    expect(telasSinAnotar([])).toEqual([]);
  });
  it("una tela con algo usado no avisa", () => {
    expect(telasSinAnotar([insumo({ usado: 10 })])).toEqual([]);
  });
  it("una tela que pide metros y no tiene nada usado, sí", () => {
    const [t] = telasSinAnotar([insumo()]);
    expect(t).toMatchObject({ insumoId: "i-1", nombre: "Lino lavado", tipo: "tela", plan: 36, usado: 0 });
  });
  it("una tela en dos colores es UNA sola tela: el libro no sabe de colores", () => {
    const telas = telasSinAnotar([insumo(), insumo({ id: "pi-2", colorCodigo: "CAQ", colorNombre: "Caqui" })]);
    expect(telas).toHaveLength(1);
    expect(telas[0].plan).toBe(72);
  });
  it("dos telas y una ya anotada: solo avisa la que falta", () => {
    const telas = telasSinAnotar([insumo({ usado: 20 }), insumo({ id: "pi-3", insumoId: "i-2", nombre: "Algodón pima" })]);
    expect(telas.map((t) => t.nombre)).toEqual(["Algodón pima"]);
  });
  it("un avío sin usar nunca avisa: los botones se pueden usar después del corte", () => {
    expect(telasSinAnotar([avio()])).toEqual([]);
    expect(telasSinAnotar([insumo({ usado: 10 }), avio()])).toEqual([]);
  });
  it("una tela con plan en cero no avisa: no se le pidió nada", () => {
    expect(telasSinAnotar([insumo({ cantidadPlan: 0 })])).toEqual([]);
  });
});

describe("avisoTelaSinAnotar — lo que dice la hoja «Pasar al stock»", () => {
  it("con una tela sin anotar, la nombra y dice lo que pasaría con el costo", () => {
    const aviso = avisoTelaSinAnotar([insumo()], false);
    expect(aviso).not.toBeNull();
    expect(aviso?.insumoId).toBe("i-1");
    expect(aviso?.texto).toBe("Todavía no anotaste la tela de este lote (Lino lavado): el costo por prenda saldría sin tela.");
  });
  it("con dos telas sin anotar, las nombra a las dos, en plural, y abre la primera", () => {
    const aviso = avisoTelaSinAnotar([insumo(), insumo({ id: "pi-3", insumoId: "i-2", nombre: "Algodón pima" })], false);
    expect(aviso?.insumoId).toBe("i-1");
    expect(aviso?.texto).toBe("Todavía no anotaste las telas de este lote (Lino lavado y Algodón pima): el costo por prenda saldría sin ellas.");
  });
  it("con tres telas las separa con comas y la última con «y»", () => {
    const aviso = avisoTelaSinAnotar([insumo(), insumo({ id: "pi-3", insumoId: "i-2", nombre: "Algodón pima" }), insumo({ id: "pi-4", insumoId: "i-3", nombre: "Drill" })], false);
    expect(aviso?.texto).toContain("(Lino lavado, Algodón pima y Drill)");
  });
  it("sin tela sin anotar no hay aviso", () => {
    expect(avisoTelaSinAnotar([insumo({ usado: 5 }), avio()], false)).toBeNull();
    expect(avisoTelaSinAnotar([], false)).toBeNull();
  });
  it("una muestra no avisa: no entra al stock y no deja costo en ninguna prenda", () => {
    expect(avisoTelaSinAnotar([insumo()], true)).toBeNull();
  });
});
