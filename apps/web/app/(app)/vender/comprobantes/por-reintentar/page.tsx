import { exigirPermiso } from "@/lib/persona-actual";
import { getPorEnviar, getFechasDeEmision } from "@/lib/comprobantes";
import { getUbicaciones } from "@/lib/ubicaciones";
import { tiendasOperativas } from "@/lib/facturacion-reglas";
import { ColaSunatPanel } from "@/components/ColaSunatPanel";
import { MarcaDeCarga } from "@/components/MarcaDeCarga";

// «Por enviar» (antes «Por reintentar», D-60 paso 3; renombrada el 2026-09-26): TODO lo que no llegó a SUNAT —la
// cola de reintento, lo que nunca se intentó y lo rechazado—, no solo la cola. El líder ve todas las sedes; la terminal de ventas,
// la suya (la RPC lo exige igual). Es la lista de verdad, así que si no se puede leer la vista se cae a
// `error.tsx` en vez de decir «nada en espera» sin saberlo.
export default async function PorReintentarPage() {
  const persona = await exigirPermiso("facturar");
  const ahora = new Date();
  const [cola, ubicaciones] = await Promise.all([getPorEnviar(persona.rol === "lider" ? null : persona.ubicacionId), getUbicaciones()]);
  if (!cola) throw new Error("No se pudo leer la cola de reintento");
  const emitidos = await getFechasDeEmision(cola.map((f) => f.comprobante_id));

  return (
    <div className="space-y-6">
      <MarcaDeCarga en={ahora.getTime()} />
      <ColaSunatPanel filas={cola} emitidos={emitidos ?? {}} ahora={ahora} tiendas={tiendasOperativas(ubicaciones).map(({ id, nombre }) => ({ id, nombre }))} />
    </div>
  );
}
