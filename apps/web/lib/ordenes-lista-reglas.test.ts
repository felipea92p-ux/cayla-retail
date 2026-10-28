import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RPC_LISTA_DE_ORDENES,
  cifrasHoyEnElTaller,
  conEtapasDeAntes,
  cuentasDeFiltros,
  cuentasDePestanas,
  cumpleBusqueda,
  datoHoyEnElTaller,
  filaDeLaLista,
  filtrarFilas,
  leerListaDeOrdenes,
  leerOrdenCreada,
  ordenarFilas,
  pestanaDe,
  pestanaDeOrdenNueva,
  pieDeLaLista,
  textoEntrega,
  urlSinParametrosDeNueva,
  type FilaDeLista,
} from "./ordenes-lista-reglas";
import { leerOrdenPagina } from "./orden-pagina-reglas";

const HOY = "2026-10-19"; // lunes

type Crudo = Record<string, unknown>;
const fase = (clave: string, secuencia: number, extra: Crudo = {}): Crudo => ({
  id: `f-${clave}`, clave, nombre: { corte: "Corte", costura: "Costura", acabado: "Acabado", bordado: "Bordado", lavanderia: "Lavandería" }[clave] ?? clave, secuencia, posicion: null, quien: "taller",
  proveedor_id: null, proveedor_nombre: null, entrada: 0, hechas: 0, afuera: 0, salieron: 0, segundas: 0, faltantes: 0, estado: "pendiente", actual: false, empezada: false, desde: null, dias_en_fase: null, por_variante: [], ...extra,
});
const hecha = (clave: string, secuencia: number, entrada = 48): Crudo => fase(clave, secuencia, { estado: "hecha", entrada, hechas: entrada, empezada: true });

/** Una orden tal como la manda `fn_ordenes_produccion_lista` (la misma forma de `fn_orden_produccion`, sin costos y con solo el último movimiento). */
function orden(parche: { orden?: Crudo; fases?: Crudo[]; lineas?: Crudo[]; insumos?: Crudo[]; linea_de_tiempo?: Crudo[] } = {}): Crudo {
  return {
    orden: {
      id: "o-1", numero: 2, numero_texto: "OP-000002", estado: "en_proceso", es_muestra: false, fecha_entrega: "2026-10-23", nota: null, created_at: "2026-10-13T14:05:00+00:00",
      creado_por_nombre: "Felipe", inventariado_at: null, cantidad_plan: 48, cantidad_buenas: null, ubicacion_id: "u-1", ubicacion_nombre: "Taller",
      producto: { id: "p-1", referencia: "Pantalón Lía", codigo: "PAN-001", categoria: { nombre: "Pantalones", prefijo: "PAN", familia: "ropa" } },
      ...parche.orden,
    },
    lineas: parche.lineas ?? [
      { variante_id: "n", talla: "30", color_nombre: "Negro", color_hex: "#111111", cantidad_plan: 30, cantidad_buenas: null },
      { variante_id: "c", talla: "30", color_nombre: "Caqui", color_hex: "#c3a77a", cantidad_plan: 18, cantidad_buenas: null },
    ],
    fases: parche.fases ?? [hecha("corte", 10), fase("costura", 30, { quien: "servicio", proveedor_nombre: "Confecciones del Norte", entrada: 48, salieron: 48, afuera: 48, estado: "en_curso", actual: true, empezada: true, desde: "2026-10-16", dias_en_fase: 3 }), fase("acabado", 60)],
    insumos: parche.insumos ?? [],
    costos: null,
    linea_de_tiempo: parche.linea_de_tiempo ?? [{ id: "e-1", cuando: "2026-10-18T15:00:00+00:00", quien_nombre: "Rosa", tipo: "salida", fase_clave: "costura", fase_nombre: "Costura", cantidad: 48, detalle: "48 prendas" }],
    permisos: { puede_operar: true, ve_costos: false },
  };
}
const fila = (parche: Parameters<typeof orden>[0] = {}, hoy = HOY): FilaDeLista => {
  const p = leerOrdenPagina(orden(parche));
  if (!p) throw new Error("la orden de prueba no se leyó");
  return filaDeLaLista(p, hoy);
};
const con = (f: FilaDeLista, parche: Partial<FilaDeLista>): FilaDeLista => ({ ...f, ...parche });

