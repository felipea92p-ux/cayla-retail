import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getCifrasClientas, getClientas, getTiendasConWhatsapp } from "@/lib/clientas";
import { hoyLima } from "@/lib/fechas-lima";
import { ClientasPanel } from "@/components/ClientasPanel";

// Clientas, paso 2 del acta (D-92 a D-111, docs/datos/DECISIONES-2026-09-26-clientas.md sección
// H): la ficha de verdad — buscar, ver su actividad, editar, archivar/anonimizar y unir fichas.
// Reemplaza la pantalla mínima de verificación de D-76/D-77.
//
// Toda cuenta con el módulo «Clientas», sin gate de líder: retail no tiene noción de "mi clienta"
// (es de la marca, D-109 — cualquier cuenta con el módulo ve a todas). La puerta es `layout.tsx`
// (`exigirModulo`), y la base lo vuelve a exigir: la política de `clientas` y sus 11 funciones
// preguntan por el módulo (ADR-0249, actualización 2026-09-28).
export default async function ClientasPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePersonaActualV2();
  // `?q=`: «Ficha de la clienta» desde Ventas ▸ Historial (ADR-0230) llega con su nombre ya buscado.
  // El WhatsApp de cada tienda (ADR-0288 tanda 1b): el QR de una socia abre el chat de la tienda activa. Si la base todavía
  // no tiene la columna, llega vacío y la ficha dice que no hay QR (principio 9).
  const [clientas, { q }, { tiendas }, cifras] = await Promise.all([getClientas(), searchParams, getTiendasConWhatsapp(), getCifrasClientas()]);
  const whatsappPorTienda = Object.fromEntries(tiendas.map((t) => [t.id, t.whatsappNumero]));
  return (
    <ClientasPanel
      clientasIniciales={clientas}
      busquedaInicial={q?.trim().slice(0, 80) ?? ""}
      whatsappPorTienda={whatsappPorTienda}
      cifras={cifras}
      // El mes de hoy en Lima (1–12), para el filtro «Cumplen este mes»: lo decide el servidor, no el reloj del navegador.
      mesActual={Number(hoyLima().slice(5, 7))}
    />
  );
}
