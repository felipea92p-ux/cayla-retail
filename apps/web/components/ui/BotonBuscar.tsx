import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { Boton } from "@/components/ui/campos";
import { TAMANOS_ICONO } from "@/lib/iconos";

/* ====================================================================
   «Buscar» al apretar — una sola pieza (ADR-0358, ronda 15, Felipe eligió P1 el 2026-10-15)

   Para lo que busca recién al apretar (el padrón de SUNAT con un DNI o un RUC, unir dos clientes): el secundario con la lupa delante,
   la misma del buscador. Un buscador que busca MIENTRAS se escribe es <Buscador> (ronda 5), no esto. `peso="primario"` solo si buscar
   ES el paso de esa hoja. Registro: docs/unificar/accion.buscar.md. Nunca un «Buscar» a mano.
   ==================================================================== */

export function BotonBuscar({
  type = "button",
  onClick,
  disabled,
  cargando,
  peso = "fantasma",
  children = "Buscar",
  className = "",
  "data-guia": guia,
}: {
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  /** Mientras consulta: «Buscando…» con el hilo (ronda 12). */
  cargando?: boolean;
  peso?: "fantasma" | "primario";
  children?: ReactNode;
  /** Solo posición y alto en su fila (márgenes, `h-12` junto a la caja del mostrador), nunca la cara. */
  className?: string;
  "data-guia"?: string;
}) {
  return (
    <Boton type={type} onClick={onClick} disabled={disabled} {...(cargando !== undefined ? { cargando, textoCargando: "Buscando…" } : {})} peso={peso} className={className} data-guia={guia}>
      <span className="flex items-center gap-2">
        <Search aria-hidden size={TAMANOS_ICONO.control} className="-my-1 shrink-0" />
        {children}
      </span>
    </Boton>
  );
}
