import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getAperturasPorRevisar, getHistorialCierres } from "@/lib/caja";
import { AperturasPorRevisar } from "@/components/AperturasPorRevisar";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { BotonVerDetalleCierre } from "@/components/CierreCajaDetalle";

function money(n: number) {
  return (n >= 0 ? "S/" : "-S/") + Math.abs(n).toFixed(2);
}

function formatearFecha(iso: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const PLANTILLA = "sm:grid-cols-[minmax(8rem,1fr)_7.5rem_6.5rem_5.5rem_5.5rem_5.5rem_5.5rem_2.5rem]";

// Tanda 3 del diagnóstico de Venta y Caja (2026-09-15): lo que `cajas` ya guarda
// (esperado, contado, diferencia, quién) y ninguna pantalla leía. Sin RPC ni
// filtro de ubicación propios — misma RLS que ya usa /caja (fn_puede_operar_ubicacion)
// y el mismo criterio de Facturación: mientras "control total temporal" siga
// vigente, se ve todo, con la sede en cada fila.
export default async function HistorialCierresPage({ searchParams }: { searchParams: Promise<{ prueba?: string }> }) {
  const persona = await requirePersonaActualV2();
  // D-54 (ADR-0159): apagado por defecto — las cajas archivadas como dato de prueba (nunca
  // borradas) no se piden a la base salvo que se pida verlas.
  const { prueba } = await searchParams;
  const incluirPrueba = prueba === "1";
  const [cierres, aperturas] = await Promise.all([
    getHistorialCierres(60, incluirPrueba),
    // ADR-0183: el aviso al líder. Solo el líder las marca como revisadas (`revisar_apertura_caja`).
    persona.rol === "lider" ? getAperturasPorRevisar() : Promise.resolve(null),
  ]);

  return (
    // `/caja` va a todo el ancho (AppShell), pero esta tabla tiene una columna flexible (la sede) que
    // en pantalla grande separaría la sede de sus cifras: conserva la columna de lectura de siempre.
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/caja" className="label-cayla text-[11px] text-tinta/60 hover:text-rojo">
            ← Caja
          </Link>
          <h1 className="font-display mt-1 text-2xl text-tinta">Historial de cierres</h1>
          <p className="mt-1 text-sm text-tinta/65">
            {cierres.length === 0 ? "Todavía no se cerró ninguna caja." : `Las últimas ${cierres.length} cajas cerradas, de todas las sedes.`}
          </p>
        </div>
        <Link
          href={incluirPrueba ? "/caja/historial" : "/caja/historial?prueba=1"}
          aria-pressed={incluirPrueba}
          className={`label-cayla mt-1 rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
            incluirPrueba ? "border-tinta bg-tinta text-crema" : "border-tinta/20 text-tinta/75 hover:border-rojo hover:text-rojo"
          }`}
        >
          Con datos de prueba
        </Link>
      </div>

      {aperturas && aperturas.length > 0 && <AperturasPorRevisar aperturas={aperturas} />}

      {cierres.length > 0 && (
        <Tabla>
          <Encabezado
            plantilla={PLANTILLA}
            columnas={[
              { titulo: "Sede" },
              { titulo: "Cerrada" },
              { titulo: "Cerró" },
              { titulo: "Apertura", alinear: "der" },
              { titulo: "Esperado", alinear: "der" },
              { titulo: "Contado", alinear: "der" },
              { titulo: "Diferencia", alinear: "der" },
              { titulo: "", alinear: "centro" },
            ]}
          />
          {cierres.map((c) => {
            const cuadra = Math.abs(c.diferencia) < 0.01;
            return (
              <div key={c.id} className={fila(PLANTILLA)}>
                <span className={celda("izq")}>{c.ubicacionNombre}</span>
                <span className={celda("izq", "text-tinta/75")}>{formatearFecha(c.cerradaEn)}</span>
                {/* Bajo `sm` la Tabla oculta el encabezado y las celdas se apilan sin
                    contexto — cuatro cifras seguidas sin etiqueta no se leen en una
                    pantalla de cuadre. La etiqueta va SOLO en celular: en escritorio
                    ya la da la columna. */}
                <span className={celda("izq", "text-tinta/75")}>
                  <span className="label-cayla mr-1 text-tinta/40 sm:hidden">Cerró</span>
                  {c.cerradaPorNombre ?? "—"}
                </span>
                <span className={celda("der", "text-tinta/75")}>
                  <span className="label-cayla mr-1 text-tinta/40 sm:hidden">Apertura</span>
                  {money(c.montoApertura)}
                </span>
                <span className={celda("der", "text-tinta/75")}>
                  <span className="label-cayla mr-1 text-tinta/40 sm:hidden">Esperado</span>
                  {money(c.montoCierreSistema)}
                </span>
                <span className={celda("der", "text-tinta/75")}>
                  <span className="label-cayla mr-1 text-tinta/40 sm:hidden">Contado</span>
                  {money(c.montoCierreReal)}
                </span>
                <span className={celda("der", `font-semibold ${cuadra ? "text-tinta" : c.diferencia > 0 ? "text-verde-profundo" : "text-rojo-profundo"}`)}>
                  <span className="label-cayla mr-1 text-tinta/40 sm:hidden">Diferencia</span>
                  {c.diferencia >= 0 ? "+" : ""}
                  {money(c.diferencia)}
                </span>
                <span className={celda("centro")}>
                  <BotonVerDetalleCierre cierre={c} />
                </span>
                {c.nota && <p className="col-span-full mt-1 text-xs italic text-tinta/60">{c.nota}</p>}
              </div>
            );
          })}
        </Tabla>
      )}
    </div>
  );
}
