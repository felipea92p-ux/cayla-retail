import Link from "next/link";
import { Aviso } from "@/components/ui/Aviso";
import { diaMes } from "@/lib/fechas-lima";
import { diasDesde, textoAvisoPendientes, textoPrendas, type PendientesDeLaSede } from "@/lib/recepcion-conteo-reglas";

// Lo recibido que todavía no está en el stock (ADR-0393, decisión 4): el mismo número en la puerta de Recibir y en el Inicio. Siempre
// calculado (`fn_recepcion_pendientes`), nunca guardado. Si lo más antiguo pasa de 7 días, el aviso cambia de tono: es lo que el ADR vigila
// («los pendientes se vuelven el cajón donde se olvida la mercadería»). Sin estado: sirve en Server Components.

export function PendientesDeRecibir({ pendientes, conLista = true, guia }: { pendientes: PendientesDeLaSede; conLista?: boolean; guia?: string }) {
  const titulo = textoAvisoPendientes(pendientes);
  if (!titulo) return null;
  const dias = diasDesde(pendientes.desde);
  const viejo = dias != null && dias > 7;
  const partes = [
    pendientes.porSeparar ? `${pendientes.porSeparar} por separar` : null,
    pendientes.porDetallar ? `${pendientes.porDetallar} por poner tallas` : null,
    pendientes.porCrear ? `${pendientes.porCrear} por crear` : null,
  ].filter(Boolean);
  return (
    <Aviso tono={viejo ? "atencion" : "info"} titulo={titulo} guia={guia}>
      <p>
        Ya están contadas y en el almacén, pero no en el sistema: hasta terminarlas no se pueden vender ni colgar ({partes.join(", ")}).
        {dias != null && dias > 0 ? ` Lo más antiguo es de hace ${dias === 1 ? "1 día" : `${dias} días`}.` : ""}
      </p>
      {conLista && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {pendientes.envios.slice(0, 6).map((e) => (
            <li key={e.despachoId}>
              <Link href={`/recibir/envio/${e.despachoId}`} className="btn-cayla btn-secundario btn-chico h-auto whitespace-normal text-left">
                {e.numero ?? "Envío"} · {textoPrendas(e.porSeparar + e.porDetallar + e.porCrear)}
                {e.cerradoEn ? <span className="font-normal text-taupe"> · {diaMes(e.cerradoEn)}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Aviso>
  );
}
