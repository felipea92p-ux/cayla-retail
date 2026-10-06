import Link from "next/link";

// «Hoy · Este mes» de la pestaña Hoy (2026-09-26): dos enlaces, porque la URL es la fuente de verdad (Hoy es
// `/vender/comprobantes`; el mes, `/vender/comprobantes/emitidos?m=`). De servidor: no guarda estado.
// Es un período, así que se dibuja con la píldora del sistema (ADR-0357, «Pestañas y segmentos», 2026-10-06): con la pista
// en píldora de antes se leía como un segundo juego de pestañas justo debajo del vidrio de Comprobantes (ADR-0124).
export function PeriodoComprobantes({ activo }: { activo: "hoy" | "mes" }) {
  return (
    <nav aria-label="Qué período mirar" className="flex flex-wrap items-center gap-2">
      <Link href="/vender/comprobantes" aria-current={activo === "hoy" ? "page" : undefined} className="pildora-cayla">
        Hoy
      </Link>
      <Link href="/vender/comprobantes/emitidos" aria-current={activo === "mes" ? "page" : undefined} className="pildora-cayla">
        Este mes
      </Link>
    </nav>
  );
}
