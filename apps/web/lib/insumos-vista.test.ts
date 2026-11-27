import { describe, expect, it } from "vitest";
import type { EstadoInsumo, MaterialVista } from "./insumos-reglas";
import {
  alcanzaPara,
  coincideConBusqueda,
  costoPor,
  precioDe,
  detalleDeLote,
  diaEnPalabras,
  fichaParaLeer,
  insigniasDeLaTela,
  insumosPorAcabarse,
  minimoTexto,
  nombreDeInsumoParaLeer,
  tarjetasDeInsumos,
  textoDeLlegoMas,
  tituloDeEliminado,
  tituloDeLote,
  tituloDeTarjeta,
} from "./insumos-vista";

const HOY = "2026-11-26";

const material = (id: string, extra: Partial<MaterialVista> = {}): MaterialVista => ({
  id,
  codigo: `${id.toUpperCase()}-01`,
  nombre: id,
  tipo: "tela",
  tejidoId: null,
  composicion: null,
  claseId: null,
  medida: null,
  unidad: "metro",
  merma: 0,
  compra: "metro",
  ancho: null,
  gramaje: null,
  metrosPorRollo: null,
  version: "v1",
  ...extra,
});

describe("diaEnPalabras", () => {
  it("dice el día con palabras y solo nombra el año si no es el de hoy", () => {
    expect(diaEnPalabras("2026-11-12", HOY)).toBe("12 de noviembre");
    expect(diaEnPalabras("2026-09-03", HOY)).toBe("3 de setiembre");
    expect(diaEnPalabras("2025-01-03", HOY)).toBe("3 de enero de 2025");
    expect(diaEnPalabras("2026-11-12T15:00:00Z", HOY)).toBe("12 de noviembre");
  });
  it("lo que no es una fecha se devuelve tal cual, sin inventar un mes", () => {
    expect(diaEnPalabras("ayer", HOY)).toBe("ayer");
  });
});

describe("nombreDeInsumoParaLeer", () => {
  it("el color de una tela se lee «tela, color X», sin el punto con que lo nombra la base", () => {
    expect(nombreDeInsumoParaLeer({ nombre: "Lino · Crudo", materialId: "m1" })).toBe("Lino, color Crudo");
    expect(nombreDeInsumoParaLeer({ nombre: "Botón nácar 1.5 cm · Negro", materialId: "m2" })).toBe("Botón nácar 1.5 cm, color Negro");
  });
  it("un insumo suelto conserva su nombre", () => {
    expect(nombreDeInsumoParaLeer({ nombre: "Etiqueta tejida", materialId: null })).toBe("Etiqueta tejida");
    expect(nombreDeInsumoParaLeer({ nombre: "Etiqueta tejida" })).toBe("Etiqueta tejida");
    expect(nombreDeInsumoParaLeer({ nombre: "Hilo · 40", materialId: null })).toBe("Hilo, 40");
  });
  it("un avío sin color (su nombre no trae color) no gana un «color» que no tiene", () => {
    expect(nombreDeInsumoParaLeer({ nombre: "Etiqueta tejida", materialId: "m3" })).toBe("Etiqueta tejida");
  });
});

describe("fichaParaLeer", () => {
  it("dice lo que se sabe con coma, o lo que falta", () => {
    expect(fichaParaLeer({ tejido: "Lino", color: { nombre: "Verde botella", hex: null }, completa: true }, "tela")).toBe("Lino, Verde botella");
    expect(fichaParaLeer({ tejido: null, color: null, completa: false }, "tela")).toBe("Sin tejido ni color");
    expect(fichaParaLeer({ tejido: null, color: null, completa: false }, "avio")).toBe("Sin color");
  });
});

describe("insigniasDeLaTela", () => {
  it("una insignia por dato: tejido, de qué está hecha y cómo se compra", () => {
    expect(insigniasDeLaTela(material("lino", { composicion: "100 % lino" }), "Lino")).toEqual(["Lino", "100 % lino", "Se compra por metro"]);
    expect(insigniasDeLaTela(material("pima", { compra: "kilo", ancho: 160, gramaje: 180 }), null)).toEqual(["Se compra por kilo", "Rinde 3.47 metros por kilo"]);
  });
  it("no repite la composición si dice lo mismo que el tejido, ni dibuja lo que no se sabe", () => {
    expect(insigniasDeLaTela(material("lino", { composicion: " lino " }), "Lino")).toEqual(["Lino", "Se compra por metro"]);
    expect(insigniasDeLaTela(material("lino", { composicion: "  " }), null)).toEqual(["Se compra por metro"]);
  });
  it("un avío dice en qué se cuenta", () => {
    expect(insigniasDeLaTela(material("boton", { tipo: "avio", unidad: "unidad", compra: "unidad" }), null)).toEqual(["Se cuenta en unidades"]);
  });
});

