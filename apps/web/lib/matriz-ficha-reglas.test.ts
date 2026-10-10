import { describe, expect, it } from "vitest";
import {
  avisoCargaDeLaFicha,
  bloqueoDeSubida,
  comoLlenarHueco,
  armarMatriz,
  cambiosDeStock,
  cantidadDeCelda,
  coloresQueSeQuitan,
  coloresYaDesactivados,
  conPaso,
  correccionesPendientes,
  cuentaEtiqueta,
  devolverColor,
  etiquetaCambiada,
  fijarCelda,
  grupoDeStockEnHoja,
  hrefEtiquetasDeSubidas,
  juntarSubidas,
  lineasParaImprimir,
  lineasDelLote,
  minimoDeCelda,
  pasoDeCelda,
  ponerEtiqueta,
  problemaDelStockDeLaVisita,
  quitarColor,
  quitarTalla,
  tallasQueSeQuitan,
  devolverTalla,
  rangoDePrecios,
  resumenVariantes,
  tonoDeBarra,
  totalesMatriz,
} from "./matriz-ficha-reglas";
import type { VarianteAjuste } from "./ajuste-reglas";
import type { FilaFicha, NombresFicha } from "./variantes-ficha-reglas";

const TALLAS: Record<string, string> = { s: "S", m: "M", l: "L", xl: "XL" };
const n: NombresFicha = { color: (c) => c ?? "Sin color", talla: (t) => (t ? TALLAS[t] : "") };

function fila(color: string | null, talla: string | null, extra: Partial<FilaFicha> = {}): FilaFicha {
  const id = `${color}-${talla}`;
  return {
    clave: id,
    id,
    colorCodigo: color,
    tallaId: talla,
    guardada: { colorCodigo: color, tallaId: talla, precio: "69", costo: "30", activo: true, codigo: null, etiquetaIds: [] },
    codigosBarras: [],
    precio: "69",
    costo: "30",
    costoFijo: false,
    activo: true,
    etiquetaIds: [],
    ...extra,
  };
}

function variante(id: string, o: Partial<VarianteAjuste> = {}): VarianteAjuste {
  return {
    varianteId: id,
    sku: id,
    talla: null,
    color: null,
    stockPiso: 0,
    stockAlmacen: 0,
    stockSinDividir: 0,
    apartadoPiso: 0,
    apartadoAlmacen: 0,
    apartadoSinDividir: 0,
    sinHistoria: false,
    ...o,
  };
}

describe("armarMatriz", () => {
  it("toma los colores en el orden de la ficha y las tallas en orden de curva, solo de las activas", () => {
    const m = armarMatriz([fila("CRU", "l"), fila("NEG", "s"), fila("CRU", "s"), fila("AZU", "xl", { activo: false }), fila("CRU", "m")], n);
    expect(m.colores).toEqual(["CRU", "NEG"]);
    expect(m.tallas).toEqual(["s", "m", "l"]);
    expect(m.celda("NEG", "s")?.id).toBe("NEG-s");
    expect(m.celda("NEG", "m")).toBeUndefined();
    expect(m.celda("AZU", "xl")).toBeUndefined();
  });

  it("una prenda sin talla deja una sola columna al final", () => {
    const m = armarMatriz([fila("CRU", null), fila("CRU", "s")], n);
    expect(m.tallas).toEqual(["s", null]);
  });
});