describe("textoEntrega — la fecha y cuándo es", () => {
  it("sin fecha, hoy, mañana, en N días, ayer y hace N días", () => {
    expect(textoEntrega(null, HOY, true)).toEqual({ fecha: null, texto: "Sin fecha", relativo: "", atrasada: false });
    expect(textoEntrega("2026-10-19", HOY, true)).toMatchObject({ texto: "lun 19 oct", relativo: "hoy", atrasada: false });
    expect(textoEntrega("2026-10-20", HOY, true)).toMatchObject({ relativo: "mañana", atrasada: false });
    expect(textoEntrega("2026-10-23", HOY, true)).toMatchObject({ texto: "vie 23 oct", relativo: "en 4 días", atrasada: false });
    expect(textoEntrega("2026-10-18", HOY, true)).toMatchObject({ texto: "dom 18 oct", relativo: "ayer", atrasada: true });
    expect(textoEntrega("2026-10-15", HOY, true)).toMatchObject({ relativo: "hace 4 días", atrasada: true });
  });
  it("una orden que ya no está en proceso no tiene «cuándo» ni se atrasa", () => {
    expect(textoEntrega("2026-10-01", HOY, false)).toEqual({ fecha: "2026-10-01", texto: "jue 1 oct", relativo: "", atrasada: false });
  });
});

describe("filaDeLaLista — una orden en una fila, con las reglas de su página", () => {
  it("una orden con la costura afuera: chip «En costura · afuera», quién la tiene y cuántas afuera, cuánto lleva y qué prenda es", () => {
    const f = fila();
    expect(f).toMatchObject({
      id: "o-1",
      numeroTexto: "OP-000002",
      href: "/produccion/ordenes/OP-000002",
      referencia: "Pantalón Lía",
      esMuestra: false,
      cuantas: 48,
      grupo: "costura",
      lista: false,
      afuera: 48,
      quien: "Confecciones del Norte · 48 afuera",
      chip: { texto: "En costura · afuera", tono: "pizarra" },
      dias: { n: 3, desde: "desde vie 16" },
      cierre: null,
      abierta: "2026-10-13",
    });
    expect(f.categoria).toEqual({ nombre: "Pantalones", prefijo: "PAN", familia: "ropa" });
  });
  it("la prenda sin foto se pinta del color con más prendas del plan, y los colores se dicen en minúscula", () => {
    const f = fila();
    expect(f.colorHex).toBe("#111111");
    expect(f.colores).toBe("negro y caqui");
    expect(fila({ lineas: [] })).toMatchObject({ colorHex: null, colores: null });
  });
  it("una fase del Taller dice «Taller · 21 de 36»; un servicio sin nada mandado, «por mandar»; uno que ya devolvió algo y no tiene nada afuera, lo que lleva", () => {
    const taller = fila({ fases: [hecha("corte", 10, 36), hecha("costura", 30, 36), fase("acabado", 60, { entrada: 36, hechas: 21, estado: "en_curso", actual: true, empezada: true, desde: "2026-10-15", dias_en_fase: 4 })] });
    expect(taller).toMatchObject({ quien: "Taller · 21 de 36", chip: { texto: "En acabado" }, grupo: "acabado", afuera: 0, dias: { n: 4, desde: "desde jue 15" } });
    const porMandar = fila({ fases: [hecha("corte", 10), fase("costura", 30, { quien: "servicio", proveedor_nombre: "Confecciones del Norte", entrada: 48, estado: "pendiente", actual: true }), fase("acabado", 60)] });
    expect(porMandar.quien).toBe("Confecciones del Norte · por mandar");
    const devolvio = fila({ fases: [hecha("corte", 10), fase("costura", 30, { quien: "servicio", proveedor_nombre: "Confecciones del Norte", entrada: 48, hechas: 20, salieron: 48, afuera: 0, estado: "en_curso", actual: true, empezada: true }), fase("acabado", 60)] });
    expect(devolvio.quien).toBe("Confecciones del Norte · 20 de 48");
  });
  it("una orden que todavía no empezó su fase cuenta los días desde que se abrió", () => {
    const f = fila({ fases: [fase("corte", 10, { actual: true, estado: "pendiente" }), fase("costura", 30), fase("acabado", 60)], linea_de_tiempo: [] });
    expect(f).toMatchObject({ grupo: "corte", chip: { texto: "En corte" }, dias: { n: 6, desde: "abierta mar 13" } });
  });
  it("con todas las fases hechas está «lista»: cuenta en la última, no marca días y dice que todo está listo", () => {
    const f = fila({ fases: [hecha("corte", 10), hecha("costura", 30), hecha("acabado", 60)] });
    expect(f).toMatchObject({ lista: true, grupo: "acabado", dias: null, quien: "Taller · todas las fases listas", chip: { texto: "Lista para pasar al stock", tono: "verde" } });
  });
  it("la entrega pasada se lee como una causa con su porqué, y la fecha dice «ayer»", () => {
    const f = fila({ orden: { fecha_entrega: "2026-10-18" } });
    expect(f.entrega).toMatchObject({ texto: "dom 18 oct", relativo: "ayer", atrasada: true });
    expect(f.causas.map((c) => c.clave)).toContain("entrega_pasada");
  });
  it("«pide algo» es exactamente lo que dice la página: sin tela, sin moverse, o nada", () => {
    const sinTela = fila({
      fases: [fase("corte", 10, { actual: true, entrada: 48 }), fase("costura", 30), fase("acabado", 60)],
      insumos: [{ id: "i-1", insumo_id: "ins-1", nombre: "Lino", tipo: "tela", unidad: "metro", color_codigo: null, color_nombre: null, consumo_por_prenda: 1.5, cantidad_plan: 72, usado: 0, saldo: 28 }],
    });
    expect(sinTela.causas.map((c) => c.clave)).toEqual(["tela_no_llega"]);
    const parada = fila({ fases: [fase("corte", 10, { actual: true, entrada: 48 }), fase("costura", 30), fase("acabado", 60)], linea_de_tiempo: [{ id: "e", cuando: "2026-10-13T14:05:00+00:00", tipo: "apertura" }] });
    expect(parada.causas.map((c) => c.clave)).toContain("sin_moverse");
    expect(fila().causas).toEqual([]);
  });
  it("una terminada dice cuántas salieron buenas y desde cuándo está en el stock; una muestra, que no entra; no tiene días ni «pide algo»", () => {
    const terminada = fila({ orden: { estado: "terminada", cantidad_buenas: 45, inventariado_at: "2026-10-12T20:00:00+00:00" }, fases: [hecha("corte", 10), hecha("costura", 30), hecha("acabado", 60)] });
    expect(terminada).toMatchObject({ estado: "terminada", cuantas: 45, grupo: null, dias: null, causas: [], chip: { texto: "Pasó al stock" }, cierre: "45 buenas de 48 · en el stock desde el lun 12 oct", quien: "45 buenas de 48 · en el stock desde el lun 12 oct" });
    const muestra = fila({ orden: { estado: "terminada", es_muestra: true, cantidad_buenas: 3, cantidad_plan: 3 } });
    expect(muestra.cierre).toBe("3 buenas de 3 · muestra, no entra al stock");
  });
  it("una anulada lo dice con el día en que se abrió y su nota; no pide nada aunque la entrega haya pasado", () => {
    const f = fila({ orden: { estado: "anulada", nota: "se abrió por error", fecha_entrega: "2026-10-01" } });
    expect(f).toMatchObject({ estado: "anulada", causas: [], chip: { texto: "Anulada" }, cierre: "Anulada · se abrió el mar 13 oct · se abrió por error" });
  });
});

