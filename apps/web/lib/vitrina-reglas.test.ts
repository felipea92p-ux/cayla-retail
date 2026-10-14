import { describe, expect, it } from "vitest";
import {
  cifrasDe,
  coloresSinFoto,
  descripcionParaGuardar,
  diferenciaCorta,
  errorDeVitrina,
  filtrarVitrina,
  frenteATienda,
  leerVitrina,
  libreEnTiendas,
  margenSinIgv,
  modeloDeJson,
  nuevoPrecioLote,
  precioConCampana,
  precioWebDe,
  precioWebDeTexto,
  problemaDePrecioWeb,
  seVeEnLaWeb,
  stockEnTiendas,
  textoLoNuevo,
  valorDeLote,
  type ModeloVitrina,
} from "./vitrina-reglas";
import { camposDeLoteMostrar, camposDeLotePrecio, camposDeModelo } from "./vitrina-guia";
import { descuentoUnitarioPorPorcentaje } from "./vender-reglas";

// Un modelo tal como lo devuelve `retail.fn_vitrina_modelos()` (20261014225000).
const JSON_EMMA = {
  id: "e1",
  codigo: "CMS-0001",
  nombre: "Blusa Emma",
  descripcion: "Blusa manga larga, cuello redondo",
  categoria: "Camisas y Blusas",
  prefijo: "CMS",
  familia: "indumentaria",
  publicable: true,
  precio_tienda: 79.9,
  precio_tienda_min: 79.9,
  costo: 35.46,
  foto: null,
  colores: [
    { codigo: "BEI", nombre: "Beige", hex: "#D5BA98", foto: "https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/b.jpg" },
    { codigo: "NEG", nombre: "Negro", hex: "#2D2C2F", foto: null },
  ],
  tallas: 3,
  stock: [
    { ubicacion_id: "lim", cantidad: 6 },
    { ubicacion_id: "tru", cantidad: 0 },
  ],
  campana: { nombre: "Aniversario", pct: 12, todas: true },
  vitrina: {
    publicado: true,
    precio_web: 74.9,
    en_lo_nuevo: "fijo",
    descripcion_web: null,
    version: 3,
    publicado_en: "2026-10-14T20:00:00Z",
    actualizado_en: "2026-10-14T20:00:00Z",
    actualizado_por: "Felipe Pereyra",
  },
};

const emma = modeloDeJson(JSON_EMMA)!;
const modelo = (cambios: Partial<ModeloVitrina>): ModeloVitrina => ({ ...emma, ...cambios });

describe("leer lo que devuelve la base", () => {
  it("lee un modelo completo", () => {
    expect(emma).toMatchObject({
      id: "e1",
      nombre: "Blusa Emma",
      precioTienda: 79.9,
      costo: 35.46,
      tallas: 3,
      campana: { nombre: "Aniversario", pct: 12, todas: true },
      vitrina: { publicado: true, precioWeb: 74.9, enLoNuevo: "fijo", version: 3, actualizadoPor: "Felipe Pereyra" },
    });
    expect(emma.colores.map((c) => c.codigo)).toEqual(["BEI", "NEG"]);
    expect(emma.stock).toEqual([
      { ubicacionId: "lim", cantidad: 6 },
      { ubicacionId: "tru", cantidad: 0 },
    ]);
  });

  it("los números que Postgres manda como texto también se leen", () => {
    const m = modeloDeJson({ ...JSON_EMMA, precio_tienda: "79.90", vitrina: { ...JSON_EMMA.vitrina, precio_web: "74.90", version: "3" } });
    expect(m?.precioTienda).toBe(79.9);
    expect(m?.vitrina?.precioWeb).toBe(74.9);
  });

  it("un modelo que nunca estuvo en la vitrina, y uno sin costo (no es líder)", () => {
    const m = modeloDeJson({ ...JSON_EMMA, vitrina: null, costo: null, campana: null });
    expect(m?.vitrina).toBeNull();
    expect(m?.costo).toBeNull();
    expect(m?.campana).toBeNull();
  });

  it("un dato raro no tumba la pantalla: se descarta o queda vacío", () => {
    expect(modeloDeJson(null)).toBeNull();
    expect(modeloDeJson({ id: "x" })).toBeNull();
    expect(modeloDeJson({ ...JSON_EMMA, vitrina: { publicado: true } })?.vitrina).toBeNull();
    expect(modeloDeJson({ ...JSON_EMMA, vitrina: { ...JSON_EMMA.vitrina, en_lo_nuevo: "siempre" } })?.vitrina?.enLoNuevo).toBe("automatico");
    expect(modeloDeJson({ ...JSON_EMMA, colores: "x", stock: [{ cantidad: 3 }] })).toMatchObject({ colores: [], stock: [] });
    expect(leerVitrina("x")).toEqual({ veCostos: false, tiendas: [], modelos: [] });
    expect(leerVitrina({ ve_costos: true, tiendas: [{ id: "lim", nombre: "Tienda Lima" }, { id: 3 }], modelos: [JSON_EMMA, { id: "roto" }] })).toMatchObject({
      veCostos: true,
      tiendas: [{ id: "lim", nombre: "Tienda Lima" }],
      modelos: [{ id: "e1" }],
    });
  });
});

