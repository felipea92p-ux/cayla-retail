import Link from "next/link";
import type { ParamsMovimientos } from "@/lib/movimientos-reglas";

// El vacío dice POR QUÉ está vacío y ofrece el siguiente paso con la cifra real (demo 2026-09-22):
// «Nada en los últimos 30 días — en los últimos 90 hay 12» con un botón que los muestra, en vez de
// «Todavía no hay movimientos», que con un período corto era falso. Los enlaces conservan los
// filtros; solo cambian el período o los quitan.
export function MovimientosVacio({
  sede,
  periodo,
  conFiltros,
  en90,
  params,
}: {
  sede: string;
  /** Ya en frase: «los últimos 30 días», «todo el historial», «el período elegido». */
  periodo: string;
  conFiltros: boolean;
  en90: number;
  params: ParamsMovimientos;
}) {
  const url = (cambios: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, cursor: undefined, mov: undefined, ubicacion: undefined, ...cambios })) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/inventario/movimientos?${qs}` : "/inventario/movimientos";
  };
  const titulo = en90 > 0 ? `Nada en ${periodo}` : conFiltros ? "Ningún movimiento coincide" : `Sin movimientos en ${periodo}`;
  return (
    <div className="card-cayla flex flex-col items-center gap-2.5 px-5 py-9 text-center">
      <h2 className="font-display text-[22px] leading-tight text-tinta">{titulo}</h2>
      <p className="max-w-[52ch] text-sm leading-relaxed text-taupe">
        {en90 > 0 ? (
          <>
            {sede} no registró movimientos{conFiltros ? " con estos filtros" : ""} en ese período. En los últimos 90 días hay{" "}
            <b className="font-semibold text-tinta">{en90.toLocaleString("es-PE")}</b>.
          </>
        ) : conFiltros ? (
          `No hay movimientos de ${sede} con esos filtros en ${periodo}.`
        ) : (
          `${sede} no registró entradas, salidas, traslados ni ajustes en ese período.`
        )}
      </p>
      <div className="mt-1.5 flex flex-wrap justify-center gap-2">
        {en90 > 0 && (
          <Link href={url({ rango: "90", desde: undefined, hasta: undefined })} className="btn-cayla btn-primario">
            Ver los últimos 90 días
          </Link>
        )}
        {en90 === 0 && params.rango !== "todo" && (
          <Link href={url({ rango: "todo", desde: undefined, hasta: undefined })} className="btn-cayla btn-secundario">
            Ver todo el historial
          </Link>
        )}
        {conFiltros && (
          <Link href="/inventario/movimientos" className="btn-cayla btn-secundario">
            Limpiar filtros
          </Link>
        )}
      </div>
    </div>
  );
}
