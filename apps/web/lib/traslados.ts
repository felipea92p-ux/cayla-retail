import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { exigir, exigirOpcional, tolerar } from "@/lib/resultado";
import { fotosDelTraslado, type FotoCruda, type FotoTraslado } from "@/lib/producto-fotos-reglas";
import { contarRequierenAccion } from "@/lib/traslados-reglas";

// Traslados en dos fases (20260916150000): envío → en tránsito →
// confirmación en destino. Las RPC de escritura (iniciar_traslado,
// registrar_recepcion_traslado, confirmar_traslado,
// cerrar_traslado_con_diferencia) se llaman directo desde los componentes
// cliente (mismo patrón que `abrir_conteo`/`conteo_contar` en ConteoPanel.tsx)
// — este archivo solo trae lecturas server-side.

export type TrasladoResumen = {
  id: string;
  /** Número corrido (20260916200000): «Traslado 12» — lo que se dice por
   *  WhatsApp, en vez del uuid. */
  numero: number;
  ubicacionOrigenId: string;
  ubicacionOrigenNombre: string;
  ubicacionDestinoId: string;
  ubicacionDestinoNombre: string;
  estado: string;
  fechaEstimadaLlegada: string | null;
  creadoEn: string;
  confirmadoEn: string | null;
  cerradoEn: string | null;
  nota: string | null;
  unidadesEnviadas: number;
  /** Cuántas variantes distintas (talla/color) van — lo que la pantalla dice «3 variantes». Es una
   *  línea por variante: `transferencia_items` tiene índice único (transferencia_id, variante_id),
   *  así que el mismo par no se repite y contar líneas ES contar variantes. */
  lineas: number;
  /** Los productos que van, por nombre y sin repetir — para leer «Blusa Camila + 2 más»
   *  sin abrir el detalle. */
  referencias: string[];
  /** Los códigos de las variantes que van: solo para que el buscador encuentre por código. */
  skus: string[];
  /** Hasta 3 miniaturas REALES (ver `fotosDelTraslado`). `[]` = ninguna prenda tiene foto, no se
   *  pidieron (`getTrasladosDeLaSede` es la única que las trae) o la lectura de fotos falló:
   *  la pantalla dibuja el marcador «sin foto», nunca una imagen rota. */
  fotos: FotoTraslado[];
};

export type { FotoTraslado };

const SELECT_RESUMEN = `id, numero, ubicacion_origen_id, ubicacion_destino_id, estado, fecha_estimada_llegada, created_at, confirmado_en, cerrado_en, nota,
  origen:ubicaciones!transferencias_ubicacion_origen_id_fkey ( nombre ),
  destino:ubicaciones!transferencias_ubicacion_destino_id_fkey ( nombre ),
  transferencia_items ( cantidad, variante_id, variante:variantes ( sku, color_codigo, producto_id, producto:productos ( referencia ) ) )`;

type FilaResumen = {
  id: string;
  numero: number;
  ubicacion_origen_id: string;
  ubicacion_destino_id: string;
  estado: string;
  fecha_estimada_llegada: string | null;
  created_at: string;
  confirmado_en: string | null;
  cerrado_en: string | null;
  nota: string | null;
  origen: { nombre: string } | null;
  destino: { nombre: string } | null;
  transferencia_items:
    | {
        cantidad: number;
        variante_id: string;
        variante: { sku: string | null; color_codigo: string | null; producto_id: string; producto: { referencia: string } | null } | null;
      }[]
    | null;
};

type Cliente = Awaited<ReturnType<typeof createClient>>;

function aResumen(f: FilaResumen, fotosPorProducto: Map<string, FotoCruda[]> = new Map()): TrasladoResumen {
  const items = f.transferencia_items ?? [];
  // Un producto con tres tallas en el mismo traslado se nombra una vez.
  const referencias = Array.from(new Set(items.map((i) => i.variante?.producto?.referencia).filter((r): r is string => !!r)));
  const skus = Array.from(new Set(items.map((i) => i.variante?.sku).filter((c): c is string => !!c)));
  return {
    id: f.id,
    numero: f.numero,
    ubicacionOrigenId: f.ubicacion_origen_id,
    ubicacionOrigenNombre: f.origen?.nombre ?? "—",
    ubicacionDestinoId: f.ubicacion_destino_id,
    ubicacionDestinoNombre: f.destino?.nombre ?? "—",
    estado: f.estado,
    fechaEstimadaLlegada: f.fecha_estimada_llegada,
    creadoEn: f.created_at,
    confirmadoEn: f.confirmado_en,
    cerradoEn: f.cerrado_en,
    nota: f.nota,
    unidadesEnviadas: items.reduce((acc, i) => acc + i.cantidad, 0),
    lineas: items.length,
    referencias,
    skus,
    fotos: fotosDelTraslado(
      items.map((i) => ({
        cantidad: i.cantidad,
        productoId: i.variante?.producto_id ?? null,
        colorCodigo: i.variante?.color_codigo ?? null,
        referencia: i.variante?.producto?.referencia ?? null,
      })),
      fotosPorProducto
    ),
  };
}

