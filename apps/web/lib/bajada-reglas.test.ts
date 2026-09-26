import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BOTON_COMPROBAR,
  BOTON_CONFIRMAR_DE_NUEVO,
  BUFER_VACIO,
  HORAS_DE_VIDA_DEL_BORRADOR,
  MAX_LINEAS_BAJADA,
  PARAMETROS_RPC_BAJADA,
  RPC_BAJADA,
  VERSION_BORRADOR,
  aPrendasBajables,
  alBufer,
  apartadasEnAlmacen,
  argumentosDeBajada,
  avisoDeExito,
  claveDeBorrador,
  conTopeDeLaBase,
  fijarCantidad,
  formatearHoraLima,
  interpretarErrorDeBajada,
  itemsParaRpc,
  leerBorrador,
  leerCodigo,
  leerRespuestaDeBajada,
  loQueFalta,
  nombreDePrenda,
  quitarLinea,
  resolverTokenReusado,
  respuestaResuelveLaMarca,
  resumenDeBajada,
  serializarBorrador,
  sumarLectura,
  teclaDeLaPistola,
  textoDeBorrador,
  textoDeConfirmar,
  textoDeEnvioIncierto,
  textoDeExito,
  textoDeLectura,
  textoDeResumen,
  textoEscaneoCongelado,
  textoMarcaSinResolver,
  textoNotaDelPie,
  type BorradorDeBajada,
  type FilaDeStock,
  type LineaBajada,
  type PrendaBajable,
  type RespuestaBajada,
} from "./bajada-reglas";
import { ID_CARGO_ESPECIAL } from "./cargo-especial";
import { esRpcDeLectura } from "./espera-reglas";
import type { FilaStock } from "./inventario-v2";

// La colaboradora abre un fardo en el almacén de la tienda, escanea cada prenda que va a colgar y confirma una sola
// vez. Estas pruebas fijan lo que la pantalla decide y dice en cada paso, sin navegador ni base.

const SEDE = "Tienda TRU";
const id = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TOKEN = "3f2b6c1e-8d4a-4b7e-9c21-5a6d7e8f9a0b";

function prenda(parcial: Partial<PrendaBajable> = {}): PrendaBajable {
  return {
    varianteId: id(1),
    sku: "BLU-LIN-BLA-M",
    referencia: "Blusa lino",
    talla: "M",
    color: "Blanco",
    codigosBarras: ["7750001000017"],
    fotoUrl: null,
    piso: 2,
    almacen: 5,
    almacenDisponible: 5,
    ...parcial,
  };
}

function fila(parcial: Partial<FilaDeStock> = {}): FilaDeStock {
  return {
    varianteId: id(1),
    sku: "BLU-LIN-BLA-M",
    referencia: "Blusa lino",
    talla: "M",
    color: "Blanco",
    codigosBarras: ["7750001000017"],
    fotoUrl: null,
    piso: 2,
    almacen: 5,
    almacenDisponible: 5,
    ...parcial,
  };
}

const BLUSA = prenda();
const CAMISON = prenda({ varianteId: id(2), sku: "CAMISÓN-AZU-L", referencia: "Camisón", talla: "L", color: "Azul", codigosBarras: ["7750002000024"], piso: 0, almacen: 3, almacenDisponible: 3 });
const SOLO_PISO = prenda({ varianteId: id(3), sku: "TOP-NEG-S", referencia: "Top", talla: "S", color: "Negro", codigosBarras: [], piso: 4, almacen: 0, almacenDisponible: 0 });
const AGOTADA = prenda({ varianteId: id(4), sku: "FAL-ROJ-M", referencia: "Falda", talla: "M", color: "Rojo", codigosBarras: [], piso: 0, almacen: 0, almacenDisponible: 0 });
const APARTADA = prenda({ varianteId: id(5), sku: "VES-VER-M", referencia: "Vestido", talla: "M", color: "Verde", codigosBarras: [], piso: 1, almacen: 3, almacenDisponible: 0 });
const PRENDAS = [BLUSA, CAMISON, SOLO_PISO, AGOTADA, APARTADA];

describe("aPrendasBajables: qué prendas de la tienda puede escanear", () => {
  it("el Taller (sin piso ni almacén separados) no tiene nada que bajar", () => {
    expect(aPrendasBajables([fila({ piso: null, almacen: null, almacenDisponible: null })])).toEqual([]);
    expect(aPrendasBajables([])).toEqual([]);
  });

  it("deja fuera lo que está en 0 en el piso y en el almacén, y conserva lo que ya está todo en el piso", () => {
    const r = aPrendasBajables([
      fila({ varianteId: id(1), piso: 0, almacen: 0, almacenDisponible: 0 }),
      fila({ varianteId: id(2), piso: 4, almacen: 0, almacenDisponible: 0 }),
      fila({ varianteId: id(3), piso: 0, almacen: 2, almacenDisponible: 2 }),
    ]);
    expect(r.map((p) => p.varianteId)).toEqual([id(2), id(3)]);
  });

  it("nunca ofrece la «Prenda sin registrar» (la base tampoco la baja)", () => {
    expect(aPrendasBajables([fila({ varianteId: ID_CARGO_ESPECIAL })])).toEqual([]);
  });

  it("ordena por referencia, talla y color, y el SKU nulo queda como texto vacío", () => {
    const r = aPrendasBajables([
      fila({ varianteId: id(1), referencia: "Top", talla: "S", color: "Negro" }),
      fila({ varianteId: id(2), referencia: "Blusa lino", talla: "M", color: "Rojo", sku: null }),
      fila({ varianteId: id(3), referencia: "Blusa lino", talla: "M", color: "Blanco" }),
      fila({ varianteId: id(4), referencia: "Blusa lino", talla: "L", color: "Blanco" }),
    ]);
    expect(r.map((p) => p.varianteId)).toEqual([id(4), id(3), id(2), id(1)]);
    expect(r.find((p) => p.varianteId === id(2))?.sku).toBe("");
  });

  it("lo disponible del almacén nunca es negativo ni mayor que lo que hay", () => {
    const [p] = aPrendasBajables([fila({ almacen: 3, almacenDisponible: -1 })]);
    expect(p.almacenDisponible).toBe(0);
    const [q] = aPrendasBajables([fila({ almacen: 3, almacenDisponible: 9 })]);
    expect(q.almacenDisponible).toBe(3);
  });

  it("acepta tal cual las filas de getStockPorUbicacion (FilaStock es un FilaDeStock por estructura)", () => {
    const desdeElLoader: FilaStock = {
      varianteId: id(9),
      productoId: id(90),
      sku: "BLU-LIN-BLA-M",
      talla: "M",
      color: "Blanco",
      colorHex: "#ffffff",
      referencia: "Blusa lino",
      categoria: "Blusas",
      codigosBarras: ["7750001000017"],
      fotoUrl: "https://ejemplo/foto.jpg",
      total: 7,
      piso: 2,
      almacen: 5,
      danado: 0,
      apartado: 1,
      disponible: 6,
      pisoDisponible: 2,
      almacenDisponible: 4,
    };
    expect(aPrendasBajables([desdeElLoader])).toEqual([
      {
        varianteId: id(9),
        sku: "BLU-LIN-BLA-M",
        referencia: "Blusa lino",
        talla: "M",
        color: "Blanco",
        codigosBarras: ["7750001000017"],
        fotoUrl: "https://ejemplo/foto.jpg",
        piso: 2,
        almacen: 5,
        almacenDisponible: 4,
      },
    ]);
  });
});

