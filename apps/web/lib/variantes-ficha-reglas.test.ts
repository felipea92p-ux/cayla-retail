import { describe, expect, it } from "vitest";
import {
  agregarCombinaciones,
  alcancesDeBloque,
  anclar,
  anclarFotos,
  aplicarEnBloque,
  asignacionesDeEtiquetas,
  avisoBloqueSinAplicar,
  bloqueoPorVenta,
  cambiarFila,
  choqueDeCorreccion,
  clasificarCombinaciones,
  codigoPrevisto,
  codigoQueMuestra,
  coloresParaAgregarTalla,
  conUnReintentoSiChoca,
  consolidar,
  correccionesSinAplicar,
  corregida,
  corregir,
  costoEfectivo,
  costosSinComprobar,
  destinoGuardado,
  ejesDeLaPrenda,
  ejesDeReferencia,
  elegirTemporada,
  enGrupo,
  esChoqueDeCandados,
  etiquetasComunes,
  filasDelEje,
  filasDeProducto,
  FRASE_CHOQUE_DE_CANDADOS,
  FRASE_MEZCLA_PREVIA,
  FRASE_MEZCLA_SIN_COLOR,
  fotosComoSeVen,
  leerEstadoVariantes,
  marcarEtiquetasGuardadas,
  margenDeFila,
  moverTemporadas,
  mudanzasAlGuardar,
  NACEN_SIN_UNIDADES,
  nombreVariante,
  ordenDeGuardado,
  payloadVariantes,
  precioYCostoPorDefecto,
  problemasVariantes,
  puedeQuedarSinColor,
  tallasParaAgregarColor,
  textoChoque,
  textosCostoFijo,
  textoTallasApagadas,
  todasNuevas,
  ubicar,
  ubicarTemporadas,
  unidadesEnStock,
  variantesParaResumen,
  vistaPreviaCorreccion,
  type ContextoTextos,
  type EstadoVariante,
  type FilaFicha,
  type NombresFicha,
  type TemporadaElegida,
  type VarianteOrigen,
} from "./variantes-ficha-reglas";
import {
  agruparCambios,
  NOTA_CORREGIDAS,
  NOTA_DESACTIVADAS_CON_STOCK,
  resumenDeCambios,
  type FichaEditable,
  type NombresFicha as NombresCambios,
  type VarianteFicha,
} from "./producto-cambios-reglas";

// Vocabulario de prueba: tallas por id (t-s = «S»…) y colores por código.
const TALLAS: Record<string, string> = { "t-xs": "XS", "t-s": "S", "t-m": "M", "t-l": "L" };
const COLORES: Record<string, string> = { NEG: "Negro", AZU: "Azul", ROJ: "Rojo" };
const N: NombresFicha = {
  color: (c) => (c === null ? "Sin color" : (COLORES[c] ?? c)),
  talla: (t) => (t === null ? "" : (TALLAS[t] ?? "")),
};

function variante(id: string, colorCodigo: string | null, tallaId: string | null, extra: Partial<VarianteOrigen> = {}): VarianteOrigen {
  const token = N.talla(tallaId) || "U";
  return {
    id,
    colorCodigo,
    tallaId,
    precio: 59.9,
    costo: 20,
    costoOficial: false,
    activo: true,
    codigo: `BOD-0003${colorCodigo ? `-${colorCodigo}` : ""}-${token}`,
    codigosBarras: [`BOD-0003${colorCodigo ? `-${colorCodigo}` : ""}-${token}`],
    etiquetaIds: [],
    ...extra,
  };
}

/** BOD-0003 «Body Amir»: nació «Sin color», S/M/L, con su carga inicial (8/5/4 en TRU). */
const BOD = () => filasDeProducto([variante("v-l", null, "t-l"), variante("v-s", null, "t-s"), variante("v-m", null, "t-m")], N);
const ESTADO_BOD: Record<string, EstadoVariante> = {
  "v-s": { stock: 8, apartado: 0, sedes: [{ ubicacionId: "tru", nombre: "Tienda TRU", cantidad: 8 }], vendida: false },
  "v-m": { stock: 5, apartado: 0, sedes: [{ ubicacionId: "tru", nombre: "Tienda TRU", cantidad: 5 }], vendida: false },
  "v-l": { stock: 4, apartado: 1, sedes: [{ ubicacionId: "tru", nombre: "Tienda TRU", cantidad: 4 }], vendida: true },
};
const claves = (filas: FilaFicha[]) => filas.map((f) => f.clave);
/** Lo que los textos necesitan: sin saber el stock (`estado` null), como con la base sin la función. */
const CTX: ContextoTextos = { nombres: N, codigoProducto: "BOD-0003", estado: null };

/** Lo que la barra «Tienes N cambios sin guardar» y la hoja cuentan de estas filas (ADR-0257), con la traducción de
 *  `variantesParaResumen`: solo las variantes (lo demás de la prenda, igual). */
const NOMBRES_CAMBIOS: NombresCambios = {
  categoria: (id) => id,
  tejido: (id) => id,
  patron: (id) => id,
  marca: (id) => id,
  proveedor: (id) => id,
  temporada: (clave) => clave,
  temporadaColor: (clave) => clave,
  color: (codigo) => N.color(codigo),
  etiqueta: (id) => id,
};
function cuenta(filas: readonly FilaFicha[], estado: Record<string, EstadoVariante> | null = null) {
  const { guardadas, ahora } = variantesParaResumen(filas, N, estado);
  const ficha = (variantes: VarianteFicha[]): FichaEditable => ({
    referencia: "Body Amir",
    categoriaId: "",
    descripcion: "",
    estado: "activo",
    stockMinimo: "",
    temporada: "",
    permitirVentaSinStock: false,
    tejidoId: "",
    patronId: "",
    marcaId: "",
    proveedorId: "",
    temporadaColor: {},
    fotos: [],
    variantes,
  });
  return resumenDeCambios(ficha(guardadas), ficha(ahora), NOMBRES_CAMBIOS);
}

