// Lectura de la cola «Por regularizar» (ADR-0179): prendas vendidas en caja antes de estar en el
// sistema. RLS deja ver solo las sedes que la persona puede operar; el líder, todas.
// Rutas relativas (como `candidatas-alta-lector.ts`): vitest no resuelve `@/`, y esta lectura se prueba con un cliente simulado.
import { createClient } from "./supabase/server";
import { exigir, leerTodas } from "./resultado";
import { resueltasDesde, vencidasDesde, type VentaSinCargar } from "./por-regularizar-reglas";
import type { HechoCandidata } from "./por-regularizar-candidatas";
import type { CategoriaParaSugerir } from "./sugerir-categoria-sin-registrar";

export type FilaPorRegularizar = {
  id: string;
  descripcion: string;
  categoria: string;
  /** La categoría que ANOTÓ la caja (para comparar con la que nombra lo que escribió, ADR-0328). */
  categoriaId: string;
  talla: string;
  color: string;
  precioCobrado: number;
  vendidoPor: string;
  /** La persona que vendió (`vendido_por`): quien la vendió no la regulariza, salvo el líder (ADR-0328). */
  vendidoPorId: string | null;
  vendidoEn: string;
  ubicacionId: string;
  sede: string;
  /** `cerrada_sin_prenda` (ADR-0334): un líder la dio por hecha en el cierre de arranque, sin identificar la prenda ni mover stock. */
  estado: "pendiente" | "regularizada" | "anulada" | "cerrada_sin_prenda";
  /** Solo cerrada (o anulada después de cerrada): por qué se cerró y cuándo. */
  cierre: { motivo: string; cerradoEn: string } | null;
  /** Solo regularizada: la prenda real y la diferencia (cobrado − oficial). */
  prendaReal: string | null;
  forma: "ya_registrada" | "llego_nueva" | null;
  diferencia: number | null;
};

const COLUMNAS = `id, ubicacion_id, categoria_id, descripcion, precio_cobrado, vendido_por, vendido_en, estado, forma, diferencia,
       categoria:categorias ( nombre ), talla:tallas ( valor ), color:colores ( nombre ),
       ubicacion:ubicaciones ( nombre ), variante:variantes ( sku, producto:productos ( referencia ) ),
       cierre:cierres_cola_arranque!prendas_por_regularizar_cierre_fk ( motivo, cerrado_en )`;

/**
 * La cola entera: las PENDIENTES (las más antiguas arriba, sin tope ni ventana) y, después, lo ya resuelto de este mes y el
 * anterior (`resueltasDesde`), de lo más nuevo a lo más viejo.
 *
 * Antes era un solo `.limit(200)` por fecha descendente. Pasadas 200 filas lo primero que se perdía eran las pendientes más
 * viejas —las vencidas, que son las que hay que ver— y las cuatro cifras de la cabecera (`cifrasPorRegularizar`, que cuenta
 * lo que llega) salían de menos sin avisar, mientras el inicio (`contarVencidas`, con conteo exacto) decía otro número. Son tres
 * lecturas porque son tres cosas: la cola de trabajo no se corta nunca; el historial sí, por fecha y no por cantidad; y las cerradas sin prenda tampoco. Cada una
 * va por páginas (`leerTodas`): PostgREST corta en 1.000 filas sin dar error.
 */