describe("nombreDePrenda y apartadasEnAlmacen", () => {
  it("arma «referencia · talla · color» omitiendo lo vacío, como retail.fn_prenda_corta", () => {
    expect(nombreDePrenda(BLUSA)).toBe("Blusa lino · M · Blanco");
    expect(nombreDePrenda({ referencia: "Cartera", talla: null, color: "Negro" })).toBe("Cartera · Negro");
    expect(nombreDePrenda({ referencia: "Cartera", talla: "  ", color: null })).toBe("Cartera");
    expect(nombreDePrenda({ referencia: "", talla: null, color: null })).toBe("Una prenda");
  });

  it("las apartadas del almacén son lo que hay menos lo disponible, nunca negativo", () => {
    expect(apartadasEnAlmacen(APARTADA)).toBe(3);
    expect(apartadasEnAlmacen(BLUSA)).toBe(0);
    expect(apartadasEnAlmacen(prenda({ almacen: 1, almacenDisponible: 4 }))).toBe(0);
  });
});

describe("leerCodigo: cada disparo de la pistola", () => {
  it("encuentra la prenda por SKU y por código de barras", () => {
    expect(leerCodigo("BLU-LIN-BLA-M", PRENDAS, [])).toEqual({ tipo: "suma", prenda: BLUSA, cantidadAhora: 1 });
    expect(leerCodigo("7750001000017", PRENDAS, [])).toEqual({ tipo: "suma", prenda: BLUSA, cantidadAhora: 1 });
  });

  it("no le importan mayúsculas, acentos ni espacios alrededor", () => {
    expect(leerCodigo("  blu-lin-bla-m \t", PRENDAS, [])).toMatchObject({ tipo: "suma", prenda: BLUSA });
    expect(leerCodigo("camison-azu-l", PRENDAS, [])).toMatchObject({ tipo: "suma", prenda: CAMISON });
    expect(leerCodigo("CAMISÓN-AZU-L", PRENDAS, [])).toMatchObject({ tipo: "suma", prenda: CAMISON });
  });

  it("un Enter sin nada (o solo espacios) no es una lectura", () => {
    expect(leerCodigo("", PRENDAS, [])).toEqual({ tipo: "vacio" });
    expect(leerCodigo("   ", PRENDAS, [])).toEqual({ tipo: "vacio" });
  });

  it("un código que no está entre las prendas de la tienda es desconocido, y se muestra sin los espacios", () => {
    expect(leerCodigo(" XYZ-999 ", PRENDAS, [])).toEqual({ tipo: "desconocido", codigo: "XYZ-999" });
  });

  it("sin nada en el almacén: avisa, tenga o no unidades en el piso", () => {
    expect(leerCodigo("TOP-NEG-S", PRENDAS, [])).toEqual({ tipo: "sin_almacen", prenda: SOLO_PISO });
    expect(leerCodigo("FAL-ROJ-M", PRENDAS, [])).toEqual({ tipo: "sin_almacen", prenda: AGOTADA });
  });

  it("si todo lo del almacén está apartado para clientas, lo dice así y no como «no hay»", () => {
    expect(leerCodigo("VES-VER-M", PRENDAS, [])).toEqual({ tipo: "todo_apartado", prenda: APARTADA, apartadas: 3 });
  });

  it("no deja pasar de lo disponible en el almacén (tope)", () => {
    const lineas: LineaBajada[] = [{ varianteId: CAMISON.varianteId, cantidad: 3 }];
    expect(leerCodigo("CAMISÓN-AZU-L", PRENDAS, lineas)).toEqual({ tipo: "tope", prenda: CAMISON, disponible: 3 });
  });

  it("cuenta lo que ya está en la lista: la siguiente lectura dice cuántas quedarán", () => {
    const lineas: LineaBajada[] = [{ varianteId: BLUSA.varianteId, cantidad: 2 }];
    expect(leerCodigo("7750001000017", PRENDAS, lineas)).toEqual({ tipo: "suma", prenda: BLUSA, cantidadAhora: 3 });
  });
});

describe("la lista: sumar, fijar y quitar", () => {
  it("sumarLectura suma 1 y sube la línea al principio", () => {
    const lineas: LineaBajada[] = [
      { varianteId: id(1), cantidad: 2 },
      { varianteId: id(2), cantidad: 1 },
    ];
    expect(sumarLectura(lineas, id(2))).toEqual([
      { varianteId: id(2), cantidad: 2 },
      { varianteId: id(1), cantidad: 2 },
    ]);
  });

  it("sumarLectura crea la línea arriba si la prenda no estaba", () => {
    expect(sumarLectura([{ varianteId: id(1), cantidad: 2 }], id(3))).toEqual([
      { varianteId: id(3), cantidad: 1 },
      { varianteId: id(1), cantidad: 2 },
    ]);
  });

  it("sumarLectura no toca la lista que recibe", () => {
    const lineas: LineaBajada[] = [{ varianteId: id(1), cantidad: 2 }];
    sumarLectura(lineas, id(1));
    expect(lineas).toEqual([{ varianteId: id(1), cantidad: 2 }]);
  });

  const LISTA: LineaBajada[] = [
    { varianteId: id(2), cantidad: 1 },
    { varianteId: BLUSA.varianteId, cantidad: 2 },
  ];

  it("fijarCantidad cambia el número sin mover la línea de lugar", () => {
    expect(fijarCantidad(LISTA, BLUSA, 4)).toEqual([
      { varianteId: id(2), cantidad: 1 },
      { varianteId: BLUSA.varianteId, cantidad: 4 },
    ]);
  });

  it("fijarCantidad no pasa de lo disponible en el almacén", () => {
    expect(fijarCantidad(LISTA, BLUSA, 12)[1]).toEqual({ varianteId: BLUSA.varianteId, cantidad: 5 });
  });

  it("fijarCantidad en 0 (o negativo) quita la línea", () => {
    expect(fijarCantidad(LISTA, BLUSA, 0)).toEqual([{ varianteId: id(2), cantidad: 1 }]);
    expect(fijarCantidad(LISTA, BLUSA, -3)).toEqual([{ varianteId: id(2), cantidad: 1 }]);
  });

  it("fijarCantidad con algo que no es un entero no cambia nada", () => {
    expect(fijarCantidad(LISTA, BLUSA, Number.NaN)).toEqual(LISTA);
    expect(fijarCantidad(LISTA, BLUSA, 2.5)).toEqual(LISTA);
    expect(fijarCantidad(LISTA, BLUSA, Number.POSITIVE_INFINITY)).toEqual(LISTA);
  });

  it("quitarLinea saca solo esa prenda", () => {
    expect(quitarLinea(LISTA, BLUSA.varianteId)).toEqual([{ varianteId: id(2), cantidad: 1 }]);
    expect(quitarLinea(LISTA, id(77))).toEqual(LISTA);
  });

  it("conTopeDeLaBase: lo que la base dijo que hay pasa a ser el tope, y lo apartado se conserva", () => {
    const conApartadas = prenda({ almacen: 5, almacenDisponible: 3 });
    expect(conTopeDeLaBase(conApartadas, undefined)).toBe(conApartadas);
    expect(conTopeDeLaBase(conApartadas, { hay: 1, motivo: "sin_alcance" })).toMatchObject({ almacenDisponible: 1, almacen: 3 });
    // Archivada, «Prenda sin registrar» o borrada: no se puede bajar ninguna, diga lo que diga «hay».
    expect(conTopeDeLaBase(conApartadas, { hay: 4, motivo: "archivada" })).toMatchObject({ almacenDisponible: 0, almacen: 2 });
  });
});

