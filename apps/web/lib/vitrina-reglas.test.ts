import { describe, expect, it } from "vitest";
import {
  cifrasDe,
  coloresSinFoto,
  descripcionParaGuardar,
  errorDeVitrina,
  esEmpaque,
  filtrarVitrina,
  interruptorEncendido,
  leerVitrina,
  libreEnTiendas,
  modeloDeJson,
  queLePasa,
  razonNoSeMuestra,
  seVeEnLaWeb,
  stockEnTiendas,
  textoLoNuevo,
  type ModeloVitrina,
} from "./vitrina-reglas";
import { camposDeLoteMostrar, camposDeModelo } from "./vitrina-guia";

// Un modelo tal como lo devuelve `retail.fn_vitrina_modelos()` (20261014225000). Sin precio ni costo: el precio es el de cada tienda.
const JSON_EMMA = {
  id: "e1",
  codigo: "CMS-0001",
  nombre: "Blusa Emma",
  descripcion: "Blusa manga larga, cuello redondo",
  categoria: "Camisas y Blusas",
  prefijo: "CMS",
  familia: "indumentaria",
  publicable: true,
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
  vitrina: {
    publicado: true,
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
      tallas: 3,
      vitrina: { publicado: true, enLoNuevo: "fijo", version: 3, actualizadoPor: "Felipe Pereyra" },
    });
    expect(emma.colores.map((c) => c.codigo)).toEqual(["BEI", "NEG"]);
    expect(emma.stock).toEqual([
      { ubicacionId: "lim", cantidad: 6 },
      { ubicacionId: "tru", cantidad: 0 },
    ]);
  });

  it("los números que Postgres manda como texto también se leen", () => {
    const m = modeloDeJson({ ...JSON_EMMA, tallas: "3", vitrina: { ...JSON_EMMA.vitrina, version: "3" } });
    expect(m?.tallas).toBe(3);
    expect(m?.vitrina?.version).toBe(3);
  });

  it("un modelo que nunca estuvo en la vitrina", () => {
    expect(modeloDeJson({ ...JSON_EMMA, vitrina: null })?.vitrina).toBeNull();
  });

  it("un dato raro no tumba la pantalla: se descarta o queda vacío", () => {
    expect(modeloDeJson(null)).toBeNull();
    expect(modeloDeJson({ id: "x" })).toBeNull();
    expect(modeloDeJson({ ...JSON_EMMA, vitrina: { publicado: true } })?.vitrina).toBeNull();
    expect(modeloDeJson({ ...JSON_EMMA, vitrina: { ...JSON_EMMA.vitrina, en_lo_nuevo: "siempre" } })?.vitrina?.enLoNuevo).toBe("automatico");
    expect(modeloDeJson({ ...JSON_EMMA, colores: "x", stock: [{ cantidad: 3 }] })).toMatchObject({ colores: [], stock: [] });
    expect(leerVitrina("x")).toEqual({ tiendas: [], modelos: [] });
    expect(leerVitrina({ tiendas: [{ id: "lim", nombre: "Tienda Lima" }, { id: 3 }], modelos: [JSON_EMMA, { id: "roto" }] })).toMatchObject({
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
  it("la descripción: limpia, y vacía si es la del catálogo", () => {
    expect(descripcionParaGuardar("  Lino   liviano ", "Otra")).toBe("Lino liviano");
    expect(descripcionParaGuardar("   ", "Otra")).toBeNull();
    expect(descripcionParaGuardar("Blusa manga larga,  cuello redondo", "Blusa manga larga, cuello redondo")).toBeNull();
  });
});

describe("mostrar u ocultar: lo que le pasa a cada uno (lo mismo que hace `vitrina_mostrar`)", () => {
  const nunca = modelo({ vitrina: null });
  const oculto = modelo({ vitrina: { ...emma.vitrina!, publicado: false } });
  const descontinuado = modelo({ publicable: false, vitrina: null });

  it("mostrar: el que no se ve entra, el que ya se ve no cambia y el que no se puede vender no entra", () => {
    expect(queLePasa(nunca, "mostrar")).toEqual({ texto: "Se verá en la web", cambia: true });
    expect(queLePasa(oculto, "mostrar")).toEqual({ texto: "Se verá en la web", cambia: true });
    expect(queLePasa(emma, "mostrar")).toMatchObject({ texto: "Ya se ve", cambia: false });
    expect(queLePasa(descontinuado, "mostrar")).toMatchObject({ cambia: false, texto: expect.stringMatching(/No se puede mostrar/) });
    expect(queLePasa(modelo({ publicable: false }), "mostrar")).toMatchObject({ cambia: false, texto: expect.stringMatching(/no se ve/) });
  });

  it("ocultar: solo cambia el que se ve", () => {
    expect(queLePasa(emma, "ocultar")).toEqual({ texto: "Deja de verse", cambia: true });
    expect(queLePasa(oculto, "ocultar")).toMatchObject({ cambia: false });
    expect(queLePasa(nunca, "ocultar")).toMatchObject({ cambia: false });
  });
});

describe("solo ropa en la web (Felipe 2026-10-15): el empaque se vende en la caja", () => {
  // Una bolsa como la devuelve la base desde 20261015122000: no se puede mostrar y dice por qué.
  const JSON_BOLSA = { ...JSON_EMMA, id: "b1", nombre: "Bolsa de papel CAYLA", categoria: "Bolsas", publicable: false, por_que_no: "empaque", vitrina: null };
  const bolsa = modeloDeJson(JSON_BOLSA)!;
  // La que quedó encendida antes de la regla: su fila de la Vitrina sigue «publicada», pero ya no se ve.
  const bolsaDeAntes = modeloDeJson({ ...JSON_BOLSA, vitrina: JSON_EMMA.vitrina })!;

  it("lee el porqué de la base; uno que se puede mostrar no tiene porqué, y un dato raro o una base sin el campo no inventan uno", () => {
    expect(bolsa.porQueNo).toBe("empaque");
    expect(emma.porQueNo).toBeNull();
    expect(modeloDeJson({ ...JSON_EMMA, por_que_no: "empaque" })?.porQueNo).toBeNull();
    expect(modeloDeJson({ ...JSON_BOLSA, por_que_no: "porque sí" })?.porQueNo).toBeNull();
    expect(modeloDeJson({ ...JSON_BOLSA, por_que_no: undefined })?.porQueNo).toBeNull();
    expect(modeloDeJson({ ...JSON_BOLSA, por_que_no: "sin_precio" })?.porQueNo).toBe("sin_precio");
  });

  it("el empaque: la fila dice «Solo en la caja» (sin alarma), la hoja explica que no es ropa y el interruptor queda apagado, también el que estaba encendido", () => {
    expect(esEmpaque(bolsa)).toBe(true);
    expect(razonNoSeMuestra(bolsa)).toEqual({
      chip: "Solo en la caja",
      tono: "neutro",
      frase: "No va en la web: no es ropa (es empaque, como las bolsas). Se vende desde el ticket, en la caja.",
    });
    expect(interruptorEncendido(bolsa)).toBe(false);
    expect(interruptorEncendido(bolsaDeAntes)).toBe(false);
    expect(seVeEnLaWeb(bolsaDeAntes)).toBe(false);
  });

  it("las otras razones siguen como estaban (ámbar), y lo que se puede mostrar no tiene razón", () => {
    expect(razonNoSeMuestra(emma)).toBeNull();
    expect(razonNoSeMuestra(modelo({ publicable: false, porQueNo: "no_se_vende", vitrina: null }))).toMatchObject({ chip: "No se puede vender", tono: "ambar" });
    expect(razonNoSeMuestra(modelo({ publicable: false, porQueNo: null }))).toMatchObject({ chip: "Ya no se vende: no se ve", tono: "ambar" });
    expect(razonNoSeMuestra(modelo({ publicable: false, porQueNo: "sin_precio" }))?.frase).toMatch(/tallas activas con precio/);
    expect(interruptorEncendido(emma)).toBe(true);
    expect(interruptorEncendido(modelo({ publicable: false, porQueNo: "no_se_vende" }))).toBe(true);
  });

  it("mostrar el empaque no lo cambia (y dice por qué); ocultar el que quedó encendido solo lo apaga", () => {
    expect(queLePasa(bolsa, "mostrar")).toEqual({ texto: "No es ropa: se vende en la caja", cambia: false });
    expect(queLePasa(bolsaDeAntes, "mostrar")).toEqual({ texto: "No es ropa: se vende en la caja", cambia: false });
    expect(queLePasa(bolsaDeAntes, "ocultar")).toEqual({ texto: "Se apaga: ya no se veía", cambia: true });
    expect(queLePasa(bolsa, "ocultar")).toMatchObject({ cambia: false });
  });

  it("la cifra «se ven en la web» no cuenta el empaque, aunque haya quedado encendido", () => {
    expect(cifrasDe([emma, bolsa, bolsaDeAntes])).toMatchObject({ seVen: 1, total: 3 });
    expect(filtrarVitrina([emma, bolsa, bolsaDeAntes], "en_la_web", "").map((m) => m.id)).toEqual(["e1"]);
  });
});

describe("lo que dice la base, en palabras de tienda", () => {
  it("cada código de la vitrina tiene su título, y el detalle es la frase de la base", () => {
    expect(errorDeVitrina("vitrina_no_publicable «Blusa Emma» no se puede mostrar")).toEqual({ titulo: "No se puede mostrar en la web", detalle: "«Blusa Emma» no se puede mostrar" });
    expect(errorDeVitrina("vitrina_cambio_otro Este modelo cambió")).toMatchObject({ titulo: "Otra persona lo cambió", releer: true });
    expect(errorDeVitrina("Tu rol no tiene el módulo «Vitrina web». vitrina_web_sin_modulo")?.titulo).toBe("Tu rol no tiene la Vitrina web");
    for (const codigo of ["vitrina_no_existe", "vitrina_datos_invalidos"]) {
      expect(errorDeVitrina(`${codigo} algo`)?.titulo, codigo).toBeTruthy();
    }
    expect(errorDeVitrina("relation does not exist")).toBeNull();
  });
});

describe("la guía de foco no agrega reglas", () => {
  it("en la hoja de un modelo solo «quién lo cambia» es requerido; la descripción es opcional", () => {
    const campos = camposDeModelo({ descripcion: "", responsableListo: false, responsableMotivo: null });
    expect(campos.map((c) => [c.id, c.requerido])).toEqual([
      ["descripcion", false],
      ["responsable", true],
    ]);
    expect(campos.find((c) => c.id === "responsable")).toMatchObject({ hecho: false, pendiente: "Elige quién hace el cambio." });
    expect(camposDeModelo({ descripcion: "Lino", responsableListo: true, responsableMotivo: null }).every((c) => c.hecho)).toBe(true);
  });

  it("mostrar u ocultar: solo quién lo cambia", () => {
    expect(camposDeLoteMostrar({ responsableListo: true, responsableMotivo: null })).toEqual([expect.objectContaining({ id: "responsable", hecho: true })]);
  });
});
