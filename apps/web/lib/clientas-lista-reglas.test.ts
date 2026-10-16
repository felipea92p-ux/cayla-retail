import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPRAS_PARA_FRECUENTE, MESES_PARA_FRECUENTE, estadoFrecuente } from "./clienta-actividad-reglas";
import {
  COLUMNAS_EXPORTAR,
  FILTROS_LISTA,
  MAX_PAGINA,
  POR_PAGINA,
  aClientaDeLista,
  aCifrasClientas,
  cuentaDelFiltro,
  desdeDePagina,
  detallePublicidad,
  detalleSocias,
  estadoDeLaFila,
  filaParaExportar,
  frecuenteDeLaFicha,
  hrefLista,
  leerPaginaQueExiste,
  leerParamsLista,
  pieLista,
  publicidadDeLaFila,
  suSedeDeLaFicha,
  suSedeLegible,
  ultimaCompraLegible,
  ultimaPagina,
  type ClientaDeLista,
  type FilaListaClienta,
  type ResumenCompras,
} from "./clientas-lista-reglas";
import type { Compra } from "./clientas-reglas";

const MIGRACION = readFileSync(new URL("../../../supabase/migrations/20260930210000_club_paso1f_lista_y_ficha.sql", import.meta.url), "utf8");

describe("el umbral de frecuente es uno solo (la base y la web)", () => {
  it("la base cuenta 3 compras en 6 meses, como COMPRAS_PARA_FRECUENTE y MESES_PARA_FRECUENTE", () => {
    // fn_club_resumen_compras: `t.compras_6m >= 3` y la ventana `interval '6 months'`.
    expect(MIGRACION).toContain(`t.compras_6m >= ${COMPRAS_PARA_FRECUENTE}`);
    expect(MIGRACION).toContain(`(count(*) filter (where n.fecha >= now() - interval '${MESES_PARA_FRECUENTE} months'))::integer as compras_6m`);
  });

  it("los filtros de la web son exactamente los que la base acepta", () => {
    const deLaBase = /v_filtro not in \(([^)]*)\)/.exec(MIGRACION)?.[1].match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1));
    expect(deLaBase).toEqual(FILTROS_LISTA.map((f) => f.valor));
  });
});