describe("órdenes abiertas antes de las fases", () => {
  const antes = (orden: Parameters<typeof fila>[0] = {}) => fila({ fases: [], ...orden });
  it("una orden en proceso sin ninguna fase es de antes de las fases; una con fases, o una cerrada, no", () => {
    expect(antes().legado).toBe(true);
    expect(fila().legado).toBe(false);
    expect(antes({ orden: { estado: "terminada", cantidad_buenas: 40 } }).legado).toBe(false);
  });
  it("se lee de sus etapas de siempre: «Por cortar», «En confección», «En acabado»; una tercerizada sigue en curso, afuera", () => {
    expect(conEtapasDeAntes(antes(), { corte: "pendiente" })).toMatchObject({ grupo: "corte", chip: { texto: "Por cortar", tono: "pizarra" }, quien: "Orden de antes de las fases", lista: false });
    expect(conEtapasDeAntes(antes(), { corte: "hecho", confeccion: "pendiente" })).toMatchObject({ grupo: "costura", chip: { texto: "En confección" } });
    expect(conEtapasDeAntes(antes(), { corte: "hecho", confeccion: "tercerizado" })).toMatchObject({ grupo: "costura", chip: { texto: "En confección · afuera" }, quien: "Con un servicio · orden de antes de las fases" });
    expect(conEtapasDeAntes(antes(), { corte: "hecho", confeccion: "hecho", acabado: "pendiente" })).toMatchObject({ grupo: "acabado", chip: { texto: "En acabado" } });
  });
  it("sin etapas anotadas está por cortar; con las tres hechas, lista para pasar al stock (cuenta en acabado, sin días)", () => {
    expect(conEtapasDeAntes(antes(), undefined).chip.texto).toBe("Por cortar");
    expect(conEtapasDeAntes(antes(), { corte: "hecho", confeccion: "hecho", acabado: "hecho" })).toMatchObject({ lista: true, grupo: "acabado", dias: null, chip: { texto: "Lista para pasar al stock", tono: "verde" } });
  });
  it("una muestra usa las etapas de las muestras y no cuenta en «Hoy en el Taller»", () => {
    const muestra = antes({ orden: { es_muestra: true } });
    expect(conEtapasDeAntes(muestra, { patronaje: "hecho" })).toMatchObject({ grupo: null, chip: { texto: "En muestra y aprobación" } });
    expect(conEtapasDeAntes(muestra, {})).toMatchObject({ chip: { texto: "En patronaje" } });
    const [corte] = cifrasHoyEnElTaller([conEtapasDeAntes(muestra, {})]);
    expect(corte.lotes).toBe(0);
  });
  it("una fila con fases no se toca, aunque le pasen etapas", () => {
    const f = fila();
    expect(conEtapasDeAntes(f, { corte: "pendiente" })).toBe(f);
  });
  it("las causas y la entrega de una orden de antes salen igual que las de cualquiera", () => {
    const f = conEtapasDeAntes(antes({ orden: { fecha_entrega: "2026-10-18" } }), { corte: "pendiente" });
    expect(f.entrega).toMatchObject({ relativo: "ayer", atrasada: true });
    expect(f.causas.map((c) => c.clave)).toContain("entrega_pasada");
  });
});

