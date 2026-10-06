"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { ResumenActualizado } from "@/components/ResumenActualizado";
import { Pestanas } from "@/components/ui/Pestanas";
import type { CambiosUrl } from "@/components/useResumenUrl";
import type { ModoResumen } from "@/lib/resumen-comparacion";
import { periodosParaSembrar } from "@/lib/resumen-periodos-guardados";

// La fila de arriba del Análisis de inventario: los dos modos —Desempeño y Comparar períodos— a la
// izquierda, y la marca discreta «Actualizado» a la derecha.
// El modo vive en la URL (`?modo=comparar`) como todo lo demás: se comparte, se recarga y
// «atrás» funciona.

const MODOS: readonly { valor: ModoResumen; texto: string }[] = [
  { valor: "desempeno", texto: "Desempeño" },
  { valor: "comparar", texto: "Comparar períodos" },
];

export function ResumenCabecera({
  modo,
  ahoraIso,
  actualizar,
  claveGuardado,
  children,
}: {
  modo: ModoResumen;
  ahoraIso: string;
  actualizar: (cambios: CambiosUrl) => void;
  /** Dónde se recuerdan A y B (`clavePeriodosElegidos`): por sede y por persona. */
  claveGuardado: string;
  /** Lo que dice el popover de «Actualizado». */
  children: ReactNode;
}) {
  const params = useSearchParams();
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      {/* Los dos modos cambian la pantalla entera: la pestaña de vista del sistema (ADR-0357), con el subrayado en tinta que
          viaja. Hasta el 2026-10-06 era una pestaña a mano con el hilo rojo de la guía. */}
      <Pestanas
        etiquetaAccesible="Modo del análisis"
        idIndicador="analisis-modo"
        activa={modo}
        items={MODOS.map((m) => ({ clave: m.valor, etiqueta: m.texto }))}
        // Cada modo tiene sus propios órdenes y filtros de tabla: al cambiar se parte de los iniciales. Al ENTRAR a
        // Comparar se le suman los períodos que la persona dejó elegidos (2026-09-29), en este mismo clic: una sola
        // navegación, sin un primer pintado con los de por defecto. Si la URL ya trae fechas de Comparar, no se toca.
        // Tocar el modo que ya está no hace nada (como antes).
        onCambio={(m) =>
          m !== modo &&
          actualizar(
            m === "comparar"
              ? { modo: "comparar", orden: null, st: null, ...periodosParaSembrar(claveGuardado, (k) => params.has(k)) }
              : { modo: null, vista: null, senal: null, orden: null, cambio: null },
          )
        }
      />
      <ResumenActualizado ahoraIso={ahoraIso}>{children}</ResumenActualizado>
    </div>
  );
}