describe("leerParamsLista / hrefLista", () => {
  it("sanea lo que llega: filtro desconocido → todas, página rara → 1, término recortado", () => {
    expect(leerParamsLista({})).toEqual({ termino: "", filtro: "todas", pagina: 1 });
    expect(leerParamsLista({ q: "  Ana  ", filtro: "vip", pagina: "-3" })).toEqual({ termino: "Ana", filtro: "todas", pagina: 1 });
    expect(leerParamsLista({ q: ["x", "y"], filtro: "frecuentes", pagina: "3" })).toEqual({ termino: "x", filtro: "frecuentes", pagina: 3 });
    expect(leerParamsLista({ q: "a".repeat(200) }).termino).toHaveLength(80);
  });

  it("la URL limpia es la lista entera; cambiar el término o el filtro vuelve a la página 1", () => {
    const actual = { termino: "ana", filtro: "socias" as const, pagina: 3 };
    expect(hrefLista({ termino: "", filtro: "todas", pagina: 1 }, {})).toBe("/clientas");
    expect(hrefLista(actual, {})).toBe("/clientas?q=ana&filtro=socias&pagina=3");
    expect(hrefLista(actual, { filtro: "todas" })).toBe("/clientas?q=ana");
    expect(hrefLista(actual, { termino: "  " })).toBe("/clientas?filtro=socias");
    expect(hrefLista(actual, { pagina: 4 })).toBe("/clientas?q=ana&filtro=socias&pagina=4");
    expect(hrefLista(actual, { termino: "María José" })).toBe("/clientas?q=Mar%C3%ADa+Jos%C3%A9&filtro=socias");
  });

  it("desdeDePagina: 20 por página", () => {
    expect(POR_PAGINA).toBe(20);
    expect(desdeDePagina(1)).toBe(0);
    expect(desdeDePagina(3)).toBe(40);
    expect(desdeDePagina(0)).toBe(0);
  });

  it("ultimaPagina: la lista vacía tiene su página 1, y una ficha de más abre otra página", () => {
    expect(ultimaPagina(0)).toBe(1);
    expect(ultimaPagina(1)).toBe(1);
    expect(ultimaPagina(POR_PAGINA)).toBe(1);
    expect(ultimaPagina(POR_PAGINA + 1)).toBe(2);
    expect(ultimaPagina(POR_PAGINA * 5)).toBe(5);
  });

  describe("leerPaginaQueExiste: una `?pagina=` que ya no existe baja a la última, no deja la tabla vacía", () => {
    // Una base de juguete con `fichas` filas: como `fn_clientas_lista`, el total solo viaja con una fila (una página vacía dice 0).
    function baseDe(fichas: number, falla: string | null = null) {
      const pedidas: number[] = [];
      const leer = async (pagina: number) => {
        pedidas.push(pagina);
        const desde = desdeDePagina(pagina);
        const filas = Array.from({ length: Math.max(0, Math.min(POR_PAGINA, fichas - desde)) }, (_, i) => desde + i);
        return { filas, total: filas.length ? fichas : 0, falla, pagina };
      };
      return { leer, pedidas };
    }

    it("la página que existe se lee una sola vez", async () => {
      const { leer, pedidas } = baseDe(45);
      const lista = await leerPaginaQueExiste(2, leer);
      expect(lista.pagina).toBe(2);
      expect(lista.filas).toHaveLength(POR_PAGINA);
      expect(pedidas).toEqual([2]);
    });

    it("la página 7 de 3 se baja a la 3: lee la pedida, la 1 (para el total) y la última", async () => {
      const { leer, pedidas } = baseDe(45);
      const lista = await leerPaginaQueExiste(7, leer);
      expect(lista.pagina).toBe(3);
      expect(lista.filas).toHaveLength(5);
      expect(pedidas).toEqual([7, 1, 3]);
    });

    it("se archivó la ficha que estaba sola en la última página: queda en la anterior", async () => {
      const { leer } = baseDe(POR_PAGINA); // 20 fichas = 1 página; el usuario estaba en la 2 con la ficha 21
      const lista = await leerPaginaQueExiste(2, leer);
      expect(lista.pagina).toBe(1);
      expect(lista.filas).toHaveLength(POR_PAGINA);
    });

    it("sin ninguna ficha (o sin las del filtro) la página 1 vacía es la verdad: no insiste", async () => {
      const { leer, pedidas } = baseDe(0);
      const lista = await leerPaginaQueExiste(5, leer);
      expect(lista.pagina).toBe(1);
      expect(lista.filas).toHaveLength(0);
      expect(pedidas).toEqual([5, 1]);
    });

    it("la página 1 vacía no se relee, y una falla de la base se devuelve tal cual, sin reintentar", async () => {
      const vacia = baseDe(0);
      await leerPaginaQueExiste(1, vacia.leer);
      expect(vacia.pedidas).toEqual([1]);
      const rota = baseDe(45, "No se pudo leer la lista de clientes: boom");
      const lista = await leerPaginaQueExiste(9, rota.leer);
      expect(lista.falla).toContain("boom");
      expect(rota.pedidas).toEqual([9]);
    });
  });

  it("una página absurdamente lejana se baja a MAX_PAGINA: `p_desde` es un integer de la base y no se desborda", () => {
    expect(leerParamsLista({ pagina: "999999999999" }).pagina).toBe(MAX_PAGINA);
    expect(leerParamsLista({ pagina: String(MAX_PAGINA) }).pagina).toBe(MAX_PAGINA);
    expect(desdeDePagina(MAX_PAGINA)).toBeLessThan(2 ** 31);
  });
});

const FILA: FilaListaClienta = {
  id: "c1",
  documento_tipo: "dni",
  documento_numero: "71234567",
  nombre: "Ana Prueba",
  telefono_whatsapp: "987654321",
  club_desde: null,
  publicidad_desde: null,
  codigo_club: null,
  cumple_dia: null,
  cumple_mes: null,
  cumple_anio: null,
  created_at: "2026-09-01T15:00:00+00:00",
  archivada_en: null,
  anonimizada: false,
  fusionada_en_id: null,
  su_sede_id: "u1",
  su_sede: "Tienda Trujillo",
  compras_sede: 2,
  compras_12m: 3,
  compras_6m: 3,
  es_frecuente: true,
  ultima_compra: "2026-09-12T20:00:00+00:00",
  baja_en: null,
  total: 1,
};
const fila = (cambios: Partial<FilaListaClienta>): ClientaDeLista => aClientaDeLista({ ...FILA, ...cambios });

