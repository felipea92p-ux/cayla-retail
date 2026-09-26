import type { ReactNode } from "react";
import { exigirPermiso } from "@/lib/persona-actual";
import { getPorEnviar, getResumenPorEnviar } from "@/lib/comprobantes";
import { getResumenProformas } from "@/lib/proformas";
import { opcional } from "@/lib/resultado";
import { conteosDePestanas, resumenCola } from "@/lib/facturacion-reglas";
import { FacturacionShell } from "@/components/FacturacionShell";
import { BarridoColaSunat } from "@/components/BarridoColaSunat";
import { entornoLucode } from "@/lib/lucode";

// Comprobantes (se llamó «Facturación» hasta 2026-09-22: el envío a SUNAT pasó a ser automático al
// cobrar, D-60, y la pantalla es de series). Facturación electrónica — rescatada de producción (2026-09-12, ver
// supabase/migrations/0010_facturacion.sql). Reserva comprobantes con correlativo oficial y
// los transmite a SUNAT por Lucode (PSE) desde la misma pantalla; anular es un tercer paso
// aparte. La pantalla es del líder y de la terminal de ventas (ADR-0160, permiso `facturar`): emitir, transmitir y anular mueven documentos
// legales, y anular, las series y los descuentos siguen siendo solo del líder. `exigirPermiso` es la primera de las tres capas (pantalla, RPC, RLS) y CADA
// `page.tsx` la repite: este layout no vuelve a ejecutarse al navegar entre las vistas.
//
// EL MARCO NO PUEDE CAERSE. Si este layout revienta, el error sube al layout de arriba y se
// lleva la cabecera y las pestañas con él — justo lo que `error.tsx` promete que NO pasa
// cuando falla una vista. Por eso lo que lee acá (contadores) es del marco:
// si falla, se oculta (`null`) y se registra en el log, no se propaga. Las vistas, que sí
// muestran plata, leen con `exigir` y sí revientan hacia `error.tsx`.
export default async function FacturacionLayout({ children }: { children: ReactNode }) {
  const persona = await exigirPermiso("facturar");

  const [porEnviar, proformas, cola] = await Promise.all([
    opcional(getResumenPorEnviar(), "la cola de SUNAT (marco de Facturación)"), // ya devuelven `null` si la consulta falla (`tolerar`);
    opcional(getResumenProformas(), "las proformas vigentes (marco de Facturación)"), // `opcional` cubre además lo que `tolerar` no ve (`createClient()`)
    // Todo lo que no llegó a SUNAT (cola + nunca intentados + rechazados, 2026-09-26), para el aviso de más de 1 hora.
    opcional(getPorEnviar(persona.rol === "lider" ? null : persona.ubicacionId), "lo que falta enviar (marco de Comprobantes)"),
  ]);
  const enCola = cola ? resumenCola(cola) : null;

  return (
    <FacturacionShell
      conteos={conteosDePestanas(porEnviar, proformas, enCola)}
      atrasadosEnCola={enCola?.masDeUnaHora ?? 0}
      entorno={entornoLucode()}
      sede={persona.ubicacionEtiqueta}
      // Sin cifras en la cabecera (2026-09-26): repetían las tarjetas de cada pestaña y cambiaban de lugar.
      // «Por enviar» sigue siempre a la vista: es el contador de su pestaña.
      cifras={{ porEnviar: null, proformasVigentes: null }}
    >
      {/* D-60: al abrir, reintenta la cola de SUNAT — todas las sedes si es líder, la suya si es la terminal. */}
      <BarridoColaSunat ubicacionId={persona.rol === "lider" ? null : persona.ubicacionId} />
      {children}
    </FacturacionShell>
  );
}
