import Link from "next/link";

/* ====================================================================
   Pestañas · vistas de una lista, con conteo (2026-09-18, ADR-0106)

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
   ==================================================================== */

export type Pestana = {
  clave: string;
  etiqueta: string;
  href: string;
  /** Cuántos hay en esa vista. `null`/omitido = no se dibuja. */
  conteo?: number | null;
};

export function Pestanas({ items, activa, etiquetaAccesible, className = "" }: { items: Pestana[]; activa: string; etiquetaAccesible: string; className?: string }) {
  return (
    <nav aria-label={etiquetaAccesible} className={`flex gap-1 overflow-x-auto border-b border-tinta/10 ${className}`}>
      {items.map((p) => {
        const esActiva = p.clave === activa;
        return (
          <Link
            key={p.clave}
            href={p.href}
            aria-current={esActiva ? "page" : undefined}
            className={`label-cayla -mb-px shrink-0 border-b-2 px-3.5 pb-[11px] pt-1 text-[11px] transition-colors ${
              esActiva ? "border-rojo text-tinta" : "border-transparent text-tinta/65 hover:text-rojo"
            }`}
          >
            {p.etiqueta}
            {p.conteo != null && <span className="ml-1.5 font-medium tracking-normal tabular-nums text-tinta/45">{p.conteo.toLocaleString("es-PE")}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