describe("lo que dice cada fila", () => {
  it("se ve en la web solo si está encendido y se puede vender", () => {
    expect(seVeEnLaWeb(emma)).toBe(true);
    expect(seVeEnLaWeb(modelo({ publicable: false }))).toBe(false);
    expect(seVeEnLaWeb(modelo({ vitrina: { ...emma.vitrina!, publicado: false } }))).toBe(false);
    expect(seVeEnLaWeb(modelo({ vitrina: null }))).toBe(false);
  });

  it("el precio web de hoy, o el de tienda para encenderlo", () => {
    expect(precioWebDe(emma)).toBe(74.9);
    expect(precioWebDe(modelo({ vitrina: null }))).toBe(79.9);
  });

  it("lo libre en las tiendas, y en cada una con su nombre corto", () => {
    expect(libreEnTiendas(emma)).toBe(6);
    expect(libreEnTiendas(modelo({ stock: [{ ubicacionId: "x", cantidad: -2 }] }))).toBe(0);
    expect(stockEnTiendas(emma, [{ id: "tru", nombre: "Tienda Trujillo" }, { id: "lim", nombre: "Tienda Lima" }, { id: "aqp", nombre: "Tienda Arequipa" }])).toEqual([
      { sede: "Trujillo", cantidad: 0 },
      { sede: "Lima", cantidad: 6 },
      { sede: "Arequipa", cantidad: 0 },
    ]);
  });

  it("los colores sin foto propia", () => {
    expect(coloresSinFoto(emma)).toBe(1);
  });

  it("el precio con campaña es la cuenta de la caja (ADR-0403): baja al múltiplo de S/ 0.10", () => {
    expect(precioConCampana(79.9, 20)).toBe(63.9);
    expect(precioConCampana(89.9, 20)).toBe(71.9);
    expect(precioConCampana(70, 10)).toBe(63);
    expect(precioConCampana(74.9, null)).toBe(74.9);
    for (const [precio, pct] of [[79.9, 12], [149.9, 15], [64.9, 33.33]] as const) {
      expect(precioConCampana(precio, pct)).toBe(Math.round((precio - descuentoUnitarioPorPorcentaje(precio, pct)) * 100) / 100);
    }
  });

  it("el margen sin IGV, y sin costo nada", () => {
    expect(margenSinIgv(118, 50)).toBeCloseTo(0.5, 5);
    expect(margenSinIgv(74.9, null)).toBeNull();
    expect(margenSinIgv(74.9, 0)).toBeNull();
  });

  it("en la fila, la diferencia corta: igual, −S/ o +S/", () => {
    expect(diferenciaCorta(79.9, 79.9)).toBe("igual");
    expect(diferenciaCorta(74.9, 79.9)).toBe("−S/ 5.00");
    expect(diferenciaCorta(84.9, 79.9)).toBe("+S/ 5.00");
    expect(diferenciaCorta(74.9, null)).toBeNull();
  });

  it("frente a la tienda: igual, menos o más, con su %", () => {
    expect(frenteATienda(79.9, 79.9)).toBe("igual");
    expect(frenteATienda(74.9, 79.9)).toBe("S/ 5.00 menos (−6 %)");
    expect(frenteATienda(84.9, 79.9)).toBe("S/ 5.00 más (+6 %)");
    expect(frenteATienda(74.9, null)).toBeNull();
  });

  it("Lo nuevo dice qué hace cada modo", () => {
    expect(textoLoNuevo("automatico")).toMatch(/30 días/);
    expect(textoLoNuevo("fijo")).toMatch(/hasta que lo quites/);
    expect(textoLoNuevo("quitado")).toMatch(/no sale/);
  });
});

