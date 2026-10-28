import { describe, expect, it } from "vitest";
import type { Estacion, EventoCalendario, TemporadaEfectiva } from "./temporada-reglas";
import {
  anioHoyLima,
  armarCategorias,
  armarSinTemporada,
  estacionesDe,
  estacionesFaltantes,
  fechasPorAgregar,
  fechasSugeridas,
  filtrarSinTemporada,
  grupoDeTemporada,
  gruposPorCategoria,
  motivoSinTemporadas,
  nombresDeCategorias,
  prendasPorTemporada,
  primerAnioVisible,
  resumenVistas,
  revisarFechas,
  textoAsignar,
  textoCambioCategoria,
  textoDiaLima,
  tonoDeTemporada,
  vecinas,
  vistaTemporadas,
  type CategoriaTemporada,
  type PrendaSinTemporada,
  type ProductoParaTemporadas,
} from "./temporadas-pantalla";

const fila = (producto_id: string, color_codigo: string | null, temporada: string | null, origen: TemporadaEfectiva["origen"], estado = "activo"): TemporadaEfectiva => ({
  producto_id,
  color_codigo,
  estado,
  temporada,
  origen,
});

// Las fechas sembradas por 20260928100000 para 2026 y el comienzo de 2027 (hora de Perú).
const ev = (anio: number, estacion: EventoCalendario["estacion"], inicio: string, extra: Partial<EventoCalendario> = {}): EventoCalendario => ({
  anio,
  estacion,
  inicio,
  hasta: null,
  fuente: "usno",
  editable: true,
  en_curso: false,
  ...extra,
});
const CALENDARIO: EventoCalendario[] = [
  ev(2026, "otono", "2026-03-20T09:46:00-05:00", { editable: false }),
  ev(2026, "invierno", "2026-06-21T03:24:00-05:00", { editable: false }),
  ev(2026, "primavera", "2026-09-22T19:05:00-05:00", { editable: false, en_curso: true }),
  ev(2026, "verano", "2026-12-21T15:50:00-05:00"),
  ev(2027, "otono", "2027-03-20T15:25:00-05:00"),
];
const HOY = new Date("2026-09-26T12:00:00-05:00");

describe("armarCategorias — la cifra que se muestra ANTES de cambiarle la temporada a una categoría", () => {
  const categorias = [
    { id: "c-banio", nombre: "Ropa de baño", temporada: "verano", padreId: null },
    { id: "c-bikini", nombre: "Bikinis", temporada: null, padreId: "c-banio" },
    { id: "c-blusa", nombre: "Blusas", temporada: null, padreId: null },
  ];
  const productos = [
    { id: "p1", categoriaId: "c-banio" },
    { id: "p2", categoriaId: "c-banio" },
    { id: "p3", categoriaId: "c-blusa" },
  ];
  const filas = [
    fila("p1", "NEG", "verano", "categoria"),
    fila("p2", "ROJ", "invierno", "producto"), // tiene la suya: no se reclasifica
    fila("p3", "BLA", null, null), // sin nada: tomaría la de su categoría
  ];
  it("cuenta las que heredan, ordena por nombre y nombra la subcategoría con su padre", () => {
    expect(armarCategorias(categorias, productos, filas)).toEqual([
      { id: "c-blusa", nombre: "Blusas", temporada: null, heredan: 1, prendas: 1 },
      { id: "c-banio", nombre: "Ropa de baño", temporada: "verano", heredan: 1, prendas: 2 },
      { id: "c-bikini", nombre: "Ropa de baño › Bikinis", temporada: null, heredan: 0, prendas: 0 },
    ]);
  });
  it("nombresDeCategorias deja igual una categoría sin padre", () => {
    expect(nombresDeCategorias(categorias).get("c-blusa")).toBe("Blusas");
  });
});

