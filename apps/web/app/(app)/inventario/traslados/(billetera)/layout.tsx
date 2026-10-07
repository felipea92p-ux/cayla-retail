import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getBilleteraDeLaSede } from "@/lib/traslados-billetera";
import { RUTA_NUEVO_TRASLADO } from "@/lib/traslados-reglas";
import { sedesParaPedir } from "@/lib/pedidos-entre-sedes-reglas";
import { getUbicaciones } from "@/lib/ubicaciones";
import { BotonPedirAOtraSede } from "@/components/BotonPedirAOtraSede";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Billetera } from "@/components/traslados-pases/Billetera";
import { BotonEnlace } from "@/components/ui/campos";

// Traslados como billetera de pases (ADR-0355, la opción D que eligió Felipe el 2026-10-06). La billetera vive en el layout:
// elegir un pase navega a `/inventario/traslados/<id>` (la página) y la billetera se queda. Esta capa solo TRAE datos con un
// solo «ahora»; qué le toca a quién, el orden, las pestañas y el anillo viven en `lib/traslados-pases-reglas.ts` y, para los
// pedidos entre sedes y «Para enviar» (que también son pases desde la actividad 4), en `lib/traslados-pedidos-pases-reglas.ts`.
// Ninguna regla de stock, recepción ni cierre cambia: eso sigue en las RPC.
export default async function TrasladosBilleteraLayout({ children }: { children: React.ReactNode }) {
  const persona = await requirePersonaActualV2();
  const puedeAjustar = puede(persona, "ajustarInventario");
  const [billetera, ubicaciones] = await Promise.all([getBilleteraDeLaSede(persona.ubicacionId, puedeAjustar), getUbicaciones()]);
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
            {/* Secundario: en esta pantalla el botón negro es el del pase, lo que te toca (Formidable, 2026-10-06). */}
            <BotonEnlace href={RUTA_NUEVO_TRASLADO}>+ Nuevo traslado</BotonEnlace>
          </div>
        }
      />
      {/* `key` por sede: al cambiar de sede, la pestaña y la búsqueda de la sede anterior no se arrastran. */}
      <Billetera key={persona.ubicacionId} billetera={billetera} puedeVerVacios={puedeAjustar}>
        {children}
      </Billetera>
    </div>
  );
}