describe("filasDeProducto — la prenda por ejes, como en el alta", () => {
  it("ordena «Sin color» primero y cada color por talla (S, M, L; no alfabético)", () => {
    const filas = filasDeProducto([variante("a", "NEG", "t-l"), variante("b", null, "t-m"), variante("c", "AZU", "t-s"), variante("d", "NEG", "t-s")], N);
    expect(filas.map((f) => nombreVariante(f, N))).toEqual(["Sin color M", "Azul S", "Negro S", "Negro L"]);
  });

  it("una que se desactiva AHORA sigue en su grupo (con su aviso); no salta al final", () => {
    const filas = cambiarFila(BOD(), "v-s", { activo: false });
    expect(enGrupo(filas.find((f) => f.id === "v-s")!)).toBe(true);
  });

  it("los ejes son lo que se VENDE: variantes activas, tallas ordenadas", () => {
    const filas = filasDeProducto([variante("a", "NEG", "t-l"), variante("b", "NEG", "t-s"), variante("c", "AZU", "t-m", { activo: false })], N);
    expect(ejesDeLaPrenda(filas, N)).toEqual({ colores: ["NEG"], tallas: ["t-s", "t-l"] });
  });

  it("sin costo oficial conocido se trata como oficial (lo que no puede pisar nada)", () => {
    const [f] = filasDeProducto([variante("a", "NEG", "t-s", { costoOficial: null })], N);
    expect(f.costoFijo).toBe(true);
  });

  it("…y la ficha dice que NO SE PUDO comprobar, no que «ya entró por Compras» (la ficha de main lo distinguía)", () => {
    expect(costosSinComprobar([{ costoOficial: null }, { costoOficial: null }])).toBe(true);
    expect(costosSinComprobar([{ costoOficial: true }, { costoOficial: false }])).toBe(false);
    expect(textosCostoFijo(true).nota).toBe("No se pudo comprobar qué costos ya vienen de compras, así que por ahora no se corrigen aquí.");
    expect(textosCostoFijo(true).celda).toMatch(/^No se pudo comprobar/);
    expect(textosCostoFijo(false).nota).toMatch(/^El costo de una variante que ya entró por Compras/);
  });

  it("todasNuevas: «Cambiar» solo si nada de lo que se toca existe todavía", () => {
    const conAzul = agregarCombinaciones(BOD(), [{ colorCodigo: "AZU", tallaId: "t-s" }, { colorCodigo: "AZU", tallaId: "t-m" }], {
      precio: "59.9",
      costo: "",
      etiquetaIds: [],
    });
    expect(todasNuevas(filasDelEje(conAzul, "color", "AZU"))).toBe(true);
    expect(todasNuevas(filasDelEje(conAzul, "talla", "t-s"))).toBe(false);
    expect(todasNuevas([])).toBe(false);
  });
});

describe("corregir (D-136) y choques (D-138)", () => {
  it("BOD-0003: las 3 «Sin color» pasan a Negro, conservan id y quedan marcadas como corregidas", () => {
    const filas = BOD();
    const todas = claves(filasDelEje(filas, "color", null));
    const hecho = corregir(filas, todas, { colorCodigo: "NEG" });
    expect(hecho.every((f) => f.colorCodigo === "NEG" && corregida(f))).toBe(true);
    expect(hecho.map((f) => f.id)).toEqual(filas.map((f) => f.id));
  });

  it("choca con una variante que ya existe, aunque esté desactivada, y lo dice con su código y qué hacer", () => {
    const filas = filasDeProducto([variante("a", null, "t-s"), variante("b", "NEG", "t-s", { activo: false })], N);
    const choque = choqueDeCorreccion(filas, ["a"], { colorCodigo: "NEG" });
    expect(choque?.con.id).toBe("b");
    expect(textoChoque(choque!, { colorCodigo: "NEG" }, filas, CTX)).toBe("Ya existe Negro S en esta prenda (BOD-0003-NEG-S), pero está desactivada: reactívala en vez de corregir esta.");
  });

  it("«Sin color» cuenta como un color: corregir Negro S a Sin color choca con la Sin color S", () => {
    const filas = filasDeProducto([variante("a", null, "t-s"), variante("b", "NEG", "t-s")], N);
    expect(choqueDeCorreccion(filas, ["b"], { colorCodigo: null })?.con.id).toBe("a");
  });

  it("una talla corregida sobre otra que ya está activa: otra combinación, o PRIMERO pasar sus unidades y DESPUÉS desactivar", () => {
    const filas = filasDeProducto([variante("a", "NEG", "t-s"), variante("b", "NEG", "t-m")], N);
    const choque = choqueDeCorreccion(filas, ["a"], { tallaId: "t-m" });
    // Sin saber el stock: la misma frase que la base (hint variante_ya_existe, 20260929045000).
    expect(textoChoque(choque!, { tallaId: "t-m" }, filas, CTX)).toBe(
      "Ya existe Negro M en esta prenda (BOD-0003-NEG-M). Elige otra combinación; si de verdad son la misma prenda, pasa su stock a esa con un ajuste y después desactiva esta.",
    );
    const conStock = { ...CTX, estado: { a: { stock: 8, apartado: 0, sedes: [], vendida: false } } };
    expect(textoChoque(choque!, { tallaId: "t-m" }, filas, conStock)).toMatch(/pasa sus 8 u\. a esa con un ajuste y después desactiva esta\.$/);
    const sinStock = { ...CTX, estado: { a: { stock: 0, apartado: 0, sedes: [], vendida: false } } };
    expect(textoChoque(choque!, { tallaId: "t-m" }, filas, sinStock)).toMatch(/desactiva esta \(no tiene unidades\)\.$/);
  });

  it("si la otra es una corrección todavía sin guardar, basta deshacerla (sin desactivar ni ajustar), con el código que su fila MUESTRA", () => {
    // Negro S y Azul S. Azul S → Rojo S, después Negro S → Azul S; «Deshacer» en la que era Azul choca con la corrección del Negro.
    let filas = filasDeProducto([variante("n", "NEG", "t-s"), variante("a", "AZU", "t-s")], N);
    filas = corregir(filas, ["a"], { colorCodigo: "ROJ" });
    filas = corregir(filas, ["n"], { colorCodigo: "AZU" });
    const fila = filas.find((f) => f.clave === "a")!;
    const choque = choqueDeCorreccion(filas, ["a"], destinoGuardado(fila));
    expect(choque?.con.clave).toBe("n");
    const conQueSeVe = filas.find((f) => f.clave === "n")!;
    // La fila del Negro ya muestra su código previsto (el Azul S todavía suena en la otra, así que -2), no BOD-0003-NEG-S.
    expect(codigoQueMuestra(filas, conQueSeVe, "BOD-0003", N)).toBe("BOD-0003-AZU-S-2");
    expect(textoChoque(choque!, destinoGuardado(fila), filas, CTX)).toBe("Azul S es la corrección pendiente de Negro S (BOD-0003-AZU-S-2): deshaz esa primero.");
  });

  it("corregir un grupo entero a otro color libre no choca (se mueven juntas)", () => {
    const filas = BOD();
    expect(choqueDeCorreccion(filas, claves(filas), { colorCodigo: "NEG" })).toBeNull();
  });

  it("choca con una nueva de esta ficha (sin código) y pide quitarla", () => {
    const filas = agregarCombinaciones(filasDeProducto([variante("a", "NEG", "t-s")], N), [{ colorCodigo: "AZU", tallaId: "t-s" }], { precio: "59.9", costo: "", etiquetaIds: [] });
    const choque = choqueDeCorreccion(filas, ["a"], { colorCodigo: "AZU" });
    expect(textoChoque(choque!, { colorCodigo: "AZU" }, filas, CTX)).toMatch(/ya está entre las variantes nuevas/);
  });

  it("deshacer vuelve a lo guardado", () => {
    const filas = corregir(BOD(), ["v-s"], { colorCodigo: "NEG" });
    const f = filas.find((x) => x.clave === "v-s")!;
    const vuelta = corregir(filas, ["v-s"], destinoGuardado(f));
    expect(corregida(vuelta.find((x) => x.clave === "v-s")!)).toBe(false);
  });

  it("«Sin color» se ofrece solo si la prenda no queda mezclando", () => {
    const filas = filasDeProducto([variante("a", "NEG", "t-s"), variante("b", "NEG", "t-m"), variante("c", "AZU", "t-s")], N);
    expect(puedeQuedarSinColor(filas, ["a", "b"])).toBe(false);
    expect(puedeQuedarSinColor(filas, ["a", "b", "c"])).toBe(true);
  });
});

