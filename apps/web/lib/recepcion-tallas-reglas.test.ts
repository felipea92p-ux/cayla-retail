import { describe, expect, it } from "vitest";
import type { VarianteSeparada } from "./recepcion-conteo-reglas";
import { matrizDe, type Conteo, type PrendaRecepcion, type TallaDeLaCategoria, type VarianteRecepcion } from "./recepcion-envio-reglas";
import {
  llenarTodasLasTallas,
  coloresIniciales,
  cuadreDeTallas,
  marcasDeLaTabla,
  tablaConLoMarcado,
  mismasVariantes,
  modoDeTallas,
  estadoDeLaTarjeta,
  tocaRepartir,
  botonPrincipal,
  modosAlCambiar,
  ordenarTallasVisibles,
  quitarColor,
  quitarTalla,
  tablaParaElNumero,
  tallasIniciales,
  tallasListas,
  type EstadoDeLaTarjeta,
} from "./recepcion-tallas-reglas";

const CATEGORIA: TallaDeLaCategoria[] = [
  { id: "xs", valor: "XS", habitual: false },
  { id: "s", valor: "S", habitual: true },
  { id: "m", valor: "M", habitual: true },
  { id: "l", valor: "L", habitual: true },
  { id: "xl", valor: "XL", habitual: false },
  { id: "xxl", valor: "XXL", habitual: false },
];

const variante = (talla: string, color: string): VarianteRecepcion => ({
  id: `${talla}-${color}`,
  tallaId: talla,
  talla: talla.toUpperCase(),
  colorCodigo: color,
  color: color === "neg" ? "Negro" : "Crema",
  codigo: null,
  costo: null,
  precio: null,
});

const prenda = (...variantes: VarianteRecepcion[]): Pick<PrendaRecepcion, "variantes"> => ({ variantes });
const COMPLETA = prenda(...["xs", "s", "m", "l", "xl"].flatMap((t) => [variante(t, "neg"), variante(t, "cre")]));
const conteo = (cantidades: Record<string, string> = {}, extra: Partial<Conteo> = {}): Conteo => ({ cantidades, danadas: {}, conDanadas: false, arreglo: null, ...extra });

describe("con qué arranca la tabla", () => {
  it("con las tallas de siempre de la categoría, aunque la prenda tenga más", () => {
    expect(tallasIniciales(matrizDe(COMPLETA), COMPLETA, CATEGORIA, conteo())).toEqual(["s", "m", "l"]);
  });

  it("lo que ya trae cantidad no se esconde", () => {
    expect(tallasIniciales(matrizDe(COMPLETA), COMPLETA, CATEGORIA, conteo({ "xl-neg": "4" }))).toEqual(["s", "m", "l", "xl"]);
  });

  it("si la prenda no tiene ninguna de las de siempre, todas las suyas", () => {
    const soloGrandes = prenda(variante("xl", "neg"), variante("xxl", "neg"));
    expect(tallasIniciales(matrizDe(soloGrandes), soloGrandes, CATEGORIA, conteo())).toEqual(["xl", "xxl"]);
  });

  it("una prenda sin talla sigue teniendo su columna", () => {
    const unica = prenda({ ...variante("x", "neg"), tallaId: null, talla: null, id: "u" });
    expect(tallasIniciales(matrizDe(unica), unica, CATEGORIA, conteo())).toEqual([""]);
  });

  it("todos los colores de la prenda; si ya hay cantidades, solo esos", () => {
    expect(coloresIniciales(matrizDe(COMPLETA), COMPLETA, conteo()).sort()).toEqual(["cre", "neg"]);
    expect(coloresIniciales(matrizDe(COMPLETA), COMPLETA, conteo({ "s-neg": "2" }))).toEqual(["neg"]);
  });
});

