"use client";

import { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import { Encabezado, fila, celda } from "@/components/ui/Tabla";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { MuestraColor } from "@/components/ui/MuestraColor";
import { estadoTalla, tallaParaReponer, type EstadoTalla, type PrendaAgrupada } from "@/lib/existencias-prendas";
import type { FilaExistencias } from "@/lib/inventario-v2";

/* ====================================================================
   Existencias por prenda (ADR-0237, spike docs/maquetas/existencias-conectada-2026-09/)

   Una fila por prenda (modelo + color) con su curva de tallas en una línea: «libre en piso · libre en almacén» por
   talla. Es la vista de entrada: la Blusa Carlita en 3 colores deja de ser 15 filas y pasa a 3, y en el celular se
   lee de un vistazo. Tocar la fila abre el detalle de la prenda (`DetallePrendaExistencias`), donde vive cada acción
   por talla. La vista «Por talla» (la tabla del #445, con Cobertura y Ritmo) sigue a un toque en el panel.
   ==================================================================== */

/** Cómo se pinta cada talla de la curva. El tono sale de las mismas reglas que la tabla por talla (ADR-0231), nunca de
 *  un umbral propio: ámbar lleno = por colgar; borde ámbar = pide reponer; tachada = sin nada libre aquí. */
const CLASE_TALLA: Record<EstadoTalla, string> = {
  por_colgar: "bg-ambar/20 font-semibold text-ambar-profundo ring-1 ring-inset ring-ambar/50",
  reponer: "bg-hueso text-tinta ring-1 ring-inset ring-ambar/40",
  sin_stock: "bg-transparent text-tinta/35 ring-1 ring-inset ring-sand",
  normal: "bg-hueso text-tinta",
};

const AYUDA_TALLA: Record<EstadoTalla, string> = {
  por_colgar: "por colgar: nada para vender en el piso y sí en el almacén",
  reponer: "poco en el piso",
  sin_stock: "sin nada libre en esta sede",
  normal: "en el piso",
};

/** La curva: una pastilla por talla con «piso·almacén» (o el total, donde no se separa). Cada pastilla es un botón:
 *  abre el detalle de la prenda ya parado en esa talla, sin obligar a elegirla de nuevo dentro del modal. */
export function CurvaTallas({
  prenda,
  separa,
  onAbrirTalla,
}: {
  prenda: PrendaAgrupada<FilaExistencias>;
  separa: boolean;
  onAbrirTalla: (varianteId: string) => void;
}) {
  return (
    <span className="flex flex-wrap gap-1">
      {prenda.tallas.map((f) => {
        const estado = estadoTalla(f);
        const cifra = separa ? `${f.pisoDisponible ?? 0}·${f.almacenDisponible ?? 0}` : `${f.disponible}`;
        return (
          <button
            type="button"
            key={f.varianteId}
            onClick={(e) => {
              // La fila entera también abre el detalle (sin talla): este clic es más específico y no debe llegar a ella.
              e.stopPropagation();
              onAbrirTalla(f.varianteId);
            }}
            aria-label={`Ver la talla ${f.talla ?? "Única"} de ${prenda.referencia}${prenda.color ? ` ${prenda.color}` : ""}`}
            title={`${f.talla ?? "Única"}: ${separa ? `${f.pisoDisponible ?? 0} en piso, ${f.almacenDisponible ?? 0} en almacén` : `${f.disponible} disponibles`} — ${AYUDA_TALLA[estado]}${f.apartado > 0 ? ` · ${f.apartado} apartada${f.apartado === 1 ? "" : "s"}` : ""}`}
            className={`inline-flex min-w-[2.6rem] cursor-pointer flex-col items-center rounded-md px-1.5 py-0.5 text-[11px] leading-tight tabular-nums transition-[filter] hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tinta/60 ${CLASE_TALLA[estado]}`}
          >
            <span className="text-[10px] font-semibold opacity-75">{f.talla ?? "Única"}</span>
            <span className={estado === "sin_stock" ? "line-through" : ""}>{cifra}</span>
          </button>
        );
      })}
    </span>
  );
}

/** La casilla de una prenda: marca todas sus tallas; a medias si solo algunas lo están. */
function CasillaPrenda({ prenda, seleccion, onAlternar }: { prenda: PrendaAgrupada<FilaExistencias>; seleccion: ReadonlySet<string>; onAlternar: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const marcadas = prenda.tallas.filter((f) => seleccion.has(f.varianteId)).length;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = marcadas > 0 && marcadas < prenda.tallas.length;
  }, [marcadas, prenda.tallas.length]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={marcadas === prenda.tallas.length}
      onChange={onAlternar}
      // La fila entera abre el detalle: la casilla no debe abrirlo también.
      onClick={(e) => e.stopPropagation()}
      aria-label={`Marcar ${prenda.referencia}${prenda.color ? ` ${prenda.color}` : ""}`}
      className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-tinta"
    />
  );
}