async function filasEnCurso(supabase: Cliente, ubicacionId: string): Promise<FilaResumen[]> {
  const filas = exigir(
    await supabase
      .from("transferencias")
      .select(SELECT_RESUMEN)
      .or(`ubicacion_origen_id.eq.${ubicacionId},ubicacion_destino_id.eq.${ubicacionId}`)
      .in("estado", ["en_transito", "recibido_con_diferencia"])
      .order("fecha_estimada_llegada", { ascending: true }),
    "los traslados en curso"
  );
  return filas as FilaResumen[];
}

async function filasCerradas(supabase: Cliente, ubicacionId: string, limite: number): Promise<FilaResumen[]> {
  const filas = exigir(
    await supabase
      .from("transferencias")
      .select(SELECT_RESUMEN)
      .or(`ubicacion_origen_id.eq.${ubicacionId},ubicacion_destino_id.eq.${ubicacionId}`)
      .in("estado", ["cerrada", "completada"])
      .order("created_at", { ascending: false })
      .limit(limite),
    "los traslados anteriores"
  );
  return filas as FilaResumen[];
}

/** Traslados que no han terminado: en tránsito o con diferencia pendiente de
 *  líder. Bilateral — sale tanto si la ubicación es origen como destino.
 *  Sin fotos a propósito: la usan Existencias y otras pantallas que solo
 *  necesitan conteos y fechas (para las miniaturas, `getTrasladosDeLaSede`). */
export async function getTrasladosEnCurso(ubicacionId: string): Promise<TrasladoResumen[]> {
  const supabase = await createClient();
  return (await filasEnCurso(supabase, ubicacionId)).map((f) => aResumen(f));
}

/** Los últimos traslados que YA terminaron (cerrados, o «completada» del
 *  modelo atómico anterior), para el historial de la pantalla. Aparte de los
 *  en curso a propósito: los en curso se traen todos (son pocos y hay que
 *  verlos todos); el historial se acota. */
export async function getTrasladosCerrados(ubicacionId: string, limite = 30): Promise<TrasladoResumen[]> {
  const supabase = await createClient();
  return (await filasCerradas(supabase, ubicacionId, limite)).map((f) => aResumen(f));
}

/** Las fotos de los productos que van en estos traslados, en UNA consulta por lote de 100
 *  productos (100 uuids caben cómodos en la URL). Son decorativas: si la lectura falla, la
 *  pantalla sigue con el marcador «sin foto» — nunca `exigir`, una miniatura no puede tumbar
 *  la pantalla donde se confirman recepciones. */
async function leerFotosPorProducto(supabase: Cliente, productoIds: string[]): Promise<Map<string, FotoCruda[]>> {
  const mapa = new Map<string, FotoCruda[]>();
  const ids = Array.from(new Set(productoIds));
  for (let i = 0; i < ids.length; i += 100) {
    try {
      const res = await supabase
        .from("producto_fotos")
        .select("producto_id, url, orden, es_principal, color_codigo")
        .in("producto_id", ids.slice(i, i + 100));
      const { datos, fallo } = tolerar(res, "las fotos de las prendas");
      if (fallo || !datos) {
        // `tolerar` devuelve el aviso para la persona; la causa real (Postgres) es para quien lea el log.
        console.error("Miniaturas de traslados:", res.error?.message ?? fallo);
        continue;
      }
      for (const f of datos) {
        const lista = mapa.get(f.producto_id) ?? [];
        lista.push({ url: f.url, orden: f.orden, es_principal: f.es_principal, color_codigo: f.color_codigo });
        mapa.set(f.producto_id, lista);
      }
    } catch (e) {
      console.error("Miniaturas de traslados:", e);
    }
  }
  return mapa;
}

/** Todo lo que la pantalla Traslados necesita, en un solo viaje: los en curso (todos), los últimos
 *  cerrados (`limiteCerrados`) y las miniaturas de ambos con UNA sola consulta de fotos. */
export async function getTrasladosDeLaSede(
  ubicacionId: string,
  limiteCerrados = 30
): Promise<{ enCurso: TrasladoResumen[]; cerrados: TrasladoResumen[] }> {
  const supabase = await createClient();
  const [abiertas, cerradas] = await Promise.all([filasEnCurso(supabase, ubicacionId), filasCerradas(supabase, ubicacionId, limiteCerrados)]);
  const productoIds = [...abiertas, ...cerradas].flatMap((f) => (f.transferencia_items ?? []).map((i) => i.variante?.producto_id).filter((id): id is string => !!id));
  const fotos = await leerFotosPorProducto(supabase, productoIds);
  return { enCurso: abiertas.map((f) => aResumen(f, fotos)), cerrados: cerradas.map((f) => aResumen(f, fotos)) };
}

type FilaContador = {
  estado: string;
  ubicacion_origen_id: string;
  ubicacion_destino_id: string;
  fecha_estimada_llegada: string | null;
  confirmado_en: string | null;
};

