import Link from "next/link";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { Chip } from "@/components/ui/Chip";
import type { ConteoResumen } from "@/lib/conteos";
import { resultadoConteo } from "@/lib/conteo-reglas";

// El historial de conteos como tabla (diseño de Felipe, 2026-09-16): número
// y fecha, qué se contó (piso/almacén y alcance), el resultado en una sola
// mirada (sin diferencias / con diferencia ±N), sistema → físico con los
// soles, y quién abrió y cerró. Cada fila lleva al detalle. Server Component
// — no hay estado: los conteos de una tienda son pocos y no hace falta
// filtrar en memoria.
//
// ADR-0174 (2026-09-22): un conteo cerrado sin prendas sale «Vacío» (neutro), no «Sin diferencias» en verde — eso
// afirmaba algo sobre cero prendas. Tampoco cuenta para la exactitud, y desde la migración
// 20260923120000_conteo_vacio_no_se_cierra.sql la base ya no deja cerrar uno.
const PLANTILLA = "sm:grid-cols-[6rem_minmax(9rem,1.2fr)_9rem_minmax(8rem,1fr)_minmax(8rem,1fr)_5.5rem]";

function fecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", timeZone: "America/Lima" });
}
function soles(n: number) {
  return `${n < 0 ? "−" : n > 0 ? "+" : ""}S/ ${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ConteosLista({ conteos }: { conteos: ConteoResumen[] }) {
  return (
    <Tabla className="rounded-lg border-0 bg-transparent">
      <Encabezado
        plantilla={PLANTILLA}
        columnas={[
          { titulo: "Conteo" },
          { titulo: "Qué se contó", alinear: "centro" },
          { titulo: "Resultado", alinear: "centro" },
          { titulo: "Sistema → físico", alinear: "centro" },
          { titulo: "Responsables", alinear: "centro" },
          { titulo: "", alinear: "centro" },
        ]}
      />
      {conteos.map((c) => {
        const abierto = c.estado === "abierto";
        const resultado = resultadoConteo(c);
        const alcance = c.alcance === "categoria" && c.alcanceCategoriaNombre ? `Solo ${c.alcanceCategoriaNombre}` : "Todo el catálogo";
        return (
          <Link
            key={c.id}
            href={abierto ? "/inventario/conteo#contar" : `/inventario/conteo/${c.id}`}
            className={fila(PLANTILLA, "focus-visible:bg-crema/60 focus-visible:outline-none")}
          >
            <span className="min-w-0">
              <span className="block text-sm text-tinta">Conteo {c.numero}</span>
              <span className="block text-xs text-taupe">{abierto ? `Abierto ${fecha(c.creadoEn)}` : `Cerrado ${fecha(c.cerradoEn ?? c.creadoEn)}`}</span>
            </span>
            <span className="min-w-0 sm:text-center">
              <span className="block truncate text-sm text-tinta">{c.sububicacionNombre ?? "Toda la ubicación"}</span>
              <span className="block truncate text-xs text-taupe">
                {alcance} · {c.lineas} {c.lineas === 1 ? "prenda" : "prendas"}
              </span>
            </span>
            <span className={celda("centro", "overflow-visible")}>
              {resultado === "en_curso" ? (
                <Chip tono="ambar">En curso</Chip>
              ) : resultado === "vacio" ? (
                <Chip tono="neutro">Vacío</Chip>
              ) : resultado === "sin_diferencias" ? (
                <Chip tono="verde">Sin diferencias</Chip>
              ) : (
                <Chip tono="rojo">
                  {c.lineasConDiferencia} con diferencia
                </Chip>
              )}
            </span>
            <span className="min-w-0 sm:text-center">
              {resultado === "vacio" ? (
                <span className="block text-xs text-taupe">No cuenta para la exactitud</span>
              ) : resultado === "en_curso" ? (
                <span className="block text-xs text-taupe">A ciegas hasta revisar</span>
              ) : (
                <>
                  <span className="block text-sm tabular-nums text-tinta">
                    {c.sistema} <span className="text-tinta/45">→</span> {c.contado}
                  </span>
                  <span className={`block text-xs tabular-nums ${c.solesDiferencia < 0 ? "text-rojo-profundo" : c.solesDiferencia > 0 ? "text-verde-profundo" : "text-taupe"}`}>
                    {c.lineasConDiferencia === 0 ? "coinciden" : <span className="whitespace-nowrap">{soles(c.solesDiferencia)}</span>}
                  </span>
                </>
              )}
            </span>
            <span className="min-w-0 sm:text-center">
              <span className="block truncate text-xs text-tinta/75">Abrió {c.abiertoPorNombre}</span>
              {!abierto && <span className="block truncate text-xs text-taupe">Cerró {c.cerradoPorNombre}</span>}
            </span>
            <span className={celda("centro", "overflow-visible")}>
              <span className={`btn-cayla btn-chico ${abierto ? "btn-primario" : resultado === "vacio" ? "btn-sutil" : "btn-secundario"}`}>
                {abierto ? "Contar" : resultado === "vacio" ? "Ver" : "Ver detalle"}
              </span>
            </span>
          </Link>
        );
      })}
    </Tabla>
  );
}