describe("agregar: la hoja completa de tallas y colores, no un combo (ADR-0645)", () => {
  const tabla = (cantidades: Record<string, string> = {}, tallas = ["s", "m", "l"], colores = ["neg", "cre"]) => ({ conteo: conteo(cantidades), tallas, colores });

  it("una talla nueva cae en su lugar de la curva", () => {
    expect(ordenarTallasVisibles(matrizDe(COMPLETA), ["s", "m", "l", "xs"])).toEqual(["xs", "s", "m", "l"]);
  });

  it("la hoja arranca con lo que la tabla muestra; la talla única y el sin color no se marcan", () => {
    expect(marcasDeLaTabla(tabla())).toEqual({ tallaIds: ["s", "m", "l"], colorCodigos: ["neg", "cre"] });
    expect(marcasDeLaTabla({ tallas: [""], colores: ["", "neg"] })).toEqual({ tallaIds: [], colorCodigos: ["neg"] });
  });

  it("sin cambiar nada, la tabla queda igual", () => {
    const antes = tabla({ "s-neg": "4" });
    const r = tablaConLoMarcado(antes, COMPLETA, marcasDeLaTabla(antes), marcasDeLaTabla(antes));
    expect(r).toEqual({ tabla: antes, perdidas: 0 });
  });

  it("lo que se marca se suma a la tabla, lo tuviera ya la prenda o se acabe de crear", () => {
    const antes = tabla({ "s-neg": "4" }, ["s", "m"], ["neg"]);
    const r = tablaConLoMarcado(antes, COMPLETA, marcasDeLaTabla(antes), { tallaIds: ["s", "m", "xl", "xxl"], colorCodigos: ["neg", "cre", "vin"] });
    expect(r.tabla.tallas).toEqual(["s", "m", "xl", "xxl"]);
    expect(r.tabla.colores).toEqual(["neg", "cre", "vin"]);
    expect(r.tabla.conteo.cantidades).toEqual({ "s-neg": "4" });
    expect(r.perdidas).toBe(0);
  });

  it("lo que se desmarca sale con sus cantidades, y dice cuántas había para el «Deshacer»", () => {
    const antes = tabla({ "s-neg": "4", "m-neg": "3", "m-cre": "2", "l-cre": "1" });
    const r = tablaConLoMarcado(antes, COMPLETA, marcasDeLaTabla(antes), { tallaIds: ["s", "l"], colorCodigos: ["neg"] });
    // Sale la talla M (3 + 2) y el color crema (lo que quedaba: 1 en L).
    expect(r.tabla.tallas).toEqual(["s", "l"]);
    expect(r.tabla.colores).toEqual(["neg"]);
    expect(r.tabla.conteo.cantidades).toEqual({ "s-neg": "4" });
    expect(r.perdidas).toBe(6);
    // Lo de antes no se toca: con eso se deshace.
    expect(antes.conteo.cantidades["m-neg"]).toBe("3");
  });

  it("la talla única y el sin color se quedan: la hoja no los maneja", () => {
    const unica = { conteo: conteo(), tallas: [""], colores: ["", "neg"] };
    const r = tablaConLoMarcado(unica, COMPLETA, marcasDeLaTabla(unica), { tallaIds: [], colorCodigos: ["neg", "cre"] });
    expect(r.tabla.tallas).toEqual([""]);
    expect(r.tabla.colores).toEqual(["", "neg", "cre"]);
  });
});

describe("quitar", () => {
  it("una talla se lleva sus cantidades y sus dañadas, y dice cuántas había", () => {
    const antes = conteo({ "xs-neg": "3", "xs-cre": "2", "s-neg": "9" }, { danadas: { "xs-neg": "1" }, conDanadas: true });
    const r = quitarTalla(antes, COMPLETA, "xs");
    expect(r.perdidas).toBe(5);
    expect(r.conteo.cantidades).toEqual({ "s-neg": "9" });
    expect(r.conteo.danadas).toEqual({});
    expect(antes.cantidades["xs-neg"]).toBe("3");
  });

  it("un color también", () => {
    const r = quitarColor(conteo({ "s-neg": "3", "s-cre": "2" }), COMPLETA, "neg");
    expect(r.perdidas).toBe(3);
    expect(r.conteo.cantidades).toEqual({ "s-cre": "2" });
  });

  it("sin cantidades no hay nada que deshacer", () => {
    expect(quitarTalla(conteo(), COMPLETA, "xs").perdidas).toBe(0);
  });
});