/** Lo que la prenda pide hoy, en una línea: el botón de reponer (abre el detalle en la primera talla a bajar) o un chip. */
function AccionPrenda({
  prenda,
  separa,
  puedeReponer,
  onReponer,
}: {
  prenda: PrendaAgrupada<FilaExistencias>;
  separa: boolean;
  puedeReponer: boolean;
  onReponer: () => void;
}) {
  const sinStock = prenda.tallas.filter((f) => estadoTalla(f) === "sin_stock").map((f) => f.talla ?? "Única");
  return (
    <span className="flex flex-wrap items-center gap-1.5 sm:justify-center">
      {prenda.tallasPorColgar > 0 && (
        <Chip tono="ambar">
          {prenda.tallasPorColgar} {prenda.tallasPorColgar === 1 ? "talla" : "tallas"} por colgar
        </Chip>
      )}
      {separa && puedeReponer && prenda.tallasParaBajar > 0 ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReponer();
          }}
          // Secundario, no primario (tarea #5): una fila no compite con la acción de la pantalla; con todas pidiendo
          // reponer, diez botones negros no decían por dónde empezar. Eso lo dice el orden (`ordenarPorUrgencia`).
          className="btn-cayla btn-secundario px-2.5 py-0.5 text-xs"
        >
          Reponer {prenda.tallasParaBajar} {prenda.tallasParaBajar === 1 ? "talla" : "tallas"}
        </button>
      ) : prenda.tallasPorColgar === 0 && sinStock.length > 0 ? (
        <Chip tono="neutro">{sinStock.join(", ")} sin stock</Chip>
      ) : null}
      {prenda.danado > 0 && <Chip tono="rojo">Dañado · {prenda.danado}</Chip>}
      {prenda.apartado > 0 && <Chip tono="ambar">Apartado · {prenda.apartado}</Chip>}
    </span>
  );
}

