import Link from "next/link";
import { ArrowDownToLine, History } from "lucide-react";
import type { ConteoDetalle } from "@/lib/conteos";
import { resultadoConteo } from "@/lib/conteo-reglas";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { Chip } from "@/components/ui/Chip";
import { ProductoVarianteCelda } from "@/components/ui/PrendaCelda";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";

// Primera columna con el mismo piso (13.5rem) que Existencias: la celda de la prenda es la misma
// y necesita el mismo ancho para que «código · talla · cápsula» no se salga hacia la columna vecina.
const PLANTILLA = "sm:grid-cols-[minmax(13.5rem,1.4fr)_5rem_5rem_6rem_7rem]";

function fechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" });
}
// null = quien mira no ve el dinero (20260923193700): «—», nunca S/ 0.
function soles(n: number | null) {
  if (n === null) return "—";
  return `${n < 0 ? "−" : n > 0 ? "+" : ""}S/ ${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// El detalle de un conteo (2026-09-16, diseño de Felipe): qué se contó, línea por línea, con sistema, físico y
// diferencia — las diferencias primero. Es solo lectura: un conteo cerrado ya escribió sus ajustes como movimientos
// y no se toca; uno abierto se sigue contando en `/inventario/conteo`.
//
// Rediseño 2026-09-22 (ADR-0174): abre filtrado en «Con diferencia» (es lo que se viene a mirar) con «Todas» a un
// clic, suma la columna en soles por prenda, y un conteo cerrado sin prendas dice «Vacío» en vez de tres ceros y un
// «todas coinciden con el sistema» que no era cierto de nada. Un conteo ABIERTO ya no muestra su tabla con la cifra
// del sistema (la mostraba: rompía el conteo a ciegas); dice cuántas prendas lleva y manda a seguir contando.
//
// Server Component sin datos propios: la página lee (`getConteoDetalle`) y esto dibuja. Separado para poder mirarlo con
// datos de muestra sin base (principio 7) y porque la vista no necesita saber de dónde vino el conteo.
export function ConteoDetalleVista({
  conteo,
  ver,
  ubicacionEtiqueta,
  volverA = null,
  bajar = null,
}: {
  conteo: ConteoDetalle;
  ver?: string;
  ubicacionEtiqueta: string;
  /** Abierto desde Movimientos: «←» vuelve a esa lista (ya validada con `volverAMovimientos`). */
  volverA?: string | null;
  /** «Bajar al piso» con lo que quedó en 0 en el piso y hay en el almacén (la página decide si se ofrece). */
  bajar?: { url: string; cuantas: number } | null;
}) {
  const abierto = conteo.estado === "abierto";
  const resultado = resultadoConteo(conteo);
  const alcance = conteo.alcance === "categoria" && conteo.alcanceCategoriaNombre ? `Solo ${conteo.alcanceCategoriaNombre}` : "Todo el catálogo";
  const conDiferencia = conteo.lineasDetalle.filter((l) => l.diferencia !== 0);
  // Por defecto las diferencias; si no hay ninguna, todas (un filtro vacío por defecto no muestra nada útil).
  const verTodas = ver === "todas" || conDiferencia.length === 0;
  const lineas = verTodas ? conteo.lineasDetalle : conDiferencia;
  const quien = `abrió ${conteo.abiertoPorNombre} el ${fechaHora(conteo.creadoEn)}${!abierto && conteo.cerradoEn ? ` · cerró ${conteo.cerradoPorNombre} el ${fechaHora(conteo.cerradoEn)}` : ""}`;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={ubicacionEtiqueta}
        titulo={
          <>
            Conteo {conteo.numero}
            <span className="text-taupe"> · </span>
            {conteo.sububicacionNombre ?? "Toda la ubicación"}
          </>
        }
        subtitulo={`${alcance} · ${quien}`}
        // La vuelta y el resultado se quedan bajo la frase; «Seguir contando» es lo que se hace desde aquí y va a la
        // derecha, como las acciones de Existencias y Traslados (ADR-0220, actualización).
        pie={
          <>
            {/* La vuelta común (`Volver`), con el nombre del menú («Conteo»): a Movimientos si se llegó desde ahí. */}
            {volverA ? <Volver forma="boton" href={volverA} a="Movimientos" /> : <Volver forma="boton" href="/inventario/conteo" a="Conteo" />}
            {!abierto &&
              (resultado === "vacio" ? (
                <Chip tono="neutro">Vacío</Chip>
              ) : (
                <Chip tono={resultado === "sin_diferencias" ? "verde" : "rojo"}>
                  {resultado === "sin_diferencias" ? "Sin diferencias" : `${conDiferencia.length} con diferencia`}
                </Chip>
              ))}
          </>
        }
        acciones={
          abierto && (
            <Link href="/inventario/conteo#contar" className="btn-cayla btn-primario">
              Seguir contando
            </Link>
          )
        }
      />

      {resultado === "vacio" ? (
        <section className="card-cayla max-w-2xl space-y-1.5 p-6">
          <h2 className="font-display text-xl text-tinta">Este conteo cerró sin prendas contadas</h2>
          <p className="text-sm leading-relaxed text-taupe">
            No ajustó nada del stock y no cuenta para la exactitud del inventario. Desde el 2026-09-22 un conteo así ya no se puede
            cerrar: si no se va a contar, se cancela.
          </p>
        </section>
      ) : abierto ? (
        <p className="nota-cayla">
          <b>Este conteo sigue abierto.</b> Lleva {conteo.lineas} {conteo.lineas === 1 ? "prenda contada" : "prendas contadas"}; la
          diferencia con el sistema se ve al revisar y cerrar, no antes.{" "}
          <Link href="/inventario/conteo#contar" className="text-tinta underline underline-offset-2 hover:text-taupe">
            Seguir contando →
          </Link>
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <TarjetaCifra etiqueta="Prendas contadas" valor={String(conteo.lineas)}>
              {conDiferencia.length === 0 ? "Todas coincidieron con el sistema" : `${conDiferencia.length} con diferencia · ${conteo.lineas - conDiferencia.length} coincidieron`}
            </TarjetaCifra>
            <TarjetaCifra etiqueta="Sistema → físico" valor={`${conteo.sistema} → ${conteo.contado}`}>
              {conteo.diferencia === 0 ? "Sin diferencia neta" : `${conteo.diferencia > 0 ? "+" : ""}${conteo.diferencia} unidades ${conteo.diferencia > 0 ? "de más" : "de menos"}`}
            </TarjetaCifra>
            <TarjetaCifra
              etiqueta="Diferencia en soles"
              valor={soles(conteo.solesDiferencia)}
              tono={(conteo.solesDiferencia ?? 0) < 0 ? "text-rojo-profundo" : (conteo.solesDiferencia ?? 0) > 0 ? "text-verde-profundo" : "text-tinta"}
            >
              Al costo actual de cada prenda · ya ajustado en el stock
            </TarjetaCifra>
          </div>

          {(bajar || conDiferencia.length > 0) && (
            // Lo que sigue (Conteo conectado, 2026-09-26): cada botón lleva a la pantalla que hace el trabajo, con la lista
            // ya cargada — aquí no se hace nada, porque el conteo cerrado ya no se toca.
            <section className="card-cayla space-y-3 p-4 sm:p-5" aria-labelledby="lo-que-sigue">
              <h2 id="lo-que-sigue" className="font-display text-lg text-tinta">
                Lo que sigue
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {bajar && (
                  <Link href={bajar.url} className="flex items-start gap-3 rounded-xl border border-sand bg-papel p-3.5 transition-colors hover:border-taupe/50">
                    <ArrowDownToLine aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-taupe" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-tinta">
                        Bajar al piso · {bajar.cuantas} {bajar.cuantas === 1 ? "prenda" : "prendas"}
                      </span>
                      <span className="block text-xs text-taupe">Quedaron en 0 en el piso y hay en el almacén. Llegan para escanear al colgarlas.</span>
                    </span>
                  </Link>
                )}
                {conDiferencia.length > 0 && (
                  <Link href="/inventario/movimientos?proc=conteo" className="flex items-start gap-3 rounded-xl border border-sand bg-papel p-3.5 transition-colors hover:border-taupe/50">
                    <History aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-taupe" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-tinta">Ver los ajustes en Movimientos</span>
                      <span className="block text-xs text-taupe">
                        {conDiferencia.length} {conDiferencia.length === 1 ? "ajuste" : "ajustes"} de este conteo, con quién y cuándo.
                      </span>
                    </span>
                  </Link>
                )}
              </div>
            </section>
          )}

          <section className="card-cayla space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Qué prendas ver">
                <Link
                  href={`/inventario/conteo/${conteo.id}`}
                  aria-pressed={!verTodas}
                  aria-disabled={conDiferencia.length === 0}
                  className={`pildora-cayla ${conDiferencia.length === 0 ? "pointer-events-none opacity-50" : ""}`}
                  replace
                  scroll={false}
                >
                  Con diferencia · {conDiferencia.length}
                </Link>
                <Link href={`/inventario/conteo/${conteo.id}?ver=todas`} aria-pressed={verTodas} className="pildora-cayla" replace scroll={false}>
                  Todas · {conteo.lineas}
                </Link>
              </div>
            </div>
            <Tabla className="rounded-lg border-0 bg-transparent">
              <Encabezado
                plantilla={PLANTILLA}
                columnas={[
                  { titulo: "Producto / variante" },
                  { titulo: "Sistema", alinear: "centro" },
                  { titulo: "Físico", alinear: "centro" },
                  { titulo: "Diferencia", alinear: "centro" },
                  { titulo: "En soles", alinear: "der" },
                ]}
              />
              {lineas.map((l) => (
                <div key={l.varianteId} className={fila(PLANTILLA)}>
                  <ProductoVarianteCelda referencia={l.referencia} sku={l.sku || "sin código"} talla={l.talla} color={l.color} colorHex={l.colorHex} fotoUrl={l.fotoUrl} />
                  <span className={celda("centro", "text-sm tabular-nums text-tinta/75")}>
                    <span className="mr-1 text-[11px] text-taupe sm:hidden">Sistema</span>
                    {l.sistema}
                  </span>
                  <span className={celda("centro", "text-sm font-semibold tabular-nums text-tinta")}>
                    <span className="mr-1 text-[11px] font-normal text-taupe sm:hidden">Físico</span>
                    {l.contado}
                  </span>
                  <span className={celda("centro", `text-sm font-semibold tabular-nums ${l.diferencia < 0 ? "text-rojo-profundo" : l.diferencia > 0 ? "text-verde-profundo" : "text-taupe"}`)}>
                    <span className="mr-1 text-[11px] font-normal text-taupe sm:hidden">Diferencia</span>
                    {l.diferencia === 0 ? "=" : `${l.diferencia > 0 ? "+" : ""}${l.diferencia}`}
                  </span>
                  <span className={celda("der", `text-sm ${(l.soles ?? 0) < 0 ? "text-rojo-profundo" : "text-tinta/75"}`)}>
                    <span className="mr-1 text-[11px] text-taupe sm:hidden">En soles</span>
                    {l.diferencia === 0 ? "—" : soles(l.soles)}
                  </span>
                </div>
              ))}
            </Tabla>
          </section>
        </>
      )}
    </div>
  );
}