describe("cuándo se guarda", () => {
  it("dice lo que falta contra lo contado", () => {
    expect(cuadreDeTallas(conteo(), COMPLETA, 360)).toEqual({ estado: "vacia", texto: "Reparte las 360" });
    expect(cuadreDeTallas(conteo({ "s-neg": "360" }), COMPLETA, 360).estado).toBe("cuadra");
    expect(cuadreDeTallas(conteo({ "s-neg": "300" }), COMPLETA, 360)).toEqual({ estado: "faltan", texto: "Faltan 60 por repartir" });
    expect(cuadreDeTallas(conteo({ "s-neg": "1400" }), COMPLETA, 360)).toEqual({ estado: "sobran", texto: "Te pasaste por 1,040" });
  });

  it("«Cuadra» solo si de verdad se guarda: las dañadas a medias tampoco", () => {
    const base = { "s-neg": "5" };
    const sinArreglo = conteo(base, { conDanadas: true, danadas: { "s-neg": "2" } });
    expect(cuadreDeTallas(sinArreglo, COMPLETA, 5).texto).toBe("Falta decir si tienen arreglo: aún no se guarda");
    const deMas = conteo(base, { conDanadas: true, danadas: { "s-neg": "9" }, arreglo: "pendiente" });
    expect(cuadreDeTallas(deMas, COMPLETA, 5).estado).toBe("danadas");
    const bien = conteo(base, { conDanadas: true, danadas: { "s-neg": "2" }, arreglo: "pendiente" });
    expect(cuadreDeTallas(bien, COMPLETA, 5).estado).toBe("cuadra");
    expect(cuadreDeTallas(conteo(base, { conDanadas: true }), COMPLETA, 5).estado).toBe("cuadra");
  });

  it("dice lo mismo que lo que se guarda", () => {
    const casos: Conteo[] = [
      conteo(),
      conteo({ "s-neg": "5" }),
      conteo({ "s-neg": "4" }),
      conteo({ "s-neg": "6" }),
      conteo({ "s-neg": "5" }, { conDanadas: true }),
      conteo({ "s-neg": "5" }, { conDanadas: true, danadas: { "s-neg": "2" } }),
      conteo({ "s-neg": "5" }, { conDanadas: true, danadas: { "s-neg": "9" }, arreglo: "pendiente" }),
      conteo({ "s-neg": "5" }, { conDanadas: true, danadas: { "s-neg": "2" }, arreglo: "sin_solucion" }),
    ];
    for (const c of casos) expect(cuadreDeTallas(c, COMPLETA, 5).estado === "cuadra").toBe(tallasListas(c, COMPLETA, 5));
  });

  it("solo con todo repartido: en la base las tallas siempre suman la cantidad", () => {
    expect(tallasListas(conteo({ "s-neg": "5" }), COMPLETA, 5)).toBe(true);
    expect(tallasListas(conteo({ "s-neg": "4" }), COMPLETA, 5)).toBe(false);
    expect(tallasListas(conteo({ "s-neg": "6" }), COMPLETA, 5)).toBe(false);
  });

  it("sin nada contado o sin prenda, no", () => {
    expect(tallasListas(conteo(), COMPLETA, 0)).toBe(false);
    expect(tallasListas(conteo({ "s-neg": "5" }), null, 5)).toBe(false);
  });

  it("una cantidad imposible no pasa", () => {
    expect(tallasListas(conteo({ "s-neg": "abc" }), COMPLETA, 5)).toBe(false);
  });

  it("con dañadas: ninguna de más, y dicho si tienen arreglo", () => {
    const base = { conDanadas: true } as const;
    expect(tallasListas(conteo({ "s-neg": "5" }, { ...base, danadas: { "s-neg": "6" }, arreglo: "pendiente" }), COMPLETA, 5)).toBe(false);
    expect(tallasListas(conteo({ "s-neg": "5" }, { ...base, danadas: { "s-neg": "2" } }), COMPLETA, 5)).toBe(false);
    expect(tallasListas(conteo({ "s-neg": "5" }, { ...base, danadas: { "s-neg": "2" }, arreglo: "pendiente" }), COMPLETA, 5)).toBe(true);
    expect(tallasListas(conteo({ "s-neg": "5" }, base), COMPLETA, 5)).toBe(true);
  });
});