describe("una fila de la lista", () => {
  it("aClientaDeLista pasa a camelCase y deja el tipo de documento conocido", () => {
    const c = fila({ documento_tipo: "carne_extranjeria" });
    expect(c).toMatchObject({ id: "c1", documentoTipo: "carne_extranjeria", suSede: "Tienda Trujillo", comprasSede: 2, compras12m: 3, esFrecuente: true });
  });

  it("Estado: Identificado, Miembro o Miembro frecuente; archivado, anonimizado o unido a otra ficha dicen por qué", () => {
    expect(estadoDeLaFila(fila({}))).toEqual({ texto: "Identificado", tono: "pizarra" });
    expect(estadoDeLaFila(fila({ club_desde: "2026-01-01", es_frecuente: false }))).toEqual({ texto: "Miembro", tono: "neutro" });
    expect(estadoDeLaFila(fila({ club_desde: "2026-01-01", es_frecuente: true }))).toEqual({ texto: "Miembro frecuente", tono: "verde" });
    expect(estadoDeLaFila(fila({ archivada_en: "2026-09-01" })).texto).toBe("Archivado");
    expect(estadoDeLaFila(fila({ archivada_en: "2026-09-01", anonimizada: true })).texto).toBe("Anonimizado");
    expect(estadoDeLaFila(fila({ archivada_en: "2026-09-01", anonimizada: true, fusionada_en_id: "c2" })).texto).toBe("Unido a otra ficha");
  });

  it("Publicidad: solo una socia activa tiene algo que decir", () => {
    expect(publicidadDeLaFila(fila({}))).toBeNull();
    expect(publicidadDeLaFila(fila({ club_desde: "2026-01-01" }))).toEqual({ texto: "Sin publicidad", tono: "neutro" });
    expect(publicidadDeLaFila(fila({ club_desde: "2026-01-01", publicidad_desde: "2026-02-01" }))).toEqual({ texto: "Publicidad", tono: "verde" });
    expect(publicidadDeLaFila(fila({ club_desde: "2026-01-01", archivada_en: "2026-09-01" }))).toBeNull();
    // Escribió BAJA: «Pidió BAJA», apagada (el spike la distingue de la que todavía no la pidió).
    expect(publicidadDeLaFila(fila({ club_desde: "2026-01-01", baja_en: "2026-07-02" }))).toEqual({ texto: "Pidió BAJA", tono: "apagado" });
  });

  it("Su sede sin «Tienda»; sin compras en 12 meses, «—»", () => {
    expect(suSedeLegible("Tienda Trujillo")).toBe("Trujillo");
    expect(suSedeLegible("Taller")).toBe("Taller");
    expect(suSedeLegible(null)).toBe("—");
  });

  it("Última compra en días de Lima: una compra a las 9 pm de Lima (2 am UTC del día siguiente) es de ese día", () => {
    expect(ultimaCompraLegible(null, "2026-09-30")).toBeNull();
    expect(ultimaCompraLegible("2026-09-12T20:00:00+00:00", "2026-09-30")).toEqual({ fecha: "12 sep", hace: "hace 18 d" });
    expect(ultimaCompraLegible("2026-10-01T02:00:00+00:00", "2026-09-30")).toEqual({ fecha: "30 sep", hace: "hoy" });
    expect(ultimaCompraLegible("2026-09-29T15:00:00+00:00", "2026-09-30")).toEqual({ fecha: "29 sep", hace: "ayer" });
  });

  it("una última compra que no se lee no inventa un día (la copia propia del día de Lima se caía con ella)", () => {
    expect(ultimaCompraLegible("ayer", "2026-09-30")).toBeNull();
  });
});

describe("exportar la lista: las fechas del CSV son el día de Lima", () => {
  // Ejemplo inventado: se registró el 13 de octubre a las 20:00 de Lima (2026-10-14 01:00 UTC) y entró al club ese mismo día a
  // las 23:30 (2026-10-14 04:30 UTC). `created_at` y `club_desde` llegan de la base en UTC.
  const clienta = {
    documentoTipo: "dni" as const,
    documentoNumero: "40112233",
    nombre: "Ana Torres",
    telefonoWhatsapp: "987654321",
    clubDesde: "2026-10-14T04:30:00+00:00",
    codigoClub: "C-0142",
    publicidadDesde: null,
    cumpleDia: 5,
    cumpleMes: 3,
    cumpleAnio: null,
    createdAt: "2026-10-14T01:00:00.123456+00:00",
    archivadaEn: null,
    anonimizada: false,
    fusionadaEnId: null,
  };

  it("«Miembro desde» y «Registrado» dicen el 13, aunque en UTC ya sea el 14", () => {
    const fila = filaParaExportar(clienta);
    expect(fila[COLUMNAS_EXPORTAR.indexOf("Miembro desde")]).toBe("2026-10-13");
    expect(fila[COLUMNAS_EXPORTAR.indexOf("Registrado")]).toBe("2026-10-13"); // con el corte de UTC, «2026-10-14»
  });

  it("la fila completa va en el orden de las columnas", () => {
    expect(filaParaExportar(clienta)).toEqual(["DNI", "40112233", "Ana Torres", "987654321", "2026-10-13", "C-0142", "no", "5/3", "2026-10-13", "activo"]);
    expect(filaParaExportar(clienta)).toHaveLength(COLUMNAS_EXPORTAR.length);
  });

  it("quien no es miembro deja «Miembro desde» vacío", () => {
    expect(filaParaExportar({ ...clienta, clubDesde: null, codigoClub: null })[COLUMNAS_EXPORTAR.indexOf("Miembro desde")]).toBe("");
  });
});