describe("leerListaDeOrdenes — lee lo que manda fn_ordenes_produccion_lista", () => {
  const respuesta = (ordenes: unknown[], stock: unknown = { lotes: 1, prendas: 57 }) => ({ ordenes, al_stock_mes: stock });
  it("trae una fila por orden y lo que pasó al stock este mes", () => {
    const lista = leerListaDeOrdenes(respuesta([orden(), orden({ orden: { id: "o-2", numero: 3, numero_texto: "OP-000003" } })]), HOY);
    expect(lista?.filas.map((f) => f.numeroTexto)).toEqual(["OP-000002", "OP-000003"]);
    expect(lista?.alStockMes).toEqual({ lotes: 1, prendas: 57 });
  });
  it("una lista vacía es una lista vacía (no «no se pudo leer»)", () => {
    expect(leerListaDeOrdenes(respuesta([]), HOY)).toEqual({ filas: [], alStockMes: { lotes: 1, prendas: 57 } });
  });
  it("una respuesta que no se parece a la lista es null: la pantalla dice «no se pudo leer», nunca «no hay órdenes»", () => {
    for (const crudo of [null, undefined, "x", 3, [], {}, { ordenes: "no" }, { al_stock_mes: {} }]) expect(leerListaDeOrdenes(crudo, HOY), JSON.stringify(crudo)).toBeNull();
  });
  it("una orden suelta que no se entiende se descarta sin tirar las demás; lo del stock que no es número queda en cero", () => {
    const lista = leerListaDeOrdenes(respuesta([orden(), { orden: { id: "roto" } }, "basura", null], { lotes: "tres", prendas: -4 }), HOY);
    expect(lista?.filas).toHaveLength(1);
    expect(lista?.alStockMes).toEqual({ lotes: 0, prendas: 0 });
    expect(leerListaDeOrdenes({ ordenes: [] }, HOY)?.alStockMes).toEqual({ lotes: 0, prendas: 0 });
  });
});