describe("tarjetasDeInsumos y tituloDeTarjeta", () => {
  const materiales = [material("lino"), material("pima")];
  const lista = [
    { id: "a", materialId: "lino" },
    { id: "s1", materialId: null },
    { id: "b", materialId: "pima" },
    { id: "c", materialId: "lino" },
    { id: "s2" },
  ];
  it("una tarjeta por tela, en el orden en que aparecen, y lo suelto junto al final", () => {
    const t = tarjetasDeInsumos(lista, materiales);
    expect(t.map((x) => [x.material?.id ?? null, x.insumos.map((i) => i.id)])).toEqual([
      ["lino", ["a", "c"]],
      ["pima", ["b"]],
      [null, ["s1", "s2"]],
    ]);
  });
  it("sin sueltos no hay tarjeta de más, y sin nada no hay tarjetas", () => {
    expect(tarjetasDeInsumos([{ id: "a", materialId: "lino" }], materiales)).toHaveLength(1);
    expect(tarjetasDeInsumos([], materiales)).toEqual([]);
  });
  it("el título: la tela con su medida, o «Otras telas» / «Otros avíos» para lo suelto", () => {
    const boton = material("Botón nácar", { tipo: "avio", medida: { valor: 1.5, unidad: "centimetro" } });
    expect(tituloDeTarjeta({ material: boton, insumos: [] }, "avio", true)).toBe("Botón nácar 1.5 cm");
    expect(tituloDeTarjeta({ material: null, insumos: [] }, "tela", true)).toBe("Otras telas");
    expect(tituloDeTarjeta({ material: null, insumos: [] }, "tela", false)).toBe("Telas");
    expect(tituloDeTarjeta({ material: null, insumos: [] }, "avio", true)).toBe("Otros avíos");
    expect(tituloDeTarjeta({ material: null, insumos: [] }, "avio", false)).toBe("Avíos");
  });
});

describe("coincideConBusqueda", () => {
  it("busca sin tildes ni mayúsculas en el nombre de la tela y en el del color", () => {
    expect(coincideConBusqueda("algodon", "Algodón pima · Blanco")).toBe(true);
    expect(coincideConBusqueda("CRUDO", "Lino", "Crudo")).toBe(true);
    expect(coincideConBusqueda("lino crudo", "Lino · Crudo")).toBe(true);
    expect(coincideConBusqueda("lino negro", "Lino · Crudo")).toBe(false);
  });
  it("vacío deja pasar todo, y lo que no se sabe no rompe", () => {
    expect(coincideConBusqueda("  ", "Lino")).toBe(true);
    expect(coincideConBusqueda("lino", null, undefined, "Lino")).toBe(true);
    expect(coincideConBusqueda("lino", null)).toBe(false);
  });
});

describe("insumosPorAcabarse", () => {
  const i = (id: string, tono: EstadoInsumo["tono"]) => ({ id, estado: { tono, etiqueta: tono } });
  it("lo agotado y lo que está bajo su mínimo, con lo agotado primero", () => {
    const r = insumosPorAcabarse([i("bien", "bien"), i("bajo", "bajo"), i("sin", "sin_minimo"), i("agotado", "sin_saldo"), i("bajo2", "bajo")]);
    expect(r.map((x) => x.id)).toEqual(["agotado", "bajo", "bajo2"]);
  });
  it("si todo alcanza, no hay nada que pedir", () => {
    expect(insumosPorAcabarse([i("a", "bien"), i("b", "sin_minimo")])).toEqual([]);
  });
});

describe("alcanzaPara", () => {
  it("dice las semanas con palabras completas", () => {
    expect(alcanzaPara(6.3, 85)).toBe("6 semanas");
    expect(alcanzaPara(1.2, 10)).toBe("1 semana");
    expect(alcanzaPara(0.4, 3)).toBe("Menos de 1 semana");
    expect(alcanzaPara(80, 900)).toBe("Más de 1 año");
  });
  it("sin nada que quede dice «Nada», y sin ritmo medido no inventa", () => {
    expect(alcanzaPara(0, 0)).toBe("Nada");
    expect(alcanzaPara(3, 0)).toBe("Nada");
    expect(alcanzaPara(null, 50)).toBeNull();
  });
});