describe("cifras, píldoras y pie", () => {
  const cifras = aCifrasClientas({
    identificadas: 20,
    socias: 8,
    con_publicidad: 5,
    sin_publicidad: 3,
    frecuentes: 4,
    sin_celular: 6,
    cumplen_este_mes: 2,
    archivadas: 1,
  });

  it("cada píldora lleva la cuenta de su filtro, de toda la base", () => {
    expect(FILTROS_LISTA.map((f) => cuentaDelFiltro(cifras, f.valor))).toEqual([20, 8, 4, 5, 3, 6, 2, 1]);
  });

  it("los detalles de las tarjetas", () => {
    expect(detalleSocias(cifras)).toBe("40 % de los identificados");
    expect(detalleSocias({ identificadas: 0, socias: 0 })).toBe("Todavía ninguno");
    expect(detallePublicidad(cifras)).toBe("3 miembros sin publicidad");
    expect(detallePublicidad({ sinPublicidad: 1 })).toBe("1 miembro sin publicidad");
  });

  it("el pie: N de los activos (o de los archivados) y que todas las cuentas con el módulo ven a todos", () => {
    expect(pieLista(7, "socias", cifras)).toBe("7 de 20 clientes · todas las cuentas con el módulo ven a todos");
    expect(pieLista(1, "archivadas", cifras)).toBe("1 de 1 archivados · todas las cuentas con el módulo ven a todos");
    expect(pieLista(1, "todas", null)).toBe("1 cliente · todas las cuentas con el módulo ven a todos");
  });
});

describe("la ficha: su sede y frecuente con la regla de la lista", () => {
  const resumen: ResumenCompras = { suSede: "Tienda Lima", comprasSede: 2, compras12m: 2, compras6m: 2, esFrecuente: false, ultimaCompra: "2026-09-20" };
  const compras = (n: number): Compra[] =>
    Array.from({ length: n }, (_, i) => ({ ventaId: `v${i}`, fecha: "2026-09-20T12:00:00Z", ubicacion: "Tienda Lima", total: 100, items: [] }));

  it("Su sede: «Lima · 2 de 2»; sin compras en 12 meses, «—»; sin resumen, «—» sin detalle", () => {
    expect(suSedeDeLaFicha(resumen)).toEqual({ valor: "Lima", detalle: "2 de 2" });
    expect(suSedeDeLaFicha({ ...resumen, suSede: null, comprasSede: 0, compras12m: 0 })).toEqual({ valor: "—", detalle: "sin compras en 12 meses" });
    expect(suSedeDeLaFicha(null)).toEqual({ valor: "—", detalle: null });
  });

  it("con el resumen de la base manda la compra NETA (una devuelta entera ya no cuenta), aunque sus compras digan 3", () => {
    const respaldo = estadoFrecuente(compras(3), new Date("2026-09-30T12:00:00Z"));
    expect(respaldo.esFrecuente).toBe(true);
    expect(frecuenteDeLaFicha(resumen, respaldo)).toEqual({ esFrecuente: false, faltanParaFrecuente: 1, comprasEnVentana: 2 });
    expect(frecuenteDeLaFicha({ ...resumen, compras6m: 4, esFrecuente: true }, respaldo)).toEqual({ esFrecuente: true, faltanParaFrecuente: 0, comprasEnVentana: 4 });
  });

  it("sin el resumen (la base todavía no lo tiene), vale lo que la ficha calculaba sobre sus compras", () => {
    const respaldo = estadoFrecuente(compras(3), new Date("2026-09-30T12:00:00Z"));
    expect(frecuenteDeLaFicha(null, respaldo)).toBe(respaldo);
  });
});