describe("cifras y filtros", () => {
  const sinStock = modelo({ id: "s", nombre: "Falda Renata", codigo: "FAL-0001", categoria: "Faldas", stock: [{ ubicacionId: "lim", cantidad: 0 }] });
  const oculto = modelo({ id: "o", nombre: "Vestido Sofía", codigo: "VES-0001", categoria: "Vestidos", vitrina: null });
  const todos = [emma, sinStock, oculto];

  it("cuántos se ven, de cuántos, y cuántos se ven sin nada que separar", () => {
    expect(cifrasDe(todos)).toEqual({ seVen: 2, total: 3, sinStock: 1 });
  });

  it("filtra por lo que se ve, por lo que no tiene stock y por texto sin tildes", () => {
    expect(filtrarVitrina(todos, "todos", "").map((m) => m.id)).toEqual(["e1", "s", "o"]);
    expect(filtrarVitrina(todos, "en_la_web", "").map((m) => m.id)).toEqual(["e1", "s"]);
    expect(filtrarVitrina(todos, "sin_stock", "").map((m) => m.id)).toEqual(["s"]);
    expect(filtrarVitrina(todos, "todos", "sofia").map((m) => m.id)).toEqual(["o"]);
    expect(filtrarVitrina(todos, "todos", "fal-0001").map((m) => m.id)).toEqual(["s"]);
    expect(filtrarVitrina(todos, "en_la_web", "vestido")).toEqual([]);
  });
});

describe("la hoja de un modelo", () => {
  it("el precio como lo escribe una persona", () => {
    expect(precioWebDeTexto("74.90")).toBe(74.9);
    expect(precioWebDeTexto("74,9")).toBe(74.9);
    expect(precioWebDeTexto("S/ 74.90")).toBe(74.9);
    for (const malo of ["", "0", "-5", "74.999", "abc", "100000"]) expect(precioWebDeTexto(malo), malo).toBeNull();
  });

  it("qué le falta al precio: vacío, inválido o bajo el costo (solo si se conoce el costo)", () => {
    expect(problemaDePrecioWeb("", 35)).toBe("Escribe el precio web.");
    expect(problemaDePrecioWeb("0", 35)).toMatch(/mayor que cero/);
    expect(problemaDePrecioWeb("30", 35)).toMatch(/por debajo/);
    expect(problemaDePrecioWeb("35", 35)).toBeNull();
    expect(problemaDePrecioWeb("30", null)).toBeNull();
  });

  it("la descripción: limpia, y vacía si es la del catálogo", () => {
    expect(descripcionParaGuardar("  Lino   liviano ", "Otra")).toBe("Lino liviano");
    expect(descripcionParaGuardar("   ", "Otra")).toBeNull();
    expect(descripcionParaGuardar("Blusa manga larga,  cuello redondo", "Blusa manga larga, cuello redondo")).toBeNull();
  });
});

