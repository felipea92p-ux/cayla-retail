import Link from "next/link";
import type { CSSProperties } from "react";
import { IndicadorDeslizante } from "@/components/ui/IndicadorDeslizante";

/* ====================================================================
   Pestañas · vistas de una lista, con conteo (2026-09-18, ADR-0111)

   Por qué existe: /compras escondía sus filtros detrás de un botón
   «Filtros» y las tarjetas de cabecera navegaban a OTRAS pantallas; para
   ver «solo lo vencido» había que abrir el panel y elegir. Las pestañas
   ponen a un toque las vistas que más se usan (Todos · Por pagar · Por
   recibir · Vencidos · Pagados), cada una con su conteo. Son enlaces (la
   vista vive en la URL, como los filtros): sirven en Server Components,
   se comparten y «atrás» del navegador funciona.

   Es la misma pieza que `TabsRecibir` dibujaba a mano en /compras/recibir
   (borde inferior, la activa con subrayado rojo), generalizada con el
   conteo. En celular se desplaza en horizontal en vez de partirse.

   `deslizante` (2026-09-19, ADR-0130, opt-in): el subrayado rojo deja de ser el borde de la pestaña
   activa y pasa a ser UNA pieza (`IndicadorDeslizante`) que viaja de la pestaña anterior a la nueva
   aunque la página se vuelva a pedir al servidor. Sin la prop no cambia nada de lo que ya dibujaba.
   `idIndicador` nombra la memoria del indicador (una por lista de pestañas de la pantalla).
   ==================================================================== */

export type Pestana = {
  clave: string;
  etiqueta: string;
  href: string;
  /** Cuántos hay en esa vista. `null`/omitido = no se dibuja. */
  conteo?: number | null;
};

export function Pestanas({
  items,
  activa,
  etiquetaAccesible,
  className = "",
  style,
  deslizante = false,
  idIndicador = "pestanas",
}: {
  items: Pestana[];
  activa: string;
  etiquetaAccesible: string;
  className?: string;
  /** Típico: `--i` de la entrada escalonada (`anim-entra`). */
  style?: CSSProperties;
  deslizante?: boolean;
  idIndicador?: string;
}) {
  return (
    <nav aria-label={etiquetaAccesible} className={`flex gap-1 overflow-x-auto border-b border-tinta/10 ${deslizante ? "relative" : ""} ${className}`} style={style}>
      {items.map((p) => {
        const esActiva = p.clave === activa;
        // Deslizante: la activa NO lleva `border-rojo` (lo pondría todo de golpe); su marca estática
        // `cmp-tab-activa` cubre el instante antes de hidratar y se apaga cuando el indicador toma el relevo.
        const estado = deslizante
          ? esActiva
            ? "cmp-tab-activa border-b-2 text-tinta"
            : "border-b-2 border-transparent text-tinta/65 hover:text-rojo"
          : esActiva
            ? "border-b-2 border-rojo text-tinta"
            : "border-b-2 border-transparent text-tinta/65 hover:text-rojo";
        return (
          <Link
            key={p.clave}
            href={p.href}
            aria-current={esActiva ? "page" : undefined}
            className={`label-cayla -mb-px shrink-0 px-3.5 pb-[11px] pt-1 text-[11px] transition-colors ${estado}`}
          >
            {p.etiqueta}
            {p.conteo != null && <span className="ml-1.5 font-medium tracking-normal tabular-nums text-tinta/45">{p.conteo.toLocaleString("es-PE")}</span>}
          </Link>
        );
      })}
      {deslizante && <IndicadorDeslizante activa={activa} id={idIndicador} variante="linea" />}
    </nav>
  );
}
