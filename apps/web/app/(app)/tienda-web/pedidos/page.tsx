import { exigirModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { leerDetalle, leerTablero, type PestanaPedidos } from "@/lib/pedidos-web-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { PedidosWebPantalla } from "@/components/pedidos-web/PedidosWebPantalla";

// Tienda web ▸ Pedidos web (ADR-0408, actividad 8; ADR-0430 y su actualización del 2026-10-17, maqueta docs/maquetas/pedidos-web-2026-10):
// lo que los clientes separaron en la tienda online para ESTA tienda, para confirmarlo; y lo que otra tienda espera de aquí, para
// enviarlo. La cabecera es `EncabezadoPagina` (ADR-0220). El pedido abierto vive en la URL (`?pedido=<id>`): se comparte, sobrevive a recargar y
// la página lo lee junto con la lista.
const PESTANAS: readonly PestanaPedidos[] = ["confirmar", "cobrar", "entregar", "cerrados"];

export default async function PedidosWebPage({ searchParams }: { searchParams: Promise<{ pedido?: string; pestana?: string }> }) {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("pedidos_web");
  const { pedido, pestana } = await searchParams;

  if (persona.ubicacionTipo !== "tienda") {
    return (
      <div className="space-y-6">
        <EncabezadoPagina sede={persona.ubicacionEtiqueta} detalle="Tienda web" titulo="Pedidos" subtitulo="Lo que los clientes separan en la tienda online." />
        <Aviso tono="info" titulo="Los pedidos web se atienden en una tienda">
          Cambia a una tienda desde el selector de arriba para ver sus pedidos.
        </Aviso>
      </div>
    );
  }

  const supabase = await createClient();
  const idPedido = pedido && /^[0-9a-f-]{36}$/i.test(pedido) ? pedido : null;
  const [tablero, detalle] = await Promise.all([
    supabase.rpc("fn_pedidos_web_tablero", { p_ubicacion_id: persona.ubicacionId }),
    idPedido ? supabase.rpc("fn_pedido_web_detalle", { p_pedido_id: idPedido }) : Promise.resolve(null),
  ]);

  if (tablero.error) {
    return (
      <div className="space-y-6">
        <EncabezadoPagina sede={persona.ubicacionEtiqueta} detalle="Tienda web" titulo="Pedidos" subtitulo={`Lo que separaron en la web para ${persona.ubicacionEtiqueta}.`} />
        <Aviso tono="error" titulo="No se pudieron leer los pedidos web">
          Recarga la página; si sigue, avísale al líder.
        </Aviso>
      </div>
    );
  }

  // La cabecera la dibuja la pantalla: su «¿Cómo funciona?» abre las reglas bajo el camino (ADR-0430, act. 2026-10-17).
  return (
    <PedidosWebPantalla
      tablero={leerTablero(tablero.data)}
      tiendaId={persona.ubicacionId}
      tienda={persona.ubicacionEtiqueta}
      ahoraIso={new Date().toISOString()}
      // `?pestana=` es el filtro del camino (el nombre viene de cuando eran pestañas: un enlace guardado o del Resumen sigue sirviendo).
      filtroInicial={PESTANAS.find((p) => p === pestana) ?? null}
      // Un pedido de otra tienda, o que ya no existe, no abre nada: la base lo rechaza y la lista queda como estaba.
      detalle={detalle && !detalle.error ? leerDetalle(detalle.data) : null}
      detalleFallo={Boolean(idPedido && (!detalle || detalle.error))}
    />
  );
}