describe("Hoy en el Taller", () => {
  const filas = [
    fila({ orden: { id: "a", numero: 3, numero_texto: "OP-000003", cantidad_plan: 40 }, fases: [fase("corte", 10, { actual: true, entrada: 40 }), fase("costura", 30), fase("acabado", 60)], insumos: [{ id: "i", insumo_id: "ins", nombre: "Lino", tipo: "tela", unidad: "metro", consumo_por_prenda: 1.5, cantidad_plan: 60, usado: 0, saldo: 28 }] }),
    fila({ orden: { id: "b", numero: 4, numero_texto: "OP-000004", cantidad_plan: 50 }, fases: [fase("corte", 10, { actual: true, entrada: 50 }), fase("costura", 30), fase("acabado", 60)] }),
    fila(), // OP-000002: costura afuera, 48
    fila({ orden: { id: "c", numero: 5, numero_texto: "OP-000005", cantidad_plan: 36, es_muestra: true }, fases: [hecha("corte", 10, 36), hecha("costura", 30, 36), hecha("acabado", 60, 36)] }),
    fila({ orden: { id: "d", numero: 6, numero_texto: "OP-000006", estado: "terminada", cantidad_buenas: 45 } }),
  ];
  it("siempre Corte y Costura, y las demás fases con su nombre de tienda en el orden de la ruta solo si alguna orden está ahí (Acabado, Bordado, Lavandería, Ploteo…)", () => {
    expect(cifrasHoyEnElTaller(filas).map((c) => c.titulo)).toEqual(["Por cortar", "En costura", "En acabado"]);
    const conBordado = [...filas, fila({ orden: { id: "e", numero: 7, numero_texto: "OP-000007" }, fases: [hecha("corte", 10), fase("bordado", 20, { actual: true, entrada: 48 }), fase("costura", 30), fase("acabado", 60)] })];
    expect(cifrasHoyEnElTaller(conBordado).map((c) => c.clave)).toEqual(["corte", "bordado", "costura", "acabado"]);
    expect(cifrasHoyEnElTaller([]).map((c) => c.clave)).toEqual(["corte", "costura"]);
    const conLavanderia = [...filas, fila({ orden: { id: "f", numero: 8, numero_texto: "OP-000008" }, fases: [hecha("corte", 10), hecha("costura", 30), fase("lavanderia", 50, { actual: true, entrada: 48 }), fase("acabado", 60)] })];
    expect(cifrasHoyEnElTaller(conLavanderia).find((c) => c.clave === "lavanderia")?.titulo).toBe("En lavandería");
  });
  it("cuenta lotes y prendas de las abiertas (muestras incluidas, terminadas no) y dice lo que importa de cada fase", () => {
    const [corte, costura, acabado] = cifrasHoyEnElTaller(filas);
    expect(corte).toMatchObject({ lotes: 2, prendas: 90, contexto: "90 prendas · 1 sin tela", atencion: true });
    expect(costura).toMatchObject({ lotes: 1, prendas: 48, contexto: "48 prendas · 48 afuera con Confecciones del Norte" });
    expect(acabado).toMatchObject({ lotes: 1, prendas: 36, contexto: "36 prendas · 1 lista para el stock" });
  });
  it("con la ruta nueva: «Por plotear» aparece cuando hay un lote ahí, en el orden de la ruta, y no hay tarjeta de Acabado si nadie está en Acabado", () => {
    const NUEVA = (extra: Crudo[]) => [...extra, fase("limpieza_revision", 55), fase("planchado", 65), fase("etiquetado_embolsado", 70)];
    const enPloteo = fila({ orden: { id: "p1", numero: 9, numero_texto: "OP-000009", cantidad_plan: 50 }, fases: NUEVA([fase("ploteo", 5, { hito: true, actual: true }), fase("corte", 10), fase("habilitado", 15), fase("costura", 30)]) });
    const enHabilitado = fila({ orden: { id: "p2", numero: 10, numero_texto: "OP-000010", cantidad_plan: 20 }, fases: NUEVA([fase("ploteo", 5, { hito: true, estado: "hecha", empezada: true, marcada: true }), hecha("corte", 10, 20), fase("habilitado", 15, { actual: true, entrada: 20 }), fase("costura", 30)]) });
    const cifras = cifrasHoyEnElTaller([enPloteo, enHabilitado]);
    expect(cifras.map((c) => c.clave)).toEqual(["ploteo", "corte", "habilitado", "costura"]);
    expect(cifras.map((c) => c.titulo)).toEqual(["Por plotear", "Por cortar", "En habilitado", "En costura"]);
    expect(cifras[0]).toMatchObject({ lotes: 1, prendas: 50, contexto: "50 prendas" });
    expect(cifras[2]).toMatchObject({ lotes: 1, prendas: 20 });
  });
  it("una fase sin órdenes lo dice y no pide atención", () => {
    const [corte] = cifrasHoyEnElTaller([fila()]);
    expect(corte).toMatchObject({ lotes: 0, prendas: 0, contexto: "ninguna ahora", atencion: false });
  });
  it("el dato de la cabecera: cuántas abiertas y cuántas piden algo", () => {
    expect(datoHoyEnElTaller(filas)).toBe("4 órdenes abiertas · 1 pide algo");
    expect(datoHoyEnElTaller([fila()])).toBe("1 orden abierta · ninguna pide algo");
    expect(datoHoyEnElTaller([])).toBe("ninguna orden abierta");
  });
});