describe("la celda: número, piso y paso", () => {
  it("el número es el stock de hoy en el lugar más lo tocado, nunca arranca en 0 si hay stock", () => {
    const v = variante("a", { stockAlmacen: 4, stockPiso: 2 });
    expect(cantidadDeCelda(v, "almacen", 0)).toBe(4);
    expect(cantidadDeCelda(v, "piso", 1)).toBe(3);
    expect(cantidadDeCelda(undefined, "almacen", 0)).toBe(0);
  });

  it("no baja de cero ni de lo apartado para clientas", () => {
    expect(pasoDeCelda(0, 0, -1, 0)).toBeNull();
    expect(pasoDeCelda(2, -1, -1, 0)).toBe(-2);
    expect(pasoDeCelda(2, -2, -1, 0)).toBeNull();
    const v = variante("a", { stockAlmacen: 3, apartadoAlmacen: 2 });
    const min = minimoDeCelda(v, "almacen");
    expect(min).toBe(2);
    expect(pasoDeCelda(3, 0, -1, min)).toBe(-1);
    expect(pasoDeCelda(3, -1, -1, min)).toBeNull();
    expect(pasoDeCelda(0, 4, 1, 0)).toBe(5);
  });

  it("lo que vuelve a 0 deja de estar pendiente", () => {
    expect(conPaso({ a: 1 }, "a", 0)).toEqual({});
    expect(conPaso({}, "a", -1)).toEqual({ a: -1 });
  });
});

describe("lineasDelLote", () => {
  const vs = [variante("a", { stockAlmacen: 4 }), variante("b", { stockAlmacen: 0 }), variante("c", { stockAlmacen: 9 })];

  it("con «Conteo físico» escribe cuántas hay, y la base recibe la misma diferencia", () => {
    const l = lineasDelLote(vs, { a: 2, b: 1 }, "almacen", "conteo_fisico");
    expect(l.map((x) => [x.variante.varianteId, x.delta, x.resultado])).toEqual([
      ["a", 2, 6],
      ["b", 1, 1],
    ]);
  });

  it("con los demás motivos, suma o resta; el resultado es el mismo", () => {
    const l = lineasDelLote(vs, { a: 2, c: -3 }, "almacen", "merma");
    expect(l.map((x) => [x.variante.varianteId, x.delta, x.resultado])).toEqual([
      ["a", 2, 6],
      ["c", -3, 6],
    ]);
  });

  it("lo que no se tocó no viaja", () => {
    expect(lineasDelLote(vs, {}, "almacen", "conteo_fisico")).toEqual([]);
  });
});