describe("el lote", () => {
  it("bajar o subir en soles o en %, al céntimo", () => {
    expect(nuevoPrecioLote(79.9, "bajar", "soles", 10)).toBe(69.9);
    expect(nuevoPrecioLote(79.9, "subir", "soles", 5)).toBe(84.9);
    expect(nuevoPrecioLote(100, "bajar", "pct", 15)).toBe(85);
    expect(nuevoPrecioLote(79.9, "subir", "pct", 10)).toBe(87.89);
  });

  it("si queda en cero o menos, o sin valor, no hay precio nuevo", () => {
    expect(nuevoPrecioLote(20, "bajar", "soles", 20)).toBeNull();
    expect(nuevoPrecioLote(20, "bajar", "soles", 25)).toBeNull();
    expect(nuevoPrecioLote(20, "bajar", "soles", 0)).toBeNull();
    expect(nuevoPrecioLote(99999, "subir", "soles", 5)).toBeNull();
  });

  it("cuánto: un monto o un % positivo; para bajar, menos de 100 %", () => {
    expect(valorDeLote("10", "bajar", "soles")).toBe(10);
    expect(valorDeLote("12,5", "bajar", "pct")).toBe(12.5);
    expect(valorDeLote("15 %", "subir", "pct")).toBe(15);
    expect(valorDeLote("100", "bajar", "pct")).toBeNull();
    expect(valorDeLote("150", "subir", "pct")).toBe(150);
    for (const malo of ["", "0", "-3", "1.234", "x"]) expect(valorDeLote(malo, "bajar", "soles"), malo).toBeNull();
  });
});

describe("lo que dice la base, en palabras de tienda", () => {
  it("cada código de la vitrina tiene su título, y el detalle es la frase de la base", () => {
    expect(errorDeVitrina("vitrina_precio_bajo_costo Ese precio web queda por debajo")).toEqual({ titulo: "Ese precio queda bajo el costo", detalle: "Ese precio web queda por debajo" });
    expect(errorDeVitrina("vitrina_cambio_otro Este modelo cambió")).toMatchObject({ titulo: "Otra persona lo cambió", releer: true });
    expect(errorDeVitrina("Tu rol no tiene el módulo «Vitrina web». vitrina_web_sin_modulo")?.titulo).toBe("Tu rol no tiene la Vitrina web");
    for (const codigo of ["vitrina_precio_invalido", "vitrina_no_publicable", "vitrina_sin_precio", "vitrina_no_existe", "vitrina_datos_invalidos"]) {
      expect(errorDeVitrina(`${codigo} algo`)?.titulo, codigo).toBeTruthy();
    }
    expect(errorDeVitrina("relation does not exist")).toBeNull();
  });
});

describe("la guía de foco no agrega reglas", () => {
  const listo = { responsableListo: true, responsableMotivo: null };

  it("el precio de la hoja «falta» exactamente cuando la regla del precio lo rechaza", () => {
    for (const [precio, costo] of [["", 35], ["0", 35], ["30", 35], ["35", 35], ["74.90", null], ["74.999", null]] as const) {
      const c = camposDeModelo({ precio, costo, descripcion: "", ...listo }).find((x) => x.id === "precio")!;
      expect(c.hecho, `${precio}/${costo}`).toBe(problemaDePrecioWeb(precio, costo) === null);
    }
  });

  it("la descripción es opcional y el responsable, requerido", () => {
    const campos = camposDeModelo({ precio: "74.90", costo: 35, descripcion: "", responsableListo: false, responsableMotivo: null });
    expect(campos.find((c) => c.id === "descripcion")?.requerido).toBe(false);
    expect(campos.find((c) => c.id === "responsable")).toMatchObject({ requerido: true, hecho: false });
  });

  it("el lote de precios: «cuánto» falta si no es válido o si deja a alguno sin precio", () => {
    const cuanto = (valor: string, sinPrecio = 0) => camposDeLotePrecio({ valor, direccion: "bajar", unidad: "soles", sinPrecio, ...listo })[0];
    expect(cuanto("").hecho).toBe(false);
    expect(cuanto("10").hecho).toBe(true);
    expect(cuanto("10", 1)).toMatchObject({ hecho: false, pendiente: expect.stringMatching(/cero o menos/) });
    expect(camposDeLoteMostrar(listo)).toEqual([expect.objectContaining({ id: "responsable", hecho: true })]);
  });
});