describe("loQueFalta: lo que queda después de descontar lo que ya viajó", () => {
  it("resta por prenda, deja fuera lo que ya viajó entero y conserva el orden de la lista", () => {
    const actuales: LineaBajada[] = [
      { varianteId: id(3), cantidad: 1 },
      { varianteId: id(1), cantidad: 5 },
      { varianteId: id(2), cantidad: 2 },
    ];
    const guardadas: LineaBajada[] = [
      { varianteId: id(1), cantidad: 2 },
      { varianteId: id(2), cantidad: 2 },
    ];
    expect(loQueFalta(actuales, guardadas)).toEqual([
      { varianteId: id(3), cantidad: 1 },
      { varianteId: id(1), cantidad: 3 },
    ]);
  });

  it("si se guardó más de lo que hay en la lista (ella quitó unidades), esa prenda no falta", () => {
    expect(loQueFalta([{ varianteId: id(1), cantidad: 1 }], [{ varianteId: id(1), cantidad: 4 }])).toEqual([]);
  });

  it("sin nada guardado, falta todo; con todo guardado, no falta nada", () => {
    const lista: LineaBajada[] = [
      { varianteId: id(2), cantidad: 1 },
      { varianteId: id(1), cantidad: 2 },
    ];
    expect(loQueFalta(lista, [])).toEqual(lista);
    expect(loQueFalta(lista, lista)).toEqual([]);
  });

  it("la misma prenda repetida en lo guardado se descuenta sumada", () => {
    expect(loQueFalta([{ varianteId: id(1), cantidad: 5 }], [{ varianteId: id(1), cantidad: 1 }, { varianteId: id(1), cantidad: 2 }])).toEqual([
      { varianteId: id(1), cantidad: 2 },
    ]);
  });
});

describe("la pistola mientras la pantalla no puede leer (guardando o con la lista congelada)", () => {
  const tecla = (key: string, mod: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...mod,
  });
  const CUERPO = { tagName: "BODY" };
  const BOTON = { tagName: "BUTTON" };
  const CAMPO = { tagName: "INPUT" };

  it("un carácter imprimible y el Enter son de la pistola, con el foco en ninguna parte, en un botón o en el propio campo", () => {
    expect(teclaDeLaPistola(tecla("7"), CUERPO, false)).toBe("caracter");
    expect(teclaDeLaPistola(tecla("B"), null, false)).toBe("caracter");
    expect(teclaDeLaPistola(tecla("Enter"), BOTON, false)).toBe("enter");
    expect(teclaDeLaPistola(tecla("-"), CAMPO, true)).toBe("caracter");
  });

  it("no toma atajos, el espacio ni las teclas con nombre (Tab, Escape, flechas)", () => {
    expect(teclaDeLaPistola(tecla("r", { ctrlKey: true }), CUERPO, false)).toBeNull();
    expect(teclaDeLaPistola(tecla("c", { metaKey: true }), CUERPO, false)).toBeNull();
    expect(teclaDeLaPistola(tecla("x", { altKey: true }), CUERPO, false)).toBeNull();
    expect(teclaDeLaPistola(tecla(" "), BOTON, false)).toBeNull();
    for (const k of ["Tab", "Escape", "ArrowDown", "Shift"]) expect(teclaDeLaPistola(tecla(k), CUERPO, false)).toBeNull();
  });

  it("lo que se escribe en OTRO campo de texto (el buscador del combo) es de ese campo", () => {
    expect(teclaDeLaPistola(tecla("a"), CAMPO, false)).toBeNull();
    expect(teclaDeLaPistola(tecla("Enter"), { tagName: "textarea" }, false)).toBeNull();
    expect(teclaDeLaPistola(tecla("a"), { tagName: "DIV", isContentEditable: true }, false)).toBeNull();
  });

  it("el búfer arma los códigos con cada Enter y guarda el que iba a medias; un Enter suelto no es código", () => {
    let b = BUFER_VACIO;
    for (const k of "7750001000017") b = alBufer(b, "caracter", k);
    b = alBufer(b, "enter", "Enter");
    b = alBufer(b, "enter", "Enter");
    for (const k of "CAM") b = alBufer(b, "caracter", k);
    expect(b).toEqual({ codigos: ["7750001000017"], parcial: "CAM" });
    expect(BUFER_VACIO).toEqual({ codigos: [], parcial: "" });
  });

  it("si escanea con la lista congelada, se le pide primero el botón que falta", () => {
    expect(textoEscaneoCongelado(BOTON_CONFIRMAR_DE_NUEVO)).toBe("Primero pulsa «Confirmar de nuevo»: no sabemos si la bajada anterior se guardó.");
    expect(textoEscaneoCongelado(BOTON_COMPROBAR)).toBe("Primero pulsa «Comprobar»: no sabemos si la bajada anterior se guardó.");
  });
});

