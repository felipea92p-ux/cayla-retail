import type { ReactNode } from "react";
import { exigirLider } from "@/lib/persona-actual";
import { getResumenPorEnviar, getSeriesComprobantes } from "@/lib/comprobantes";
import { getResumenProformas } from "@/lib/proformas";
import { getUbicaciones } from "@/lib/ubicaciones";
import { conteosDePestanas, tiendasOperativas, ubicacionActualDe } from "@/lib/facturacion-reglas";
import { FacturacionShell } from "@/components/FacturacionShell";

// Facturación electrónica — rescatada de producción (2026-09-12, ver
// supabase/migrations/0010_facturacion.sql). Reserva comprobantes con correlativo oficial y
// los transmite a SUNAT por Lucode (PSE) desde la misma pantalla; anular es un tercer paso
// aparte. Toda la pantalla es de líder: emitir, transmitir y anular mueven documentos
// legales. `exigirLider` es la primera de las tres capas (pantalla, RPC, RLS) y CADA
// `page.tsx` la repite: este layout no vuelve a ejecutarse al navegar entre las vistas.
//
// EL MARCO NO PUEDE CAERSE. Si este layout revienta, el error sube al layout de arriba y se
// lleva la cabecera y las pestañas con él — justo lo que `error.tsx` promete que NO pasa
// cuando falla una vista. Por eso lo que lee acá (series, tiendas, contadores) es del marco:
// si falla, se oculta (`null`) y se registra en el log, no se propaga. Las vistas, que sí
// muestran plata, leen con `exigir` y sí revientan hacia `error.tsx`.
const opcional = <T,>(lectura: Promise<T>): Promise<T | null> =>
  lectura.catch((error) => {
    console.error("Facturación: no se pudo leer un dato del marco:", error);
    return null;
  });

export default async function FacturacionLayout({ children }: { children: ReactNode }) {
  const persona = await exigirLider();

  const [ubicaciones, series, porEnviar, proformas] = await Promise.all([
    opcional(getUbicaciones()),
    opcional(getSeriesComprobantes()),
    opcional(getResumenPorEnviar()), // ya devuelven `null` si la consulta falla (`tolerar`);
    opcional(getResumenProformas()), // `opcional` cubre además lo que `tolerar` no ve (`createClient()`)
  ]);

  const tiendas = ubicaciones ? tiendasOperativas(ubicaciones) : null;

  return (
    <FacturacionShell
      conteos={conteosDePestanas(porEnviar, proformas)}
      series={series}
      tiendas={tiendas ? tiendas.map(({ id, nombre }) => ({ id, nombre })) : null}
      ubicacionActualId={tiendas ? ubicacionActualDe(tiendas, persona.ubicacionId) : ""}
    >
      {children}
    </FacturacionShell>
  );
}
