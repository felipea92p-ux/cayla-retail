import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAMILIAS_FUERA_DEL_RIEL } from "./capacidad-piso";
import {
  armarVista,
  avisoDeGruposPorRevisar,
  cambiosPreparados,
  conCambio,
  confirmarPropuestas,
  cuelgaEnElRiel,
  describirCambio,
  estadoDe,
  gruposPermitidos,
  leerCategorias,
  leerGrupos,
  leerResultado,
  loteParaGuardar,
  obsoletas,
  preparadoDe,
  resumir,
  ROLES_MIX,
  sinObsoletas,
  textoGuardado,
  type CategoriaMix,
  type GrupoMix,
} from "./plan-piso-grupos";

// Lo que devuelven fn_grupos_mix y fn_categorias_grupo_mix por PostgREST.
const FILAS_GRUPOS = [
  { clave: "polos_tops_blusas", nombre: "Polos, tops y blusas", rol: "destino", en_riel: true, orden: 10 },
  { clave: "jeans", nombre: "Jeans", rol: "destino", en_riel: true, orden: 20 },
  { clave: "abrigo_y_capas", nombre: "Abrigo y capas", rol: "estacional", en_riel: true, orden: 60 },
  { clave: "accesorios_de_impulso", nombre: "Accesorios de impulso y caja", rol: "conveniencia", en_riel: false, orden: 70 },
  { clave: "bolsos_y_calzado", nombre: "Bolsos y calzado", rol: "ocasional", en_riel: false, orden: 80 },
];
const fila = (categoria: string, extra: Record<string, unknown> = {}) => ({
  categoria_id: `id-${categoria}`,
  categoria,
  prefijo: categoria.slice(0, 3).toUpperCase(),
  familia: "indumentaria",
  grupo_clave: "polos_tops_blusas",
  confirmada: false,
  confirmada_en: null,
  version: 1,
  ...extra,
});

const GRUPOS = leerGrupos(FILAS_GRUPOS) as GrupoMix[];
const cat = (categoria: string, extra: Partial<CategoriaMix> = {}): CategoriaMix =>
  ({ ...(leerCategorias([fila(categoria)]) as CategoriaMix[])[0], ...extra });

describe("leer lo que manda la base, sin confiar en su forma", () => {
  it("los grupos salen en el orden de la pantalla, con su rol y de qué lado del riel están", () => {
    const desordenados = [FILAS_GRUPOS[3], FILAS_GRUPOS[0], FILAS_GRUPOS[2]];
    expect(leerGrupos(desordenados)?.map((g) => g.clave)).toEqual(["polos_tops_blusas", "abrigo_y_capas", "accesorios_de_impulso"]);
    expect(GRUPOS[0]).toEqual({ clave: "polos_tops_blusas", nombre: "Polos, tops y blusas", rol: "destino", enRiel: true, orden: 10 });
    expect(GRUPOS.find((g) => g.clave === "accesorios_de_impulso")?.enRiel).toBe(false);
  });

  it("un grupo con un rol que no existe, sin lado del riel o sin orden no se inventa: toda la lectura es «no se pudo leer»", () => {
    expect(leerGrupos([{ ...FILAS_GRUPOS[0], rol: "inventado" }])).toBeNull();
    expect(leerGrupos([{ ...FILAS_GRUPOS[0], en_riel: "true" }])).toBeNull();
    expect(leerGrupos([{ ...FILAS_GRUPOS[0], orden: 1.5 }])).toBeNull();
    expect(leerGrupos(null)).toBeNull();
    expect(leerGrupos({})).toBeNull();
    expect(leerGrupos([null])).toBeNull();
  });

  it("una lista vacía de grupos es una lectura válida (la base sin grupos), no un error", () => {
    expect(leerGrupos([])).toEqual([]);
  });

  it("las categorías conservan su grupo, su confirmación y su versión; lo que falta se lee como nulo", () => {
    const [c] = leerCategorias([fila("Jeans", { grupo_clave: "jeans", confirmada: true, confirmada_en: "2026-10-06T10:00:00Z", version: 2 })]) as CategoriaMix[];
    expect(c).toEqual({
      categoriaId: "id-Jeans", categoria: "Jeans", prefijo: "JEA", familia: "indumentaria", grupoClave: "jeans",
      confirmada: true, confirmadaEn: "2026-10-06T10:00:00Z", version: 2,
    });
    const [sin] = leerCategorias([fila("Capas", { grupo_clave: null, prefijo: null, familia: null, version: 0 })]) as CategoriaMix[];
    expect(sin).toMatchObject({ grupoClave: null, prefijo: null, familia: null, version: 0, confirmada: false });
  });

  it("una categoría con la confirmación mal escrita o una versión negativa invalida la lectura", () => {
    expect(leerCategorias([fila("Jeans", { confirmada: "si" })])).toBeNull();
    expect(leerCategorias([fila("Jeans", { version: -1 })])).toBeNull();
    expect(leerCategorias([fila("Jeans", { categoria_id: "" })])).toBeNull();
  });
});

