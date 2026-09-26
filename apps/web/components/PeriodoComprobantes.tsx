import Link from "next/link";

// «Hoy · Este mes» de la pestaña Hoy (2026-09-26): dos enlaces, porque la URL es la fuente de verdad (Hoy es
// `/vender/comprobantes`; el mes, `/vender/comprobantes/emitidos?m=`). De servidor: no guarda estado.
export function PeriodoComprobantes({ activo }: { activo: "hoy" | "mes" }) {
  const base = "inline-flex h-8 items-center rounded-full px-3.5 text-[13px] transition-colors duration-200 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60";
  return (
    <nav aria-label="Qué período mirar" className="inline-flex rounded-full border border-sand bg-papel p-[3px]">
      <Link href="/vender/comprobantes" aria-current={activo === "hoy" ? "page" : undefined} className={`${base} ${activo === "hoy" ? "bg-hueso font-semibold text-tinta" : "text-tinta/65 hover:text-tinta"}`}>
        Hoy
      </Link>
      <Link href="/vender/comprobantes/emitidos" aria-current={activo === "mes" ? "page" : undefined} className={`${base} ${activo === "mes" ? "bg-hueso font-semibold text-tinta" : "text-tinta/65 hover:text-tinta"}`}>
        Este mes
      </Link>
    </nav>
  );
}
