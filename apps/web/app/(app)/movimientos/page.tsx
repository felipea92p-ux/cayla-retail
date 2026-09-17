import { permanentRedirect } from "next/navigation";

// Movimientos se mudó a `/inventario/movimientos` el 2026-09-16 (Felipe,
// integrando sus diseños: Movimientos es una de las cuatro pestañas del
// módulo, no una pantalla suelta). Esta ruta queda solo para que ningún
// enlace ya compartido se rompa — un `?mov=<id>` mandado por WhatsApp ayer
// tiene que seguir abriendo ese movimiento — y reenvía con todos sus
// filtros intactos.
export default async function MovimientosRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v)) for (const x of v) qs.append(k, x);
  }
  const texto = qs.toString();
  permanentRedirect(texto ? `/inventario/movimientos?${texto}` : "/inventario/movimientos");
}