describe("bloqueoPorVenta (D-136): vendida = solo un líder", () => {
  it("quien no es líder no corrige una que ya se vendió; el líder sí", () => {
    const filas = BOD();
    // Nombra SOLO lo que cuenta (venta, separación con abonos, cambio): «Apartar» de Existencias no bloquea, y la fila que
    // lo muestra («· 1 ap.») queda corrigiéndose al lado (revisión 2026-09-28).
    expect(bloqueoPorVenta(filas, ESTADO_BOD, false, N)).toBe(
      "BOD-0003-L ya salió con un cliente (venta, separación en Apartados o cambio): solo un líder corrige su color o su talla.",
    );
    expect(bloqueoPorVenta(filas, ESTADO_BOD, false, N)).not.toMatch(/apartó/);
    expect(bloqueoPorVenta(filas, ESTADO_BOD, true, N)).toBeNull();
  });
  it("sin saber (la función no está en la base) se permite: decide la base", () => {
    expect(bloqueoPorVenta(BOD(), null, false, N)).toBeNull();
  });
});

describe("codigoPrevisto (D-137): el código nuevo, con -2 si otra variante ya lo usa", () => {
  it("BOD-0003-S → BOD-0003-NEG-S", () => {
    const filas = corregir(BOD(), ["v-s"], { colorCodigo: "NEG" });
    const f = filas.find((x) => x.clave === "v-s")!;
    expect(codigoPrevisto(filas, f, f, "BOD-0003", N)).toBe("BOD-0003-NEG-S");
  });

  it("si otra variante ya tiene ese código (propio o viejo en sus códigos de barras), -2", () => {
    const filas = filasDeProducto(
      [variante("a", null, "t-s"), variante("b", "AZU", "t-s", { codigosBarras: ["BOD-0003-AZU-S", "BOD-0003-NEG-S"] })],
      N,
    );
    const f = { ...filas[0], colorCodigo: "NEG" };
    expect(codigoPrevisto(filas, f, f, "BOD-0003", N)).toBe("BOD-0003-NEG-S-2");
  });

  it("sus propios códigos viejos no cuentan como ocupados; sin código de producto, no se adivina", () => {
    const filas = BOD();
    expect(codigoPrevisto(filas, filas[0], filas[0], "BOD-0003", N)).toBe("BOD-0003-S");
    expect(codigoPrevisto(filas, filas[0], filas[0], null, N)).toBeNull();
  });

  it("la vista previa dice de qué código a qué código pasa cada una", () => {
    const filas = BOD();
    expect(vistaPreviaCorreccion(filas, ["v-s", "v-m"], { colorCodigo: "NEG" }, "BOD-0003", N)).toEqual([
      { clave: "v-s", antes: "BOD-0003-S", despues: "BOD-0003-NEG-S", nombre: "Negro S" },
      { clave: "v-m", antes: "BOD-0003-M", despues: "BOD-0003-NEG-M", nombre: "Negro M" },
    ]);
  });
});

describe("fotos y temporada siguen al color (como la base)", () => {
  it("el color que desaparece se muda al nuevo; si queda alguna fila del viejo, no se muda", () => {
    const antes = filasDeProducto([variante("a", "NEG", "t-s"), variante("b", "NEG", "t-m")], N);
    expect(mudanzasAlGuardar(corregir(antes, ["a"], { colorCodigo: "AZU" }))).toEqual([]);
    expect(mudanzasAlGuardar(corregir(antes, ["a", "b"], { colorCodigo: "AZU" }))).toEqual([["NEG", "AZU"]]);
  });

  it("las fotos del color viejo pasan al nuevo; a «Sin color», quedan generales; las generales no se mueven nunca", () => {
    const fotos = [
      { clientKey: "1", colorCodigo: "NEG" as string | null },
      { clientKey: "2", colorCodigo: null as string | null },
      { clientKey: "3", colorCodigo: "ROJ" as string | null },
    ];
    expect(fotosComoSeVen(fotos, [["NEG", "AZU"]]).map((f) => f.colorCodigo)).toEqual(["AZU", null, "ROJ"]);
    expect(fotosComoSeVen(fotos, [["NEG", null]]).map((f) => f.colorCodigo)).toEqual([null, null, "ROJ"]);
  });

  it("la temporada pasa si el nuevo no tiene la suya; si la tiene, manda la del nuevo", () => {
    expect(moverTemporadas({ NEG: "invierno" }, new Map([["NEG", "AZU"]]))).toEqual({ AZU: "invierno" });
    expect(moverTemporadas({ NEG: "invierno", AZU: "verano" }, new Map([["NEG", "AZU"]]))).toEqual({ AZU: "verano" });
    expect(moverTemporadas({ NEG: "invierno" }, new Map([["NEG", null]]))).toEqual({});
  });
});