describe("resumenDeBajada y los textos del pie", () => {
  it("1 prenda · 1 modelo", () => {
    const r = resumenDeBajada([{ varianteId: BLUSA.varianteId, cantidad: 1 }], PRENDAS);
    expect(r).toEqual({ prendas: 1, modelos: 1 });
    expect(textoDeResumen(r)).toBe("1 prenda · 1 modelo");
    expect(textoDeConfirmar(r.prendas)).toBe("Confirmar bajada · 1 prenda");
  });

  it("N prendas · M modelos: dos tallas del mismo modelo son un solo modelo", () => {
    const blusaL = prenda({ varianteId: id(6), sku: "BLU-LIN-BLA-L", talla: "L" });
    const r = resumenDeBajada(
      [
        { varianteId: BLUSA.varianteId, cantidad: 3 },
        { varianteId: blusaL.varianteId, cantidad: 2 },
        { varianteId: CAMISON.varianteId, cantidad: 1 },
      ],
      [...PRENDAS, blusaL]
    );
    expect(r).toEqual({ prendas: 6, modelos: 2 });
    expect(textoDeResumen(r)).toBe("6 prendas · 2 modelos");
    expect(textoDeConfirmar(r.prendas)).toBe("Confirmar bajada · 6 prendas");
  });

  it("lista vacía: 0 prendas · 0 modelos", () => {
    expect(textoDeResumen(resumenDeBajada([], PRENDAS))).toBe("0 prendas · 0 modelos");
  });
});

describe("itemsParaRpc y los parámetros de bajar_al_piso", () => {
  it("sin ceros, sin duplicados (se suman) y ordenado por variante_id", () => {
    expect(
      itemsParaRpc([
        { varianteId: id(3), cantidad: 2 },
        { varianteId: id(1), cantidad: 0 },
        { varianteId: id(2), cantidad: 1 },
        { varianteId: id(3), cantidad: 1 },
        { varianteId: id(4), cantidad: -2 },
        { varianteId: id(5), cantidad: 1.5 },
      ])
    ).toEqual([
      { variante_id: id(2), cantidad: 1 },
      { variante_id: id(3), cantidad: 3 },
    ]);
  });

  it(`con más de ${MAX_LINEAS_BAJADA} prendas distintas no recorta en silencio: las manda todas y la base rechaza la bajada entera`, () => {
    const muchas = Array.from({ length: MAX_LINEAS_BAJADA + 1 }, (_, i) => ({ varianteId: id(1000 + i), cantidad: 1 }));
    expect(itemsParaRpc(muchas)).toHaveLength(MAX_LINEAS_BAJADA + 1);
    expect(itemsParaRpc(muchas.slice(0, MAX_LINEAS_BAJADA))).toHaveLength(MAX_LINEAS_BAJADA);
  });

  it("los nombres de los parámetros son exactamente p_ubicacion_id, p_items y p_token", () => {
    expect(RPC_BAJADA).toBe("bajar_al_piso");
    expect([...PARAMETROS_RPC_BAJADA]).toEqual(["p_ubicacion_id", "p_items", "p_token"]);
    const args = argumentosDeBajada(id(50), [{ varianteId: id(1), cantidad: 2 }], TOKEN);
    expect(Object.keys(args)).toEqual([...PARAMETROS_RPC_BAJADA]);
    expect(args).toEqual({ p_ubicacion_id: id(50), p_items: [{ variante_id: id(1), cantidad: 2 }], p_token: TOKEN });
  });

  it("el loader global la trata como guardado; la lectura de Frescura, como lectura", () => {
    expect(esRpcDeLectura(RPC_BAJADA)).toBe(false);
    expect(esRpcDeLectura("bajar_al_piso")).toBe(false);
    expect(esRpcDeLectura("fn_bajadas_del_piso")).toBe(true);
  });
});

// La llamada de la pantalla va con `as never` (los tipos de la base son generados), así que ni tsc ni
// `datos:comparar` ven sus parámetros: esta prueba los cruza con la firma que escribe la migración.
const DIR_MIGRACIONES = new URL("../../../supabase/migrations/", import.meta.url);
function parametrosEnLasMigraciones(): string[] | null {
  let ultima: string[] | null = null;
  const archivos = readdirSync(DIR_MIGRACIONES).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  for (const archivo of archivos) {
    const sql = readFileSync(new URL(archivo, DIR_MIGRACIONES), "utf8");
    for (const m of sql.matchAll(/create\s+or\s+replace\s+function\s+(?:retail\.)?bajar_al_piso\s*\(([^)]*)\)/gi)) {
      ultima = m[1]
        .split(",")
        .map((p) => p.trim().split(/\s+/)[0])
        .filter(Boolean);
    }
  }
  return ultima;
}
describe("la firma de bajar_al_piso en las migraciones", () => {
  it("recibe los mismos parámetros que manda la pantalla (la última definición manda)", () => {
    expect(parametrosEnLasMigraciones()).toEqual([...PARAMETROS_RPC_BAJADA]);
  });
});

describe("respuestaResuelveLaMarca: cuándo un reenvío deja de estar en duda", () => {
  const err = (code: string | null, hint: string | null = null) => ({ message: "x", code, hint, details: null });

  it("con éxito, o con un rechazo que la base levanta DESPUÉS de mirar la marca, sí se sabe qué pasó", () => {
    expect(respuestaResuelveLaMarca(null)).toBe(true);
    for (const h of ["bajada_token_reusado", "bajada_token_ajeno", "bajada_tienda_sin_piso", "bajada_sin_alcance"]) {
      expect(respuestaResuelveLaMarca(err("P0001", h)), h).toBe(true);
    }
    // El responsable ahora se pide después de mirar la marca: su rechazo prueba que esa marca no guardó nada.
    expect(respuestaResuelveLaMarca(err("42501", "responsable_no_presente"))).toBe(true);
    expect(respuestaResuelveLaMarca(err("42501", "responsable_requerido"))).toBe(true);
    // Un choque de candados ocurre ya escribiendo: pasó la marca y se deshizo entero.
    expect(respuestaResuelveLaMarca(err("40P01"))).toBe(true);
  });

  it("con un corte, una sesión vencida, el módulo apagado o sin permiso en la tienda, la duda sigue", () => {
    expect(respuestaResuelveLaMarca({ message: "TypeError: Failed to fetch" })).toBe(false);
    expect(respuestaResuelveLaMarca(err(null))).toBe(false);
    expect(respuestaResuelveLaMarca(err("42501"))).toBe(false);
    expect(respuestaResuelveLaMarca(err("PGRST301"))).toBe(false);
    expect(respuestaResuelveLaMarca(err("P0001", "bajada_sin_modulo"))).toBe(false);
    expect(respuestaResuelveLaMarca(err("P0001", "bajada_sin_tienda"))).toBe(false);
  });

  it("la base de verdad levanta esos rechazos DESPUÉS de tomar la marca (si se reordena la función, esta regla miente)", () => {
    const sql = readFileSync(new URL("20260926000200_bajada_piso_funciones.sql", DIR_MIGRACIONES), "utf8");
    const cuerpo = sql.slice(sql.indexOf("create or replace function retail.bajar_al_piso"));
    const marca = cuerpo.indexOf("pg_advisory_xact_lock");
    expect(marca).toBeGreaterThan(0);
    for (const h of ["bajada_token_ajeno", "bajada_token_reusado", "bajada_tienda_sin_piso", "bajada_sin_alcance"]) {
      expect(cuerpo.indexOf(`hint = '${h}'`), h).toBeGreaterThan(marca);
    }
    expect(cuerpo.indexOf("fn_actor_persona_id(true)")).toBeGreaterThan(marca);
    for (const h of ["bajada_sin_modulo", "bajada_sin_tienda"]) expect(cuerpo.indexOf(`hint = '${h}'`), h).toBeLessThan(marca);
  });

  it("un choque de candados se dice en palabras de la tienda, sin código", () => {
    const f = interpretarErrorDeBajada(err("40P01"), "Tienda TRU");
    expect(f.mensaje).toBe("Otra operación estaba moviendo las mismas prendas en ese momento. No se guardó nada: vuelve a confirmar.");
  });

  it("los textos mientras sigue en duda", () => {
    expect(textoMarcaSinResolver("2026-09-25T15:32:00.000Z", BOTON_COMPROBAR)).toBe(
      "Todavía no sabemos si la bajada que enviaste a las 10:32 se guardó. Cuando se resuelva lo de arriba, pulsa «Comprobar»: si ya se había guardado, no se repite."
    );
    expect(textoNotaDelPie(false)).toContain("siguen en el almacén para el sistema");
    expect(textoNotaDelPie(true)).toBe("Hasta comprobar, no sabemos si el sistema ya las ve en el piso: no las subas por «Reponer» mientras tanto.");
  });
});