// ADR-0328 (actividad 4) en la ficha, tras la revisión adversarial: «Encontré prendas» se ofrece con su nota y, con la carga de
// la sede cerrada, es la única forma de sumar una talla que nunca estuvo en la tienda. Las MISMAS reglas que la base.
describe("«Encontré prendas» y la carga cerrada en la ficha", () => {
  const MOTIVOS = ["reposicion", "merma", "conteo_fisico", "otro"] as const;
  const conHistoria = variante("h", { stockAlmacen: 4, apartadoAlmacen: 1 });
  const nueva = variante("n", { sinHistoria: true });

  it("con «Encontré prendas» la celda no baja de lo que hay hoy (solo suma); con los demás, de lo apartado", () => {
    expect(minimoDeCelda(conHistoria, "almacen", "reposicion")).toBe(4);
    for (const m of ["merma", "conteo_fisico", "otro"] as const) expect(minimoDeCelda(conHistoria, "almacen", m)).toBe(1);
    expect(minimoDeCelda(conHistoria, "almacen")).toBe(1);
    expect(pasoDeCelda(4, 0, -1, minimoDeCelda(conHistoria, "almacen", "reposicion"))).toBeNull();
    expect(pasoDeCelda(4, 0, 1, minimoDeCelda(conHistoria, "almacen", "reposicion"))).toBe(1);
    expect(minimoDeCelda(undefined, "almacen", "reposicion")).toBe(0);
  });

  it("el «+» de una talla sin historia: abierta suma con todo; cerrada, solo con «Encontré prendas», y en el piso manda al almacén", () => {
    for (const m of MOTIVOS) {
      expect(bloqueoDeSubida({ sinHistoria: true, cargaAbierta: true, motivo: m, enPisoCerrado: false })).toBeNull();
      expect(bloqueoDeSubida({ sinHistoria: false, cargaAbierta: false, motivo: m, enPisoCerrado: false })).toBeNull();
      const cerrada = bloqueoDeSubida({ sinHistoria: true, cargaAbierta: false, motivo: m, enPisoCerrado: false });
      if (m === "reposicion") expect(cerrada).toBeNull();
      else expect(cerrada).toMatch(/elige «Encontré prendas»/);
    }
    expect(bloqueoDeSubida({ sinHistoria: true, cargaAbierta: false, motivo: "merma", enPisoCerrado: true })).toMatch(/anótala en el almacén/);
  });

  it("nada que frenar sin cambios, ni con la carga abierta y un motivo sin nota", () => {
    const base = { nuevasConStock: 0, nota: "", cargaAbierta: true, enPisoCerrado: false };
    for (const m of MOTIVOS) expect(problemaDelStockDeLaVisita({ ...base, lineas: [], motivo: m })).toBeNull();
    expect(problemaDelStockDeLaVisita({ ...base, lineas: [{ delta: 2, variante: conHistoria }], motivo: "conteo_fisico" })).toBeNull();
    // Abierta, lo nuevo es stock inicial: no necesita motivo ni nota (ni una variante nueva, ni una talla sin historia).
    expect(problemaDelStockDeLaVisita({ ...base, lineas: [], nuevasConStock: 2, motivo: "reposicion" })).toBeNull();
    expect(problemaDelStockDeLaVisita({ ...base, lineas: [{ delta: 2, variante: nueva }], motivo: "reposicion" })).toBeNull();
    // …pero si en el mismo lote hay una talla con historia, esa sí viaja como ajuste y pide la nota.
    expect(problemaDelStockDeLaVisita({ ...base, lineas: [{ delta: 2, variante: nueva }, { delta: 1, variante: conHistoria }], motivo: "reposicion" })?.campo).toBe("nota");
  });

  it("«Encontré prendas» pide la nota (3 letras o más) y la manda a su campo; restar se manda al motivo", () => {
    const base = { nuevasConStock: 0, cargaAbierta: true, enPisoCerrado: false, motivo: "reposicion" as const };
    expect(problemaDelStockDeLaVisita({ ...base, lineas: [{ delta: 2, variante: conHistoria }], nota: " ab " })).toEqual({
      texto: "Con «Encontré prendas» cuenta dónde estaban o por qué aparecieron (3 letras o más).",
      campo: "nota",
    });
    expect(problemaDelStockDeLaVisita({ ...base, lineas: [{ delta: 2, variante: conHistoria }], nota: "en una caja" })).toBeNull();
    expect(problemaDelStockDeLaVisita({ ...base, lineas: [{ delta: -1, variante: conHistoria }], nota: "en una caja" })?.campo).toBe("motivo");
  });

  it("cerrada: una talla sin historia u otra variante nueva con otro motivo frena en el motivo; con «Encontré prendas», en la nota", () => {
    const base = { cargaAbierta: false, enPisoCerrado: false, nota: "" };
    for (const m of ["merma", "conteo_fisico", "otro"] as const) {
      expect(problemaDelStockDeLaVisita({ ...base, lineas: [{ delta: 1, variante: nueva }], nuevasConStock: 0, motivo: m })?.campo).toBe("motivo");
      expect(problemaDelStockDeLaVisita({ ...base, lineas: [], nuevasConStock: 1, motivo: m })?.campo).toBe("motivo");
    }
    // Las variantes nuevas viajan como ajuste: con «Encontré prendas» piden la nota como cualquier otra.
    expect(problemaDelStockDeLaVisita({ ...base, lineas: [], nuevasConStock: 1, motivo: "reposicion" })?.campo).toBe("nota");
    expect(problemaDelStockDeLaVisita({ ...base, lineas: [], nuevasConStock: 1, motivo: "reposicion", nota: "en el probador" })).toBeNull();
  });

  it("la línea bajo el motivo: cerrada y con otro motivo dice qué hacer con las tallas quietas; si no, el aviso tal cual", () => {
    const aviso = "La carga inicial de Tienda TRU se cerró el 15-oct. Lo que encuentres entra por «Encontré prendas».";
    expect(avisoCargaDeLaFicha(null, false, "merma", false)).toBeNull();
    expect(avisoCargaDeLaFicha(aviso, true, "merma", false)).toBe(aviso);
    expect(avisoCargaDeLaFicha(aviso, false, "reposicion", false)).toBe(aviso);
    expect(avisoCargaDeLaFicha(aviso, false, "merma", false)).toBe(`${aviso} Las tallas que nunca estuvieron aquí se suman eligiendo «Encontré prendas».`);
    expect(avisoCargaDeLaFicha(aviso, false, "otro", true)).toMatch(/se suman en el almacén, con «Encontré prendas»\.$/);
  });
});