// Integración ADR-0263: lo que la ficha muestra de fotos y temporada tiene que ser lo que la BASE deja al guardar
// (`fn_corregir_identidad_variante` muda un color cuando ninguna variante que EXISTE lo conserva), y «Deshacer» lo
// devuelve todo. Nada se mueve gesto a gesto: todo se guarda con su color de ORIGEN y se ubica con las mudanzas de hoy.
describe("mudanzasAlGuardar, anclar y ubicar — igual que la base, y Deshacer devuelve", () => {
  const PRENDA = () => filasDeProducto([variante("n", "NEG", "t-s"), variante("a", "AZU", "t-m")], N);
  const FOTOS = [
    { clientKey: "f-neg", colorCodigo: "NEG" as string | null },
    { clientKey: "f-azu", colorCodigo: "AZU" as string | null },
    { clientKey: "f-gen", colorCodigo: null as string | null },
  ];

  it("fundir Negro S en el Azul (que ya existe) muda el Negro; Deshacer lo devuelve", () => {
    const antes = PRENDA();
    const fundida = corregir(antes, ["n"], { colorCodigo: "AZU" });
    expect(mudanzasAlGuardar(fundida)).toEqual([["NEG", "AZU"]]);
    expect(fotosComoSeVen(FOTOS, mudanzasAlGuardar(fundida)).map((f) => f.colorCodigo)).toEqual(["AZU", "AZU", null]);
    const deshecha = corregir(fundida, ["n"], { colorCodigo: "NEG" });
    expect(fotosComoSeVen(FOTOS, mudanzasAlGuardar(deshecha)).map((f) => f.colorCodigo)).toEqual(["NEG", "AZU", null]);
    // Y la temporada guardada, derivada de lo guardado, vuelve sola.
    expect(moverTemporadas({ NEG: "invierno" }, mudanzasAlGuardar(deshecha))).toEqual({ NEG: "invierno" });
  });

  it("corregir todo el Negro a Rojo y agregar una Negro M nueva: la base muda igual (la nueva nace después)", () => {
    const antes = filasDeProducto([variante("n", "NEG", "t-s")], N);
    const corregida_ = corregir(antes, ["n"], { colorCodigo: "ROJ" });
    const conNueva = agregarCombinaciones(corregida_, [{ colorCodigo: "NEG", tallaId: "t-m" }], { precio: "59.90", costo: "", etiquetaIds: [] });
    expect(mudanzasAlGuardar(conNueva)).toEqual([["NEG", "ROJ"]]); // aunque el Negro se siga viendo (por la nueva)
    expect(moverTemporadas({ NEG: "invierno" }, mudanzasAlGuardar(conNueva))).toEqual({ ROJ: "invierno" });
    // Lo que se elige AHORA para el Negro que se ve (el de la nueva) es literalmente del Negro: la base lo guarda después
    // de corregir. No salta al Rojo.
    const a = anclar("NEG", conNueva);
    expect(a).toEqual({ origen: "NEG", fijo: true });
    expect(ubicar(a, mudanzasAlGuardar(conNueva))).toBe("NEG");
  });

  it("una cadena se muda en el orden en que la base corrige (Negro→Azul espera a que el Azul pase a Rojo)", () => {
    const antes = filasDeProducto([variante("n", "NEG", "t-s"), variante("a", "AZU", "t-s")], N);
    const cadena = corregir(corregir(antes, ["n"], { colorCodigo: "AZU" }), ["a"], { colorCodigo: "ROJ" });
    expect(ordenDeGuardado(cadena)?.map((f) => f.clave)).toEqual(["a", "n"]);
    expect(mudanzasAlGuardar(cadena)).toEqual([
      ["AZU", "ROJ"],
      ["NEG", "AZU"],
    ]);
    expect(fotosComoSeVen(FOTOS, mudanzasAlGuardar(cadena)).map((f) => f.colorCodigo)).toEqual(["AZU", "ROJ", null]);
  });

  it("de «Sin color» a Negro (BOD-0003) no muda nada: las generales no se mueven nunca", () => {
    const filas = BOD();
    expect(mudanzasAlGuardar(corregir(filas, claves(filas), { colorCodigo: "NEG" }))).toEqual([]);
  });

  it("elegir algo no lo mueve de donde se eligió: ubicar(anclar(c)) = c, en todos los casos", () => {
    const antes = filasDeProducto([variante("n", "NEG", "t-s"), variante("a", "AZU", "t-m"), variante("r", "ROJ", "t-s")], N);
    const escenarios = [
      antes,
      corregir(antes, ["n"], { colorCodigo: "AZU" }), // fundir en uno que existe
      corregir(antes, ["n"], { colorCodigo: "VER" }), // a uno que no estaba
      corregir(corregir(antes, ["n"], { colorCodigo: "AZU" }), ["a"], { colorCodigo: "ROJ" }), // cadena
      agregarCombinaciones(corregir(antes, ["n"], { colorCodigo: "VER" }), [{ colorCodigo: "NEG", tallaId: "t-m" }], { precio: "1", costo: "", etiquetaIds: [] }),
    ];
    for (const filas of escenarios) {
      for (const c of ["NEG", "AZU", "ROJ", "VER", "OTR", null]) expect(ubicar(anclar(c, filas), mudanzasAlGuardar(filas))).toBe(c);
    }
  });

  it("lo elegido para un color al que llegó una corrección sigue a esas prendas: si se deshace, vuelve al color de antes", () => {
    const antes = filasDeProducto([variante("n", "NEG", "t-s")], N);
    const aRojo = corregir(antes, ["n"], { colorCodigo: "ROJ" });
    const a = anclar("ROJ", aRojo);
    expect(a).toEqual({ origen: "NEG", fijo: false });
    expect(ubicar(a, mudanzasAlGuardar(corregir(aRojo, ["n"], { colorCodigo: "NEG" })))).toBe("NEG");
  });
});

// Revisión 2026-09-28 (hallazgos 5 y 7): la foto NUEVA y la temporada elegida a mano se movían gesto a gesto; al fundir
// un color en otro que ya existía y pulsar «Deshacer», se quedaban en el color equivocado y se guardaban ahí.
describe("lo elegido a mano se ancla a su color de origen: Deshacer lo devuelve", () => {
  const PRENDA = () => filasDeProducto([variante("n", "NEG", "t-s"), variante("a", "AZU", "t-m")], N);

  it("una foto recién subida y marcada Negro: fundir Negro S en el Azul la lleva al Azul; Deshacer la devuelve al Negro", () => {
    const antes = PRENDA();
    // Una guardada del Negro y una recién subida (sin id) que la persona marca Negro.
    const guardadas = [{ clientKey: "f1", id: "f1", colorCodigo: "NEG" as string | null }];
    const subida = [...fotosComoSeVen(guardadas, mudanzasAlGuardar(antes)), { clientKey: "nueva", id: null, colorCodigo: null as string | null }];
    let fotos = anclarFotos(subida, guardadas, antes);
    fotos = anclarFotos(
      fotosComoSeVen(fotos, mudanzasAlGuardar(antes)).map((f) => (f.clientKey === "nueva" ? { ...f, colorCodigo: "NEG" } : f)),
      fotos,
      antes,
    );

    const fundida = corregir(antes, ["n"], { colorCodigo: "AZU" });
    expect(fotosComoSeVen(fotos, mudanzasAlGuardar(fundida)).map((f) => f.colorCodigo)).toEqual(["AZU", "AZU"]);

    const deshecha = corregir(fundida, ["n"], { colorCodigo: "NEG" });
    expect(cuenta(deshecha).total).toBe(0);
    // Antes: [{id:null, AZU}, {id:'f1', NEG}] — la nueva se quedaba en el Azul y viajaba así al guardar.
    expect(fotosComoSeVen(fotos, mudanzasAlGuardar(deshecha)).map((f) => f.colorCodigo)).toEqual(["NEG", "NEG"]);
  });

  it("una foto recoloreada a mano a un color que la prenda no tiene se queda en él (la corrección no la arrastra)", () => {
    const antes = PRENDA();
    const fotos = anclarFotos([{ clientKey: "f1", colorCodigo: "ROJ" as string | null }], [{ clientKey: "f1", colorCodigo: "NEG" as string | null }], antes);
    const todoAzul = corregir(antes, ["n"], { colorCodigo: "AZU" });
    expect(fotosComoSeVen(fotos, mudanzasAlGuardar(todoAzul)).map((f) => f.colorCodigo)).toEqual(["ROJ"]);
  });

  it("reordenar o marcar principal no cambia el origen de una foto que ya siguió a una corrección", () => {
    const fundida = corregir(PRENDA(), ["n"], { colorCodigo: "AZU" });
    const fotos = [{ clientKey: "f1", colorCodigo: "NEG" as string | null, principal: false }];
    const vista = fotosComoSeVen(fotos, mudanzasAlGuardar(fundida));
    const ancladas = anclarFotos(
      vista.map((f) => ({ ...f, principal: true })),
      fotos,
      fundida,
    );
    expect(ancladas).toEqual([{ clientKey: "f1", colorCodigo: "NEG", principal: true, fijo: false }]);
  });

  it("temporada: invierno elegido para el Negro; al fundirlo en el Azul (que tiene verano guardado) manda el verano; Deshacer devuelve el invierno", () => {
    const antes = PRENDA();
    const porColorBase = { AZU: "verano" };
    let elegidas: TemporadaElegida[] = [];
    elegidas = elegirTemporada(elegidas, "NEG", "invierno", antes);
    const ver = (filas: FilaFicha[]) => {
      const m = mudanzasAlGuardar(filas);
      return { ...moverTemporadas(porColorBase, m), ...ubicarTemporadas(elegidas, m, porColorBase) };
    };
    expect(ver(antes)).toEqual({ AZU: "verano", NEG: "invierno" });

    const fundida = corregir(antes, ["n"], { colorCodigo: "AZU" });
    // Antes del arreglo: {AZU: invierno} — lo elegido para el Negro pisaba el verano guardado del Azul.
    expect(ver(fundida)).toEqual({ AZU: "verano" });

    const deshecha = corregir(fundida, ["n"], { colorCodigo: "NEG" });
    // Antes del arreglo: {AZU: invierno} y el Negro sin nada; al guardar, el Azul pasaba a invierno sin que nadie lo tocara.
    expect(ver(deshecha)).toEqual({ AZU: "verano", NEG: "invierno" });
  });

  it("temporada: si el color al que llega no tiene la suya, lo elegido lo sigue (y lo elegido para ese color manda sobre todo)", () => {
    const antes = PRENDA();
    let elegidas = elegirTemporada([], "NEG", "invierno", antes);
    const fundida = corregir(antes, ["n"], { colorCodigo: "AZU" });
    expect(ubicarTemporadas(elegidas, mudanzasAlGuardar(fundida), {})).toEqual({ AZU: "invierno" });
    elegidas = elegirTemporada(elegidas, "AZU", "verano", fundida);
    expect(ubicarTemporadas(elegidas, mudanzasAlGuardar(fundida), {})).toEqual({ AZU: "verano" });
    // Elegir otra vez para el mismo color reemplaza, no duplica.
    expect(elegirTemporada(elegidas, "AZU", "otono", fundida).filter((e) => e.origen === "AZU")).toEqual([{ origen: "AZU", fijo: false, clave: "otono" }]);
  });
});