describe("textoDeLectura: el banner bajo el campo", () => {
  it("código desconocido", () => {
    expect(textoDeLectura({ tipo: "desconocido", codigo: "XYZ-999" }, SEDE)).toBe(
      "No encuentro «XYZ-999» entre las prendas que hay en Tienda TRU según el sistema. Escríbelo a mano (es el SKU) o revisa que la prenda esté recibida en Recibir mercadería."
    );
  });

  // Ella tiene la prenda en la mano: el texto dice lo que cuenta el sistema y el paso siguiente, nunca «no hace falta
  // bajarla» (eso la haría devolver al fardo una prenda que el sistema no ve).
  it("sin almacén, sin nada en el piso", () => {
    expect(textoDeLectura({ tipo: "sin_almacen", prenda: AGOTADA }, SEDE)).toBe(
      "Falda · M · Rojo: el sistema no tiene unidades en el almacén de Tienda TRU. Si la tienes en la mano, revisa que el fardo esté recibido en Recibir mercadería o avisa al líder."
    );
  });

  it("sin almacén, con unidades en el piso", () => {
    expect(textoDeLectura({ tipo: "sin_almacen", prenda: SOLO_PISO }, SEDE)).toBe(
      "Top · S · Negro: el sistema no tiene unidades en el almacén de Tienda TRU (cuenta 4 en el piso). Si la tienes en la mano, revisa que el fardo esté recibido en Recibir mercadería o avisa al líder."
    );
  });

  it("todo apartado, en plural y en singular", () => {
    expect(textoDeLectura({ tipo: "todo_apartado", prenda: APARTADA, apartadas: 3 }, SEDE)).toBe(
      "Vestido · M · Verde: las 3 unidades del almacén están apartadas para clientas y no se pueden mover."
    );
    expect(textoDeLectura({ tipo: "todo_apartado", prenda: APARTADA, apartadas: 1 }, SEDE)).toBe(
      "Vestido · M · Verde: la única unidad del almacén está apartada para una clienta y no se puede mover."
    );
  });

  it("tope, en plural y en singular", () => {
    expect(textoDeLectura({ tipo: "tope", prenda: CAMISON, disponible: 3 }, SEDE)).toBe(
      "Camisón · L · Azul: en el almacén hay 3 y ya las tienes todas en la lista. No se puede bajar más."
    );
    expect(textoDeLectura({ tipo: "tope", prenda: CAMISON, disponible: 1 }, SEDE)).toBe(
      "Camisón · L · Azul: en el almacén hay 1 y ya la tienes en la lista. No se puede bajar más."
    );
  });

  it("una lectura válida no es un error: es lo que oye el lector de pantalla", () => {
    expect(textoDeLectura({ tipo: "suma", prenda: BLUSA, cantidadAhora: 3 }, SEDE)).toBe("Blusa lino · M · Blanco, ahora 3");
  });

  it("un Enter vacío no dice nada", () => {
    expect(textoDeLectura({ tipo: "vacio" }, SEDE)).toBe("");
  });
});