describe("totalesMatriz", () => {
  it("suma por color, por talla y general lo que muestra cada celda", () => {
    const m = armarMatriz([fila("CRU", "s"), fila("CRU", "m"), fila("NEG", "s")], n);
    const num: Record<string, number> = { "CRU-s": 6, "CRU-m": 9, "NEG-s": 3 };
    const t = totalesMatriz(m, (f) => num[f.id!]);
    expect(t.porColor.get("CRU")).toBe(15);
    expect(t.porTalla.get("s")).toBe(9);
    expect(t.total).toBe(18);
  });
});

describe("textos", () => {
  it("la barra se apaga en 0 y avisa con 3 o menos", () => {
    expect(tonoDeBarra(0)).toBe("cero");
    expect(tonoDeBarra(3)).toBe("bajo");
    expect(tonoDeBarra(4)).toBe("normal");
  });

  it("el rango de precios", () => {
    expect(rangoDePrecios([69, 89, 79])).toBe("S/ 69–89");
    expect(rangoDePrecios([69.9, 69.9])).toBe("S/ 69.90");
    expect(resumenVariantes([fila("CRU", "s"), fila("NEG", "s", { precio: "89" }), fila("NEG", "m", { activo: false })])).toBe("2 variantes activas · S/ 69–89");
  });
});

describe("stock que espera a «Revisar y guardar» (ADR-0313, act. 2026-10-02 noche)", () => {
  it("fijarCelda: lo escrito a mano es lo tocado contra el stock de hoy; nunca debajo de lo apartado ni algo que no es un entero", () => {
    expect(fijarCelda(4, 6, 0)).toBe(2);
    expect(fijarCelda(4, 1, 0)).toBe(-3);
    expect(fijarCelda(4, 4, 0)).toBe(0);
    expect(fijarCelda(4, 1, 2)).toBeNull();
    expect(fijarCelda(4, 2, 2)).toBe(-2);
    expect(fijarCelda(4, -1, 0)).toBeNull();
    expect(fijarCelda(4, 1.5, 0)).toBeNull();
  });

  it("cambiosDeStock: de cuánto a cuánto en el lugar que se ajusta, solo lo tocado", () => {
    const vs = [variante("a", { talla: "S", color: "Blanco", stockAlmacen: 4 }), variante("b", { talla: "M", color: "Blanco", stockAlmacen: 3 })];
    expect(cambiosDeStock(vs, { a: 2 }, "almacen")).toEqual([{ varianteId: "a", color: "Blanco", talla: "S", antes: 4, despues: 6 }]);
    expect(cambiosDeStock(vs, { b: -1 }, "piso")).toEqual([{ varianteId: "b", color: "Blanco", talla: "M", antes: 0, despues: -1 }]);
    expect(cambiosDeStock(vs, {}, "almacen")).toEqual([]);
  });

  it("grupoDeStockEnHoja: una línea por talla y la nota con motivo, lugar y las etiquetas si algo sube", () => {
    expect(grupoDeStockEnHoja([], "Conteo físico", "en el almacén")).toBeNull();
    const g = grupoDeStockEnHoja(
      [
        { varianteId: "a", color: "Blanco", talla: "S", antes: 4, despues: 6 },
        { varianteId: "b", color: "Rojo", talla: null, antes: 3, despues: 2 },
      ],
      "Conteo físico",
      "en el almacén"
    )!;
    expect(g.lineas).toEqual([
      { texto: "S · Blanco", antes: "4", despues: "6" },
      { texto: "Única · Rojo", antes: "3", despues: "2" },
    ]);
    expect(g.nota).toBe("Se registra como «Conteo físico» en el almacén. Entran 2 unidades: al guardar te propone imprimir sus etiquetas.");
    expect(grupoDeStockEnHoja([{ varianteId: "b", color: "Rojo", talla: "M", antes: 3, despues: 2 }], "Merma", "en esta sede")!.nota).toBe(
      "Se registra como «Merma» en esta sede."
    );
  });

  it("juntarSubidas y hrefEtiquetasDeSubidas: una etiqueta por unidad nueva, sumando lo que se repite", () => {
    const una = juntarSubidas([], [{ varianteId: "a", color: "Blanco", talla: "S", unidades: 2 }, { varianteId: "b", color: "Rojo", talla: "M", unidades: 0 }]);
    const dos = juntarSubidas(una, [{ varianteId: "a", color: "Blanco", talla: "S", unidades: 1 }, { varianteId: "c", color: "Rojo", talla: "L", unidades: 4 }]);
    expect(dos.map((s) => [s.varianteId, s.unidades])).toEqual([["a", 3], ["c", 4]]);
    expect(una[0].unidades).toBe(2);
    expect(hrefEtiquetasDeSubidas(dos)).toBe("/etiquetas-de-precio?unidades=a:3,c:4");
    expect(hrefEtiquetasDeSubidas([])).toBeNull();
  });
});

