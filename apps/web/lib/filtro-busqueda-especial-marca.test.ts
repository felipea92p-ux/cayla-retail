import { describe, expect, it } from "vitest";
import casos from "./filtro-busqueda-especial.casos.json";
import {
  crearIndiceBusquedaEspecial,
  filtrarConBusquedaEspecial,
  interpretarBusquedaEspecial,
  normalizarCamposBuscables,
  type CamposBuscables,
} from "./filtro-busqueda-especial";

// Marca y categoría en el buscador (2026-09-26, Existencias). Estas pruebas NO viven en
// `filtro-busqueda-especial.casos.json` a propósito: ese archivo lo lee también la prueba de Postgres
// (Movimientos) y la copia en SQL todavía no busca por marca ni categoría. Cuando se escriba esa migración,
// los escenarios de aquí que no dependan del orden pasan al JSON compartido.

type Fila = { id: string; producto: string; marca: string | null; categoria: string | null; color: string; talla: string; codigo: string };

// Los productos reales de Tienda TRU (2026-09-26): «CAYLA» y «Cayla 2» son DOS marcas.
const FILAS: Fila[] = [
  { id: "aurora-negro-s", producto: "Top Aurora", marca: "Cayla 2", categoria: "Tops", color: "Negro", talla: "S", codigo: "TOP-0001-NEG-S" },
  { id: "aurora-negro-m", producto: "Top Aurora", marca: "Cayla 2", categoria: "Tops", color: "Negro", talla: "M", codigo: "TOP-0001-NEG-M" },
  { id: "carlita-dorado-m", producto: "Blusa Carlita", marca: "Doradas Chic", categoria: "Camisas y Blusas", color: "Dorado", talla: "M", codigo: "BLU-0002-DOR-M" },
  { id: "carlita-negro-m", producto: "Blusa Carlita", marca: "Doradas Chic", categoria: "Camisas y Blusas", color: "Negro", talla: "M", codigo: "BLU-0002-NEG-M" },
  { id: "xd-blanco-l", producto: "Blusa Xd", marca: "Artemisa", categoria: "Blazers", color: "Blanco", talla: "L", codigo: "BLU-0003-BLA-L" },
  { id: "basico-manga-larga-blanco-m", producto: "Básico Manga Larga", marca: "Miramhe", categoria: "Polos", color: "Blanco", talla: "M", codigo: "POL-0005-BLA-M" },
  { id: "polo-basico-blanco-m", producto: "Polo Básico M/corta", marca: "Miramhe", categoria: "Polos", color: "Blanco", talla: "M", codigo: "POL-0002-BLA-M" },
  { id: "jean-baggy-azul-30", producto: "Jean Baggy", marca: "Wayi", categoria: "Jeans", color: "Azul", talla: "30", codigo: "JEA-0004-AZU-30" },
];

const leer = (f: Fila): CamposBuscables => ({
  nombre: f.producto,
  sku: f.codigo,
  codigosBarras: [],
  color: f.color,
  talla: f.talla,
  marca: f.marca,
  categoria: f.categoria,
});

const INDICE = crearIndiceBusquedaEspecial(FILAS, leer);
const buscar = (consulta: string) => filtrarConBusquedaEspecial(INDICE, consulta).filas.map((f) => f.id);
const productos = (consulta: string) => [...new Set(filtrarConBusquedaEspecial(INDICE, consulta).filas.map((f) => f.producto))];

