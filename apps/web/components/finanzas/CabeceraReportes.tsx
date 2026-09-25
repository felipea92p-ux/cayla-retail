import type { ReactNode } from "react";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { PestanasFin } from "@/components/finanzas/kit";

// Finanzas ▸ Reportes (ADR-0195 F5–F7; spike `vista-reportes.js`): la cabecera y las pestañas que comparten sus páginas.
// Cada pestaña es una ruta propia bajo /finanzas/reportes, así cada fase agrega su página sin tocar las demás. `lista` = la
// pestaña ya tiene página; las que no, no se muestran (sin pestañas vacías).

export type PestanaReportes = "resultados" | "presupuesto" | "campanas" | "escenarios" | "flujo" | "balance";

const PESTANAS: { clave: PestanaReportes; etiqueta: string; href: string; lista: boolean }[] = [
  { clave: "resultados", etiqueta: "Estado de resultados", href: "/finanzas/reportes", lista: true },
  { clave: "presupuesto", etiqueta: "Presupuesto", href: "/finanzas/reportes/presupuesto", lista: false },
  { clave: "campanas", etiqueta: "Campañas", href: "/finanzas/reportes/campanas", lista: true },
  { clave: "escenarios", etiqueta: "Escenarios", href: "/finanzas/reportes/escenarios", lista: false },
  { clave: "flujo", etiqueta: "Flujo de caja", href: "/finanzas/reportes/flujo", lista: false },
  { clave: "balance", etiqueta: "Balance", href: "/finanzas/reportes/balance", lista: false },
];

export function CabeceraReportes({
  pestana,
  titulo,
  bajada,
  acciones,
  children,
}: {
  pestana: PestanaReportes;
  /** Cada reporte dice su título («Resultados de agosto», «¿Alcanza para pagar?»). */
  titulo: ReactNode;
  bajada?: ReactNode;
  acciones?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <CabeceraPantalla sobretitulo="Finanzas · Reportes" titulo={titulo} bajada={bajada} accionesAbajo acciones={acciones}>
        {children}
      </CabeceraPantalla>
      <PestanasFin
        etiqueta="Reportes"
        valor={pestana}
        items={PESTANAS.filter((p) => p.lista || p.clave === pestana).map((p) => ({ clave: p.clave, etiqueta: p.etiqueta, href: p.href }))}
      />
    </>
  );
}