describe("armarSinTemporada — la lista para completar", () => {
  const productos = new Map<string, ProductoParaTemporadas>([
    ["p1", { id: "p1", nombre: "Blusa Lino", codigo: "BLU-001", categoriaId: "c-blusa", marca: "Costanera", proveedor: "Textiles del Valle" }],
    // Sin marca ni proveedor: pasa (ADR-0283) y la lista lo dice con `null`, no con un texto inventado.
    ["p2", { id: "p2", nombre: "Abrigo Paño", codigo: null, categoriaId: null, marca: null, proveedor: null }],
  ]);
  const colores = new Map([
    ["NEG", "Negro"],
    ["ROJ", "Rojo"],
  ]);
  const categorias = new Map([["c-blusa", "Blusas"]]);
  it("nombra prenda, código, categoría, marca, proveedor y colores; marca si solo algunos colores faltan", () => {
    const filas = [
      fila("p1", "ROJ", null, null),
      fila("p1", "NEG", null, null),
      fila("p2", "NEG", "invierno", "color"),
      fila("p2", null, null, null),
      fila("p3", "NEG", null, null, "descontinuado"), // ya no se vende: no se pide
    ];
    expect(armarSinTemporada(filas, productos, colores, categorias)).toEqual([
      {
        productoId: "p1",
        nombre: "Blusa Lino",
        codigo: "BLU-001",
        categoriaId: "c-blusa",
        categoria: "Blusas",
        marca: "Costanera",
        proveedor: "Textiles del Valle",
        colores: ["Negro", "Rojo"],
        todosSusColores: true,
      },
      { productoId: "p2", nombre: "Abrigo Paño", codigo: null, categoriaId: null, categoria: null, marca: null, proveedor: null, colores: ["Sin color"], todosSusColores: false },
    ]);
  });
  it("vacía cuando todas tienen temporada", () => {
    expect(armarSinTemporada([fila("p1", "NEG", "verano", "producto")], productos, colores, categorias)).toEqual([]);
  });
  it("se busca sin tildes por nombre, código, categoría, marca, proveedor o color", () => {
    const lista = armarSinTemporada([fila("p1", "ROJ", null, null), fila("p2", null, null, null)], productos, colores, categorias);
    expect(filtrarSinTemporada(lista, "pano").map((p) => p.productoId)).toEqual(["p2"]);
    expect(filtrarSinTemporada(lista, "blu-001").map((p) => p.productoId)).toEqual(["p1"]);
    expect(filtrarSinTemporada(lista, "rojo").map((p) => p.productoId)).toEqual(["p1"]);
    expect(filtrarSinTemporada(lista, "COSTANERA").map((p) => p.productoId)).toEqual(["p1"]);
    expect(filtrarSinTemporada(lista, "textiles del valle").map((p) => p.productoId)).toEqual(["p1"]);
    expect(filtrarSinTemporada(lista, "  ")).toHaveLength(2);
  });
  it("una prenda sin marca ni proveedor, o fuera de la lista de activas, queda con `null` y no con un texto inventado", () => {
    const sola = new Map<string, ProductoParaTemporadas>([["p9", { id: "p9", nombre: "Falda", codigo: null, categoriaId: null, marca: null, proveedor: null }]]);
    const [p] = armarSinTemporada([fila("p9", "NEG", null, null)], sola, colores, categorias);
    expect([p.marca, p.proveedor]).toEqual([null, null]);
    // Y una prenda que ni está en el mapa de productos (quedó fuera de la lista de activas) tampoco inventa nada.
    const [huerfana] = armarSinTemporada([fila("p10", "NEG", null, null)], sola, colores, categorias);
    expect([huerfana.marca, huerfana.proveedor]).toEqual([null, null]);
  });
});

describe("prendasPorTemporada", () => {
  it("cuenta prendas activas distintas; una con un color de otra temporada cuenta en las dos", () => {
    expect(
      prendasPorTemporada([
        fila("p1", "NEG", "verano", "producto"),
        fila("p1", "ROJ", "verano", "producto"),
        fila("p1", "AZU", "invierno", "color"),
        fila("p2", "NEG", "verano", "categoria"),
        fila("p3", "NEG", "verano", "producto", "descontinuado"),
        fila("p4", "NEG", null, null),
      ]),
    ).toEqual({ verano: 2, invierno: 1 });
  });
});