describe("interpretarErrorDeBajada: el rechazo al confirmar", () => {
  const SIN_ALCANCE =
    "No se bajó nada. Blusa lino · M · Blanco: pides 3 y en el almacén hay 1 (2 apartadas para clientas). Puede que otra persona ya las haya bajado: revisa el piso y corrige esas líneas.";

  const RED_CAIDA =
    "Se cortó la conexión y no sabemos si la bajada se guardó. Tu lista sigue aquí: pulsa «Confirmar de nuevo». Si ya se había guardado, no se repite.";

  it("red caída: no sabemos si se guardó, la lista sigue y el único camino es «Confirmar de nuevo» (no el «no se guardó nada» genérico)", () => {
    expect(interpretarErrorDeBajada({ message: "TypeError: Failed to fetch", details: "", hint: "", code: "" }, SEDE)).toEqual({
      tipo: "red",
      mensaje: RED_CAIDA,
    });
    expect(RED_CAIDA).toContain(`«${BOTON_CONFIRMAR_DE_NUEVO}»`);
  });

  it("sin el veredicto de la base (sin código de Postgres: un 504 del camino, una excepción del cliente) también es incierto", () => {
    for (const error of [{ message: "upstream request timeout" }, { message: "AbortError: signal is aborted", code: null }, { message: "<html>502</html>", code: "" }]) {
      expect(interpretarErrorDeBajada(error, SEDE)).toEqual({ tipo: "red", mensaje: RED_CAIDA });
    }
  });

  it("no alcanza: el texto de la base tal cual y las líneas del detail para pintarlas en rojo", () => {
    const detail = JSON.stringify([
      { variante_id: id(1), prenda: "Blusa lino · M · Blanco", pide: 3, hay: 1, apartadas: 2, motivo: "sin_alcance" },
      { variante_id: id(4), prenda: "Falda · M · Rojo", pide: 1, hay: 0, apartadas: 0, motivo: "archivada" },
    ]);
    expect(interpretarErrorDeBajada({ message: SIN_ALCANCE, code: "P0001", hint: "bajada_sin_alcance", details: detail }, SEDE)).toEqual({
      tipo: "sin_alcance",
      mensaje: SIN_ALCANCE,
      lineas: [
        { varianteId: id(1), hay: 1, motivo: "sin_alcance" },
        { varianteId: id(4), hay: 0, motivo: "archivada" },
      ],
    });
  });

  it("no alcanza con el detail roto, ausente o de otra forma: el mensaje sin líneas en rojo, sin lanzar", () => {
    for (const details of ["[{\"variante_id\":", null, undefined, "", "{}", "\"texto\""]) {
      expect(interpretarErrorDeBajada({ message: SIN_ALCANCE, code: "P0001", hint: "bajada_sin_alcance", details }, SEDE)).toEqual({
        tipo: "sin_alcance",
        mensaje: SIN_ALCANCE,
        lineas: [],
      });
    }
  });

  it("no alcanza: descarta las entradas del detail que no tienen forma de línea", () => {
    const detail = JSON.stringify([{ variante_id: id(1), hay: 2, motivo: "sin_alcance" }, { hay: 1 }, "x", { variante_id: id(2), hay: "3", motivo: "sin_alcance" }]);
    const r = interpretarErrorDeBajada({ message: SIN_ALCANCE, code: "P0001", hint: "bajada_sin_alcance", details: detail }, SEDE);
    expect(r.tipo === "sin_alcance" && r.lineas).toEqual([{ varianteId: id(1), hay: 2, motivo: "sin_alcance" }]);
  });

  const REUSADO = "Esa bajada ya se guardó a las 10:32 con 3 prendas. No se repitió: la pantalla te deja solo lo que faltaba.";

  it("token reusado: el texto de la base tal cual y las líneas ya guardadas del detail", () => {
    const detail = JSON.stringify([
      { variante_id: id(1), cantidad: 2 },
      { variante_id: id(2), cantidad: 1 },
    ]);
    expect(interpretarErrorDeBajada({ message: REUSADO, code: "P0001", hint: "bajada_token_reusado", details: detail }, SEDE)).toEqual({
      tipo: "token_reusado",
      mensaje: REUSADO,
      guardadas: [
        { varianteId: id(1), cantidad: 2 },
        { varianteId: id(2), cantidad: 1 },
      ],
    });
  });

  it("token reusado con el detail roto, vacío o con UNA entrada rara: no se sabe qué se guardó (null), sin lanzar", () => {
    const rotos = [
      null,
      undefined,
      "",
      "[{\"variante_id\":",
      "[]",
      "{}",
      JSON.stringify([{ variante_id: id(1), cantidad: 2 }, { variante_id: id(2), cantidad: 0 }]),
      JSON.stringify([{ variante_id: id(1), cantidad: 2 }, { variante_id: "no-es-uuid", cantidad: 1 }]),
      JSON.stringify([{ variante_id: id(1), cantidad: "2" }]),
      JSON.stringify([{ variante_id: id(1), cantidad: 1.5 }]),
    ];
    for (const details of rotos) {
      expect(interpretarErrorDeBajada({ message: REUSADO, code: "P0001", hint: "bajada_token_reusado", details }, SEDE)).toEqual({
        tipo: "token_reusado",
        mensaje: REUSADO,
        guardadas: null,
      });
    }
  });

  it("todos los demás rechazos de la RPC (P0001) pasan tal cual: ninguno choca con una huella de traducirError", () => {
    const rechazos: [string, string][] = [
      ["Falta la marca de este intento. Recarga la página y vuelve a escanear.", "bajada_sin_token"],
      ["No puedes bajar prendas al piso: tu rol no tiene el módulo «Bajada al piso». Pídele al líder que lo active.", "bajada_sin_modulo"],
      ["No tienes permiso para mover mercadería en esa tienda.", "bajada_sin_tienda"],
      ["Elige quién hace esta operación.", "responsable_requerido"],
      ["No hay prendas para bajar: escanea al menos una.", "bajada_vacia"],
      ["Cada prenda necesita un código válido y al menos 1 unidad.", "bajada_linea_invalida"],
      ["Una bajada admite hasta 300 prendas distintas: confirma esta y arma otra.", "bajada_muy_larga"],
      ["Ese intento ya se usó en otra tienda. Recarga la página y vuelve a escanear.", "bajada_token_ajeno"],
      ["Esta tienda todavía no separa piso y almacén: no hay nada que bajar.", "bajada_tienda_sin_piso"],
    ];
    for (const [message, hint] of rechazos) {
      expect(interpretarErrorDeBajada({ message, code: "P0001", hint }, SEDE)).toEqual({ tipo: "otro", mensaje: message });
    }
  });

  it("el responsable que no está de turno usa la frase de siempre del combo", () => {
    const r = interpretarErrorDeBajada({ message: "responsable no presente", code: "42501", hint: "responsable_no_presente" }, SEDE);
    expect(r).toEqual({
      tipo: "otro",
      mensaje: "Esa persona ya no figura de turno en esta tienda (marcó su salida o salió a una pausa). Actualiza la lista y elige a quien está presente.",
    });
  });

  it("sesión cerrada: conserva la frase de traducirError", () => {
    const r = interpretarErrorDeBajada({ message: "permission denied for function bajar_al_piso", code: "42501" }, SEDE);
    expect(r).toEqual({
      tipo: "otro",
      mensaje: "Tu sesión se cerró (quizá alguien salió con esta cuenta en otro equipo). No se guardó nada: recarga la página, vuelve a entrar e inténtalo de nuevo.",
    });
  });

  it("lo que no reconoce no se lo traga: dice qué se intentaba, en qué tienda, y deja el código", () => {
    const r = interpretarErrorDeBajada({ message: "algo raro", code: "XX000" }, SEDE);
    expect(r).toEqual({ tipo: "otro", mensaje: "No se pudo bajar las prendas al piso de Tienda TRU. Vuelve a intentar; si sigue igual, avisa a Felipe. Código: algo raro" });
    expect(interpretarErrorDeBajada(null, SEDE)).toEqual({ tipo: "otro", mensaje: "No se pudo bajar las prendas al piso de Tienda TRU." });
    expect(interpretarErrorDeBajada(null, "")).toEqual({ tipo: "otro", mensaje: "No se pudo bajar las prendas al piso." });
  });
});