describe("la marca se busca", () => {
  it("«cayla» trae la marca «Cayla 2» (Top Aurora): lo que Felipe escribió y no veía", () => {
    expect(productos("cayla")).toEqual(["Top Aurora"]);
    expect(buscar("CAYLA")).toEqual(["aurora-negro-s", "aurora-negro-m"]);
  });

  it("desde el inicio de una palabra, mientras se teclea: «cay», «mira»", () => {
    expect(productos("cay")).toEqual(["Top Aurora"]);
    expect(productos("mira")).toEqual(["Básico Manga Larga", "Polo Básico M/corta"]);
  });

  it("no desde la mitad de una palabra: «hamhe» o «tica» no traen Miramhe ni Artemisa", () => {
    expect(buscar("hamhe")).toEqual([]);
    expect(buscar("tica")).toEqual([]);
  });

  it("sin tildes ni mayúsculas, y una marca de dos palabras se encuentra por cualquiera: «doradas», «chic»", () => {
    expect(productos("DORADAS")).toContain("Blusa Carlita");
    expect(productos("chic")).toEqual(["Blusa Carlita"]);
  });

  it("marca y prenda juntas, en cualquier orden: «wayi jean», «jean wayi»", () => {
    expect(productos("wayi jean")).toEqual(["Jean Baggy"]);
    expect(productos("jean wayi")).toEqual(["Jean Baggy"]);
  });

  it("una marca y otra palabra que no es de esa marca no trae nada: «miramhe jean»", () => {
    expect(buscar("miramhe jean")).toEqual([]);
  });

  it("la marca no es una dimensión: no le dice al filtro visual que se ignore", () => {
    const busqueda = interpretarBusquedaEspecial("cayla", INDICE.vocabulario);
    expect(busqueda.dimensiones).toEqual({ talla: false, color: false });
  });

  it("un COLOR escrito no busca en la marca: «dorado», «dorada» y «doradas» traen solo lo dorado, no toda la marca «Doradas Chic»", () => {
    // Regresión que encontró la revisión: «dorada» empieza la palabra «doradas» de la marca y traía la blusa NEGRA. El resultado
    // dependía del género con que se escribiera el color.
    for (const consulta of ["dorado", "dorada", "doradas", "blusa dorada", "blusa doradas"]) {
      expect(buscar(consulta).filter((id) => id.startsWith("carlita"))).toEqual(["carlita-dorado-m"]);
    }
    expect(buscar("dorada")).toEqual(["carlita-dorado-m"]);
  });

  it("…y la marca se encuentra por las otras palabras que la forman: «chic» o «doradas chic»", () => {
    expect(productos("chic")).toEqual(["Blusa Carlita"]);
    expect(buscar("chic")).toEqual(["carlita-dorado-m", "carlita-negro-m"]);
    // «doradas» sigue leyéndose como color (existe el color Dorado en estas filas): se pide con «chic» → solo la dorada. Para toda la marca, el filtro Marca.
    expect(buscar("doradas chic")).toEqual(["carlita-dorado-m"]);
  });
});

describe("marca y categoría con separadores", () => {
  const filas: Fila[] = [
    { id: "lenceria", producto: "Set Encaje", marca: "Wayi-Kids", categoria: "Ropa interior/Lencería", color: "Negro", talla: "M", codigo: "SET-0001-NEG-M" },
    { id: "cuaderno", producto: "Agenda Lino", marca: "Lucky\tGirl", categoria: "Libretas/Cuadernos", color: "Beige", talla: "U", codigo: "AGE-0001-BEI-U" },
    { id: "nbsp", producto: "Blusa Sol", marca: "Doradas Chic", categoria: "Camisas y Blusas", color: "Negro", talla: "S", codigo: "BLU-0009-NEG-S" },
    { id: "yjj-1", producto: "Y.j.j", marca: "y.j.j", categoria: "Camisas y Blusas", color: "Rojo", talla: "M", codigo: "PRD-0001-ROJ-M" },
    { id: "yjj-2", producto: "Camisa con Brillos", marca: "y.j.j", categoria: "Camisas y Blusas", color: "Rojo", talla: "L", codigo: "CAM-0001-ROJ-L" },
    { id: "cayla2", producto: "Top Aurora", marca: "Cayla 2", categoria: "Tops", color: "Negro", talla: "S", codigo: "TOP-0001-NEG-S" },
  ];
  const indice = crearIndiceBusquedaEspecial(filas, leer);
  const ids = (consulta: string) => filtrarConBusquedaEspecial(indice, consulta).filas.map((f) => f.id);

  it("después de «/» empieza otra palabra: «lenceria» y «cuadernos» encuentran su categoría (con o sin tilde)", () => {
    expect(ids("lenceria")).toEqual(["lenceria"]);
    expect(ids("lencería")).toEqual(["lenceria"]);
    expect(ids("cuadernos")).toEqual(["cuaderno"]);
    expect(ids("ropa interior")).toEqual(["lenceria"]);
  });

  it("después de un guion o una tabulación también: «kids» → Wayi-Kids, «girl» → Lucky Girl", () => {
    expect(ids("kids")).toEqual(["lenceria"]);
    expect(ids("girl")).toEqual(["cuaderno"]);
  });

  it("la marca escrita sin sus puntos o espacios se encuentra: «yjj» → y.j.j, «cayla2» → Cayla 2", () => {
    expect(ids("yjj")).toEqual(["yjj-1", "yjj-2"]);
    expect(ids("y.j.j")).toEqual(["yjj-1", "yjj-2"]);
    expect(ids("cayla2")).toEqual(["cayla2"]);
  });

  it("…pero solo desde el inicio y con 3 letras o más: «jj» y «yj» no traen nada, ni un trozo del medio", () => {
    expect(ids("jj")).toEqual([]);
    expect(ids("yj")).toEqual([]);
    expect(ids("ylaa")).toEqual([]);
  });
});