describe("el calendario en pantalla", () => {
  it("el año de hoy es el de Perú, no el de UTC", () => {
    expect(anioHoyLima(new Date("2027-01-01T02:00:00Z"))).toBe(2026);
    expect(anioHoyLima(new Date("2027-01-01T06:00:00Z"))).toBe(2027);
  });
  it("se muestra desde el año de la estación en curso (el verano de diciembre sigue en enero)", () => {
    expect(primerAnioVisible(CALENDARIO, 2026)).toBe(2026);
    const enero = CALENDARIO.map((e) => ({ ...e, en_curso: e.estacion === "verano" && e.anio === 2026 }));
    expect(primerAnioVisible(enero, 2027)).toBe(2026);
    expect(primerAnioVisible([], 2027)).toBe(2027);
  });
  it("estacionesFaltantes y fechasSugeridas: el 20/21/22/21 de mar/jun/set/dic a mediodía", () => {
    expect(estacionesFaltantes(CALENDARIO, 2027)).toEqual(["invierno", "primavera", "verano"]);
    expect(estacionesFaltantes(CALENDARIO, 2026)).toEqual([]);
    expect(fechasSugeridas(2029, ["otono", "invierno", "primavera", "verano"])).toEqual([
      { anio: 2029, estacion: "otono", fecha: "2029-03-20", hora: "12:00" },
      { anio: 2029, estacion: "invierno", fecha: "2029-06-21", hora: "12:00" },
      { anio: 2029, estacion: "primavera", fecha: "2029-09-22", hora: "12:00" },
      { anio: 2029, estacion: "verano", fecha: "2029-12-21", hora: "12:00" },
    ]);
  });
  it("vecinas: la estación anterior y la siguiente por fecha", () => {
    const { antes, despues } = vecinas(CALENDARIO, 2026, "verano");
    expect(antes?.estacion).toBe("primavera");
    expect(despues?.anio).toBe(2027);
    expect(vecinas(CALENDARIO, 2031, "verano")).toEqual({ antes: null, despues: null });
  });
});

describe("revisarFechas — la web solo bloquea lo que la base no puede decir antes del viaje", () => {
  const limites = vecinas(CALENDARIO, 2026, "verano");
  const verano = (fecha: string, hora = "15:50") => [{ anio: 2026, estacion: "verano" as const, fecha, hora }];
  it("una fecha bien escrita sale con la zona de Perú, sin error ni aviso", () => {
    expect(revisarFechas(verano("2026-12-20"), HOY, limites)).toEqual([{ instante: "2026-12-20T15:50:00-05:00", error: null, aviso: null }]);
  });
  it("fecha u hora incompleta, o una fecha que no existe: eso SÍ bloquea (no hay instante que mandar)", () => {
    const [incompleta] = revisarFechas(verano("2026-12-20", ""), HOY, limites);
    expect(incompleta.error).toMatch(/Falta la fecha o la hora/);
    expect(incompleta.instante).toBeNull();
    expect(revisarFechas(verano("2026-11-31"), HOY, limites)[0].error).toMatch(/no es una fecha real/);
  });
  it("lo que ya pasó: se avisa, no se bloquea (quien decide es la base)", () => {
    const [r] = revisarFechas([{ anio: 2026, estacion: "primavera", fecha: "2026-09-22", hora: "19:05" }], HOY);
    expect(r.error).toBeNull();
    expect(r.instante).not.toBeNull();
    expect(r.aviso).toMatch(/ya pasó/);
  });
  it("la holgura alrededor del 21 de su mes NO se revisa aquí: es un número de la base", () => {
    // Antes la web apagaba «Guardar» a más de 60 días; si la base amplía la holgura, la web no puede seguir bloqueando.
    expect(revisarFechas(verano("2027-02-25"), HOY)).toEqual([{ instante: "2027-02-25T15:50:00-05:00", error: null, aviso: null }]);
  });
  it("entre la anterior y la siguiente del calendario: aviso", () => {
    const r = revisarFechas(verano("2027-01-15"), HOY, { ...limites, despues: { ...CALENDARIO[4], inicio: "2027-01-10T10:00:00-05:00" } })[0];
    expect(r.error).toBeNull();
    expect(r.aviso).toMatch(/antes del inicio de otoño \(10 ene 2027, 10:00\)/);
    const antesDeLaPrimavera = revisarFechas([{ anio: 2026, estacion: "verano", fecha: "2026-10-23", hora: "10:00" }], new Date("2026-09-01T00:00:00Z"), {
      antes: { ...CALENDARIO[2], inicio: "2026-10-24T10:00:00-05:00" },
      despues: null,
    });
    expect(antesDeLaPrimavera[0].aviso).toMatch(/después del inicio de primavera/);
  });
  it("al agregar un año, cada estación después de la que se acaba de escribir", () => {
    const filas = fechasSugeridas(2029, ["otono", "invierno"]);
    filas[0] = { ...filas[0], fecha: "2029-05-10" };
    filas[1] = { ...filas[1], fecha: "2029-05-01" };
    const r = revisarFechas(filas, HOY, { antes: ev(2028, "verano", "2028-12-21T03:19:00-05:00"), despues: null });
    expect(r[0].aviso).toBeNull();
    expect(r[1].aviso).toMatch(/después del inicio de otoño \(10 may 2029, 12:00\)/);
    // Y la primera, después de la última que ya estaba en el calendario.
    const temprano = revisarFechas([{ anio: 2029, estacion: "otono", fecha: "2029-01-20", hora: "12:00" }], HOY, {
      antes: ev(2028, "verano", "2029-02-01T03:19:00-05:00"),
      despues: null,
    });
    expect(temprano[0].aviso).toMatch(/después del inicio de verano \(1 feb 2029, 03:19\)/);
  });
});

