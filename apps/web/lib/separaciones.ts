import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { apartadoDeFila, pedidoDeFila, TOPE_SEPARACIONES, type Apartado, type AvisoApartado, type PedidoApartado } from "@/lib/separaciones-reglas";

// «Apartados» de una tienda (ADR-0166; en la base, `separaciones`). Solo lectura, salvo el vencimiento:
// antes de leer se llama `fn_vencer_separaciones`, que libera lo vencido hace más de 2 días (D3). Así el
// vencimiento no necesita una tarea programada: pasa al abrir la pantalla, y es idempotente.

export type ApartadosDeTienda =
  /** La migración todavía no está en esta base (PGRST202): la pantalla lo dice, no se cae. */
  | { instalado: false }
  | {
      instalado: true;
      apartados: Apartado[];
      hayMas: boolean;
      avisos: Record<string, AvisoApartado>;
      /** Lo que esta tienda apagó en «Opciones» (20260927130000). Vacío = Completo, el de fábrica. */
      apagadas: string[];
      /** Pedidos a otras tiendas para apartar (20260927140000): los que esta tienda hizo y los que le hicieron, con dónde
       *  quedó apartada la prenda en la sede que la envía (ADR-0328 act. 17). */
      pedidos: PedidoApartado[];
    };

/**
 * `desde`: el primer día (de Lima) de lo CERRADO que se lee —el Historial abre en los últimos 30 días
 * (`lib/historial-apartados-reglas.ts`)—; lo abierto o por devolver sale siempre (`buscar_separaciones`, 20261010180000).
 * `abrir`: un apartado pedido por su id (`?abrir=`, desde Movimientos) entra a la lista aunque sea más viejo que el rango.
 */
export async function getApartadosDeTienda(ubicacionId: string, opciones: { desde?: string; abrir?: string | null } = {}): Promise<ApartadosDeTienda> {
  const supabase = await createClient();
  const vencer = await supabase.rpc("fn_vencer_separaciones", { p_ubicacion_id: ubicacionId });
  if (vencer.error?.code === "PGRST202") return { instalado: false };
  // Si el vencimiento falla por otra razón no se tumba la pantalla: se lee igual y lo vencido espera al próximo intento. Lo que se
  // liberó ahora sale en «Pendientes» como «Por devolver» (ADR-0720): no hace falta contarlo aparte.

  const [lista, pedido, avisos, ajustes, pedidos] = await Promise.all([
    supabase.rpc("buscar_separaciones", { p_ubicacion_id: ubicacionId, p_desde: opciones.desde }),
    // El apartado pedido por `?abrir=`, sin rango. Es secundario: si falla, la pantalla abre como siempre.
    opciones.abrir ? supabase.rpc("buscar_separaciones", { p_ubicacion_id: ubicacionId, p_texto: opciones.abrir }) : null,
    // Recordar en lote (20260926233000). Es secundario: sin la migración (PGRST202) o si falla, la pantalla sigue igual
    // y la cola cuenta a todas como «por avisar» — nunca esconde a alguien que falta avisar.
    supabase.rpc("fn_avisos_separaciones", { p_ubicacion_id: ubicacionId }),
    // Opciones de la tienda: si fallan o la migración aún no está, todo queda encendido (Completo).
    supabase.rpc("fn_opciones_apartados", { p_ubicacion_id: ubicacionId }),
    // Pedidos a otra sede: secundario como los anteriores (sin la migración, la lista queda vacía). La misma lectura que
    // Traslados (ADR-0328 act. 17): trae `reserva_en`, para que las dos listas decidan igual entre «Enviar» y «Subir al
    // almacén» (`envioConCliente`).
    supabase.rpc("fn_pedidos_con_cliente", { p_ubicacion_id: ubicacionId }),
  ]);
  // Si la base todavía no tiene el rango (20261010180000 sin aplicar: PGRST202), se lee como antes, sin fecha.
  const filas = exigir(
    lista.error?.code === "PGRST202" ? await supabase.rpc("buscar_separaciones", { p_ubicacion_id: ubicacionId }) : lista,
    "los apartados",
  );
  const extra = (pedido && !pedido.error ? (pedido.data ?? []) : []).filter((f) => f.id === opciones.abrir && !filas.some((x) => x.id === f.id));

  return {
    instalado: true,
    hayMas: filas.length >= TOPE_SEPARACIONES,
    apagadas: ajustes.error ? [] : ((ajustes.data as string[] | null) ?? []),
    pedidos: pedidos.error ? [] : (pedidos.data ?? []).map((f) => pedidoDeFila(f as unknown as Record<string, unknown>)),
    avisos: Object.fromEntries(
      (avisos.error ? [] : (avisos.data ?? [])).map((a) => [a.separacion_id, { avisos: Number(a.avisos), ultimoEn: a.ultimo_aviso_en, ultimoPor: a.ultimo_por }]),
    ),
    apartados: [...filas, ...extra].map((f) => apartadoDeFila(f as unknown as Record<string, unknown>)),
  };
}