export async function getPorRegularizar(ubicacionId: string | null, ahora: Date = new Date()): Promise<FilaPorRegularizar[]> {
  const supabase = await createClient();
  const ventana = resueltasDesde(ahora);
  // Lo normal es que cada lectura quepa en una página: en serie, la 2.ª solo se pide si la 1.ª vino llena.
  // Tres lecturas, porque son tres cosas: la COLA de trabajo (pendientes, sin ventana, la más vieja arriba), el HISTORIAL resuelto (por
  // fecha) y las CERRADAS sin prenda (ADR-0334), que van SIN ventana: son pocas, no crecen y el botón «Reabrir» solo existe en esta lista;
  // con la ventana del historial, una venta cerrada de hace más de un mes dejaría de poder reabrirse aunque la base lo permita.
  const leer = (cual: "pendientes" | "resueltas" | "cerradas") =>
    leerTodas(
      (desde, hasta) => {
        let consulta = supabase.from("prendas_por_regularizar").select(COLUMNAS);
        if (ubicacionId) consulta = consulta.eq("ubicacion_id", ubicacionId);
        if (cual === "pendientes") consulta = consulta.eq("estado", "pendiente");
        else if (cual === "cerradas") consulta = consulta.eq("estado", "cerrada_sin_prenda");
        else consulta = consulta.neq("estado", "pendiente").neq("estado", "cerrada_sin_prenda").gte("vendido_en", ventana);
        // `id` desempata: sin un orden único, dos páginas pueden repetir o saltarse filas.
        return consulta.order("vendido_en", { ascending: cual === "pendientes" }).order("id").range(desde, hasta);
      },
      { enParalelo: 1 },
    );
  const [pendientes, resueltas, cerradas] = await Promise.all([leer("pendientes"), leer("resueltas"), leer("cerradas")]);
  const yaResueltas = [...exigir(resueltas, "las prendas ya regularizadas"), ...exigir(cerradas, "las ventas cerradas sin prenda")].sort(
    (a, b) => Date.parse(b.vendido_en) - Date.parse(a.vendido_en) || a.id.localeCompare(b.id),
  );
  // Las lecturas no comparten foto de la base: una prenda que almacén regulariza (o un líder cierra) justo entre las lecturas saldría en
  // dos y se pintaría dos veces. Gana la resuelta, que es la más nueva. (En el sentido contrario, que no salga en ninguna, solo dura
  // hasta el siguiente refresco.)
  const idsResueltas = new Set(yaResueltas.map((f) => f.id));
  const filas = [...exigir(pendientes, "las prendas por regularizar").filter((f) => !idsResueltas.has(f.id)), ...yaResueltas];

  // `personas` vive en `public` (Dynamic): PostgREST no la embebe; se nombra con la misma función que Historial.
  const ids = [...new Set(filas.flatMap((f) => (f.vendido_por ? [f.vendido_por] : [])))];
  const nombres = new Map<string, string>();
  if (ids.length > 0) {
    for (const n of exigir(await supabase.rpc("fn_nombres_personas", { p_ids: ids }), "quién vendió cada prenda")) nombres.set(n.id, n.nombre);
  }

  const aFila = (f: (typeof filas)[number]): FilaPorRegularizar => ({
    id: f.id,
    descripcion: f.descripcion,
    categoria: f.categoria?.nombre ?? "",
    categoriaId: f.categoria_id,
    talla: f.talla?.valor ?? "",
    color: f.color?.nombre ?? "",
    precioCobrado: Number(f.precio_cobrado),
    vendidoPor: (f.vendido_por && nombres.get(f.vendido_por)) || "—",
    vendidoPorId: f.vendido_por,
    vendidoEn: f.vendido_en,
    ubicacionId: f.ubicacion_id,
    sede: f.ubicacion?.nombre ?? "",
    estado: f.estado as FilaPorRegularizar["estado"],
    cierre: f.cierre ? { motivo: f.cierre.motivo, cerradoEn: f.cierre.cerrado_en } : null,
    prendaReal: f.variante ? `${f.variante.producto?.referencia ?? ""} · ${f.variante.sku}` : null,
    forma: f.forma as FilaPorRegularizar["forma"],
    diferencia: f.diferencia === null ? null : Number(f.diferencia),
  });
  return filas.map(aFila);
}

/** Para el aviso del inicio: pendientes que ya pasaron el plazo. Solo lo pide el líder. null = no se pudo leer. */
export async function contarVencidas(): Promise<number | null> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("prendas_por_regularizar")
    .select("id", { count: "exact", head: true })
    .eq("estado", "pendiente")
    .lte("vendido_en", vencidasDesde());
  // Nunca lanza: si no se puede leer, el inicio lo dice en la tarjeta en vez de dibujar un 0.
  return error ? null : (count ?? 0);
}

/**
 * Las categorías activas, para leer lo que la caja escribió (`categoriaEscritaDistinta`). Es una ayuda: si falla, ninguna venta
 * se marca como «escrita distinta» y la pantalla sigue con la categoría anotada.
 */
export async function getCategoriasParaSugerir(): Promise<CategoriaParaSugerir[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("categorias").select("id, nombre, prefijo").eq("activo", true);
  if (error || !data) {
    console.error("Categorías para leer lo escrito en Por regularizar:", error);
    return [];
  }
  return data;
}

/**
 * Por cada venta pendiente, si su prenda está sin cargar en la sede y cómo está la carga inicial de esa sede
 * (`retail.fn_por_regularizar_sin_cargar`, ajuste ADR-0328 del 2026-10-04). Es una ayuda, como las candidatas: si la lectura falla
 * (la función todavía no está pegada, o la red se cae) devuelve `{}` y la pantalla sigue sin la línea que agrupa ni la salida según
 * la carga; al guardar, la base dice igual qué hacer.
 */
