import type { CSSProperties } from "react";
import type { MedioCobro, TipoCuenta } from "@/lib/cuentas-dinero-reglas";

// Configuración ▸ Dinero: los dibujos de cobros y cuentas, dentro de la gota de vidrio de Las vitrinas (`.vs-gota`). Se dibujan una vez al llegar (ADR-0136) y son `aria-hidden`: lo que se lee está en el texto de al lado.

const TRAZOS = {
  celular: ["M22 14h14a2.5 2.5 0 0 1 2.5 2.5v25a2.5 2.5 0 0 1-2.5 2.5H22a2.5 2.5 0 0 1-2.5-2.5v-25A2.5 2.5 0 0 1 22 14z", "M27 39.5h4"],
  plin: ["M22 14h14a2.5 2.5 0 0 1 2.5 2.5v25a2.5 2.5 0 0 1-2.5 2.5H22a2.5 2.5 0 0 1-2.5-2.5v-25A2.5 2.5 0 0 1 22 14z", "M27 39.5h4", "M25 24a6 6 0 0 1 8 0M27 27.500a3 3 0 0 1 4 0"],
  tarjeta: ["M13 19h32a3 3 0 0 1 3 3v15a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V22a3 3 0 0 1 3-3z", "M10 26h38", "M16 34h7"],
  qr: ["M15 21v-6h6M37 15h6v6M43 37v6h-6M21 43h-6v-6", "M22 22h5v5h-5zM31 22h5v5h-5zM22 31h5v5h-5zM31 31h5v5h-5z"],
  transferencia: ["M14 23h28l-7-7", "M44 35H16l7 7"],
  banco: ["M12 24 29 13l17 11z", "M16 28v11M25 28v11M33 28v11M42 28v11", "M12 44h34"],
  maquina: ["M19 12h20a2 2 0 0 1 2 2v30a2 2 0 0 1-2 2H19a2 2 0 0 1-2-2V14a2 2 0 0 1 2-2z", "M22 17h14v8H22z", "M23 31h2M28 31h2M33 31h2M23 37h2M28 37h2M33 37h2"],
  cajon: ["M11 22h36v20H11z", "M11 22l5-8h26l5 8", "M25 31h8"],
  fuerte: ["M13 13h32v32H13z", "M29 22a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M29 26v10M24 31h10"],
  rendir: ["M18 12h22v34l-5-3-6 3-6-3-5 3z", "M24 21h10M24 28h10"],
  caja: ["M12 42h34", "M16 36l8-9 7 5 10-14"],
  gasto: ["M15 42V30M24 42V24M33 42V34M42 42V14"],
  calendario: ["M14 18h30v26H14z", "M14 25h30M22 13v8M36 13v8"],
  reloj: ["M29 13a16 16 0 1 0 16 16", "M29 20v9h8"],
  porcentaje: ["M16 43 42 15", "M20 14a5.500 5.500 0 1 0 0 11 5.500 5.500 0 0 0 0-11z", "M38 33a5.500 5.500 0 1 0 0 11 5.500 5.500 0 0 0 0-11z"],
  regla: ["M9 22h40v14H9z", "M16 22v6M23 22v4M30 22v6M37 22v4M44 22v6"],
  movilidad: ["M12 36l4-11h26l4 11v7H12z", "M12 36h34", "M19 43v3M39 43v3"],
} as const;

export type TrazoDinero = keyof typeof TRAZOS;

export const TRAZO_DE_MEDIO: Record<MedioCobro, TrazoDinero> = { yape: "celular", plin: "plin", tarjeta: "tarjeta", qr: "qr", transferencia: "transferencia" };
export const TRAZO_DE_CUENTA: Record<TipoCuenta, TrazoDinero> = { banco: "banco", por_abonar: "maquina", tarjeta_credito: "tarjeta", cajon: "cajon", caja_fuerte: "fuerte", por_rendir: "rendir", fondo: "rendir" };

/** La gota con su dibujo. `i`: su lugar en la cascada de la entrada. */
export function GotaDinero({ trazo, i = 0, conColor = false }: { trazo: TrazoDinero; i?: number; conColor?: boolean }) {
  return (
    <span className="vs-gota cv-gota" aria-hidden>
      <i className="vs-brillo" />
      <svg className={`cv-ic ${conColor ? "con-color" : ""}`} style={{ "--i": i } as CSSProperties} viewBox="0 0 58 58">
        {TRAZOS[trazo].map((d) => (
          <path key={d} pathLength={1} d={d} />
        ))}
      </svg>
    </span>
  );
}