describe("etiquetas y colores que se quitan (ADR-0313, act. 2026-10-03)", () => {
  const NUEVO = "et-nuevo";
  const OFERTA = "et-oferta";

  it("cuenta solo las activas", () => {
    const filas = [fila("CRU", "s", { etiquetaIds: [NUEVO] }), fila("CRU", "m"), fila("NEG", "s", { activo: false, etiquetaIds: [NUEVO] })];
    expect(cuentaEtiqueta(filas, NUEVO)).toEqual({ con: 1, de: 2 });
  });

  it("pone en todas las activas sin tocar las otras etiquetas ni las desactivadas", () => {
    const filas = [fila("CRU", "s", { etiquetaIds: [OFERTA] }), fila("CRU", "m", { etiquetaIds: [NUEVO] }), fila("NEG", "s", { activo: false })];
    const r = ponerEtiqueta(filas, NUEVO, true);
    expect(r[0].etiquetaIds).toEqual([OFERTA, NUEVO]);
    expect(r[1]).toBe(filas[1]); // ya la tenía: misma fila, sin cambio fantasma
    expect(r[2].etiquetaIds).toEqual([]);
  });

  it("quita de una sola variante", () => {
    const filas = [fila("CRU", "s", { etiquetaIds: [NUEVO, OFERTA] }), fila("CRU", "m", { etiquetaIds: [NUEVO] })];
    const r = ponerEtiqueta(filas, NUEVO, false, ["CRU-s"]);
    expect(r[0].etiquetaIds).toEqual([OFERTA]);
    expect(r[1].etiquetaIds).toEqual([NUEVO]);
  });

  it("marca el cambio contra lo guardado, no en una nueva", () => {
    const tocada = fila("CRU", "s", { etiquetaIds: [NUEVO] });
    expect(etiquetaCambiada(tocada, NUEVO)).toBe(true);
    expect(etiquetaCambiada(tocada, OFERTA)).toBe(false);
    expect(etiquetaCambiada({ ...tocada, guardada: null }, NUEVO)).toBe(false);
  });

  it("un color que se vendía y quedó sin tallas activas se quita; uno ya apagado no", () => {
    const filas = [
      fila("CRU", "s"),
      fila("NEG", "s", { activo: false }),
      fila("NEG", "m", { activo: false }),
      fila("ROJ", "s", { activo: false, guardada: { ...fila("ROJ", "s").guardada!, activo: false } }),
    ];
    expect(coloresQueSeQuitan(filas)).toEqual(["NEG"]);
    expect(coloresYaDesactivados(filas)).toEqual(["ROJ"]);
  });

  it("con una talla todavía activa, el color no se quita", () => {
    expect(coloresQueSeQuitan([fila("NEG", "s", { activo: false }), fila("NEG", "m")])).toEqual([]);
  });

  it("devolver el color reactiva solo lo que estaba activo en la base", () => {
    const apagadaAntes = fila("NEG", "l", { activo: false, guardada: { ...fila("NEG", "l").guardada!, activo: false } });
    const r = devolverColor([fila("NEG", "s", { activo: false }), apagadaAntes, fila("CRU", "s", { activo: false })], "NEG");
    expect(r.map((f) => f.activo)).toEqual([true, false, false]);
  });
});

