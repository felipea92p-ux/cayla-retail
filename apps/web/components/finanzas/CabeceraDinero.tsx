import type { ReactNode } from "react";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { PestanasFin } from "@/components/finanzas/kit";

// Finanzas ▸ Cuentas y dinero (ADR-0195 F3/F4; spike `vista-dinero.js`): la cabecera y las pestañas que comparten sus
// páginas. Cada pestaña es una ruta propia bajo /finanzas/dinero, así cada fase agrega su página sin tocar las demás.
// `lista` = la pestaña ya tiene página; las que no, no se muestran (sin pestañas vacías).

export type PestanaDinero = "cuentas" | "efectivo" | "porpagar" | "conciliacion";

const PESTANAS: { clave: PestanaDinero; etiqueta: string; href: string; soloLider?: boolean; lista: boolean }[] = [
  { clave: "cuentas", etiqueta: "Cuentas", href: "/finanzas/dinero", lista: false },
  { clave: "efectivo", etiqueta: "Efectivo por tienda", href: "/finanzas/dinero/efectivo", lista: false },
  { clave: "porpagar", etiqueta: "Por pagar", href: "/finanzas/dinero/por-pagar", lista: true },
  { clave: "conciliacion", etiqueta: "Conciliación", href: "/finanzas/dinero/conciliacion", soloLider: true, lista: false },
];

export function CabeceraDinero({
  pestana,
  esLider,
  conteos = {},
  acciones,
  children,
}: {
  pestana: PestanaDinero;
  esLider: boolean;
  /** El número en la píldora de cada pestaña (lo que pide atención), si hay. */
  conteos?: Partial<Record<PestanaDinero, number>>;
  /** «Ver» y la acción principal de la pestaña (a la derecha, al pie de la cabecera). */
  acciones?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <CabeceraPantalla
        sobretitulo="Finanzas · Cuentas y dinero"
        titulo="¿Dónde está la plata?"
        bajada="Cada lugar donde CAYLA tiene dinero: bancos, tarjeta por abonar y cajones. Un saldo nunca se escribe a mano: se suma de los movimientos."
        accionesAbajo
        acciones={acciones}
      >
        {children}
      </CabeceraPantalla>
      <PestanasFin
        etiqueta="Secciones de Cuentas y dinero"
        valor={pestana}
        items={PESTANAS.filter((p) => (p.lista || p.clave === pestana) && (!p.soloLider || esLider)).map((p) => ({ clave: p.clave, etiqueta: p.etiqueta, href: p.href, conteo: conteos[p.clave] }))}
      />
    </>
  );
}