// El caso de la revisión: 40 prendas guardadas, se perdió la respuesta y la lista tenía 20 más. La base dice qué guardó;
// la pantalla deja solo las 20 y no borra nada que no haya viajado.
describe("resolverTokenReusado: ese token ya guardó una bajada", () => {
  const MENSAJE = "Esa bajada ya se guardó a las 10:32 con 3 prendas. No se repitió: la pantalla te deja solo lo que faltaba.";
  const guardadas: LineaBajada[] = [
    { varianteId: BLUSA.varianteId, cantidad: 2 },
    { varianteId: CAMISON.varianteId, cantidad: 1 },
  ];

  it("si falta algo, deja esas líneas y suma cuántas prendas quedan por confirmar", () => {
    const lineas: LineaBajada[] = [
      { varianteId: APARTADA.varianteId, cantidad: 4 },
      { varianteId: BLUSA.varianteId, cantidad: 3 },
      { varianteId: CAMISON.varianteId, cantidad: 1 },
      { varianteId: SOLO_PISO.varianteId, cantidad: 2 },
    ];
    expect(resolverTokenReusado(lineas, guardadas, MENSAJE, SEDE)).toEqual({
      tipo: "faltan",
      lineas: [
        { varianteId: APARTADA.varianteId, cantidad: 4 },
        { varianteId: BLUSA.varianteId, cantidad: 1 },
        { varianteId: SOLO_PISO.varianteId, cantidad: 2 },
      ],
      mensaje: `${MENSAJE} Te quedan 7 prendas por confirmar.`,
    });
  });

  it("en singular: «Te queda 1 prenda por confirmar.»", () => {
    const r = resolverTokenReusado([...guardadas, { varianteId: AGOTADA.varianteId, cantidad: 1 }], guardadas, MENSAJE, SEDE);
    expect(r).toMatchObject({ tipo: "faltan", mensaje: `${MENSAJE} Te queda 1 prenda por confirmar.` });
  });

  it("si no falta nada, es una bajada que ya estaba registrada: la tarjeta de éxito con la hora del texto de la base", () => {
    expect(resolverTokenReusado([{ varianteId: BLUSA.varianteId, cantidad: 1 }], guardadas, MENSAJE, SEDE)).toEqual({
      tipo: "ya_estaba",
      exito: { titulo: "Se bajaron 3 prendas al piso de Tienda TRU", detalle: "Esta bajada ya estaba registrada a las 10:32. No se repitió." },
    });
    const una = resolverTokenReusado([], [{ varianteId: BLUSA.varianteId, cantidad: 1 }], "Esa bajada ya se guardó.", SEDE);
    expect(una).toEqual({
      tipo: "ya_estaba",
      exito: { titulo: "Se bajó 1 prenda al piso de Tienda TRU", detalle: "Esta bajada ya estaba registrada. No se repitió." },
    });
  });

  it("el texto de la base que la pantalla completa es el que escribe la última definición de bajar_al_piso", () => {
    const raise = ultimoRaiseDe("bajada_token_reusado");
    expect(raise).toContain("Esa bajada ya se guardó a las % con % %. No se repitió: la pantalla te deja solo lo que faltaba.");
    // Las líneas guardadas viajan en el DETAIL con las dos claves que lee la pantalla.
    expect(raise).toMatch(/'variante_id'/);
    expect(raise).toMatch(/'cantidad'/);
    expect(raise).toMatch(/detail\s*=/);
  });
});

// El bloque de la ÚLTIMA migración que levanta ese hint (desde el `if` que lo abre hasta el `using … hint`).
function ultimoRaiseDe(hint: string): string {
  let ultimo = "";
  const archivos = readdirSync(DIR_MIGRACIONES).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  for (const archivo of archivos) {
    const sql = readFileSync(new URL(archivo, DIR_MIGRACIONES), "utf8");
    const fin = sql.indexOf(`hint = '${hint}'`);
    if (fin < 0) continue;
    const inicio = sql.lastIndexOf("if v_prev.huella", fin);
    ultimo = sql.slice(inicio < 0 ? Math.max(0, fin - 1500) : inicio, sql.indexOf(";", fin) + 1);
  }
  return ultimo;
}

describe("leerRespuestaDeBajada: la forma del jsonb", () => {
  const VALIDA = { bajada_id: id(70), ya_registrada: false, lineas: 2, unidades: 5, registrada_en: "2026-09-25T15:32:10.123456+00:00" };

  it("acepta la respuesta de la base y se queda solo con sus campos", () => {
    expect(leerRespuestaDeBajada({ ...VALIDA, sobra: 1 })).toEqual(VALIDA);
    expect(leerRespuestaDeBajada({ ...VALIDA, ya_registrada: true })).toEqual({ ...VALIDA, ya_registrada: true });
  });

  it("devuelve null si algo no calza", () => {
    const rotas: unknown[] = [
      null,
      undefined,
      "texto",
      [VALIDA],
      { ...VALIDA, bajada_id: "no-es-uuid" },
      { ...VALIDA, ya_registrada: "false" },
      { ...VALIDA, lineas: "2" },
      { ...VALIDA, unidades: -1 },
      { ...VALIDA, unidades: 2.5 },
      { ...VALIDA, registrada_en: "ayer" },
      { bajada_id: id(70), ya_registrada: false, lineas: 2, unidades: 5 },
    ];
    for (const r of rotas) expect(leerRespuestaDeBajada(r)).toBeNull();
  });
});

describe("el éxito: tarjeta y aviso", () => {
  const base: RespuestaBajada = { bajada_id: id(70), ya_registrada: false, lineas: 3, unidades: 12, registrada_en: "2026-09-25T15:32:10.123456+00:00" };

  it("la hora es la de Lima, en 24 h", () => {
    expect(formatearHoraLima(base.registrada_en)).toBe("10:32");
    expect(formatearHoraLima("2026-09-25T04:05:00Z")).toBe("23:05");
    expect(formatearHoraLima("no es fecha")).toBe("--:--");
  });

  it("en plural, con el responsable en el detalle", () => {
    expect(textoDeExito(base, SEDE, "Ana Ríos")).toEqual({ titulo: "Se bajaron 12 prendas al piso de Tienda TRU", detalle: "10:32 · Ana Ríos" });
    expect(textoDeExito(base, SEDE)).toEqual({ titulo: "Se bajaron 12 prendas al piso de Tienda TRU", detalle: "10:32" });
    expect(avisoDeExito(base, SEDE)).toEqual({ titulo: "12 prendas bajadas al piso", detalle: "Tienda TRU" });
  });

  it("en singular", () => {
    const una = { ...base, lineas: 1, unidades: 1 };
    expect(textoDeExito(una, SEDE, "Ana Ríos").titulo).toBe("Se bajó 1 prenda al piso de Tienda TRU");
    expect(avisoDeExito(una, SEDE).titulo).toBe("1 prenda bajada al piso");
  });

  it("si ya estaba registrada, lo dice y no pretende que se bajó de nuevo", () => {
    expect(textoDeExito({ ...base, ya_registrada: true }, SEDE, "Ana Ríos")).toEqual({
      titulo: "Se bajaron 12 prendas al piso de Tienda TRU",
      detalle: "Esta bajada ya estaba registrada a las 10:32. No se repitió.",
    });
  });
});