describe("agregar colores y tallas", () => {
  it("crea las que faltan, reactiva la que existía desactivada y no duplica las que ya se venden", () => {
    const filas = filasDeProducto([variante("a", "NEG", "t-s"), variante("b", "AZU", "t-s", { activo: false })], N);
    const combos = [
      { colorCodigo: "NEG", tallaId: "t-s" },
      { colorCodigo: "AZU", tallaId: "t-s" },
      { colorCodigo: "AZU", tallaId: "t-m" },
    ];
    expect(clasificarCombinaciones(filas, combos).map((c) => c.queHace)).toEqual(["ya-esta", "reactiva", "nueva"]);
    const salida = agregarCombinaciones(filas, combos, { precio: "59.9", costo: "20", etiquetaIds: ["nuevo"] });
    expect(salida).toHaveLength(3);
    expect(salida.find((f) => f.id === "b")?.activo).toBe(true);
    const nueva = salida.find((f) => !f.id)!;
    expect(nueva).toMatchObject({ colorCodigo: "AZU", tallaId: "t-m", precio: "59.9", costo: "20", etiquetaIds: ["nuevo"], guardada: null });
  });

  it("agregar color: solo se eligen las tallas que la categoría habilita HOY; las demás, apagadas y con su porqué", () => {
    // Un polo con Negro S y XXL que se pasó a Bodies (no habilita XXL): la base rechazaría un Azul XXL y el guardado entero.
    const TALLAS_XXL: NombresFicha = { ...N, talla: (t) => (t === "t-xxl" ? "XXL" : N.talla(t)) };
    const filas = filasDeProducto([variante("a", "NEG", "t-s"), variante("b", "NEG", "t-xxl")], TALLAS_XXL);
    const tallas = tallasParaAgregarColor(filas, TALLAS_XXL, [{ id: "t-s" }, { id: "t-m" }]);
    expect(tallas).toEqual([
      { id: "t-s", habilitada: true },
      { id: "t-xxl", habilitada: false },
    ]);
    expect(textoTallasApagadas(["t-xxl"], TALLAS_XXL, "Bodies")).toBe("XXL ya no está habilitada en Bodies: el color nuevo no nace en esa talla.");
    expect(textoTallasApagadas([], TALLAS_XXL, "Bodies")).toBeNull();
  });

  it("agregar color en una prenda con todo desactivado: las tallas salen de todas sus variantes (nunca nace una «Única»)", () => {
    const filas = filasDeProducto(
      [variante("s", "NEG", "t-s", { activo: false }), variante("m", "NEG", "t-m", { activo: false }), variante("l", "NEG", "t-l", { activo: false })],
      N,
    );
    expect(ejesDeLaPrenda(filas, N).tallas).toEqual([]);
    expect(ejesDeReferencia(filas, N)).toEqual({ colores: ["NEG"], tallas: ["t-s", "t-m", "t-l"], deDesactivadas: true });
    expect(tallasParaAgregarColor(filas, N, [{ id: "t-s" }, { id: "t-m" }, { id: "t-l" }]).map((t) => t.id)).toEqual(["t-s", "t-m", "t-l"]);
    // Una prenda sin ninguna variante toma las de su categoría.
    expect(tallasParaAgregarColor([], N, [{ id: "t-s" }])).toEqual([{ id: "t-s", habilitada: true }]);
  });

  it("agregar talla: nace en los colores de la prenda que siguen activos; con todo desactivado, en los que tuvo (nunca «Sin color» por accidente)", () => {
    const filas = filasDeProducto([variante("a", "NEG", "t-s"), variante("b", "VIE", "t-s")], N);
    expect(coloresParaAgregarTalla(filas, N, ["NEG", "AZU"])).toEqual({ colores: ["NEG"], inactivos: ["VIE"], sinColor: false, deDesactivadas: false });
    const apagadas = filas.map((f) => ({ ...f, activo: false }));
    expect(coloresParaAgregarTalla(apagadas, N, ["NEG"])).toEqual({ colores: ["NEG"], inactivos: ["VIE"], sinColor: false, deDesactivadas: true });
    // «Sin color» solo si de verdad lo es.
    expect(coloresParaAgregarTalla(BOD(), N, ["NEG"]).sinColor).toBe(true);
    expect(coloresParaAgregarTalla([], N, ["NEG"])).toEqual({ colores: [], inactivos: [], sinColor: false, deDesactivadas: false });
  });

  it("precio por defecto con todo desactivado: el de sus variantes (no vacío)", () => {
    const filas = filasDeProducto([variante("a", "NEG", "t-s", { activo: false, precio: 49.9 })], N);
    expect(precioYCostoPorDefecto(filas).precio).toBe("49.90");
  });

  it("dos nuevas con la misma combinación en momentos distintos no comparten clave", () => {
    let filas = agregarCombinaciones([], [{ colorCodigo: "NEG", tallaId: "t-s" }], { precio: "1", costo: "", etiquetaIds: [] });
    filas = corregir(filas, [filas[0].clave], { tallaId: "t-m" });
    filas = agregarCombinaciones(filas, [{ colorCodigo: "NEG", tallaId: "t-s" }], { precio: "1", costo: "", etiquetaIds: [] });
    expect(new Set(claves(filas)).size).toBe(2);
  });

  it("precio y costo por defecto: los más comunes entre las activas", () => {
    const filas = filasDeProducto(
      [variante("a", "NEG", "t-s", { precio: 59.9 }), variante("b", "NEG", "t-m", { precio: 59.9 }), variante("c", "NEG", "t-l", { precio: 69.9, costo: 25 })],
      N,
    );
    expect(precioYCostoPorDefecto(filas)).toEqual({ precio: "59.90", costo: "20.00" });
  });

  it("las nuevas llevan solo las etiquetas que tienen TODAS las activas y que esta cuenta puede poner", () => {
    const filas = filasDeProducto(
      [variante("a", "NEG", "t-s", { etiquetaIds: ["nuevo", "descuento"] }), variante("b", "NEG", "t-m", { etiquetaIds: ["nuevo", "descuento"] }), variante("c", "NEG", "t-l", { etiquetaIds: ["nuevo"] })],
      N,
    );
    expect(etiquetasComunes(filas, ["nuevo", "descuento"])).toEqual(["nuevo"]);
    expect(etiquetasComunes(filas.slice(0, 2), ["nuevo"])).toEqual(["nuevo"]);
  });
});