describe("la categoría se busca", () => {
  it("«polos» trae la categoría Polos aunque un nombre no lo diga: «Básico Manga Larga»", () => {
    expect(productos("polos")).toEqual(["Básico Manga Larga", "Polo Básico M/corta"]);
  });

  it("«camisas» y «blazers» traen su categoría; «blusas» sigue trayendo los nombres con Blusa (y la categoría «Camisas y Blusas»)", () => {
    expect(productos("camisas")).toEqual(["Blusa Carlita"]);
    expect(productos("blazers")).toEqual(["Blusa Xd"]);
    expect(productos("blusas")).toEqual(["Blusa Carlita", "Blusa Xd"]);
  });

  it("singular y plural: «top» trae Tops y Top Aurora una sola vez", () => {
    expect(productos("top")).toEqual(["Top Aurora"]);
    expect(productos("tops")).toEqual(["Top Aurora"]);
  });
});

describe("quien no pasa marca ni categoría se comporta exactamente como antes", () => {
  const sin = (f: Fila): CamposBuscables => ({ nombre: f.producto, sku: f.codigo, codigosBarras: [], color: f.color, talla: f.talla });
  const indiceSin = crearIndiceBusquedaEspecial(FILAS, sin);
  const buscarSin = (consulta: string) => filtrarConBusquedaEspecial(indiceSin, consulta).filas.map((f) => f.id);

  it("«cayla», «miramhe» y «polos» (que solo dicen marca o categoría) no traen nada", () => {
    expect(buscarSin("cayla")).toEqual([]);
    expect(buscarSin("miramhe")).toEqual([]);
    expect(buscarSin("polos")).toEqual(["polo-basico-blanco-m"]); // el plural encuentra el NOMBRE «Polo Básico»
  });

  it("lo que ya funcionaba sigue igual: nombre, talla, color, código", () => {
    expect(buscarSin("blusa negro m")).toEqual(["carlita-negro-m"]);
    expect(buscarSin("pol-0002")).toEqual(["polo-basico-blanco-m"]);
    expect(buscarSin("jean 30")).toEqual(["jean-baggy-azul-30"]);
  });
});

describe("normalizarCamposBuscables", () => {
  it("normaliza marca y categoría sin tildes ni mayúsculas, y vacías si no llegan", () => {
    const con = normalizarCamposBuscables({ nombre: "X", sku: null, codigosBarras: [], color: null, talla: null, marca: "Doradas Chíc", categoria: "Camisas y Blusas" });
    expect(con.marca).toBe("doradas chic");
    expect(con.categoria).toBe("camisas y blusas");
    const sin = normalizarCamposBuscables({ nombre: "X", sku: null, codigosBarras: [], color: null, talla: null });
    expect(sin.marca).toBe("");
    expect(sin.categoria).toBe("");
  });
});

