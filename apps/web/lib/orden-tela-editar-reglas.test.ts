import { describe, expect, it } from "vitest";
import type { InsumoVista } from "./insumos";
import type { InsumoPagina } from "./orden-pagina-reglas";
import type { TelaBorrador } from "./orden-tela-reglas";
import { armarEdicionDeTela, contarCambios, hayCambios, problemasDeEdicion, telasIniciales, textoDeCambios, usadoPorInsumo } from "./orden-tela-editar-reglas";

const pagina = (o: Partial<InsumoPagina> & Pick<InsumoPagina, "insumoId">): InsumoPagina => ({
  id: `fila-${o.insumoId}-${o.colorCodigo ?? "x"}`,
  nombre: o.insumoId,
  tipo: "tela",
  unidad: "metro",
  colorCodigo: null,
  colorNombre: null,
  consumoPorPrenda: 1.2,
  cantidadPlan: 36,
  usado: 0,
  saldo: 100,
  comprometidoOtras: 0,
  enCamino: 0,
  atrasado: 0,
  pedidos: [],
  ...o,
});
const fila = (insumoId: string | null, colorCodigo: string | null, consumoPorPrenda: string): TelaBorrador => ({ insumoId, colorCodigo, consumoPorPrenda });
const vista = (o: Partial<InsumoVista> & Pick<InsumoVista, "id">): InsumoVista =>
  ({ codigo: o.id, nombre: o.id, tipo: "tela", unidad: "metro", merma: 0.05, minimo: null, nota: null, tejidoId: null, colorCodigo: null, saldo: 100, estado: "ok", lotes: [], consumoSemanal: null, semanas: null, ...o }) as InsumoVista;

describe("telasIniciales", () => {
  it("lleva la tela primero y los avíos después, con el consumo a tres decimales", () => {
    const l = telasIniciales([pagina({ insumoId: "boton", tipo: "avio", consumoPorPrenda: 4 }), pagina({ insumoId: "lino", colorCodigo: "NEG", consumoPorPrenda: 1.2 })]);
    expect(l).toEqual([fila("lino", "NEG", "1.200"), fila("boton", null, "4.000")]);
  });
  it("una orden sin tela declarada empieza vacía", () => {
    expect(telasIniciales([])).toEqual([]);
  });
});

describe("hayCambios", () => {
  const inicial = [fila("lino", "NEG", "1.200"), fila("boton", null, "4.000")];
  it("lo mismo escrito de otra forma no es un cambio", () => {
    expect(hayCambios(inicial, [fila("lino", "NEG", "1.2"), fila("boton", null, "4")])).toBe(false);
  });
  it("una fila sin tela elegida no cuenta (la hoja deja filas vacías por color)", () => {
    expect(hayCambios(inicial, [...inicial, fila(null, "BLA", "")])).toBe(false);
  });
  it("agregar, quitar o cambiar el consumo sí son cambios", () => {
    expect(hayCambios(inicial, [...inicial, fila("lino", "BLA", "1.1")])).toBe(true);
    expect(hayCambios(inicial, [inicial[0]])).toBe(true);
    expect(hayCambios(inicial, [fila("lino", "NEG", "1.5"), inicial[1]])).toBe(true);
  });
  it("un consumo a medio escribir se trata como cambio (no se puede guardar, pero tampoco es «igual»)", () => {
    expect(hayCambios(inicial, [fila("lino", "NEG", "1,"), inicial[1]])).toBe(true);
  });
  it("sin nada en los dos lados no hay cambios", () => {
    expect(hayCambios([], [])).toBe(false);
  });
});

describe("contarCambios y textoDeCambios", () => {
  const inicial = [fila("lino", "NEG", "1.200"), fila("boton", null, "4.000")];
  it("cuenta igual que la base: agregadas, corregidas, quitadas", () => {
    expect(contarCambios(inicial, [fila("lino", "NEG", "1.5"), fila("hilo", null, "0.02")])).toEqual({ agregadas: 1, corregidas: 1, quitadas: 1 });
    expect(contarCambios(inicial, inicial)).toEqual({ agregadas: 0, corregidas: 0, quitadas: 0 });
  });
  it("la misma tela en otro color es una fila nueva, no una corrección", () => {
    expect(contarCambios([fila("lino", "NEG", "1.2")], [fila("lino", "NEG", "1.2"), fila("lino", "BLA", "1.2")])).toEqual({ agregadas: 1, corregidas: 0, quitadas: 0 });
  });
  it("lo dice en palabras de tienda", () => {
    expect(textoDeCambios({ agregadas: 1, corregidas: 1, quitadas: 1 })).toBe("agregaste 1, corregiste 1 y quitaste 1");
    expect(textoDeCambios({ agregadas: 2, corregidas: 0, quitadas: 0 })).toBe("agregaste 2");
    expect(textoDeCambios({ agregadas: 0, corregidas: 1, quitadas: 1 })).toBe("corregiste 1 y quitaste 1");
    expect(textoDeCambios({ agregadas: 0, corregidas: 0, quitadas: 0 })).toBe("");
  });
});

