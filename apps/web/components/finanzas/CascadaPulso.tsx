import type { CSSProperties } from "react";
import { soles } from "@/lib/flujo-caja-reglas";
import type { TramoCascada } from "@/lib/pulso-reglas";

// La cascada del camino A: vendiste → costó → sueldos → gastos → queda, cada tramo con su barra proporcional al mayor.
// Una sola pieza para Resumen y Reportes (ADR-0358). Sin estado: quien la abre decide cuándo mostrarla.

export function CascadaPulso({ id, tramos, etiqueta }: { id: string; tramos: TramoCascada[]; etiqueta: string }) {
  const mayor = Math.max(1, ...tramos.map((t) => t.monto));
  return (
    <ol id={id} className="fin-pulso-cascada" aria-label={etiqueta}>
      {tramos.map((t, i) => (
        <li key={t.clave} className="fin-pulso-tramo anim-entra" data-tipo={t.tipo} style={{ ["--i" as string]: i } as CSSProperties}>
          <span className="fin-pulso-tramo-nombre">
            {t.nombre}
            {t.detalle && <small>{t.detalle}</small>}
          </span>
          <span className="fin-pulso-tramo-monto num">
            {t.tipo === "sale" ? "−" : ""}
            {soles(t.monto)}
          </span>
          <span className="fin-pulso-tramo-barra" aria-hidden="true">
            <i style={{ ["--w" as string]: `${Math.round((t.monto / mayor) * 100)}%` } as CSSProperties} />
          </span>
        </li>
      ))}
    </ol>
  );
}
