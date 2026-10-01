import { exigirModulo } from "@/lib/persona-actual";
import { getCifrasClientas, getListaClientas, getTiendasConWhatsapp } from "@/lib/clientas";
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
  await exigirModulo("clientas"); // el layout es la puerta del grupo (Clientas o Avisos): las fichas piden «clientas»
  const params = leerParamsLista(await searchParams);
  // El WhatsApp de cada tienda (ADR-0288 tanda 1b): el QR de una socia abre el chat de la tienda activa. Si la base todavía
  // no tiene la columna, llega vacío y la ficha dice que no hay QR (principio 9).
  const [lista, { tiendas }, cifras] = await Promise.all([getListaClientas(params), getTiendasConWhatsapp(), getCifrasClientas()]);
  const whatsappPorTienda = Object.fromEntries(tiendas.map((t) => [t.id, t.whatsappNumero]));
  return (
    <ClientasPanel
      filas={lista.filas}
      total={lista.total}
      falla={lista.falla}
      params={params}
      cifras={cifras}
      hoy={hoyLima()}
      whatsappPorTienda={whatsappPorTienda}
    />
  );
}