describe("precio y costo en bloque", () => {
  it("el costo no toca las que lo traen de compras, y lo cuenta", () => {
    const filas = filasDeProducto([variante("a", "NEG", "t-s"), variante("b", "NEG", "t-m", { costoOficial: true }), variante("c", "AZU", "t-s")], N);
    const r = aplicarEnBloque(filas, "costo", "todas", "22");
    expect({ aplicadas: r.aplicadas, fijas: r.fijas }).toEqual({ aplicadas: 2, fijas: 1 });
    expect(r.filas.find((f) => f.id === "b")?.costo).toBe("20.00");
  });

  it("por color o por talla; solo las activas; un precio de 0 no sirve", () => {
    const filas = filasDeProducto([variante("a", "NEG", "t-s"), variante("b", "NEG", "t-m"), variante("c", "AZU", "t-s", { activo: false })], N);
    expect(aplicarEnBloque(filas, "precio", "talla:t-s", "65").aplicadas).toBe(1);
    expect(aplicarEnBloque(filas, "precio", "color:NEG", "65").aplicadas).toBe(2);
    expect(aplicarEnBloque(filas, "precio", "todas", "0").error).toBe("Escribe un precio mayor que 0.");
  });

  it("los alcances: todas, y cada color o talla solo si hay más de uno", () => {
    const filas = filasDeProducto([variante("a", null, "t-s"), variante("b", null, "t-m")], N);
    expect(alcancesDeBloque(filas, N)).toEqual([
      { valor: "todas", texto: "Todas las activas" },
      { valor: "talla:t-s", texto: "Talla: S" },
      { valor: "talla:t-m", texto: "Talla: M" },
    ]);
  });

  it("el margen usa el costo guardado si el campo quedó vacío (el vacío no es cero)", () => {
    const [f] = filasDeProducto([variante("a", "NEG", "t-s", { precio: 100, costo: 40 })], N);
    const vacia = { ...f, costo: "" };
    expect(costoEfectivo(vacia)).toBe("40.00");
    expect(margenDeFila(vacia)).toBe(60);
  });
});

describe("payloadVariantes — lo que viaja a catalogo_actualizar_producto", () => {
  it("las claves de identidad viajan SOLO en las corregidas ('' = sin color); sin SKU en las nuevas", () => {
    let filas = filasDeProducto([variante("a", "NEG", "t-s"), variante("b", "NEG", "t-m")], N);
    filas = corregir(filas, ["b"], { colorCodigo: null });
    filas = agregarCombinaciones(filas, [{ colorCodigo: "AZU", tallaId: "t-s" }], { precio: "59.9", costo: "", etiquetaIds: [] });
    expect(payloadVariantes(filas)).toEqual([
      { id: "b", color_codigo: "", precio: 59.9, costo: 20, activo: true },
      { id: "a", precio: 59.9, costo: 20, activo: true },
      { color_codigo: "AZU", talla_id: "t-s", precio: 59.9, costo: 0 },
    ]);
  });

  it("una que va a la combinación guardada de otra corregida espera a que esa se mueva", () => {
    let filas = filasDeProducto([variante("s", "NEG", "t-s"), variante("m", "NEG", "t-m")], N);
    filas = corregir(filas, ["s"], { tallaId: "t-m" });
    filas = corregir(filas, ["m"], { tallaId: "t-l" });
    expect(ordenDeGuardado(filas)?.map((f) => f.id)).toEqual(["m", "s"]);
  });

  it("un intercambio (S↔M) no se puede en un solo guardado y lo dice", () => {
    let filas = filasDeProducto([variante("s", "NEG", "t-s"), variante("m", "NEG", "t-m")], N);
    filas = corregir(filas, ["s"], { tallaId: "t-m" });
    filas = corregir(filas, ["m"], { tallaId: "t-s" });
    expect(ordenDeGuardado(filas)).toBeNull();
    expect(problemasVariantes(filas, N).some((p) => p.bloquea && /intercambian/.test(p.texto))).toBe(true);
  });
});