describe("la tarjeta «Tallas y colores» del contador (ADR-0645)", () => {
  const base = { contadas: 10, enStock: 0, enCatalogo: true, modo: "ahora" as const, repartidas: 0 };

  it("sin contar, espera; lo nuevo sin crear queda para después aunque se pida «ahora» (primero se crea)", () => {
    expect(estadoDeLaTarjeta({ ...base, contadas: 0 })).toBe("espera");
    expect(estadoDeLaTarjeta({ ...base, enCatalogo: false })).toBe("nueva");
    expect(estadoDeLaTarjeta({ ...base, enCatalogo: false, modo: "despues" })).toBe("nueva");
  });

  it("lo del catálogo: repartir, a medias, de más o lista, según cuánto va", () => {
    expect(estadoDeLaTarjeta(base)).toBe("repartir");
    expect(estadoDeLaTarjeta({ ...base, repartidas: 7 })).toBe("a-medias");
    expect(estadoDeLaTarjeta({ ...base, repartidas: 12 })).toBe("de-mas");
    expect(estadoDeLaTarjeta({ ...base, repartidas: 10 })).toBe("lista");
    expect(estadoDeLaTarjeta({ ...base, modo: "despues", repartidas: 0 })).toBe("despues");
  });

  it("lo que ya entró al stock no se vuelve a repartir: se reparte lo que queda", () => {
    // Contó 10 y 4 ya entraron: quedan 6 por repartir.
    expect(estadoDeLaTarjeta({ ...base, enStock: 4, repartidas: 6 })).toBe("lista");
    expect(estadoDeLaTarjeta({ ...base, enStock: 4, repartidas: 2 })).toBe("a-medias");
    expect(estadoDeLaTarjeta({ ...base, enStock: 4, repartidas: 7 })).toBe("de-mas");
    // Todo entró: no hay nada que repartir, diga lo que diga el modo.
    expect(estadoDeLaTarjeta({ ...base, enStock: 10, modo: "despues" })).toBe("en-stock");
  });

  it("recorre todos los estados: solo repartir, a medias y de más piden el botón principal", () => {
    const todos = ["espera", "en-stock", "nueva", "despues", "repartir", "a-medias", "de-mas", "lista"] as const;
    expect(todos.filter(tocaRepartir)).toEqual(["repartir", "a-medias", "de-mas"]);
  });
});