/**
 * El número junto a «Traslados» en el menú: cuántos traslados le piden una acción a quien mira,
 * AHORA. Usa la misma regla que la franja «Atención hoy» de la pantalla (`contarRequierenAccion`),
 * así que el menú y la pantalla no pueden discrepar.
 *
 * Total: nunca lanza. Devuelve `null` si algo falla y el menú sale sin número — este cálculo
 * corre dentro del layout de toda la app, y una excepción ahí (que no tiene `error.tsx` propio)
 * dejaría sin pantalla hasta Vender y Caja por un contador. Un contador que falta es un
 * inconveniente; una app caída por un contador es un incidente.
 *
 * Solo mira lo que llega a la sede (las dos acciones que existen —confirmar una recepción, cerrar
 * una diferencia— se hacen en el destino). Una lectura liviana: sin ítems ni joins. `cache()` la
 * comparte entre los dos layouts que la piden dentro del mismo request; los argumentos son
 * primitivos justamente para que la deduplicación funcione.
 */
export const getTrasladosPorAtender = cache(async (ubicacionId: string, puedeCerrarDiferencia: boolean): Promise<number | null> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("transferencias")
      .select("estado, ubicacion_origen_id, ubicacion_destino_id, fecha_estimada_llegada, confirmado_en")
      .eq("ubicacion_destino_id", ubicacionId)
      .in("estado", ["en_transito", "recibido_con_diferencia"]);
    if (error || !data) {
      console.error("Contador de traslados:", error?.message);
      return null;
    }
    return contarRequierenAccion(
      (data as FilaContador[]).map((f) => ({
        estado: f.estado,
        ubicacionOrigenId: f.ubicacion_origen_id,
        ubicacionDestinoId: f.ubicacion_destino_id,
        fechaEstimadaLlegada: f.fecha_estimada_llegada,
        confirmadoEn: f.confirmado_en,
      })),
      { miUbicacionId: ubicacionId, puedeCerrarDiferencia, ahoraIso: new Date().toISOString() }
    );
  } catch (e) {
    console.error("Contador de traslados:", e);
    return null;
  }
});

export type LineaTraslado = {
  varianteId: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  cantidadEnviada: number | null;
  cantidadRecibida: number | null;
  diferencia: number | null;
};

export type TrasladoDetalle = {
  id: string;
  numero: number;
  ubicacionOrigenId: string;
  ubicacionOrigenNombre: string;
  ubicacionDestinoId: string;
  ubicacionDestinoNombre: string;
  estado: string;
  fechaEstimadaLlegada: string | null;
  creadoEn: string;
  /** Cuándo se registró la primera línea recibida y cuándo se cerró — para decir lo mismo que la lista. */
  confirmadoEn: string | null;
  cerradoEn: string | null;
  nota: string | null;
  notaCierre: string | null;
  creadoPorNombre: string;
  lineas: LineaTraslado[];
};

export async function getTrasladoDetalle(id: string): Promise<TrasladoDetalle | null> {
  const supabase = await createClient();
  const res = await supabase
    .from("transferencias")
    .select(
      `id, numero, ubicacion_origen_id, ubicacion_destino_id, estado, fecha_estimada_llegada, created_at, confirmado_en, cerrado_en, nota, nota_cierre, creado_por,
       origen:ubicaciones!transferencias_ubicacion_origen_id_fkey ( nombre ),
       destino:ubicaciones!transferencias_ubicacion_destino_id_fkey ( nombre )`
    )
    .eq("id", id)
    .maybeSingle();
  const t = exigirOpcional(res, "el traslado");
  if (!t) return null;

  const [lineasRes, nombreRes] = await Promise.all([
    supabase.rpc("fn_traslado_lineas", { p_transferencia_id: id }),
    t.creado_por ? supabase.rpc("fn_nombres_personas", { p_ids: [t.creado_por] }) : Promise.resolve({ data: [], error: null }),
  ]);
  const lineas = exigir(lineasRes, "las líneas del traslado");
  const nombres = exigir(nombreRes, "el nombre de quien envió");

  return {
    id: t.id,
    numero: t.numero,
    ubicacionOrigenId: t.ubicacion_origen_id,
    ubicacionOrigenNombre: t.origen?.nombre ?? "—",
    ubicacionDestinoId: t.ubicacion_destino_id,
    ubicacionDestinoNombre: t.destino?.nombre ?? "—",
    estado: t.estado,
    fechaEstimadaLlegada: t.fecha_estimada_llegada,
    creadoEn: t.created_at,
    confirmadoEn: t.confirmado_en,
    cerradoEn: t.cerrado_en,
    nota: t.nota,
    notaCierre: t.nota_cierre,
    creadoPorNombre: nombres[0]?.nombre ?? "—",
    lineas: lineas.map((l) => ({
      varianteId: l.variante_id,
      sku: l.sku,
      referencia: l.referencia,
      talla: l.talla,
      color: l.color,
      cantidadEnviada: l.cantidad_enviada,
      cantidadRecibida: l.cantidad_recibida,
      diferencia: l.diferencia,
    })),
  };
}