describe("una fase que se marca (Ploteo) en la fila de la lista", () => {
  const ploteo = (extra: Crudo = {}) => fase("ploteo", 5, { hito: true, actual: true, desde: null, ...extra });
  const NUEVA = (primera: Crudo) => [primera, fase("corte", 10, { entrada: 48 }), fase("habilitado", 15), fase("costura", 30), fase("limpieza_revision", 55), fase("planchado", 65), fase("etiquetado_embolsado", 70)];

  it("dice quién la tiene y que falta hacerla, sin «0 de 0» ni «por mandar»; no hay prendas afuera", () => {
    const taller = fila({ fases: NUEVA(ploteo()) });
    expect(taller).toMatchObject({ quien: "Taller · por hacer", chip: { texto: "En ploteo" }, grupo: "ploteo", afuera: 0 });
    const afuera = fila({ fases: NUEVA(ploteo({ quien: "servicio", proveedor_nombre: "Plotter Lima", fijo_orden: 40 })) });
    expect(afuera).toMatchObject({ quien: "Plotter Lima · por hacer", chip: { texto: "En ploteo · afuera" }, grupo: "ploteo", afuera: 0 });
  });
  it("marcado, la orden sigue por su fase de siempre; un ploteo sin marcar no impide «lista para el stock»", () => {
    const marcado = fila({ fases: NUEVA(ploteo({ estado: "hecha", actual: false, empezada: true, marcada: true })).map((f) => (f.clave === "corte" ? { ...f, actual: true, estado: "en_curso", empezada: true, hechas: 10 } : f)) });
    expect(marcado).toMatchObject({ grupo: "corte", chip: { texto: "En corte" } });
    const todas = fila({ fases: [ploteo({ actual: false }), ...["corte", "habilitado", "costura", "limpieza_revision", "planchado", "etiquetado_embolsado"].map((c, i) => hecha(c, [10, 15, 30, 55, 65, 70][i]))] });
    expect(todas).toMatchObject({ lista: true, grupo: "etiquetado_embolsado", quien: "Taller · todas las fases listas", chip: { texto: "Lista para pasar al stock" } });
  });
});