describe("el estado de cada categoría", () => {
  it("sin grupo manda sobre todo; con grupo, confirmada o por revisar", () => {
    expect(estadoDe(cat("A", { grupoClave: null, confirmada: false }))).toBe("sin_grupo");
    expect(estadoDe(cat("A", { grupoClave: "jeans", confirmada: true }))).toBe("confirmada");
    expect(estadoDe(cat("A", { grupoClave: "jeans", confirmada: false }))).toBe("por_revisar");
  });

  it("el resumen cuenta cada categoría en uno solo de los tres estados", () => {
    const cs = [cat("A", { confirmada: true }), cat("B"), cat("C"), cat("D", { grupoClave: null })];
    expect(resumir(cs)).toEqual({ total: 4, confirmadas: 1, porRevisar: 2, sinGrupo: 1 });
    expect(resumir([])).toEqual({ total: 0, confirmadas: 0, porRevisar: 0, sinGrupo: 0 });
  });
});

describe("a qué grupos puede ir cada categoría (el mismo lado del riel que exige la base)", () => {
  it("la ropa solo se ofrece entre los grupos del riel y un accesorio solo entre los de fuera", () => {
    expect(gruposPermitidos({ familia: "indumentaria" }, GRUPOS).map((g) => g.clave)).toEqual(["polos_tops_blusas", "jeans", "abrigo_y_capas"]);
    expect(gruposPermitidos({ familia: "accesorios" }, GRUPOS).map((g) => g.clave)).toEqual(["accesorios_de_impulso", "bolsos_y_calzado"]);
    expect(gruposPermitidos({ familia: "calzado" }, GRUPOS).every((g) => !g.enRiel)).toBe(true);
  });

  it("una categoría sin familia, o con una familia que un líder creó después, cuelga en el riel: la ropa nunca se esconde como accesorio", () => {
    expect(cuelgaEnElRiel(null)).toBe(true);
    expect(cuelgaEnElRiel("familia-nueva")).toBe(true);
    expect(gruposPermitidos({ familia: null }, GRUPOS).every((g) => g.enRiel)).toBe(true);
  });

  it("cada familia que la web manda fuera del riel es una que el disparador de la base también manda fuera (la misma lista, escrita en dos lados)", () => {
    const sql = readFileSync(new URL("../../../supabase/migrations/20261006100000_plan_del_piso_grupos_del_mix.sql", import.meta.url), "utf8");
    const lista = /v_fuera_del_riel := coalesce\(v_familia in \(([^)]*)\)/.exec(sql)?.[1];
    expect(lista, "no se encontró la lista de familias del disparador").toBeDefined();
    const enLaBase = (lista as string).split(",").map((f) => f.trim().replace(/^'|'$/g, ""));
    expect([...enLaBase].sort()).toEqual([...FAMILIAS_FUERA_DEL_RIEL].sort());
  });
});