describe("problemas antes de guardar", () => {
  it("precio 0 en una activa bloquea (como el alta); en una desactivada no", () => {
    const filas = filasDeProducto([variante("a", "NEG", "t-s", { precio: 0 }), variante("b", "NEG", "t-m", { precio: 0, activo: false })], N);
    const p = problemasVariantes(filas, N);
    expect(p).toContainEqual({ texto: "Negro S necesita un precio mayor que 0.", bloquea: true, clave: "a" });
    expect(p.some((x) => x.clave === "b")).toBe(false);
  });

  it("«Sin color» junto a colores bloquea con la misma frase que la base", () => {
    const filas = agregarCombinaciones(BOD(), [{ colorCodigo: "NEG", tallaId: "t-s" }], { precio: "59.9", costo: "", etiquetaIds: [] });
    expect(problemasVariantes(filas, N)).toContainEqual({ texto: FRASE_MEZCLA_SIN_COLOR, bloquea: true });
  });

  // La misma regla que la base (variantes_sin_mezcla_de_color, 20260929045000): frena lo que ESTE guardado crea, recolorea
  // o reactiva; una prenda que YA venía mezclada (el censo del Conteo le sumaba una Negro S a una «Sin color») se sigue
  // guardando con un aviso. Antes se bloqueaba entera: ni un precio.
  describe("mezcla «no empeora» (ADR-0263 T5)", () => {
    const yaMezclada = () =>
      filasDeProducto([variante("v-s", null, "t-s"), variante("v-m", null, "t-m"), variante("censo", "NEG", "t-s")], N);

    it("guardar solo un precio de una prenda que ya venía mezclada: avisa y deja guardar", () => {
      const filas = cambiarFila(yaMezclada(), "v-m", { precio: "65" });
      const p = problemasVariantes(filas, N);
      expect(p).toContainEqual({ texto: FRASE_MEZCLA_PREVIA, bloquea: false });
      expect(p.some((x) => x.bloquea)).toBe(false);
    });

    it("desactivar su «Sin color S» (la arregla a medias) tampoco bloquea", () => {
      const filas = cambiarFila(yaMezclada(), "v-s", { activo: false });
      expect(problemasVariantes(filas, N).some((x) => x.bloquea)).toBe(false);
    });

    it("recolorear o reactivar una variante que queda en la mezcla sí bloquea (la base también)", () => {
      const recoloreada = corregir(yaMezclada(), ["v-m"], { colorCodigo: "AZU" });
      expect(problemasVariantes(recoloreada, N)).toContainEqual({ texto: FRASE_MEZCLA_SIN_COLOR, bloquea: true });
      const conApagada = filasDeProducto(
        [variante("v-s", null, "t-s"), variante("v-m", null, "t-m", { activo: false }), variante("censo", "NEG", "t-s")],
        N,
      );
      const reactivada = cambiarFila(conApagada, "v-m", { activo: true });
      expect(problemasVariantes(reactivada, N)).toContainEqual({ texto: FRASE_MEZCLA_SIN_COLOR, bloquea: true });
    });

    it("corregir las «Sin color» a Negro (sin chocar con la Negro S) y desactivar la que chocaría la ordena: nada que avisar", () => {
      let filas = corregir(yaMezclada(), ["v-m"], { colorCodigo: "NEG" });
      filas = cambiarFila(filas, "v-s", { activo: false });
      expect(problemasVariantes(filas, N).some((x) => x.texto === FRASE_MEZCLA_SIN_COLOR || x.texto === FRASE_MEZCLA_PREVIA)).toBe(false);
    });
  });

  // La base valida contra la categoría ELEGIDA la talla de toda variante nueva o corregida, y rechaza el guardado entero
  // («Esa talla no está habilitada…», sin decir qué fila). Cambiar la categoría DESPUÉS de agregar una talla dejaba abrir la
  // hoja igual (revisión 2026-09-28).
  describe("talla habilitada en la categoría elegida", () => {
    const TOPS = { tallasHabilitadas: ["t-s", "t-m", "t-l"], nombre: "Tops", cambio: true };

    it("una talla nueva que la categoría elegida no habilita bloquea, con su fila y las dos salidas", () => {
      const filas = agregarCombinaciones(BOD(), [{ colorCodigo: null, tallaId: "t-xs" }], { precio: "59.9", costo: "", etiquetaIds: [] });
      const nueva = filas.find((f) => f.tallaId === "t-xs")!;
      expect(problemasVariantes(filas, N, TOPS)).toContainEqual({
        texto: "XS no está habilitada en Tops: quita Sin color XS, o vuelve a la categoría anterior.",
        bloquea: true,
        clave: nueva.clave,
      });
    });

    it("una talla corregida también; si la categoría no cambió, la salida es habilitarla", () => {
      const filas = corregir(BOD(), ["v-s"], { tallaId: "t-xs" });
      expect(problemasVariantes(filas, N, { ...TOPS, cambio: false })).toContainEqual({
        texto: "XS no está habilitada en Tops: deshaz la corrección de Sin color XS, o pide que la habiliten en Catálogo → Categorías.",
        bloquea: true,
        clave: "v-s",
      });
    });

    it("una que ya existe y no cambia de talla no se revisa (la base tampoco la valida)", () => {
      const soloS = { tallasHabilitadas: ["t-s"], nombre: "Tops", cambio: true };
      expect(problemasVariantes(cambiarFila(BOD(), "v-m", { precio: "70" }), N, soloS).some((x) => x.bloquea)).toBe(false);
    });

    it("sin categoría que revisar (las pruebas de siempre), no se revisa", () => {
      const filas = agregarCombinaciones(BOD(), [{ colorCodigo: null, tallaId: "t-xs" }], { precio: "59.9", costo: "", etiquetaIds: [] });
      expect(problemasVariantes(filas, N).some((x) => x.bloquea)).toBe(false);
    });
  });

  it("desactivarlas todas avisa pero deja guardar (y no dice que dejan de contarse: siguen en el inventario)", () => {
    const filas = BOD().map((f) => ({ ...f, activo: false }));
    const p = problemasVariantes(filas, N);
    expect(p).toEqual([expect.objectContaining({ bloquea: false })]);
    expect(p[0].texto).not.toMatch(/contar/);
  });

  it("un monto escrito en «Cambiar en bloque» sin aplicar bloquea con su porqué; sin nada pendiente, nada", () => {
    expect(avisoBloqueSinAplicar(null)).toBeNull();
    expect(avisoBloqueSinAplicar("precio")).toBe("Tienes un precio sin aplicar: pulsa Aplicar o bórralo.");
    expect(avisoBloqueSinAplicar("costo")).toMatch(/^Tienes un costo sin aplicar/);
  });
});

describe("variantesParaResumen — la barra y la hoja cuentan la sección con UNA cuenta (ADR-0257 + ADR-0263)", () => {
  it("BOD-0003 a Negro, dos nuevas, un precio y una que se desactiva con stock: la hoja lo dice en cuatro grupos", () => {
    let filas = BOD();
    filas = corregir(filas, claves(filas), { colorCodigo: "NEG" });
    filas = agregarCombinaciones(
      filas,
      [
        { colorCodigo: "AZU", tallaId: "t-s" },
        { colorCodigo: "AZU", tallaId: "t-m" },
      ],
      { precio: "59.9", costo: "", etiquetaIds: [] },
    );
    filas = cambiarFila(filas, "v-m", { precio: "64.9" });
    filas = cambiarFila(filas, "v-s", { activo: false });
    const r = cuenta(filas, ESTADO_BOD);
    expect(r.total).toBe(7);
    expect(r.frases).toEqual(["1 variante se desactiva", "2 variantes se agregan", "3 variantes cambian de color o talla", "1 precio cambia"]);
    expect(agruparCambios(r.cambios)).toEqual([
      { clave: "desactivan", titulo: "Se desactivan", lineas: [{ texto: "Negro S", detalle: "8 u. en stock" }], cantidad: 1, nota: NOTA_DESACTIVADAS_CON_STOCK },
      { clave: "agregan", titulo: "Se agregan", lineas: [{ texto: "2 variantes: Azul S, Azul M", detalle: "S/ 59.90" }], cantidad: 2, nota: NACEN_SIN_UNIDADES },
      {
        clave: "identidad",
        titulo: "Color o talla corregidos",
        lineas: [{ texto: "3 variantes pasan de Sin color a Negro", detalle: "S, M, L" }],
        cantidad: 3,
        nota: NOTA_CORREGIDAS,
      },
      { clave: "precios", titulo: "Precios", lineas: [{ texto: "Negro M", antes: "S/ 59.90", despues: "S/ 64.90" }], cantidad: 1 },
    ]);
  });

  it("el índice de cada cambio es el de su fila: la marca de la fila sale de la misma cuenta que la barra", () => {
    const filas = cambiarFila(corregir(BOD(), ["v-m"], { tallaId: "t-xs" }), "v-l", { precio: "70" });
    const r = cuenta(filas);
    expect(agruparCambios(r.cambios)[0].lineas).toEqual([{ texto: "1 variante pasa de talla M a XS" }]);
  });

  it("sin cambios, nada que contar", () => {
    expect(cuenta(BOD(), ESTADO_BOD).total).toBe(0);
  });

  it("un precio reescrito igual (59.9 vs 59.90) no es un cambio; se abre con dos decimales", () => {
    expect(BOD()[0].precio).toBe("59.90");
    expect(cuenta(cambiarFila(BOD(), "v-s", { precio: "59.9" })).total).toBe(0);
  });

  it("el costo que cuenta es el que se guardaría: vacío en una que existe conserva el suyo; el de compras no se toca", () => {
    const [libre] = filasDeProducto([variante("a", "NEG", "t-s")], N);
    expect(cuenta([{ ...libre, costo: "" }]).total).toBe(0);
    expect(cuenta([{ ...libre, costo: "18" }]).cambios).toEqual([{ tipo: "costo", indice: 0, nombre: "Negro S", antes: "20.00", despues: "18" }]);
    const [fijo] = filasDeProducto([variante("a", "NEG", "t-s", { costoOficial: true })], N);
    expect(cuenta([{ ...fijo, costo: "18" }]).total).toBe(0);
  });

  it("sin saber el stock (`estado` null), desactivar no inventa unidades", () => {
    const r = cuenta(cambiarFila(BOD(), "v-s", { activo: false }), null);
    expect(r.cambios).toEqual([{ tipo: "desactiva", indice: 0, nombre: "Sin color S" }]);
  });
});