describe("problemasDeEdicion (lo que la base rechaza con insumo_con_consumo)", () => {
  const nombres = new Map([["lino", "Lino"], ["boton", "Botón"]]);
  const inicial = [fila("lino", "NEG", "1.2"), fila("lino", "BLA", "1.1"), fila("boton", null, "4")];
  it("una tela con consumo que se quedó sin ninguna fila se marca, con su nombre", () => {
    const p = problemasDeEdicion(inicial, [fila("boton", null, "4")], new Map([["lino", 10]]), nombres);
    expect(p).toHaveLength(1);
    expect(p[0].insumoId).toBe("lino");
    expect(p[0].texto).toContain("«Lino»");
  });
  it("quitar un color de una tela con consumo está bien si le queda otro", () => {
    expect(problemasDeEdicion(inicial, [fila("lino", "NEG", "1.2"), fila("boton", null, "4")], new Map([["lino", 10]]), nombres)).toEqual([]);
  });
  it("corregir el consumo de lo ya usado no es un problema", () => {
    expect(problemasDeEdicion(inicial, [fila("lino", "NEG", "1.5"), fila("lino", "BLA", "1.1"), fila("boton", null, "4")], new Map([["lino", 10]]), nombres)).toEqual([]);
  });
  it("quitar lo que no se usó está bien", () => {
    expect(problemasDeEdicion(inicial, [fila("lino", "NEG", "1.2"), fila("lino", "BLA", "1.1")], new Map([["lino", 10]]), nombres)).toEqual([]);
  });
  it("una fila sin tela elegida no cuenta como «queda»: dejar la tela en blanco la quita", () => {
    expect(problemasDeEdicion([fila("lino", "NEG", "1.2")], [fila(null, "NEG", "")], new Map([["lino", 10]]), nombres)).toHaveLength(1);
  });
  it("sin consumo anotado nunca hay problema", () => {
    expect(problemasDeEdicion(inicial, [], new Map(), nombres)).toEqual([]);
  });
});

describe("usadoPorInsumo", () => {
  it("el libro no sabe de colores: se toma el mayor de las filas de una tela, no la suma", () => {
    const u = usadoPorInsumo([pagina({ insumoId: "lino", colorCodigo: "NEG", usado: 10 }), pagina({ insumoId: "lino", colorCodigo: "BLA", usado: 10 }), pagina({ insumoId: "boton", usado: 0 })]);
    expect(u.get("lino")).toBe(10);
    expect(u.get("boton")).toBe(0);
  });
});

describe("armarEdicionDeTela", () => {
  const base = {
    insumosDeLaOrden: [pagina({ insumoId: "lino", colorCodigo: "NEG", usado: 5, comprometidoOtras: 7, enCamino: 3 })],
    tejidoNombre: "Lino",
    estante: [vista({ id: "lino", saldo: 40, merma: 0.05 }), vista({ id: "algodon", saldo: 20, merma: 0 })],
    tejidoId: "t-lino",
    consumoDeclarado: { telaPorPrenda: 1.2, fuente: "declarado" as const },
    comprometidoDeTodas: { lino: 99, algodon: 4 },
    enCaminoDeTodas: { lino: 50 },
    conCostos: false,
  };
  it("lo reservado por las demás órdenes de una tela de ESTA orden es lo que la página ya calculó sin ella, no lo de todas", () => {
    const d = armarEdicionDeTela(base);
    expect(d.comprometido.lino).toBe(7);
    expect(d.comprometido.algodon).toBe(4);
    expect(d.enCamino.lino).toBe(3);
    expect(d.usado).toEqual({ lino: 5 });
  });
  it("sin la lectura de las demás órdenes sigue funcionando con lo que la página sabe", () => {
    const d = armarEdicionDeTela({ ...base, comprometidoDeTodas: null, enCaminoDeTodas: null });
    expect(d.comprometido).toEqual({ lino: 7 });
    expect(d.enCamino).toEqual({ lino: 3 });
  });
  it("una tela de la orden que ya no está en el estante se ve como archivada y no se vuelve a elegir", () => {
    const d = armarEdicionDeTela({ ...base, insumosDeLaOrden: [pagina({ insumoId: "viejo", nombre: "Tela Vieja", colorCodigo: "NEG" })] });
    const viejo = d.insumos.find((i) => i.id === "viejo");
    expect(viejo).toMatchObject({ nombre: "Tela Vieja", archivado: true });
    expect(d.insumos.filter((i) => !i.archivado).map((i) => i.id)).toEqual(["lino", "algodon"]);
  });
  it("los costos solo viajan a quien los ve, y salen del lote más antiguo con saldo", () => {
    const conLotes = [vista({ id: "lino", lotes: [{ saldo: 0, costoUnitario: 3 }, { saldo: 5, costoUnitario: 6 }] as InsumoVista["lotes"] })];
    expect(armarEdicionDeTela({ ...base, estante: conLotes, conCostos: false }).costoPorUnidad).toEqual({});
    expect(armarEdicionDeTela({ ...base, estante: conLotes, conCostos: true }).costoPorUnidad).toEqual({ lino: 6 });
  });
  it("lo que devuelve cruza del servidor al cliente: se puede serializar sin perder nada", () => {
    const d = armarEdicionDeTela({ ...base, conCostos: true });
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });
});