describe("lo que la migración siembra (leído del SQL real, no de una copia)", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20261006100000_plan_del_piso_grupos_del_mix.sql", import.meta.url), "utf8").replace(/--[^\n]*/g, "");
  const gruposSembrados = [...sql.matchAll(/\('([a-z_]+)',\s*'[^']+',\s*'(destino|rutina|ocasional|estacional|conveniencia)',\s*(true|false),\s*(\d+)\)/g)];
  const pertenencias = [...sql.matchAll(/\('([A-Z]{3})',\s*'([a-z_]+)'\)/g)];

  it("los 8 grupos sembrados usan solo roles que la web conoce, con órdenes distintos", () => {
    expect(gruposSembrados).toHaveLength(8);
    for (const g of gruposSembrados) expect(ROLES_MIX as readonly string[]).toContain(g[2]);
    expect(new Set(gruposSembrados.map((g) => g[4])).size).toBe(8);
  });

  it("cada categoría sembrada va a un grupo que existe, y ningún prefijo está dos veces", () => {
    const claves = new Set(gruposSembrados.map((g) => g[1]));
    expect(pertenencias.length).toBeGreaterThan(30);
    for (const [, prefijo, grupo] of pertenencias) expect(claves.has(grupo), `${prefijo} → ${grupo}`).toBe(true);
    const prefijos = pertenencias.map((p) => p[1]);
    expect(new Set(prefijos).size).toBe(prefijos.length);
  });
});

describe("repartir las categorías por grupo", () => {
  it("las sin grupo van aparte y primero; cada grupo lista las suyas por nombre y cuenta las que faltan por revisar", () => {
    const cs = [
      cat("Polos", { grupoClave: "polos_tops_blusas", confirmada: true }),
      cat("Camisas y Blusas", { grupoClave: "polos_tops_blusas" }),
      cat("Jeans", { grupoClave: "jeans" }),
      cat("Capas", { grupoClave: null }),
    ];
    const v = armarVista(GRUPOS, cs);
    expect(v.sinGrupo.map((c) => c.categoria)).toEqual(["Capas"]);
    const polos = v.secciones.find((s) => s.grupo.clave === "polos_tops_blusas");
    expect(polos?.categorias.map((c) => c.categoria)).toEqual(["Camisas y Blusas", "Polos"]);
    expect(polos?.porRevisar).toBe(1);
    expect(v.secciones.map((s) => s.grupo.clave)).toEqual(GRUPOS.map((g) => g.clave));
  });

  it("una categoría cuyo grupo ya no existe se ve como «sin grupo»: no se esconde", () => {
    const v = armarVista(GRUPOS, [cat("Rara", { grupoClave: "grupo_borrado" })]);
    expect(v.sinGrupo.map((c) => c.categoria)).toEqual(["Rara"]);
    expect(v.secciones.every((s) => s.categorias.length === 0)).toBe(true);
  });
});

describe("preparar cambios antes de guardar", () => {
  const poleras = cat("Poleras", { grupoClave: "abrigo_y_capas", confirmada: false, version: 1 });
  const jeans = cat("Jeans", { grupoClave: "jeans", confirmada: true, version: 3 });
  const nueva = cat("Capas", { grupoClave: null, version: 0 });
  const todas = [poleras, jeans, nueva];
  /** Lo preparado, con la versión que cada categoría tenía cuando se preparó. */
  const prep = (...pares: [CategoriaMix, string][]) => new Map(pares.map(([c, g]) => [c.categoriaId, { grupoClave: g, version: c.version }]));

  it("cambiar de grupo una categoría confirmada la deja preparada; volver al que tenía no deja nada preparado", () => {
    const uno = conCambio(new Map(), jeans, "polos_tops_blusas");
    expect(preparadoDe(uno, jeans)).toBe("polos_tops_blusas");
    expect(conCambio(uno, jeans, "jeans").has("id-Jeans")).toBe(false);
  });

  it("una por revisar que se «confirma» en su mismo grupo SÍ queda preparada (es una decisión, aunque el grupo no cambie)", () => {
    expect(preparadoDe(conCambio(new Map(), poleras, "abrigo_y_capas"), poleras)).toBe("abrigo_y_capas");
  });

  it("confirmar las propuestas prepara solo las por revisar, y respeta lo que ya estaba preparado", () => {
    const previo = prep([poleras, "polos_tops_blusas"]);
    const todo = confirmarPropuestas(previo, todas);
    expect(preparadoDe(todo, poleras)).toBe("polos_tops_blusas");
    expect(todo.has("id-Jeans")).toBe(false);
    expect(todo.has("id-Capas")).toBe(false);
    expect(preparadoDe(confirmarPropuestas(new Map(), [poleras]), poleras)).toBe("abrigo_y_capas");
  });

  it("el lote lleva, de cada cambio, el grupo y la versión que se leyó (0 si no tenía grupo), en el orden de la lista", () => {
    const pendientes = prep([nueva, "abrigo_y_capas"], [jeans, "polos_tops_blusas"]);
    const cambios = cambiosPreparados(todas, pendientes);
    expect(cambios.map((c) => c.categoria)).toEqual(["Jeans", "Capas"]);
    expect(loteParaGuardar(cambios)).toEqual([
      { categoria_id: "id-Jeans", grupo_clave: "polos_tops_blusas", version: 3 },
      { categoria_id: "id-Capas", grupo_clave: "abrigo_y_capas", version: 0 },
    ]);
  });

  it("un cambio preparado para una categoría que ya no está en la lista no entra al lote", () => {
    expect(cambiosPreparados([jeans], new Map([["id-borrada", { grupoClave: "jeans", version: 1 }]]))).toEqual([]);
  });

  it("si otra persona cambió la categoría después de prepararla (la versión subió), lo preparado caduca: no vale, no llega al lote y se avisa", () => {
    const pendientes = prep([jeans, "polos_tops_blusas"], [poleras, "polos_tops_blusas"]);
    // La pantalla se actualizó: Jeans ahora trae la versión 4 (la cambió otra persona); Poleras sigue igual.
    const alDia = [{ ...jeans, version: 4, grupoClave: "abrigo_y_capas" }, poleras, nueva];
    expect(preparadoDe(pendientes, alDia[0]!)).toBeUndefined();
    expect(cambiosPreparados(alDia, pendientes).map((c) => c.categoria)).toEqual(["Poleras"]);
    expect(obsoletas(alDia, pendientes).map((c) => c.categoria)).toEqual(["Jeans"]);
    const limpio = sinObsoletas(alDia, pendientes);
    expect([...limpio.keys()]).toEqual(["id-Poleras"]);
    expect(obsoletas(alDia, limpio)).toEqual([]);
  });

  it("lo preparado de una categoría que desapareció de la lista también se quita al limpiar", () => {
    const pendientes = new Map([...prep([poleras, "polos_tops_blusas"]), ["id-borrada", { grupoClave: "jeans", version: 1 }]]);
    expect([...sinObsoletas([poleras], pendientes).keys()]).toEqual(["id-Poleras"]);
  });

  it("volver a preparar una categoría cuyo cambio caducó lo prepara de nuevo con la versión vigente", () => {
    const vieja = prep([jeans, "polos_tops_blusas"]);
    const alDia = { ...jeans, version: 4 };
    const otra = conCambio(vieja, alDia, "polos_tops_blusas");
    expect(preparadoDe(otra, alDia)).toBe("polos_tops_blusas");
    expect(cambiosPreparados([alDia], otra)[0]?.version).toBe(4);
  });

  it("cada cambio se describe en palabras del negocio", () => {
    // Salen en el orden de la lista de categorías (Poleras, Jeans, Capas), no en el orden en que se prepararon.
    const [aConfirmar, aCambiar, aAsignar] = cambiosPreparados(
      todas,
      prep([jeans, "polos_tops_blusas"], [poleras, "abrigo_y_capas"], [nueva, "abrigo_y_capas"])
    );
    expect(describirCambio(aCambiar, GRUPOS)).toBe("Jeans: de «Jeans» a «Polos, tops y blusas»");
    expect(describirCambio(aConfirmar, GRUPOS)).toBe("Poleras: confirmar en «Abrigo y capas»");
    expect(describirCambio(aAsignar, GRUPOS)).toBe("Capas: sin grupo a «Abrigo y capas»");
  });
});

describe("lo que responde el guardado", () => {
  it("lee la respuesta de la base y rechaza lo que no tiene su forma", () => {
    expect(leerResultado({ cambiadas: 1, confirmadas: 41, sin_cambios: 0 })).toEqual({ cambiadas: 1, confirmadas: 41, sinCambios: 0 });
    expect(leerResultado({ cambiadas: 1 })).toBeNull();
    expect(leerResultado(null)).toBeNull();
    expect(leerResultado("ok")).toBeNull();
  });

  it("le dice a quien guardó qué quedó cambiado y qué quedó confirmado, con su plural", () => {
    expect(textoGuardado({ cambiadas: 1, confirmadas: 0, sinCambios: 0 })).toBe("1 categoría cambió de grupo");
    expect(textoGuardado({ cambiadas: 2, confirmadas: 40, sinCambios: 0 })).toBe("2 categorías cambiaron de grupo y 40 quedaron confirmadas");
    expect(textoGuardado({ cambiadas: 0, confirmadas: 1, sinCambios: 0 })).toBe("1 quedó confirmada");
    expect(textoGuardado({ cambiadas: 0, confirmadas: 0, sinCambios: 3 })).toBe("Ya estaba todo guardado así.");
  });
});

describe("el aviso de la propuesta sobre las categorías que esperan al líder", () => {
  it("sin categorías por revisar ni sin grupo no hay aviso (ni con cero, ni con un número que no es cuenta)", () => {
    expect(avisoDeGruposPorRevisar(0, 0, true)).toBeNull();
    expect(avisoDeGruposPorRevisar(-2, 0, true)).toBeNull();
    expect(avisoDeGruposPorRevisar(Number.NaN, Number.NaN, false)).toBeNull();
  });

  it("solo «por revisar»: dice que la propuesta usa el grupo del sistema mientras nadie lo confirme, y manda a revisar", () => {
    expect(avisoDeGruposPorRevisar(45, 0, true)).toEqual({
      titulo: "45 categorías siguen por revisar",
      detalle: "Mientras no las confirmes, la propuesta usa el grupo que el sistema les puso.",
      accion: "Revisar las 45 categorías",
    });
  });

  it("a quien no es líder le dice que las confirma el líder y solo lo deja verlas", () => {
    const a = avisoDeGruposPorRevisar(45, 0, false)!;
    expect(a.detalle).toBe("Mientras el líder no las confirme, la propuesta usa el grupo que el sistema les puso.");
    expect(a.accion).toBe("Ver las 45 categorías");
  });

  it("solo «sin grupo»: NO dice que la propuesta usa un grupo (no tienen ninguno): dice que no entran al reparto", () => {
    const a = avisoDeGruposPorRevisar(0, 2, true)!;
    expect(a.titulo).toBe("2 categorías no tienen grupo");
    expect(a.detalle).toBe("Mientras no les elijas uno, no entran al reparto de la propuesta.");
    expect(a.detalle).not.toMatch(/el sistema/);
    expect(avisoDeGruposPorRevisar(0, 2, false)!.detalle).toBe("Mientras el líder no les elija uno, no entran al reparto de la propuesta.");
  });

  it("las dos cosas a la vez: el botón cuenta todas (es lo que la pestaña Grupos muestra) y el detalle separa lo que SÍ y lo que NO entra", () => {
    const a = avisoDeGruposPorRevisar(45, 2, true)!;
    expect(a.titulo).toBe("47 categorías esperan revisión");
    expect(a.detalle).toBe("45 siguen con el grupo que les puso el sistema; 2 no tienen grupo y no entran al reparto de la propuesta.");
    expect(a.accion).toBe("Revisar las 47 categorías");
  });

  it("con una sola categoría todo va en singular, en cada caso", () => {
    expect(avisoDeGruposPorRevisar(1, 0, true)).toEqual({
      titulo: "1 categoría sigue por revisar",
      detalle: "Mientras no la confirmes, la propuesta usa el grupo que el sistema le puso.",
      accion: "Revisar la categoría",
    });
    expect(avisoDeGruposPorRevisar(0, 1, true)).toEqual({
      titulo: "1 categoría no tiene grupo",
      detalle: "Mientras no le elijas uno, no entra al reparto de la propuesta.",
      accion: "Revisar la categoría",
    });
    expect(avisoDeGruposPorRevisar(1, 1, false)!.detalle).toBe("1 sigue con el grupo que le puso el sistema; 1 no tiene grupo y no entra al reparto de la propuesta.");
    expect(avisoDeGruposPorRevisar(1, 0, false)!.accion).toBe("Ver la categoría");
  });

  it("los miles llevan coma, como en el resto del ERP", () => {
    expect(avisoDeGruposPorRevisar(1200, 0, true)!.titulo).toBe("1,200 categorías siguen por revisar");
  });
});
