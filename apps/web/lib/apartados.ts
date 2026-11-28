import { createClient } from "@/lib/supabase/server";
import { exigir, leerTodas } from "@/lib/resultado";
import { puedeLiberarApartado, type Apartado } from "@/lib/apartados-reglas";

// Los apartados ABIERTOS de una ubicación (`retail.listar_apartados`, 20260920160000, ADR-0141).
// Solo lectura: se escribe únicamente por las RPC `apartar_stock`/`liberar_apartado`, que llaman los
// modales. La base ya limita a lo de la tienda de quien mira (una líder ve la que elija), ordena por
// fecha límite (lo que vence primero, o ya venció, sale arriba) y resuelve `puede_liberar` — la regla
// «solo quien apartó o una líder» no se repite en la app.
//
// Excepción de la TERMINAL (Felipe, 2026-09-22; `liberar_apartado` en 20260923100000): libera siempre, sea quien sea
// que apartó — entregar la prenda o soltar un apartado vencido es operación del mostrador. `listar_apartados` todavía
// calcula `puede_liberar` con la persona de la sesión (una terminal no tiene), así que aquí se abre para la terminal
// hasta que la lectura se alinee en la base. La base sigue siendo la que decide al liberar.
export async function getApartadosAbiertos(ubicacionId: string, opciones: { esTerminal?: boolean; veApartados?: boolean } = {}): Promise<Apartado[]> {
  const supabase = await createClient();
  // Por páginas, en serie (ADR-0192): PostgREST corta también las RPC en 1.000 filas sin avisar. Mismo orden que la
  // función (lo que vence primero arriba) más `id`, único.
  const respuesta = await leerTodas(
    (desde, hasta) =>
      supabase.rpc("listar_apartados", { p_ubicacion_id: ubicacionId }).order("vence_el").order("created_at").order("id").range(desde, hasta),
    { enParalelo: 1 },
  );
  // PGRST202 = la función todavía no existe (la migración no está pegada en producción): sin apartados, y las
  // demás pantallas siguen. TEMPORAL, mismo criterio que `getStockPorUbicacion` (ADR-0141).
  if (respuesta.error?.code === "PGRST202") return [];
  const filas = exigir(respuesta, "los apartados");
  // Cuáles son la reserva de un pedido web (ADR-0408, act. 8). Si la función no responde (no está pegada), la lista sigue sin el
  // rótulo: la base igual rechaza «Liberar» con su propio aviso.
  // Y cuáles son la prenda de un apartado con adelanto (auditoría 2026-11-28, N.º 2): se rotulan con su APT y enlazan a Apartados en
  // vez de ofrecer «Liberar». Igual de secundaria: si no responde, `listar_apartados` ya devuelve `puede_liberar` en falso para ellas
  // y la base rechaza la liberación con su propio aviso.
  const [web, deApt] =
    filas.length === 0
      ? [null, null]
      : await Promise.all([
          supabase.rpc("fn_apartados_de_pedidos_web", { p_ubicacion_id: ubicacionId }),
          supabase.rpc("fn_apartados_de_separaciones", { p_ubicacion_id: ubicacionId }),
        ]);
  const deWeb = new Map(
    (web?.error ? [] : (web?.data ?? [])).map((w) => [w.apartado_id, { codigo: w.pedido_codigo, tiendaPedido: w.tienda_pedido, paraOtraTienda: w.para_otra_tienda }]),
  );
  // El enlace solo a quien ve Apartados (como Movimientos, `FilaMovimiento.tsx`): a los demás se les dice dónde, sin un enlace que da «Sin acceso».
  const deSeparacion = new Map(
    (deApt?.error ? [] : (deApt?.data ?? [])).map((s) => [
      s.apartado_id,
      { id: s.separacion_id, codigo: s.separacion_codigo, href: opciones.veApartados === true ? `/vender/apartados?abrir=${s.separacion_id}` : null },
    ]),
  );

  return filas.map((f) => ({
    id: f.id,
    varianteId: f.variante_id,
    sku: f.sku,
    referencia: f.referencia,
    talla: f.talla ?? null,
    color: f.color ?? null,
    sububicacionId: f.sububicacion_id ?? null,
    cantidad: f.cantidad,
    clienta: f.clienta_nombre,
    contacto: f.clienta_contacto,
    nota: f.nota ?? null,
    // Null = la reserva de un pedido de otra sede: no vence (ADR-0328 act. 17, decisión del 2026-10-04).
    venceEl: f.vence_el ?? null,
    creadoEn: f.created_at,
    apartoNombre: f.creado_por_nombre ?? null,
    puedeLiberar: puedeLiberarApartado({
      puedeLiberarBase: f.puede_liberar,
      esTerminal: opciones.esTerminal === true,
      esPedidoWeb: deWeb.has(f.id),
      esDeSeparacion: deSeparacion.has(f.id),
    }),
    pedidoWeb: deWeb.get(f.id) ?? null,
    separacion: deSeparacion.get(f.id) ?? null,
  }));
}
