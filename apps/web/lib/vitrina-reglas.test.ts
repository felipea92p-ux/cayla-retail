import { describe, expect, it } from "vitest";
import {
  categoriasDe,
  cifrasDe,
  coloresSinFoto,
  contarPorEstado,
  descripcionParaGuardar,
  errorDeVitrina,
  esEmpaque,
  esEncendidoSinPrecio,
  filtrarVitrina,
  filtrosDeLaUrl,
  hrefVitrina,
  interruptorEncendido,
  leerVitrina,
  libreEnTiendas,
  MODELOS_POR_PAGINA,
  modeloDeJson,
  modoDeLista,
  queLePasa,
  razonNoSeMuestra,
  seVeEnLaWeb,
  stockEnTiendas,
  textoLoNuevo,
  type ModeloVitrina,
} from "./vitrina-reglas";
import { paginar } from "./paginacion";
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

describe("filtros por estado, categoría y Lo nuevo (Ola 1 de Tienda web)", () => {
  const sinPrecio = modelo({ id: "p", nombre: "Collar Perla", categoria: "Collares", publicable: false, porQueNo: "sin_precio" });
  const sinPrecioApagado = modelo({ id: "pa", nombre: "Collar Luna", categoria: "Collares", publicable: false, porQueNo: "sin_precio", vitrina: { ...emma.vitrina!, publicado: false } });
  const apagado = modelo({ id: "a", nombre: "Falda Renata", categoria: "Faldas", vitrina: { ...emma.vitrina!, publicado: false, enLoNuevo: "quitado" } });
  const nunca = modelo({ id: "n", nombre: "Vestido Sofía", categoria: "Vestidos", vitrina: null });
  const bolsa = modelo({ id: "b", nombre: "Bolsa Kraft", categoria: "Bolsas", publicable: false, porQueNo: "empaque", vitrina: { ...emma.vitrina!, publicado: false } });
  const sinStock = modelo({ id: "s", nombre: "Polo Abril", categoria: "Camisas y Blusas", stock: [{ ubicacionId: "lim", cantidad: 0 }], vitrina: { ...emma.vitrina!, enLoNuevo: "automatico" } });
  const todos = [emma, sinPrecio, sinPrecioApagado, apagado, nunca, bolsa, sinStock];
  const ids = (ms: ModeloVitrina[]) => ms.map((m) => m.id);

  it("«sin precio» es lo mismo que cuenta el Resumen: encendidos que no se ven, no los apagados ni el empaque", () => {
    expect(ids(filtrarVitrina(todos, "sin_precio", ""))).toEqual(["p"]);
    expect(todos.filter(esEncendidoSinPrecio).map((m) => m.id)).toEqual(["p"]);
  });

  it("«ocultos» es lo que alguien apagó o nunca encendió; el empaque no, porque no se puede prender", () => {
    expect(ids(filtrarVitrina(todos, "ocultos", ""))).toEqual(["pa", "a", "n"]);
  });

  it("la categoría y Lo nuevo se suman al estado y al texto", () => {
    expect(ids(filtrarVitrina(todos, "todos", "", { categoria: "Collares" }))).toEqual(["p", "pa"]);
    expect(ids(filtrarVitrina(todos, "ocultos", "", { categoria: "Collares" }))).toEqual(["pa"]);
    expect(ids(filtrarVitrina(todos, "todos", "", { loNuevo: "fijo" }))).toEqual(["e1", "p", "pa"]);
    expect(ids(filtrarVitrina(todos, "todos", "", { loNuevo: "quitado" }))).toEqual(["a"]);
    expect(ids(filtrarVitrina(todos, "todos", "luna", { categoria: "Collares" }))).toEqual(["pa"]);
    // «Todos» no trae el empaque (queda uno menos). Sin la ficha de la vitrina, Lo nuevo es automático.
    expect(ids(filtrarVitrina(todos, "todos", "", { loNuevo: "todos" }))).toHaveLength(todos.length - 1);
  });

  it("cuenta cada estado para la lista de la píldora, ya con la categoría y Lo nuevo puestas", () => {
    expect(contarPorEstado(todos)).toEqual({ todos: 6, en_la_web: 2, sin_stock: 1, sin_precio: 1, ocultos: 3, empaque: 1 });
    expect(contarPorEstado(todos, { categoria: "Collares" })).toEqual({ todos: 2, en_la_web: 0, sin_stock: 0, sin_precio: 1, ocultos: 1, empaque: 0 });
  });

  it("«todos» es solo ropa: el empaque no ocupa la lista y se ve con su propio filtro", () => {
    expect(ids(filtrarVitrina(todos, "todos", ""))).not.toContain("b");
    expect(ids(filtrarVitrina(todos, "empaque", ""))).toEqual(["b"]);
    expect(ids(filtrarVitrina(todos, "empaque", "kraft"))).toEqual(["b"]);
    expect(ids(filtrarVitrina(todos, "empaque", "", { categoria: "Collares" }))).toEqual([]);
    // La búsqueda de ropa no encuentra una bolsa: sin el filtro Empaque no hay forma de verla por error en un lote.
    expect(filtrarVitrina(todos, "todos", "kraft")).toEqual([]);
    // «De N modelos» no cuenta el empaque.
    expect(cifrasDe(todos).total).toBe(6);
  });

  it("las categorías, de la A a la Z y con su cuenta; sin categoría no entra", () => {
    expect(categoriasDe([...todos, modelo({ id: "x", categoria: null })])).toEqual([
      { nombre: "Bolsas", modelos: 1 },
      { nombre: "Camisas y Blusas", modelos: 2 },
      { nombre: "Collares", modelos: 2 },
      { nombre: "Faldas", modelos: 1 },
      { nombre: "Vestidos", modelos: 1 },
    ]);
  });

  it("lee los filtros de la dirección y un valor raro abre la lista completa", () => {
    expect(filtrosDeLaUrl({ filtro: "sin_precio", categoria: "Blusas", lonuevo: "fijo" })).toEqual({ estado: "sin_precio", categoria: "Blusas", loNuevo: "fijo" });
    expect(filtrosDeLaUrl({})).toEqual({ estado: "todos", categoria: null, loNuevo: "todos" });
    expect(filtrosDeLaUrl({ filtro: "cualquier-cosa", lonuevo: "siempre", categoria: "  " })).toEqual({ estado: "todos", categoria: null, loNuevo: "todos" });
    expect(filtrosDeLaUrl({ filtro: ["sin_stock", "ocultos"] }).estado).toBe("sin_stock");
  });

  it("los enlaces del Resumen llevan a la Vitrina ya filtrada, y lo que arman se lee igual al llegar", () => {
    expect(hrefVitrina("todos")).toBe("/tienda-web/vitrina");
    expect(hrefVitrina("sin_precio")).toBe("/tienda-web/vitrina?filtro=sin_precio");
    for (const f of ["en_la_web", "sin_stock", "sin_precio", "ocultos"] as const) {
      expect(filtrosDeLaUrl({ filtro: new URL(hrefVitrina(f), "http://x").searchParams.get("filtro") ?? undefined }).estado).toBe(f);
    }
  });
});

