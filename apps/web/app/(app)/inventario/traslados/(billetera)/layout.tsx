import Link from "next/link";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getBilleteraDeLaSede } from "@/lib/traslados-billetera";
import { RUTA_NUEVO_TRASLADO } from "@/lib/traslados-reglas";
import { sedesParaPedir } from "@/lib/pedidos-entre-sedes-reglas";
import { getUbicaciones } from "@/lib/ubicaciones";
import { BotonPedirAOtraSede } from "@/components/BotonPedirAOtraSede";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Billetera } from "@/components/traslados-pases/Billetera";
import { PedidosEntreSedes } from "@/components/PedidosEntreSedes";
import { getParaEnviar, getPedidosConCliente, getPedidosEntreSedes } from "@/lib/pedidos-entre-sedes";
import { hayAlgoEnLaLista, juntarPedidos } from "@/lib/pedidos-con-cliente-reglas";
import { agruparPorDestino } from "@/lib/para-enviar-reglas";

// Traslados como billetera de pases (ADR-0354, la opción D que eligió Felipe el 2026-10-06). La billetera vive en el layout:
// elegir un pase navega a `/inventario/traslados/<id>` (la página) y la billetera se queda. Esta capa solo TRAE datos con un
// solo «ahora»; qué le toca a quién, el orden, las pestañas y el anillo viven en `lib/traslados-pases-reglas.ts`, con pruebas.
// Ninguna regla de stock, recepción ni cierre cambia: eso sigue en las RPC.
export default async function TrasladosBilleteraLayout({ children }: { children: React.ReactNode }) {
  const persona = await requirePersonaActualV2();
  const puedeAjustar = puede(persona, "ajustarInventario");
  const [billetera, ubicaciones, reposicion, conCliente, paraEnviar] = await Promise.all([
    getBilleteraDeLaSede(persona.ubicacionId, puedeAjustar),
    getUbicaciones(),
    getPedidosEntreSedes(persona.ubicacionId),
    getPedidosConCliente(persona.ubicacionId),
    getParaEnviar(persona.ubicacionId),
  ]);
  const pedidos = juntarPedidos(reposicion, conCliente);
  const gruposParaEnviar = agruparPorDestino(paraEnviar);
  // A quién se le puede pedir desde aquí (otras tiendas; si quien mira es el Taller, a nadie y el botón no se dibuja).
  const pedir = { ubicacionId: persona.ubicacionId, sedes: sedesParaPedir(ubicaciones, persona.ubicacionId) };
  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Traslados"
        subtitulo="Cada caja: de dónde viene, cuándo llega y qué te toca."
        acciones={
          <div className="flex flex-wrap items-center gap-3">
            <BotonPedirAOtraSede {...pedir} />
            <Link href={RUTA_NUEVO_TRASLADO} className="btn-cayla btn-primario">
              + Nuevo traslado
            </Link>
          </div>
        }
      />
      {hayAlgoEnLaLista(pedidos, gruposParaEnviar) && (
        <PedidosEntreSedes
          key={`pedidos-${persona.ubicacionId}`}
          pedidos={pedidos}
          paraEnviar={gruposParaEnviar}
          ubicacion={{ ubicacionId: persona.ubicacionId, etiqueta: persona.ubicacionEtiqueta }}
          ahoraIso={billetera.ahoraIso}
        />
      )}
      {/* `key` por sede: al cambiar de sede, la pestaña y la búsqueda de la sede anterior no se arrastran. */}
      <Billetera key={persona.ubicacionId} billetera={billetera} puedeVerVacios={puedeAjustar}>
        {children}
      </Billetera>
    </div>
  );
}
