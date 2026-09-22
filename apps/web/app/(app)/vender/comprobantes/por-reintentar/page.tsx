import { exigirPermiso } from "@/lib/persona-actual";
import { getColaReintento } from "@/lib/comprobantes";
import { getUbicaciones } from "@/lib/ubicaciones";
import { tiendasOperativas } from "@/lib/facturacion-reglas";
import { ColaSunatPanel } from "@/components/ColaSunatPanel";
import { MarcaDeCarga } from "@/components/MarcaDeCarga";

// «Por reintentar» (D-60 paso 3): la cola de SUNAT. El líder ve todas las sedes; la terminal de ventas,
// la suya (la RPC lo exige igual). Es la lista de verdad, así que si no se puede leer la vista se cae a
// `error.tsx` en vez de decir «nada en espera» sin saberlo.
export default async function PorReintentarPage() {
  const persona = await exigirPermiso("facturar");
  const ahora = new Date();
  const [cola, ubicaciones] = await Promise.all([getColaReintento(persona.rol === "lider" ? null : persona.ubicacionId), getUbicaciones()]);
  if (!cola) throw new Error("No se pudo leer la cola de reintento");

  return (
    <div className="space-y-6">
      <MarcaDeCarga en={ahora.getTime()} />
      <ColaSunatPanel filas={cola} tiendas={tiendasOperativas(ubicaciones).map(({ id, nombre }) => ({ id, nombre }))} />
    </div>
  );
}