describe("la tabla sigue a la vista mientras se escribe (Felipe 2026-11-03)", () => {
  it("sin que nadie elija: «ahora» si tiene tallas guardadas, «después» si no", () => {
    expect(modoDeTallas(undefined, true)).toBe("ahora");
    expect(modoDeTallas(undefined, false)).toBe("despues");
  });

  it("viene contestado por lo que es: lo del catálogo se reparte ahora; lo nuevo sin crear, después (ADR-0645)", () => {
    expect(modoDeTallas(undefined, false, true)).toBe("ahora");
    expect(modoDeTallas(undefined, false, false)).toBe("despues");
    // Con tallas guardadas es «ahora», esté o no en el catálogo.
    expect(modoDeTallas(undefined, true, false)).toBe("ahora");
  });

  it("lo que la persona eligió manda, tenga o no tallas, esté o no en el catálogo", () => {
    expect(modoDeTallas("ahora", false)).toBe("ahora");
    expect(modoDeTallas("despues", true)).toBe("despues");
    expect(modoDeTallas("despues", false, true)).toBe("despues");
    expect(modoDeTallas("ahora", false, false)).toBe("ahora");
  });

  it("al recargar y teclear algo que no cuadra, las tallas se sueltan y el modelo sigue en «ahora»: antes se iba a «después» y la tabla se cerraba", () => {
    const modos = modosAlCambiar({}, "modelo", true);
    // El cambio soltó las tallas: ya no hay nada guardado de donde deducir el modo.
    expect(modoDeTallas(modos.modelo, false)).toBe("ahora");
  });

  it("un modelo sin tallas guardadas no pasa a «ahora» por tocar su número: nadie lo pidió", () => {
    const modos = {};
    expect(modosAlCambiar(modos, "modelo", false)).toBe(modos);
  });

  it("«Solo la cantidad», elegido por la persona, no se pisa", () => {
    const modos = { modelo: "despues" as const };
    expect(modosAlCambiar(modos, "modelo", true)).toBe(modos);
  });

  it("los demás modelos no cambian", () => {
    expect(modosAlCambiar({ otro: "despues" }, "modelo", true)).toEqual({ otro: "despues", modelo: "ahora" });
  });
});

describe("la tabla con que se decide si el número nuevo cuadra", () => {
  const guardada = (varianteId: string, cantidad: number): VarianteSeparada => ({ varianteId, cantidad, danadas: 0, solucion: null, talla: null, color: null, codigo: null });
  const GUARDADAS = [guardada("s-neg", 20), guardada("m-neg", 28)];

  it("al recargar solo hay lo guardado: cambiar el número no lo pierde, y al volver cuadra otra vez", () => {
    const tabla = tablaParaElNumero(undefined, COMPLETA, GUARDADAS, ["neg", "cre"], CATEGORIA, 49);
    expect(tabla?.conteo.cantidades).toMatchObject({ "s-neg": "20", "m-neg": "28" });
    expect(tallasListas(tabla!.conteo, COMPLETA, 49)).toBe(false);
    expect(tallasListas(tabla!.conteo, COMPLETA, 48)).toBe(true);
  });

  it("lo que se está escribiendo manda sobre lo guardado", () => {
    const escrita = { conteo: conteo({ "s-neg": "7" }), tallas: ["s"], colores: ["neg"] };
    expect(tablaParaElNumero(escrita, COMPLETA, GUARDADAS, ["neg"], CATEGORIA, 49)).toBe(escrita);
  });

  it("sin tallas guardadas, sin la prenda leída o con el modelo en cero, no hay tabla que armar", () => {
    expect(tablaParaElNumero(undefined, COMPLETA, null, ["neg"], CATEGORIA, 49)).toBeUndefined();
    expect(tablaParaElNumero(undefined, undefined, GUARDADAS, ["neg"], CATEGORIA, 49)).toBeUndefined();
    expect(tablaParaElNumero(undefined, COMPLETA, GUARDADAS, ["neg"], CATEGORIA, 0)).toBeUndefined();
  });
});

describe("mismasVariantes", () => {
  const v = (id: string, cantidad: number, danadas = 0): VarianteSeparada => ({ varianteId: id, cantidad, danadas, solucion: danadas > 0 ? "pendiente" : null, talla: "S", color: "Negro", codigo: null });

  it("el orden no importa", () => {
    expect(mismasVariantes([v("a", 1), v("b", 2)], [v("b", 2), v("a", 1)])).toBe(true);
  });

  it("una cantidad o una dañada distinta, sí", () => {
    expect(mismasVariantes([v("a", 1)], [v("a", 2)])).toBe(false);
    expect(mismasVariantes([v("a", 2, 1)], [v("a", 2)])).toBe(false);
  });

  it("sin nada y vacío son lo mismo; lo que va en 0 no cuenta", () => {
    expect(mismasVariantes(null, [])).toBe(true);
    expect(mismasVariantes([v("a", 0)], null)).toBe(true);
  });
});