describe("por relevancia", () => {
  const ordenado = (consulta: string, filas: Fila[] = FILAS) => {
    const indice = crearIndiceBusquedaEspecial(filas, leer);
    return filtrarConBusquedaEspecial(indice, consulta, {}, { ordenar: "relevancia", grupo: (f) => f.producto }).filas.map((f) => f.id);
  };

  it("el nombre que empieza con lo escrito gana a la categoría: «polo» pone «Polo Básico» antes que «Básico Manga Larga»", () => {
    // Sin relevancia salen por el orden de las filas (Básico primero); con ella, el nombre manda.
    expect(buscar("polo")).toEqual(["basico-manga-larga-blanco-m", "polo-basico-blanco-m"]);
    expect(ordenado("polo")).toEqual(["polo-basico-blanco-m", "basico-manga-larga-blanco-m"]);
  });

  it("una marca escrita entera gana a un trozo dentro de un nombre", () => {
    const filas: Fila[] = [
      { id: "trozo", producto: "Vicaylana", marca: "Otra", categoria: null, color: "Rojo", talla: "M", codigo: "VIC-0001-ROJ-M" },
      ...FILAS,
    ];
    expect(ordenado("cayla", filas)).toEqual(["aurora-negro-s", "aurora-negro-m", "trozo"]);
    // Sin relevancia manda el orden de las filas, y el trozo suelto sale primero.
    const indice = crearIndiceBusquedaEspecial(filas, leer);
    expect(filtrarConBusquedaEspecial(indice, "cayla").filas.map((f) => f.id)).toEqual(["trozo", "aurora-negro-s", "aurora-negro-m"]);
  });

  it("las variantes de un producto no se separan, y siguen en su orden", () => {
    expect(ordenado("blusa").filter((id) => id.startsWith("carlita"))).toEqual(["carlita-dorado-m", "carlita-negro-m"]);
    const salida = ordenado("blusa");
    const posiciones = salida.map((id, i) => (id.startsWith("carlita") ? i : -1)).filter((i) => i >= 0);
    expect(posiciones[1] - posiciones[0]).toBe(1);
  });

  it("sin texto escrito, el orden original (y con los filtros visuales, igual que siempre)", () => {
    expect(ordenado("")).toEqual(FILAS.map((f) => f.id));
  });

  it("no cambia QUIÉN entra, solo el orden", () => {
    for (const consulta of ["polo", "cayla", "blusa negro", "m", "doradas", "polos", "xyz"]) {
      expect([...ordenado(consulta)].sort()).toEqual([...buscar(consulta)].sort());
    }
  });

  it("lo escrito tal cual gana a un singular que el motor derivó: «mias» pone la marca «Mias» antes que «Moda Mia»", () => {
    const filas: Fila[] = [
      { id: "moda-mia", producto: "Falda Uno", marca: "Moda Mia", categoria: null, color: "Rojo", talla: "M", codigo: "FAL-0001-ROJ-M" },
      { id: "mias", producto: "Falda Dos", marca: "Mias", categoria: null, color: "Rojo", talla: "M", codigo: "FAL-0002-ROJ-M" },
    ];
    expect(ordenado("mias", filas)).toEqual(["mias", "moda-mia"]);
  });

  it("un `grupo` vacío no funde filas ajenas en un solo bloque: cada fila sin grupo vale por sí misma", () => {
    const filas: Fila[] = [
      { id: "a", producto: "Polo Uno", marca: "X", categoria: null, color: "Rojo", talla: "M", codigo: "A" },
      { id: "b", producto: "Uno Polo", marca: "X", categoria: null, color: "Rojo", talla: "M", codigo: "B" },
      { id: "c", producto: "Polo Tres", marca: "X", categoria: null, color: "Rojo", talla: "M", codigo: "C" },
    ];
    const indice = crearIndiceBusquedaEspecial(filas, leer);
    const salida = filtrarConBusquedaEspecial(indice, "polo", {}, { ordenar: "relevancia", grupo: () => "" }).filas.map((f) => f.id);
    // «Uno Polo» (la palabra en medio, 60 igual porque empieza una palabra) — lo que importa: no se pierde ni se duplica ninguna fila.
    expect([...salida].sort()).toEqual(["a", "b", "c"]);
  });

  it("las variantes de un producto siguen juntas aunque la entrada las intercale con las de otro del mismo puntaje", () => {
    const filas: Fila[] = [
      { id: "a1", producto: "Polo A", marca: "X", categoria: null, color: "Rojo", talla: "S", codigo: "A-S" },
      { id: "b1", producto: "Polo B", marca: "X", categoria: null, color: "Rojo", talla: "S", codigo: "B-S" },
      { id: "a2", producto: "Polo A", marca: "X", categoria: null, color: "Rojo", talla: "M", codigo: "A-M" },
      { id: "b2", producto: "Polo B", marca: "X", categoria: null, color: "Rojo", talla: "M", codigo: "B-M" },
    ];
    const indice = crearIndiceBusquedaEspecial(filas, leer);
    const salida = filtrarConBusquedaEspecial(indice, "polo", {}, { ordenar: "relevancia", grupo: (f) => f.producto }).filas.map((f) => f.id);
    expect(salida).toEqual(["a1", "a2", "b1", "b2"]);
  });
});