describe("correccionesPendientes", () => {
  it("junta las tallas de un color corregido y las de una talla corregida", () => {
    const filas = [
      fila("ARN", "s", { colorCodigo: "BEI" }),
      fila("ARN", "m", { colorCodigo: "BEI" }),
      fila("CRU", "s", { tallaId: "m" }),
      fila("NEG", "s", { colorCodigo: "CRU", tallaId: "l" }),
      fila("NEG", "m"),
    ];
    const r = correccionesPendientes(filas, n);
    expect(r.map((c) => c.texto)).toEqual(["ARN → BEI (2 tallas)", "Talla S → M en CRU", "NEG S → CRU L"]);
    expect(r[0].claves).toEqual(["ARN-s", "ARN-m"]);
    expect(r[0].destino).toEqual({ colorCodigo: "ARN" });
    expect(r[1].destino).toEqual({ tallaId: "s" });
    expect(r[2].destino).toEqual({ colorCodigo: "NEG", tallaId: "s" });
  });

  it("sin correcciones (o solo nuevas), nada", () => {
    expect(correccionesPendientes([fila("CRU", "s"), { ...fila("NEG", "s"), guardada: null }], n)).toEqual([]);
  });
});

describe("quitarColor — opción B (Felipe 2026-10-03)", () => {
  it("desactiva el color y devuelve a lo guardado su precio, su costo y sus etiquetas tocados", () => {
    const filas = [
      fila("ROJ", "s", { precio: "5", costo: "9", etiquetaIds: ["et-nuevo"] }),
      fila("ROJ", "m", { etiquetaIds: ["et-nuevo"] }),
      fila("CRU", "s", { precio: "99" }),
    ];
    const r = quitarColor(filas, "ROJ");
    expect(r.map((f) => [f.clave, f.activo, f.precio, f.costo, f.etiquetaIds])).toEqual([
      ["ROJ-s", false, "69", "30", []],
      ["ROJ-m", false, "69", "30", []],
      ["CRU-s", true, "99", "30", []],
    ]);
  });

  it("una talla nueva del color se va; un costo que viene de compras no se toca", () => {
    const nueva = { ...fila("ROJ", "l"), id: null, clave: "nueva:ROJ-l", guardada: null };
    const fija = fila("ROJ", "s", { costoFijo: true, costo: "31" });
    const r = quitarColor([fija, nueva], "ROJ");
    expect(r).toHaveLength(1);
    expect(r[0].costo).toBe("31");
    expect(r[0].activo).toBe(false);
  });

  it("deshacer la vuelve a la venta tal como está guardada", () => {
    const r = devolverColor(quitarColor([fila("ROJ", "s", { precio: "5" })], "ROJ"), "ROJ");
    expect(r[0].activo).toBe(true);
    expect(r[0].precio).toBe("69");
  });
});