describe("pestañas, filtros, búsqueda y orden", () => {
  const A = con(fila({ orden: { id: "a", numero: 3, numero_texto: "OP-000003", fecha_entrega: "2026-10-28" }, fases: [fase("corte", 10, { actual: true, entrada: 40 }), fase("costura", 30), fase("acabado", 60)] }), {});
  const B = fila(); // costura afuera, entrega 23 oct
  const C = fila({ orden: { id: "c", numero: 4, numero_texto: "OP-000004", fecha_entrega: null, producto: { id: "p", referencia: "Vestido Aurora", categoria: null } }, fases: [fase("corte", 10, { actual: true, entrada: 50 }), fase("costura", 30), fase("acabado", 60)] });
  const M = fila({ orden: { id: "m", numero: 5, numero_texto: "OP-000005", es_muestra: true } });
  const T = fila({ orden: { id: "t", numero: 1, numero_texto: "OP-000001", estado: "terminada", cantidad_buenas: 45 } });
  const X = fila({ orden: { id: "x", numero: 6, numero_texto: "OP-000006", estado: "anulada" } });
  const L = fila({ orden: { id: "l", numero: 7, numero_texto: "OP-000007" }, fases: [hecha("corte", 10), hecha("costura", 30), hecha("acabado", 60)] });
  const todas = [A, B, C, M, T, X, L];
  const q = { pestana: "en_curso" as const, fase: null, filtro: "todas" as const, texto: "" };

  it("las abiertas van a En curso o a Muestras; las que ya no están en proceso (pasaron al stock o se anularon), a Terminadas", () => {
    expect(todas.map(pestanaDe)).toEqual(["en_curso", "en_curso", "en_curso", "muestras", "terminadas", "terminadas", "en_curso"]);
    expect(cuentasDePestanas(todas)).toEqual({ en_curso: 4, muestras: 1, terminadas: 2 });
  });
  it("sin filtros, cada pestaña muestra lo suyo", () => {
    expect(filtrarFilas(todas, q).map((f) => f.id)).toEqual(["a", "o-1", "c", "l"]);
    expect(filtrarFilas(todas, { ...q, pestana: "muestras" }).map((f) => f.id)).toEqual(["m"]);
    expect(filtrarFilas(todas, { ...q, pestana: "terminadas" }).map((f) => f.id)).toEqual(["t", "x"]);
  });
  it("la fase tocada en «Hoy en el Taller» filtra por donde está cada orden", () => {
    expect(filtrarFilas(todas, { ...q, fase: "corte" }).map((f) => f.id)).toEqual(["a", "c"]);
    expect(filtrarFilas(todas, { ...q, fase: "costura" }).map((f) => f.id)).toEqual(["o-1"]);
    expect(filtrarFilas(todas, { ...q, fase: "acabado" }).map((f) => f.id)).toEqual(["l"]);
    expect(filtrarFilas(todas, { ...q, fase: "bordado" })).toEqual([]);
  });
  it("«Afuera» y «Listas» y «Piden algo» filtran cada uno por lo suyo", () => {
    expect(filtrarFilas(todas, { ...q, filtro: "afuera" }).map((f) => f.id)).toEqual(["o-1"]);
    expect(filtrarFilas(todas, { ...q, filtro: "listas" }).map((f) => f.id)).toEqual(["l"]);
    const piden = filtrarFilas(todas, { ...q, filtro: "piden" });
    expect(piden.every((f) => f.causas.length > 0)).toBe(true);
  });
  it("la búsqueda no distingue tildes, mayúsculas ni el guion del número, y encuentra por modelo, número o color", () => {
    for (const texto of ["pantalon", "PANTALÓN lía", "op-000002", "op 2", "000002", "2", "caqui", "negro"]) expect(cumpleBusqueda(B, texto), texto).toBe(true);
    for (const texto of ["vestido", "op-9", "rojo"]) expect(cumpleBusqueda(B, texto), texto).toBe(false);
    expect(cumpleBusqueda(B, "   ")).toBe(true);
    expect(filtrarFilas(todas, { ...q, texto: "aurora" }).map((f) => f.id)).toEqual(["c"]);
  });
  it("la búsqueda pide TODAS las palabras: «pantalón vestido» no encuentra nada", () => {
    expect(filtrarFilas(todas, { ...q, texto: "pantalón vestido" })).toEqual([]);
  });
  it("En curso va por entrega (la más cercana primero, sin fecha al final) y, a igual entrega, la más nueva; Terminadas, la más nueva primero", () => {
    // «l» (OP-000007) y «o-1» (OP-000002) entregan el mismo día: gana la más nueva.
    expect(ordenarFilas(filtrarFilas(todas, q), "en_curso").map((f) => f.id)).toEqual(["l", "o-1", "a", "c"]);
    expect(ordenarFilas(filtrarFilas(todas, { ...q, pestana: "terminadas" }), "terminadas").map((f) => f.id)).toEqual(["x", "t"]);
  });
  it("ordenar no cambia la lista de entrada", () => {
    const entrada = filtrarFilas(todas, q);
    const antes = entrada.map((f) => f.id);
    ordenarFilas(entrada, "en_curso");
    expect(entrada.map((f) => f.id)).toEqual(antes);
  });
  it("cada píldora lleva cuántas hay con ese filtro, dentro de la pestaña, la fase y la búsqueda", () => {
    expect(cuentasDeFiltros(todas, { pestana: "en_curso", fase: null, texto: "" })).toEqual({ todas: 4, afuera: 1, piden: expect.any(Number), listas: 1 });
    expect(cuentasDeFiltros(todas, { pestana: "en_curso", fase: "corte", texto: "" })).toMatchObject({ todas: 2, afuera: 0, listas: 0 });
    expect(cuentasDeFiltros(todas, { pestana: "en_curso", fase: null, texto: "aurora" })).toMatchObject({ todas: 1 });
  });
  it("el pie dice cuántas son, cómo van ordenadas y si lo que se ve está filtrado", () => {
    expect(pieDeLaLista(5, "en_curso", false)).toEqual({ cuenta: "5 órdenes en curso", orden: "Ordenadas por entrega, la más cercana primero" });
    expect(pieDeLaLista(1, "en_curso", true).cuenta).toBe("1 orden en curso con lo que elegiste");
    expect(pieDeLaLista(2, "muestras", false).cuenta).toBe("2 muestras en desarrollo");
    expect(pieDeLaLista(1, "muestras", false).cuenta).toBe("1 muestra en desarrollo");
    expect(pieDeLaLista(3, "terminadas", false)).toEqual({ cuenta: "3 órdenes cerradas", orden: "Las más nuevas primero" });
  });
});