describe("el puntaje nunca contradice a «coincide»", () => {
  const CONSULTAS = ["cayla", "cay", "polo", "polos", "camisas", "blazers", "blusa", "negro", "doradas", "m", "30", "pol-0002", "pol0002", "top", "tops", "wayi", "hamhe", "l", "xl", "azules"];

  it("con un solo término, puntaje > 0 exactamente cuando la fila coincide (marca y categoría incluidas)", () => {
    for (const consulta of CONSULTAS) {
      const busqueda = interpretarBusquedaEspecial(consulta, INDICE.vocabulario);
      for (const { fila, campos } of INDICE.entradas) {
        expect({ consulta, fila: fila.id, coincide: busqueda.coincide(campos) }).toEqual({ consulta, fila: fila.id, coincide: busqueda.puntaje(campos) > 0 });
      }
    }
  });

  it("también con separadores y marca pegada («lenceria», «kids», «yjj», «cayla2», «dorada»)", () => {
    const filas: Fila[] = [
      { id: "lenceria", producto: "Set Encaje", marca: "Wayi-Kids", categoria: "Ropa interior/Lencería", color: "Negro", talla: "M", codigo: "SET-0001-NEG-M" },
      { id: "yjj", producto: "Y.j.j", marca: "y.j.j", categoria: "Camisas y Blusas", color: "Rojo", talla: "M", codigo: "PRD-0001-ROJ-M" },
      { id: "cayla2", producto: "Top Aurora", marca: "Cayla 2", categoria: "Tops", color: "Dorado", talla: "S", codigo: "TOP-0001-DOR-S" },
      { id: "doradas", producto: "Blusa Sol", marca: "Doradas Chic", categoria: "Blusas", color: "Negro", talla: "S", codigo: "BLU-0009-NEG-S" },
    ];
    const indice = crearIndiceBusquedaEspecial(filas, leer);
    for (const consulta of ["lenceria", "interior", "kids", "yjj", "y.j.j", "cayla2", "cay", "dorada", "doradas", "chic", "wayi", "mias", "ropa", "libretas", "xyzw"]) {
      const busqueda = interpretarBusquedaEspecial(consulta, indice.vocabulario);
      for (const { fila, campos } of indice.entradas) {
        expect({ consulta, fila: fila.id, coincide: busqueda.coincide(campos) }).toEqual({ consulta, fila: fila.id, coincide: busqueda.puntaje(campos) > 0 });
      }
    }
  });

  it("y lo mismo con las filas y consultas compartidas con Postgres (sin marca ni categoría)", () => {
    type FilaCaso = { producto: string; color: string | null; talla: string | null; sku: string | null; codigos: string[]; codigo?: string; productoCodigo?: string };
    for (const escenario of casos.escenarios) {
      const filas = escenario.filas as FilaCaso[];
      const indice = crearIndiceBusquedaEspecial(filas, (f) => ({
        nombre: f.producto,
        sku: f.sku,
        codigosBarras: f.codigos,
        otrosCodigos: [f.codigo, f.productoCodigo].filter((x): x is string => !!x),
        color: f.color,
        talla: f.talla,
      }));
      for (const caso of escenario.casos) {
        const busqueda = interpretarBusquedaEspecial(caso.consulta, indice.vocabulario);
        if (busqueda.terminos.length !== 1) continue;
        for (const { campos } of indice.entradas) expect(busqueda.puntaje(campos) > 0).toBe(busqueda.coincide(campos));
      }
    }
  });
});