export function ExistenciasPorPrenda({
  prendas,
  separa,
  mostrarMarca,
  conSeleccion,
  seleccion,
  onAlternar,
  onAbrir,
  puedeReponer,
}: {
  prendas: PrendaAgrupada<FilaExistencias>[];
  separa: boolean;
  mostrarMarca: boolean;
  /** Casillas para marcar varias prendas y actuar sobre todas (la barra de abajo). */
  conSeleccion: boolean;
  seleccion: ReadonlySet<string>;
  onAlternar: (prenda: PrendaAgrupada<FilaExistencias>) => void;
  /** Abre el detalle de la prenda; con `varianteId`, parado en esa talla. */
  onAbrir: (prenda: PrendaAgrupada<FilaExistencias>, varianteId?: string) => void;
  puedeReponer: boolean;
}) {
  // Casilla | Prenda | Tallas | Piso | Almacén | Acción | ›. Donde no se separa piso y almacén (Taller), Disponible.
  const plantilla = separa
    ? `${conSeleccion ? "sm:grid-cols-[1.5rem_minmax(12rem,1fr)_minmax(13rem,1.5fr)_4rem_4.5rem_minmax(10rem,0.9fr)_1.75rem]" : "sm:grid-cols-[minmax(12rem,1fr)_minmax(13rem,1.5fr)_4rem_4.5rem_minmax(10rem,0.9fr)_1.75rem]"}`
    : `${conSeleccion ? "sm:grid-cols-[1.5rem_minmax(12rem,1fr)_minmax(13rem,1.5fr)_5.5rem_minmax(8rem,0.8fr)_1.75rem]" : "sm:grid-cols-[minmax(12rem,1fr)_minmax(13rem,1.5fr)_5.5rem_minmax(8rem,0.8fr)_1.75rem]"}`;
  const columnas = [
    ...(conSeleccion ? [{ titulo: "" }] : []),
    { titulo: "Prenda" },
    { titulo: separa ? "Tallas (piso · almacén)" : "Tallas" },
    ...(separa ? [{ titulo: "Piso", alinear: "centro" as const }, { titulo: "Almacén", alinear: "centro" as const }] : [{ titulo: "Disponible", alinear: "centro" as const }]),
    { titulo: separa ? "Acción hoy" : "", alinear: "centro" as const },
    { titulo: "" },
  ];
  return (
    <>
      <Encabezado plantilla={plantilla} columnas={columnas} />
      {prendas.map((p) => {
        const marcada = p.tallas.some((f) => seleccion.has(f.varianteId));
        const primeraABajar = tallaParaReponer(p.tallas);
        return (
          <div
            key={p.clave}
            role="button"
            tabIndex={0}
            aria-label={`Abrir ${p.referencia}${p.color ? ` ${p.color}` : ""}`}
            onClick={(e) => {
              // Un modal abierto desde esta fila le entrega sus clics por React (ADR-0128): solo cuenta el que nace aquí.
              if (!e.currentTarget.contains(e.target as Node)) return;
              onAbrir(p);
            }}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onAbrir(p);
              }
            }}
            className={fila(plantilla, `cursor-pointer gap-y-2.5 transition-colors hover:bg-sand/25 focus-visible:bg-sand/25 focus-visible:outline-none sm:items-center ${marcada ? "bg-sand/35" : ""}`)}
          >
            {/* Celular: tarjeta (casilla + foto + nombre, con piso y almacén a la derecha; debajo la curva y la acción).
                Escritorio: `sm:contents` devuelve cada pieza a su columna. */}
            <div className="flex min-w-0 items-center gap-3 sm:contents">
              {conSeleccion && (
                <span className="flex items-center">
                  <CasillaPrenda prenda={p} seleccion={seleccion} onAlternar={() => onAlternar(p)} />
                </span>
              )}
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <MiniaturaPrenda fotoUrl={p.fotoUrl} colorHex={p.colorHex} tamano="lg" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-tinta">
                    {p.referencia}
                    {mostrarMarca && p.marca && <span className="font-normal text-taupe"> · {p.marca}</span>}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-taupe">
                    {p.color ? <MuestraColor nombre={p.color} hex={p.colorHex} /> : <span>Sin color</span>}
                    <span className="hidden sm:inline">
                      {p.tallas.length} {p.tallas.length === 1 ? "talla" : "tallas"}
                    </span>
                  </span>
                </span>
              </span>
              {/* Solo celular: las dos cifras de la prenda, a la derecha del nombre. */}
              <span className="shrink-0 text-right text-xs leading-snug text-taupe sm:hidden">
                {separa ? (
                  <>
                    Piso <b className="text-sm font-semibold tabular-nums text-tinta">{p.piso ?? 0}</b>
                    <br />
                    Almacén <span className="tabular-nums text-tinta">{p.almacen ?? 0}</span>
                  </>
                ) : (
                  <>
                    Disponible
                    <br />
                    <b className="text-sm font-semibold tabular-nums text-tinta">{p.disponible}</b>
                  </>
                )}
              </span>
            </div>
            <span className="min-w-0">
              <CurvaTallas prenda={p} separa={separa} onAbrirTalla={(varianteId) => onAbrir(p, varianteId)} />
            </span>
            {separa ? (
              <>
                <span className={celda("centro", "hidden text-sm tabular-nums sm:block")}>{p.piso ?? 0}</span>
                <span className={celda("centro", "hidden text-sm tabular-nums sm:block")}>{p.almacen ?? 0}</span>
              </>
            ) : (
              <span className={celda("centro", "hidden text-sm font-semibold tabular-nums sm:block")}>{p.disponible}</span>
            )}
            <span className="min-w-0">
              <AccionPrenda prenda={p} separa={separa} puedeReponer={puedeReponer} onReponer={() => onAbrir(p, primeraABajar?.varianteId)} />
            </span>
            <span aria-hidden className="hidden justify-center text-taupe/60 sm:flex">
              <ChevronRight className="h-4 w-4" />
            </span>
          </div>
        );
      })}
    </>
  );
}