export async function getSinCargarPorRegularizar(ubicacionId: string | null): Promise<Record<string, VentaSinCargar>> {
  try {
    const supabase = await createClient();
    const args = ubicacionId ? { p_ubicacion_id: ubicacionId } : {};
    // Una fila por venta pendiente: cientos, no miles; igual va por páginas (PostgREST corta en 1.000 sin avisar).
    const r = await leerTodas((desde, hasta) => supabase.rpc("fn_por_regularizar_sin_cargar", args).range(desde, hasta), { enParalelo: 1 });
    if (r.error || !r.data) throw new Error(r.error?.message ?? "sin datos");
    return Object.fromEntries(
      r.data.map((f) => [f.prenda_id, { sinCargar: f.sin_cargar, carga: { abierta: f.carga_abierta, hastaCorta: f.carga_hasta_corta } }]),
    );
  } catch (e) {
    console.error("Ventas de prendas sin cargar en Por regularizar:", e);
    return {};
  }
}

/**
 * Las prendas del stock que pueden ser cada venta pendiente (`retail.fn_candidatas_por_regularizar`, ADR-0328 act. 5): la base
 * trae los hechos y `lib/por-regularizar-candidatas.ts` los ordena y los explica. Con `categoriaDe` ({id de la venta: id de
 * categoría}) solo esas ventas, buscadas en la categoría que nombra lo que la caja escribió (la segunda lectura).
 *
 * Es una ayuda, no la cola: si la lectura falla (la función todavía no está pegada en producción, o la red se cae) NUNCA tumba
 * Por regularizar. Devuelve la lista vacía y el aviso para pintar, y la persona regulariza como antes, buscando en el catálogo.
 */
export async function getCandidatasPorRegularizar(
  ubicacionId: string | null,
  categoriaDe?: Record<string, string>,
): Promise<{ hechos: HechoCandidata[]; fallo: string | null }> {
  try {
    const supabase = await createClient();
    const args = { ...(ubicacionId ? { p_ubicacion_id: ubicacionId } : {}), ...(categoriaDe ? { p_categoria_de: categoriaDe } : {}) };
    // Hasta 20 por venta: con cientos de pendientes puede pasar de las 1.000 filas que PostgREST entrega de una vez.
    const r = await leerTodas((desde, hasta) => supabase.rpc("fn_candidatas_por_regularizar", args).range(desde, hasta), { enParalelo: 1 });
    if (r.error || !r.data) throw new Error(r.error?.message ?? "sin datos");
    return {
      hechos: r.data.map((f) => ({
        prendaId: f.prenda_id,
        varianteId: f.variante_id,
        colorExacto: f.color_exacto,
        colorHex: f.color_hex,
        colorHexAnotado: f.color_hex_anotado,
        pisoLibre: Number(f.piso_libre),
        almacenLibre: Number(f.almacen_libre),
        disponible: Number(f.disponible),
        primeraEntrada: f.primera_entrada,
        primeraEntradaMotivo: f.primera_entrada_motivo,
        saldoALaVenta: f.saldo_a_la_venta === null ? null : Number(f.saldo_a_la_venta),
        cambioPosterior: f.cambio_posterior,
        cambioPosteriorMotivo: f.cambio_posterior_motivo,
      })),
      fallo: null,
    };
  } catch (e) {
    console.error("Prendas sugeridas de Por regularizar:", e);
    return { hechos: [], fallo: "No se pudieron leer las prendas sugeridas: busca cada una en el catálogo, como siempre." };
  }
}

/**
 * Hasta cuándo cada tienda puede cerrar su cola de arranque (ADR-0334): `ubicacion_id → AAAA-MM-DD`. RLS deja ver solo las tiendas que la
 * persona opera. Una tienda sin fila no tiene plazo, y sin plazo la pantalla no ofrece el cierre.
 * Nunca lanza: si no se puede leer, devuelve `{}` y la pantalla sigue entera, solo sin ese botón (principio 9: lo accesorio no tumba lo
 * principal). La base vuelve a exigir el plazo al cerrar.
 */
export async function getPlazosColaArranque(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("cola_arranque_plazo").select("ubicacion_id, hasta");
  if (error || !data) return {};
  return Object.fromEntries(data.map((p) => [p.ubicacion_id, p.hasta]));
}