describe("minimoTexto y costoPor", () => {
  it("el mínimo con su unidad, o que no hay", () => {
    expect(minimoTexto(40, "metro")).toBe("Mínimo 40.00 m");
    expect(minimoTexto(200, "unidad")).toBe("Mínimo 200 unid.");
    expect(minimoTexto(null, "metro")).toBe("Sin mínimo");
  });
  it("«por unidad» con palabras, para cada unidad y para el rollo", () => {
    expect(costoPor("metro")).toBe("el metro");
    expect(costoPor("kilo")).toBe("el kilo");
    expect(costoPor("rollo")).toBe("el rollo");
    expect(costoPor("unidad")).toBe("cada uno");
    expect(costoPor("docena")).toBe("la docena");
  });
});

describe("tituloDeLote y detalleDeLote", () => {
  it("una compra dice su día; el saldo inicial, «Lo que ya tenías»", () => {
    expect(tituloDeLote({ origen: "compra", ingreso: "2026-11-12" }, HOY)).toBe("Compra del 12 de noviembre");
    expect(tituloDeLote({ origen: "saldo_inicial", ingreso: "2026-11-12" }, HOY)).toBe("Lo que ya tenías");
  });
  it("debajo: a quién y con qué papel, lo que se sepa", () => {
    expect(detalleDeLote({ origen: "compra", ingreso: "2026-11-12", proveedor: "Textiles del Sur", documento: "F001-2231" }, HOY)).toBe("Textiles del Sur, F001-2231");
    expect(detalleDeLote({ origen: "compra", ingreso: "2026-11-12", proveedor: "  ", documento: "F001-2231" }, HOY)).toBe("F001-2231");
    expect(detalleDeLote({ origen: "compra", ingreso: "2026-11-12", documento: null }, HOY)).toBeNull();
  });
  it("el saldo inicial dice cuándo se anotó", () => {
    expect(detalleDeLote({ origen: "saldo_inicial", ingreso: "2026-11-12", documento: null }, HOY)).toBe("Anotado el 12 de noviembre");
    expect(detalleDeLote({ origen: "saldo_inicial", ingreso: "2025-11-12", documento: "Inventario" }, HOY)).toBe("Anotado el 12 de noviembre de 2025, Inventario");
  });
});

describe("tituloDeEliminado y textoDeLlegoMas", () => {
  it("un ingreso eliminado se lee en una frase", () => {
    expect(tituloDeEliminado({ cantidad: 12, ingreso: "2026-11-12" }, "metro", HOY)).toBe("12.00 m del 12 de noviembre");
  });
  it("el botón de compra de la fila nombra lo que es", () => {
    expect(textoDeLlegoMas({ tipo: "tela", colorCodigo: "NEG" })).toBe("Llegó más de este color");
    expect(textoDeLlegoMas({ tipo: "avio", colorCodigo: "NEG" })).toBe("Llegó más de este color");
    expect(textoDeLlegoMas({ tipo: "tela", colorCodigo: null })).toBe("Llegó más de esta tela");
    expect(textoDeLlegoMas({ tipo: "avio", colorCodigo: null })).toBe("Llegó más de este avío");
  });
});

describe("ningún texto de la pantalla separa datos con un punto medio", () => {
  it("lo que arma este archivo no lleva «·»", () => {
    const textos = [
      nombreDeInsumoParaLeer({ nombre: "Lino · Crudo", materialId: "m1" }),
      nombreDeInsumoParaLeer({ nombre: "Hilo · 40" }),
      fichaParaLeer({ tejido: "Lino", color: { nombre: "Crudo", hex: null }, completa: true }, "tela"),
      ...insigniasDeLaTela(material("pima", { compra: "kilo", ancho: 160, gramaje: 180, composicion: "100 % algodón" }), "Jersey"),
      tituloDeLote({ origen: "compra", ingreso: "2026-11-12" }, HOY),
      detalleDeLote({ origen: "compra", ingreso: "2026-11-12", proveedor: "Textiles del Sur", documento: "F001-2231" }, HOY) ?? "",
      detalleDeLote({ origen: "saldo_inicial", ingreso: "2026-11-12", documento: "Inventario" }, HOY) ?? "",
      tituloDeEliminado({ cantidad: 12, ingreso: "2026-11-12" }, "metro", HOY),
    ];
    for (const t of textos) expect(t, t).not.toContain("·");
  });
});

describe("precioDe", () => {
  it("dice de qué es el precio de corrido, sin «de el»", () => {
    expect(precioDe("metro")).toBe("del metro");
    expect(precioDe("kilo")).toBe("del kilo");
    expect(precioDe("rollo")).toBe("del rollo");
    expect(precioDe("unidad")).toBe("de cada uno");
    expect(precioDe("docena")).toBe("de la docena");
    for (const u of ["metro", "kilo", "unidad", "cono", "par", "docena", "rollo"] as const) expect(precioDe(u)).not.toMatch(/de el /);
  });
});