describe("lineasParaImprimir", () => {
  it("cruza lo que entró con la ficha, en el orden de la tabla", () => {
    const filas = [fila("CRU", "m", { precio: "140", etiquetaIds: ["et-nuevo"] }), fila("CRU", "s"), fila("NEG", "s", { precio: "0" })];
    const r = lineasParaImprimir(
      [
        { varianteId: "NEG-s", color: "NEG", talla: "S", unidades: 2 },
        { varianteId: "CRU-m", color: "CRU", talla: "M", unidades: 3 },
        { varianteId: "CRU-s", color: "CRU", talla: "S", unidades: 1 },
        { varianteId: "x", color: "Lila", talla: null, unidades: 1 },
        { varianteId: "CRU-s", color: "CRU", talla: "S", unidades: 0 },
      ],
      filas,
      n
    );
    expect(r.map((l) => `${l.color} ${l.talla} ×${l.unidades} ${l.precio}`)).toEqual(["CRU S ×1 69", "CRU M ×3 140", "NEG S ×2 null", "Lila Única ×1 null"]);
    expect(r[1].etiquetaIds).toEqual(["et-nuevo"]);
  });
  it("con precio propio de esta tienda, la línea sale con ese precio (ADR-0370); las demás, con el de la ficha", () => {
    const filas = [fila("CRU", "m", { precio: "140" }), fila("CRU", "s", { precio: "140" })];
    const r = lineasParaImprimir(
      [
        { varianteId: "CRU-m", color: "CRU", talla: "M", unidades: 1 },
        { varianteId: "CRU-s", color: "CRU", talla: "S", unidades: 1 },
      ],
      filas,
      n,
      { "CRU-m": 155 },
    );
    expect(r.map((l) => `${l.talla} ${l.precio}`)).toEqual(["S 140", "M 155"]);
  });
});

describe("comoLlenarHueco — la celda «—» agrega la combinación (Felipe 2026-10-03)", () => {
  const permitidos = { coloresActivos: ["Rojo", "Azul"], tallasHabilitadas: ["s", "m", "l"] };

  it("una combinación que nunca existió nace nueva", () => {
    expect(comoLlenarHueco([fila("Rojo", "s"), fila("Azul", "m")], "Rojo", "m", permitidos, n)).toEqual({ puede: true, queHace: "nueva" });
  });

  it("una que existió desactivada vuelve a venderse (no se duplica)", () => {
    const filas = [fila("Rojo", "s"), fila("Rojo", "m", { activo: false })];
    expect(comoLlenarHueco(filas, "Rojo", "m", permitidos, n)).toEqual({ puede: true, queHace: "reactiva" });
  });

  it("reactiva aunque el color ya no esté activo en Colores: no crea nada nuevo", () => {
    const filas = [fila("Verde", "s"), fila("Verde", "m", { activo: false })];
    expect(comoLlenarHueco(filas, "Verde", "m", permitidos, n)).toEqual({ puede: true, queHace: "reactiva" });
  });

  it("no nace en un color desactivado en Colores ni en una talla que la categoría ya no habilita", () => {
    const filas = [fila("Verde", "s"), fila("Rojo", "xl")];
    const color = comoLlenarHueco(filas, "Verde", "xl", permitidos, n);
    expect(color.puede).toBe(false);
    expect(!color.puede && color.motivo).toMatch(/Verde está desactivado/);
    const sinTalla = comoLlenarHueco([fila("Rojo", "s"), fila("Azul", "xl")], "Rojo", "xl", permitidos, n);
    expect(!sinTalla.puede && sinTalla.motivo).toMatch(/XL ya no está habilitada/);
  });

  it("sin color o sin talla (prenda de talla única) también se puede llenar", () => {
    expect(comoLlenarHueco([fila(null, "s")], null, "m", permitidos, n)).toEqual({ puede: true, queHace: "nueva" });
    expect(comoLlenarHueco([fila("Rojo", null)], "Azul", null, permitidos, n)).toEqual({ puede: true, queHace: "nueva" });
  });

  it("una que ya se vende no es un hueco", () => {
    expect(comoLlenarHueco([fila("Rojo", "s")], "Rojo", "s", permitidos, n).puede).toBe(false);
  });
});

