import { redirect } from "next/navigation";

// Finanzas ▸ Cuentas y dinero ▸ Efectivo por tienda se retiró (El telar, actividad 2, Felipe 2026-10-23): el efectivo de hoy lo
// dicen las filas del cajón y de la caja fuerte en «Dónde está», con los cierres con diferencia debajo. La dirección vieja lleva
// ahí, con la sede que traía.
export default async function EfectivoPorTiendaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const k of ["sede", "ver"]) {
    const v = sp[k];
    if (typeof v === "string") q.set(k, v);
  }
  redirect(`/finanzas/dinero${q.size ? `?${q}` : ""}`);
}