describe("el borrador en el navegador", () => {
  const AHORA = new Date("2026-09-25T20:00:00Z");
  const creadoEn = "2026-09-25T15:32:00.000Z";
  const borrador: BorradorDeBajada = {
    v: VERSION_BORRADOR,
    token: TOKEN,
    lineas: [
      { varianteId: BLUSA.varianteId, cantidad: 2 },
      { varianteId: CAMISON.varianteId, cantidad: 1 },
    ],
    creadoEn,
  };
  const guardado = serializarBorrador(borrador);

  it("una llave por tienda", () => {
    expect(claveDeBorrador(id(50))).toBe(`cayla:bajada:${id(50)}:borrador`);
    expect(claveDeBorrador(id(50))).not.toBe(claveDeBorrador(id(51)));
  });

  it("vuelve igual que se guardó, con el mismo token (así reintentar no duplica)", () => {
    expect(leerBorrador(guardado, AHORA, PRENDAS)).toEqual(borrador);
  });

  it("sin nada guardado o con el JSON roto: no hay borrador", () => {
    expect(leerBorrador(null, AHORA, PRENDAS)).toBeNull();
    expect(leerBorrador("", AHORA, PRENDAS)).toBeNull();
    expect(leerBorrador("{roto", AHORA, PRENDAS)).toBeNull();
    expect(leerBorrador("[]", AHORA, PRENDAS)).toBeNull();
  });

  it("de otra versión o con un token que no es uuid: no hay borrador", () => {
    expect(VERSION_BORRADOR).toBe(2);
    expect(leerBorrador(JSON.stringify({ ...JSON.parse(guardado), v: 3 }), AHORA, PRENDAS)).toBeNull();
    expect(leerBorrador(JSON.stringify({ ...JSON.parse(guardado), v: "2" }), AHORA, PRENDAS)).toBeNull();
    expect(leerBorrador(JSON.stringify({ ...JSON.parse(guardado), token: "abc" }), AHORA, PRENDAS)).toBeNull();
    expect(leerBorrador(JSON.stringify({ ...JSON.parse(guardado), token: null }), AHORA, PRENDAS)).toBeNull();
    expect(leerBorrador(JSON.stringify({ ...JSON.parse(guardado), creadoEn: "ayer" }), AHORA, PRENDAS)).toBeNull();
  });

  it(`vence a las ${HORAS_DE_VIDA_DEL_BORRADOR} horas`, () => {
    const justo = new Date(Date.parse(creadoEn) + HORAS_DE_VIDA_DEL_BORRADOR * 3_600_000);
    expect(leerBorrador(guardado, justo, PRENDAS)).toEqual(borrador);
    expect(leerBorrador(guardado, new Date(justo.getTime() + 1), PRENDAS)).toBeNull();
  });

  it("en otra tienda sus prendas no están: se descartan, y si no queda ninguna no hay borrador", () => {
    const otraTienda = [prenda({ varianteId: id(60), sku: "OTRA" })];
    expect(leerBorrador(guardado, AHORA, otraTienda)).toBeNull();
    expect(leerBorrador(guardado, AHORA, [CAMISON])).toEqual({ ...borrador, lineas: [{ varianteId: CAMISON.varianteId, cantidad: 1 }] });
  });

  it("NO topa las cantidades a lo que hoy dice el almacén: la base decide si ya estaba registrada o si no alcanza", () => {
    const conMas = serializarBorrador({ ...borrador, lineas: [{ varianteId: BLUSA.varianteId, cantidad: 9 }] });
    expect(leerBorrador(conMas, AHORA, PRENDAS)?.lineas).toEqual([{ varianteId: BLUSA.varianteId, cantidad: 9 }]);
  });

  it("descarta líneas sin forma y la misma prenda repetida (queda la primera)", () => {
    const sucio = JSON.stringify({
      v: VERSION_BORRADOR,
      token: TOKEN,
      creadoEn,
      lineas: [
        { varianteId: BLUSA.varianteId, cantidad: 2 },
        { varianteId: CAMISON.varianteId, cantidad: 0 },
        { varianteId: CAMISON.varianteId, cantidad: 1.5 },
        { varianteId: CAMISON.varianteId, cantidad: "3" },
        { cantidad: 1 },
        "x",
        { varianteId: BLUSA.varianteId, cantidad: 4 },
      ],
    });
    expect(leerBorrador(sucio, AHORA, PRENDAS)?.lineas).toEqual([{ varianteId: BLUSA.varianteId, cantidad: 2 }]);
  });

  it("el aviso para retomarlo dice cuántas prendas y a qué hora (Lima)", () => {
    expect(textoDeBorrador(borrador)).toBe("Dejaste una bajada sin confirmar (3 prendas, 10:32). ¿Sigues con ella o empiezas de nuevo?");
    expect(textoDeBorrador({ ...borrador, lineas: [{ varianteId: BLUSA.varianteId, cantidad: 1 }] })).toBe(
      "Dejaste una bajada sin confirmar (1 prenda, 10:32). ¿Sigues con ella o empiezas de nuevo?"
    );
  });

  // El envío incierto: se pulsó Confirmar, la base pudo guardar y la respuesta se perdió (luz, wifi, recarga).
  const enviadoEn = "2026-09-25T15:40:00.000Z";
  const enviado: BorradorDeBajada = { ...borrador, enviadoEn };

  it("guarda y devuelve la hora del envío; sin ella el JSON no la trae", () => {
    expect(leerBorrador(serializarBorrador(enviado), AHORA, PRENDAS)).toEqual(enviado);
    expect(JSON.parse(serializarBorrador(borrador))).not.toHaveProperty("enviadoEn");
  });

  it("un borrador v1 (de antes de la marca) se lee como sin enviar", () => {
    const v1 = JSON.stringify({ ...JSON.parse(guardado), v: 1 });
    expect(leerBorrador(v1, AHORA, PRENDAS)).toEqual(borrador);
    expect(leerBorrador(JSON.stringify({ ...JSON.parse(guardado), v: 1, enviadoEn }), AHORA, PRENDAS)).toEqual(borrador);
  });

  it("uno ENVIADO conserva todas sus líneas aunque la prenda ya no esté en la tienda: tiene que viajar igual que la primera vez", () => {
    expect(leerBorrador(serializarBorrador(enviado), AHORA, [CAMISON])).toEqual(enviado);
    expect(leerBorrador(serializarBorrador(enviado), AHORA, [])).toEqual(enviado);
  });

  it("una marca de envío ilegible se toma como enviada a la hora de creación: ante la duda, se comprueba", () => {
    for (const marca of ["ayer", 123, true]) {
      expect(leerBorrador(JSON.stringify({ ...JSON.parse(guardado), enviadoEn: marca }), AHORA, PRENDAS)).toEqual({ ...borrador, enviadoEn: creadoEn });
    }
    for (const marca of [null, ""]) {
      expect(leerBorrador(JSON.stringify({ ...JSON.parse(guardado), enviadoEn: marca }), AHORA, PRENDAS)).toEqual(borrador);
    }
  });

  it("el texto del envío incierto dice a qué hora se envió y que «Comprobar» no repite", () => {
    expect(textoDeEnvioIncierto(enviadoEn)).toBe(
      "Enviaste esta bajada a las 10:40 y no llegó la respuesta. Pulsa «Comprobar»: si ya se guardó, no se repite."
    );
  });
});