describe("paridad con la migración 20261015005000", () => {
  const SQL = readFileSync(join(__dirname, "..", "..", "..", "supabase", "migrations", "20261015005000_produccion_lista_de_ordenes.sql"), "utf8");
  it("la web llama a la función con el nombre y los argumentos que la base declara", () => {
    expect(SQL).toContain(`create or replace function retail.${RPC_LISTA_DE_ORDENES}(p_ubicacion_id uuid, p_historicas integer default 40)`);
  });
  it("la lista es lo que la página lee de cada orden: la base llama a fn_orden_produccion, sin costos y con solo el último movimiento", () => {
    expect(SQL).toContain("retail.fn_orden_produccion(v_id)");
    expect(SQL).toContain("v_o - 'costos' - 'linea_de_tiempo'");
    expect(SQL).toContain("v_o -> 'linea_de_tiempo' -> 0");
  });
  it("manda las llaves que la web lee: ordenes y al_stock_mes (lotes y prendas)", () => {
    for (const k of ["ordenes", "al_stock_mes", "lotes", "prendas"]) expect(SQL, k).toContain(`'${k}'`);
  });
  it("las en proceso vienen todas y solo las históricas se acotan; las muestras no cuentan como «al stock»", () => {
    expect(SQL).toContain("x.estado = 'en_proceso' or x.posicion <=");
    expect(SQL).toContain("not p.es_muestra");
  });
});

describe("la orden que se acaba de abrir (ADR-0509, actividad 1)", () => {
  it("lee (id, numero) tal como lo entrega supabase-js: una lista de una fila", () => {
    expect(leerOrdenCreada([{ id: "ord-1", numero: 12 }])).toEqual({ id: "ord-1", numero: 12, numeroTexto: "OP-000012", href: "/produccion/ordenes/OP-000012" });
  });
  it("acepta la fila sola y el número como texto (un integer de Postgres puede llegar así)", () => {
    expect(leerOrdenCreada({ id: "ord-2", numero: "7" })?.numeroTexto).toBe("OP-000007");
  });
  it("su dirección es la misma que lleva la fila de la lista", () => {
    const f = fila({ orden: { id: "o-12", numero: 12, numero_texto: "OP-000012" } });
    expect(leerOrdenCreada([{ id: f.id, numero: f.numero }])?.href).toBe(f.href);
  });
  it("sin id o sin un número entero positivo no inventa nada", () => {
    for (const malo of [null, undefined, [], {}, [{ id: "", numero: 3 }], [{ id: "x" }], [{ id: "x", numero: 0 }], [{ id: "x", numero: -2 }], [{ id: "x", numero: 1.5 }], [{ id: "x", numero: "doce" }], [{ id: 5, numero: 3 }], "OP-000012"]) {
      expect(leerOrdenCreada(malo), JSON.stringify(malo)).toBeNull();
    }
  });
  it("una orden nueva siempre está en proceso: va a «Muestras» si es muestra y a «En curso» si no, igual que `pestanaDe`", () => {
    const base = fila();
    expect(base.estado).toBe("en_proceso");
    expect(pestanaDeOrdenNueva(false)).toBe(pestanaDe({ ...base, esMuestra: false }));
    expect(pestanaDeOrdenNueva(true)).toBe(pestanaDe({ ...base, esMuestra: true }));
  });
  it("urlSinParametrosDeNueva quita nueva, sugerida y tipo, y deja lo demás", () => {
    expect(urlSinParametrosDeNueva("/produccion/ordenes?nueva=auto&sugerida=1&tipo=muestra")).toBe("/produccion/ordenes");
    expect(urlSinParametrosDeNueva("/produccion/ordenes?nueva=abc-123&orden=xyz")).toBe("/produccion/ordenes?orden=xyz");
    expect(urlSinParametrosDeNueva("/produccion/ordenes?nueva=&otro=1#lista")).toBe("/produccion/ordenes?otro=1#lista");
  });
  it("una dirección sin esos parámetros vuelve igual", () => {
    expect(urlSinParametrosDeNueva("/produccion/ordenes")).toBe("/produccion/ordenes");
    expect(urlSinParametrosDeNueva("/produccion/ordenes?orden=xyz")).toBe("/produccion/ordenes?orden=xyz");
  });
});