describe("la lista de la Vitrina llega de 40 en 40", () => {
  const muchos = Array.from({ length: 59 }, (_, i) => modelo({ id: `m${i}`, nombre: `Modelo ${i}` }));

  it("40 por página: dos páginas para 59, con lo que se ve de cada una", () => {
    expect(MODELOS_POR_PAGINA).toBe(40);
    const p1 = paginar(filtrarVitrina(muchos, "todos", ""), 1, MODELOS_POR_PAGINA);
    expect(p1).toMatchObject({ pagina: 1, totalPaginas: 2, desde: 1, hasta: 40 });
    const p2 = paginar(filtrarVitrina(muchos, "todos", ""), 2, MODELOS_POR_PAGINA);
    expect(p2).toMatchObject({ pagina: 2, desde: 41, hasta: 59 });
    expect(p2.filas.at(-1)!.id).toBe("m58");
  });

  it("un filtro que deja pocos cabe en una página, y una página que ya no existe vuelve a la última", () => {
    expect(paginar(filtrarVitrina(muchos, "todos", "Modelo 5"), 1, MODELOS_POR_PAGINA).totalPaginas).toBe(1);
    expect(paginar(muchos, 9, MODELOS_POR_PAGINA).pagina).toBe(2);
  });
});

describe("la Lista: una columna por tienda en pantalla grande, las filas de siempre si no cabe", () => {
  /** El ancho más chico de la tarjeta con el que la Lista pasa a columnas, para esas tiendas. */
  const umbral = (tiendas: number) => Array.from({ length: 3000 }, (_, w) => w).find((w) => modoDeLista(w, tiendas) === "columnas");

  it("sin medir todavía (ancho 0) o angosta, son las filas de siempre", () => {
    expect(modoDeLista(0, 3)).toBe("filas");
    expect(modoDeLista(700, 3)).toBe("filas");
  });

  it("con 3 tiendas pasa a columnas desde ~1030 px de tarjeta: una laptop de 1366 sí (1052 px) y una de 1280 no (968 px)", () => {
    expect(umbral(3)).toBeGreaterThan(900);
    expect(umbral(3)).toBeLessThanOrEqual(1052);
    expect(modoDeLista(1052, 3)).toBe("columnas");
    expect(modoDeLista(968, 3)).toBe("filas");
    expect(modoDeLista(1600, 3)).toBe("columnas");
  });

  it("cada tienda de más pide más ancho, y con más de 8 tiendas son filas aunque la pantalla sea enorme", () => {
    for (let n = 1; n < 8; n++) expect(umbral(n + 1)!).toBeGreaterThan(umbral(n)!);
    expect(modoDeLista(1700, 8)).toBe("columnas");
    expect(modoDeLista(5000, 9)).toBe("filas");
    expect(modoDeLista(5000, 0)).toBe("filas");
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
    expect(razonNoSeMuestra(modelo({ publicable: false, porQueNo: "no_se_vende", vitrina: null }))?.frase).toBe(
      "No se puede mostrar: está descontinuado, es de prueba o no tiene tallas activas.",
    );
    // Una base sin el porqué (anterior a 20261015122000): la razón de siempre, que también nombra el precio.
    expect(razonNoSeMuestra(modelo({ publicable: false, porQueNo: null }))).toMatchObject({
      chip: "Ya no se vende: no se ve",
      tono: "ambar",
      frase: expect.stringMatching(/tallas activas con precio/),
    });
    expect(interruptorEncendido(emma)).toBe(true);
    expect(interruptorEncendido(modelo({ publicable: false, porQueNo: "no_se_vende" }))).toBe(true);
  });

  it("sin precio en ninguna tienda de la web (el precio es el de la tienda, Felipe 2026-10-15): la fila dice «Sin precio» y la hoja dónde ponérselo, no «descontinuado»", () => {
    const sinPrecio = modelo({ publicable: false, porQueNo: "sin_precio", vitrina: null });
    const sinPrecioEncendido = modelo({ publicable: false, porQueNo: "sin_precio" });
    expect(razonNoSeMuestra(sinPrecio)).toEqual({
      chip: "Sin precio",
      tono: "ambar",
      frase:
        "No se puede mostrar: no tiene precio en ninguna tienda que se ve en la web. Ponle precio en su ficha, en Catálogo ▸ Productos: el de la prenda o el de una de esas tiendas.",
    });
    expect(razonNoSeMuestra(sinPrecioEncendido)?.chip).toBe("Sin precio: no se ve");
    expect(razonNoSeMuestra(sinPrecio)?.frase).not.toMatch(/descontinuado/);
    // Mostrar no lo cambia y dice por qué; el que quedó encendido sigue sin verse; ocultarlo solo lo apaga.
    expect(queLePasa(sinPrecio, "mostrar")).toEqual({ texto: "No se puede mostrar: sin precio en las tiendas de la web", cambia: false });
    expect(queLePasa(sinPrecioEncendido, "mostrar")).toEqual({ texto: "Sin precio en la web: no se ve", cambia: false });
    expect(queLePasa(sinPrecioEncendido, "ocultar")).toEqual({ texto: "Se apaga: ya no se veía", cambia: true });
    expect(seVeEnLaWeb(sinPrecioEncendido)).toBe(false);
    // Los otros porqués en el lote: descontinuado o de prueba, y una base sin el porqué (la razón de siempre).
    expect(queLePasa(modelo({ publicable: false, porQueNo: "no_se_vende", vitrina: null }), "mostrar").texto).toBe(
      "No se puede mostrar: descontinuado, de prueba o sin tallas activas",
    );
    expect(queLePasa(modelo({ publicable: false, porQueNo: null, vitrina: null }), "mostrar").texto).toBe(
      "No se puede mostrar: descontinuado, de prueba o sin tallas con precio",
    );
  });

  it("mostrar el empaque no lo cambia (y dice por qué); ocultar el que quedó encendido solo lo apaga", () => {
    expect(queLePasa(bolsa, "mostrar")).toEqual({ texto: "No es ropa: se vende en la caja", cambia: false });
    expect(queLePasa(bolsaDeAntes, "mostrar")).toEqual({ texto: "No es ropa: se vende en la caja", cambia: false });
    expect(queLePasa(bolsaDeAntes, "ocultar")).toEqual({ texto: "Se apaga: ya no se veía", cambia: true });
    expect(queLePasa(bolsa, "ocultar")).toMatchObject({ cambia: false });
  });

  it("la cifra «se ven en la web» no cuenta el empaque, aunque haya quedado encendido", () => {
    expect(cifrasDe([emma, bolsa, bolsaDeAntes])).toMatchObject({ seVen: 1, total: 1 });
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