describe("quitarColor también suelta una corrección de la visita (revisión 2026-10-03)", () => {
  it("Negro corregido a Azul y quitado: queda Negro, desactivado, sin corrección pendiente", () => {
    const corregidas = [fila("Negro", "s", { colorCodigo: "Azul" }), fila("Negro", "m", { colorCodigo: "Azul" }), fila("Rojo", "s")];
    const r = quitarColor(corregidas, "Azul");
    expect(r.filter((f) => f.guardada?.colorCodigo === "Negro").map((f) => [f.colorCodigo, f.activo])).toEqual([
      ["Negro", false],
      ["Negro", false],
    ]);
    expect(correccionesPendientes(r, n)).toEqual([]);
    expect(coloresQueSeQuitan(r)).toEqual(["Negro"]);
  });

  it("si su lugar de antes ya lo ocupa otra fila, se queda con la corrección (no se arma un choque)", () => {
    const filas = [fila("Negro", "s", { colorCodigo: "Azul" }), fila("Negro", "s", { clave: "otra", id: "otra", guardada: null })];
    const r = quitarColor(filas, "Azul");
    expect(r.find((f) => f.clave === "Negro-s")?.colorCodigo).toBe("Azul");
  });
});

describe("quitarTalla — el tacho de la cabecera de una talla (Felipe 2026-10-03)", () => {
  const prenda = () => [fila("Rojo", "s"), fila("Rojo", "m"), fila("Azul", "s"), fila("Azul", "m")];

  it("desactiva la talla en todos los colores y no toca las demás", () => {
    const r = quitarTalla(prenda(), "s");
    expect(r.map((f) => [f.clave, f.activo])).toEqual([
      ["Rojo-s", false],
      ["Rojo-m", true],
      ["Azul-s", false],
      ["Azul-m", true],
    ]);
    expect(tallasQueSeQuitan(r, n)).toEqual(["s"]);
    expect(coloresQueSeQuitan(r)).toEqual([]);
  });

  it("suelta lo tocado en la visita (precio, etiquetas) y una corrección de talla", () => {
    const filas = [fila("Rojo", "s", { precio: "99", etiquetaIds: ["nuevo"] }), fila("Rojo", "m", { tallaId: "l" })];
    const r = quitarTalla(quitarTalla(filas, "s"), "l");
    expect(r[0]).toMatchObject({ activo: false, precio: "69", etiquetaIds: [] });
    expect(r[1]).toMatchObject({ activo: false, tallaId: "m" });
    expect(correccionesPendientes(r, n)).toEqual([]);
  });

  it("una talla recién agregada (sin guardar) simplemente se va", () => {
    const nueva = fila("Rojo", "xl", { clave: "nueva:xl", id: null, guardada: null });
    const r = quitarTalla([...prenda(), nueva], "xl");
    expect(r.some((f) => f.clave === "nueva:xl")).toBe(false);
    expect(tallasQueSeQuitan(r, n)).toEqual([]);
  });

  it("si un color se queda sin tallas, también se dice que ese color se quita", () => {
    const r = quitarTalla([fila("Rojo", "s"), fila("Azul", "s"), fila("Azul", "m")], "s");
    expect(coloresQueSeQuitan(r)).toEqual(["Rojo"]);
  });

  it("«Deshacer» la devuelve a la venta", () => {
    const r = devolverTalla(quitarTalla(prenda(), "m"), "m");
    expect(r.every((f) => f.activo)).toBe(true);
    expect(tallasQueSeQuitan(r, n)).toEqual([]);
  });

  it("varias tallas quitadas se listan en orden de curva", () => {
    const r = quitarTalla(quitarTalla(prenda(), "m"), "s");
    expect(tallasQueSeQuitan(r, n)).toEqual(["s", "m"]);
  });
});