describe("«Agregar el año»: solo las estaciones que faltan (otra persona pudo agregar alguna mientras tanto)", () => {
  const cal2028 = [ev(2028, "verano", "2028-12-21T03:19:00-05:00")];
  it("sin nada guardado: las cuatro, con lo que el líder escribió en las que tocó", () => {
    const escrita = { anio: 2029, estacion: "invierno" as const, fecha: "2029-05-25", hora: "08:00" };
    expect(fechasPorAgregar(cal2028, 2029, { invierno: escrita }).map((f) => [f.estacion, f.fecha])).toEqual([
      ["otono", "2029-03-20"],
      ["invierno", "2029-05-25"],
      ["primavera", "2029-09-22"],
      ["verano", "2029-12-21"],
    ]);
  });
  it("si el otoño ya estaba, la ventana ya no lo muestra (ni lo marca en error) y el resto conserva lo escrito", () => {
    const conOtono = [...cal2028, ev(2029, "otono", "2029-03-20T12:00:00-05:00")];
    const escrita = { anio: 2029, estacion: "invierno" as const, fecha: "2029-05-25", hora: "08:00" };
    const filas = fechasPorAgregar(conOtono, 2029, { otono: { anio: 2029, estacion: "otono", fecha: "2029-03-20", hora: "12:00" }, invierno: escrita });
    expect(filas.map((f) => f.estacion)).toEqual(["invierno", "primavera", "verano"]);
    expect(filas[0]).toEqual(escrita);
    // Y se revisan contra el otoño ya guardado, no contra sí mismas.
    expect(revisarFechas(filas, HOY, { antes: conOtono[1], despues: null }).every((r) => r.aviso === null && r.error === null)).toBe(true);
  });
});


describe("motivoSinTemporadas — la pestaña no se cae si el SQL todavía no está en producción", () => {
  it("sin la función o la columna: «todavía no están activas»", () => {
    expect(motivoSinTemporadas({ code: "PGRST202", message: "Could not find the function retail.fn_temporadas" })).toMatch(/todavía no están activas/);
    expect(motivoSinTemporadas({ code: "42703", message: "column categorias.temporada does not exist" })).toMatch(/todavía no están activas/);
  });
  it("otro fallo se dice distinto, para no esconderlo", () => {
    expect(motivoSinTemporadas({ code: "", message: "TypeError: fetch failed" })).toMatch(/No se pudieron leer/);
  });
});

