import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getCifrasClientas, getListaClientas } from "@/lib/clientas";
import { leerParamsLista } from "@/lib/clientas-lista-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { ClientasPanel } from "@/components/ClientasPanel";

// Clientas ▸ Fichas (paso 2 del acta, D-92 a D-111, y el club: ADR-0288, «Actualización 2026-09-30 (f)»): la lista, como el
// spike del club. La base la arma sobre TODAS las fichas (`fn_clientas_lista`, `fn_cifras_clientas`): su sede, su última
// compra y si es frecuente con compra neta. Búsqueda, filtro y página vienen en la URL (`?q=&filtro=&pagina=`); «Ficha de la
// clienta» desde Ventas ▸ Historial (ADR-0230) llega con `?q=<nombre>`.
//
// Toda cuenta con el módulo «Clientas», sin gate de líder: retail no tiene noción de "mi clienta"
// (es de la marca, D-109 — cualquier cuenta con el módulo ve a todas). La puerta es `layout.tsx`
// (`exigirModulo`), y la base lo vuelve a exigir: la política de `clientas` y sus funciones
// preguntan por el módulo (ADR-0249, actualización 2026-09-28).
export default async function ClientasPage({ searchParams }: { searchParams: Promise<{ q?: string; filtro?: string; pagina?: string }> }) {
  await requirePersonaActualV2();
  const params = leerParamsLista(await searchParams);
  // Desde la tanda 1g (ADR-0288, G-1) la ficha ya no muestra un QR personal: no necesita el WhatsApp de cada tienda.
  const [lista, cifras] = await Promise.all([getListaClientas(params), getCifrasClientas()]);
  return (
    <ClientasPanel
      filas={lista.filas}
      total={lista.total}
      falla={lista.falla}
      params={params}
      cifras={cifras}
      hoy={hoyLima()}
    />
  );
}