describe("botonPrincipal: un solo botón negro a la vez (ADR-0645, cambio 2 de /formidable)", () => {
  const TARJETAS: (EstadoDeLaTarjeta | null)[] = [null, "espera", "en-stock", "nueva", "despues", "repartir", "a-medias", "de-mas", "lista"];
  const SI_NO = [true, false];

  it("si al modelo le toca repartir, manda su tarjeta: también con todo contado", () => {
    for (const tarjeta of ["repartir", "a-medias", "de-mas"] as const) {
      for (const todoContado of SI_NO) for (const hayConteo of SI_NO) for (const hayParaLlevar of SI_NO) {
        expect(botonPrincipal({ tarjeta, hayParaLlevar, hayConteo, todoContado })).toBe("tarjeta");
      }
    }
  });

  it("con todo repartido manda la tarjeta solo si queda algo por llevar al stock", () => {
    expect(botonPrincipal({ tarjeta: "lista", hayParaLlevar: true, hayConteo: true, todoContado: true })).toBe("tarjeta");
    expect(botonPrincipal({ tarjeta: "lista", hayParaLlevar: false, hayConteo: true, todoContado: true })).toBe("cerrar");
    expect(botonPrincipal({ tarjeta: "lista", hayParaLlevar: false, hayConteo: true, todoContado: false })).toBe("siguiente");
  });

  it("«Revisar y cerrar» manda con todo contado y nada pendiente en el modelo en foco", () => {
    for (const tarjeta of [null, "espera", "en-stock", "nueva", "despues"] as const) {
      expect(botonPrincipal({ tarjeta, hayParaLlevar: false, hayConteo: true, todoContado: true })).toBe("cerrar");
    }
  });

  it("sin contar no hay botón negro: el protagonista es «Llegaron las N»", () => {
    expect(botonPrincipal({ tarjeta: "espera", hayParaLlevar: false, hayConteo: false, todoContado: false })).toBe("ninguno");
    expect(botonPrincipal({ tarjeta: null, hayParaLlevar: false, hayConteo: false, todoContado: false })).toBe("ninguno");
  });

  it("contado y con envío por contar, manda «Listo, siguiente»", () => {
    for (const tarjeta of ["en-stock", "nueva", "despues"] as const) {
      expect(botonPrincipal({ tarjeta, hayParaLlevar: false, hayConteo: true, todoContado: false })).toBe("siguiente");
    }
  });

  it("es una sola respuesta para cada combinación (nunca dos a la vez)", () => {
    const respuestas = new Set<string>();
    for (const tarjeta of TARJETAS) for (const hayParaLlevar of SI_NO) for (const hayConteo of SI_NO) for (const todoContado of SI_NO) {
      respuestas.add(botonPrincipal({ tarjeta, hayParaLlevar, hayConteo, todoContado }));
    }
    expect([...respuestas].sort()).toEqual(["cerrar", "ninguno", "siguiente", "tarjeta"]);
  });
});

describe("«Llenar todas con» en la tabla de tallas (Felipe 2026-11-12)", () => {
  const antes = { a: "3", b: "" };
  it("pone lo escrito en cada casilla a la vista y no toca las demás", () => {
    expect(llenarTodasLasTallas({ a: "3", b: "", z: "7" }, ["a", "b", "c"], "2", antes)).toEqual({ a: "2", b: "2", c: "2", z: "7" });
  });
  it("vacía, vuelve a como estaban al entrar a la caja", () => {
    expect(llenarTodasLasTallas({ a: "2", b: "2", c: "2" }, ["a", "b", "c"], "", antes)).toEqual({ a: "3", b: "" });
  });
  it("lo que no es una cantidad no llena nada", () => {
    expect(llenarTodasLasTallas({ a: "2", b: "2" }, ["a", "b"], "99999", antes)).toEqual({ a: "3", b: "" });
  });
  it("limpia lo escrito como una casilla", () => {
    expect(llenarTodasLasTallas({}, ["a"], " 04", {})).toEqual({ a: "4" });
  });
});