describe("las confirmaciones dicen la consecuencia ANTES de guardar", () => {
  it("cambiar la temporada de una categoría dice cuántas prendas se reclasifican", () => {
    const t = textoCambioCategoria("Ropa de baño", null, "Verano", 12);
    expect(t.titulo).toBe("¿Cambiar la temporada de «Ropa de baño»?");
    expect(t.bajada).toBe(
      "Pasa de «Sin temporada» a «Verano». 12 prendas la heredan hoy y se reclasifican al instante. Las que tienen su propia temporada no cambian.",
    );
    expect(textoCambioCategoria("Blusas", "Verano", null, 1).bajada).toMatch(/1 prenda la hereda hoy y se reclasifica al instante \(queda «Sin temporada»/);
    expect(textoCambioCategoria("Blusas", null, "Verano", 0).bajada).toMatch(/ninguna prenda la hereda/);
  });
  it("la asignación en lote avisa que es todo o nada", () => {
    const t = textoAsignar("Verano", 1);
    expect(t.titulo).toBe("¿Poner «Verano» a 1 prenda?");
    expect(t.bajada).toMatch(/si una falla, no cambia ninguna/);
    expect(t.bajada).toMatch(/le pusieron temporada mientras tanto, esa se salta/);
    expect(textoAsignar("Invierno", 3).titulo).toBe("¿Poner «Invierno» a 3 prendas?");
  });
});

describe("las cuatro vistas de la pestaña", () => {
  it("abre «Las nueve» (la grilla, como las otras pestañas) salvo que la URL pida otra que exista", () => {
    expect(vistaTemporadas(null)).toBe("lista");
    expect(vistaTemporadas("completar")).toBe("completar"); // «Completar» de Productos
    expect(vistaTemporadas("categorias")).toBe("categorias"); // el enlace de Categorías
    expect(vistaTemporadas("calendario")).toBe("calendario");
    expect(vistaTemporadas("sin-temporada")).toBe("lista"); // el ancla vieja no rompe nada
  });

  const prenda = (productoId: string, categoriaId: string | null, categoria: string | null): PrendaSinTemporada => ({
    productoId,
    nombre: productoId,
    codigo: null,
    categoriaId,
    categoria,
    marca: null,
    proveedor: null,
    colores: ["Negro"],
    todosSusColores: true,
  });
  const categoria = (id: string, nombre: string, temporada: string | null = null): CategoriaTemporada => ({ id, nombre, temporada, heredan: 0, prendas: 0 });

  it("agrupa por categoría, de la que más rinde a la que menos, con «Sin categoría» al final", () => {
    const prendas = [prenda("a", "c-pol", "Polos"), prenda("b", null, null), prenda("c", "c-bod", "Bodys"), prenda("d", "c-bod", "Bodys"), prenda("e", "c-cam", "Camisas")];
    const grupos = gruposPorCategoria(prendas, [categoria("c-bod", "Bodys"), categoria("c-cam", "Camisas"), categoria("c-pol", "Polos")]);
    expect(grupos.map((g) => [g.categoria, g.prendas.length])).toEqual([
      ["Bodys", 2],
      ["Camisas", 1],
      ["Polos", 1],
      ["Sin categoría", 1],
    ]);
    expect(grupos[3].activa).toBeNull();
  });

  it("una categoría desactivada agrupa igual, pero sin atajo", () => {
    const [g] = gruposPorCategoria([prenda("a", "c-vieja", "Vieja")], [categoria("c-pol", "Polos")]);
    expect(g.categoriaId).toBe("c-vieja");
    expect(g.activa).toBeNull();
  });

  it("las cifras de las tarjetas: cuántas faltan, en cuántas categorías y la estación en curso", () => {
    const r = resumenVistas({
      sinTemporada: [prenda("a", "c-pol", "Polos"), prenda("b", "c-pol", "Polos"), prenda("c", null, null)],
      categorias: [categoria("c-pol", "Polos"), categoria("c-ban", "Ropa de baño", "verano")],
      calendario: [ev(2026, "invierno", "2026-06-21T08:24:00+00:00"), { ...ev(2026, "primavera", "2026-09-23T00:05:00+00:00"), en_curso: true, hasta: "2026-12-21T20:50:00+00:00" }],
      prendasActivas: 33,
    });
    expect(r).toEqual({
      sinTemporada: 3,
      categoriasConPendientes: 2,
      categoriasSinTemporada: 1,
      categorias: 2,
      prendasActivas: 33,
      enCurso: { estacion: "primavera", hasta: "2026-12-21T20:50:00+00:00", siguiente: "verano" },
    });
  });

  it("después del verano viene el otoño (el ciclo da la vuelta)", () => {
    const r = resumenVistas({ sinTemporada: [], categorias: [], calendario: [{ ...ev(2026, "verano", "2026-12-21T20:50:00+00:00"), en_curso: true }], prendasActivas: 0 });
    expect(r.enCurso?.siguiente).toBe("otono");
  });

  it("la fecha corta de la tarjeta va en hora de Perú", () => {
    expect(textoDiaLima("2026-12-21T20:50:00+00:00")).toBe("21 dic.");
    // 02:00 UTC del 1 de enero todavía es 31 de diciembre en Lima
    expect(textoDiaLima("2027-01-01T02:00:00+00:00")).toBe("31 dic.");
  });
});

describe("las nueve en grilla (ADR-0261)", () => {
  // Las nueve tal como las siembra 20260928100000.
  const t = (clave: string, es_clasico: boolean, estacion_desde: Estacion | null, estacion_hasta: Estacion | null) => ({ clave, es_clasico, estacion_desde, estacion_hasta });
  const NUEVE = [
    t("primavera_verano", false, "primavera", "otono"),
    t("primavera", false, "primavera", "verano"),
    t("verano", false, "verano", "otono"),
    t("otono_invierno", false, "otono", "primavera"),
    t("otono", false, "otono", "invierno"),
    t("invierno", false, "invierno", "primavera"),
    t("clasico", true, null, null),
    t("clasico_verano", true, "verano", "otono"),
    t("clasico_invierno", true, "invierno", "primavera"),
  ];
  const por = (clave: string) => NUEVE.find((x) => x.clave === clave)!;

  it("cada temporada cubre las estaciones desde la suya hasta la que la termina, dando la vuelta al año", () => {
    expect(estacionesDe(por("primavera_verano"))).toEqual(["primavera", "verano"]);
    expect(estacionesDe(por("otono_invierno"))).toEqual(["otono", "invierno"]); // cruza fin de año
    expect(estacionesDe(por("verano"))).toEqual(["verano"]);
    expect(estacionesDe(por("clasico_invierno"))).toEqual(["invierno"]);
    expect(estacionesDe(por("clasico"))).toEqual([]); // todo el año: no termina
  });

  it("se agrupan en 4 de una estación, 2 de dos y 3 clásicos", () => {
    const cuenta = (g: string) => NUEVE.filter((x) => grupoDeTemporada(x) === g).map((x) => x.clave);
    expect(cuenta("una")).toEqual(["primavera", "verano", "otono", "invierno"]);
    expect(cuenta("dos")).toEqual(["primavera_verano", "otono_invierno"]);
    expect(cuenta("clasicos")).toEqual(["clasico", "clasico_verano", "clasico_invierno"]);
  });

  it("el tono sigue la mitad del año; los clásicos, neutros aunque tengan estación", () => {
    expect(NUEVE.map((x) => [x.clave, tonoDeTemporada(x)])).toEqual([
      ["primavera_verano", "calido"],
      ["primavera", "calido"],
      ["verano", "calido"],
      ["otono_invierno", "frio"],
      ["otono", "frio"],
      ["invierno", "frio"],
      ["clasico", "neutro"],
      ["clasico_verano", "neutro"],
      ["clasico_invierno", "neutro"],
    ]);
  });
});