describe("después de guardar: consolidar, verificar y etiquetas de las nuevas", () => {
  const conCorreccionYNueva = () => {
    let filas = filasDeProducto([variante("a", null, "t-s", { etiquetaIds: ["nuevo"] })], N);
    filas = corregir(filas, ["a"], { colorCodigo: "NEG" });
    return agregarCombinaciones(filas, [{ colorCodigo: "NEG", tallaId: "t-m" }], { precio: "59.9", costo: "", etiquetaIds: ["nuevo"] });
  };

  it("la nueva recibe su id por su combinación; lo corregido deja de estar pendiente y el código viejo sigue sonando", () => {
    const deLaBase = [
      { id: "a", color_codigo: "NEG", talla_id: "t-s", codigo: "BOD-0003-NEG-S" },
      { id: "n1", color_codigo: "NEG", talla_id: "t-m", codigo: "BOD-0003-NEG-M" },
    ];
    const filas = conCorreccionYNueva();
    expect(correccionesSinAplicar(filas, deLaBase)).toEqual([]);
    const hechas = consolidar(filas, deLaBase);
    expect(hechas.map((f) => f.id)).toEqual(["a", "n1"]);
    expect(hechas.some(corregida)).toBe(false);
    expect(hechas[0].codigosBarras).toEqual(expect.arrayContaining(["BOD-0003-S", "BOD-0003-NEG-S"]));
    // La nueva todavía tiene que recibir sus etiquetas; la corregida no cambió las suyas.
    expect(asignacionesDeEtiquetas(hechas)).toEqual([{ variante_id: "n1", etiqueta_ids: ["nuevo"] }]);
    expect(asignacionesDeEtiquetas(marcarEtiquetasGuardadas(hechas))).toEqual([]);
    expect(cuenta(marcarEtiquetasGuardadas(hechas)).total).toBe(0);
  });

  it("con la base sin el SQL (ignora el color de una que existe), la corrección se detecta y sigue pendiente", () => {
    const deLaBase = [
      { id: "a", color_codigo: null, talla_id: "t-s", codigo: "BOD-0003-S" },
      { id: "n1", color_codigo: "NEG", talla_id: "t-m", codigo: "BOD-0003-NEG-M" },
    ];
    const filas = conCorreccionYNueva();
    expect(correccionesSinAplicar(filas, deLaBase).map((f) => f.id)).toEqual(["a"]);
    expect(corregida(consolidar(filas, deLaBase)[0])).toBe(true);
  });
});

describe("stock visible (fn_variantes_estado)", () => {
  it("lee el arreglo de la base; cualquier otra forma es «no se sabe»", () => {
    const leido = leerEstadoVariantes([
      { variante_id: "v-s", stock: 8, apartado: 0, sedes: [{ ubicacion_id: "tru", nombre: "Tienda TRU", cantidad: 8 }], vendida: false },
    ]);
    expect(leido).toEqual({ "v-s": { stock: 8, apartado: 0, sedes: [{ ubicacionId: "tru", nombre: "Tienda TRU", cantidad: 8 }], vendida: false } });
    expect(leerEstadoVariantes(null)).toBeNull();
    // `[]` = cuenta sin permiso de catálogo (o prenda sin variantes): «no se sabe», nunca «todas en 0 u.».
    expect(leerEstadoVariantes([])).toBeNull();
    expect(leerEstadoVariantes([{ nada: 1 }])).toBeNull();
  });

  it("la suma del grupo", () => {
    expect(unidadesEnStock(BOD(), ESTADO_BOD)).toBe(17);
    expect(unidadesEnStock(BOD(), null)).toBeNull();
  });
});

describe("conUnReintentoSiChoca — el círculo de candados que T8 no cierra (ADR-0263)", () => {
  const choque = { data: null, error: { code: "40P01", message: "deadlock detected" } };
  const bien = { data: 9, error: null };
  const otro = { data: null, error: { code: "PT409", message: "Otra persona cambió esta prenda…" } };

  function secuencia<R>(respuestas: R[]) {
    let i = 0;
    const llamar = () => Promise.resolve(respuestas[Math.min(i++, respuestas.length - 1)]);
    return { llamar, veces: () => i };
  }

  it("si la ficha cae por 40P01 (la base deshizo todo), repite la misma llamada UNA vez", async () => {
    const s = secuencia<typeof choque | typeof bien>([choque, bien]);
    expect(await conUnReintentoSiChoca(s.llamar)).toBe(bien);
    expect(s.veces()).toBe(2);
  });

  it("si vuelve a caer, no insiste: devuelve el choque y la ficha lo dice con palabras", async () => {
    const s = secuencia([choque, choque, bien]);
    const r = await conUnReintentoSiChoca(s.llamar);
    expect(s.veces()).toBe(2);
    expect(esChoqueDeCandados(r.error)).toBe(true);
    expect(FRASE_CHOQUE_DE_CANDADOS).toMatch(/No se guardó nada/);
    expect(FRASE_CHOQUE_DE_CANDADOS).not.toMatch(/deadlock|40P01/);
  });

  it("un éxito o cualquier otro rechazo (versión cambiada, permiso) no se repite", async () => {
    for (const r of [bien, otro]) {
      const s = secuencia([r, bien]);
      expect(await conUnReintentoSiChoca(s.llamar)).toBe(r);
      expect(s.veces()).toBe(1);
    }
    expect(esChoqueDeCandados(null)).toBe(false);
    expect(esChoqueDeCandados({ code: "55P03" })).toBe(false);
  });
});
