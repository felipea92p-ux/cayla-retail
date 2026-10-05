"use client";

import { AlertTriangle, ChevronRight } from "lucide-react";
import { Encabezado, celda } from "@/components/ui/Tabla";
import { Chip } from "@/components/ui/Chip";
import { Casilla } from "@/components/ui/Casilla";
import { ChipAlerta, ChipMantener } from "@/components/ExistenciasChips";
import { MiniaturaPrenda, categoriaDe } from "@/components/ui/PrendaCelda";
import { MuestraColor } from "@/components/ui/MuestraColor";
import { estadoTalla, queHacerPrenda, type PrendaAgrupada } from "@/lib/existencias-prendas";
import { AYUDA_HOY, textoHoyDePrenda, TONO_HOY } from "@/lib/existencias-hoy";
import type { FilaExistencias } from "@/lib/inventario-v2";

/* ====================================================================
   Existencias por prenda (ADR-0237; diseño aprobado por Felipe, 2026-09-28)

   Una fila por prenda (modelo + color) con su curva de tallas en una línea: «libre en piso · libre en almacén» por
   talla. La tabla COMUNICA el estado y no ofrece acciones: «Qué hacer» es un diagnóstico («4 tallas sin stock en piso»),
   nunca un botón; tocar la fila abre el cajón de la prenda (`CajonPrendaExistencias`), donde vive cada acción. La vista
   «Por talla» (Cobertura, Ritmo, En la red) sigue a un toque en el panel.
   ==================================================================== */

/** Cómo se pinta cada talla de la curva: beige, y con borde punteado (un lugar vacío, no un error) la que no tiene NADA en ningún
 *  lado (0·0); hasta el 2026-10-04 iba en rojo. El resto de
 *  los estados (por colgar, sin nada atrás) los dice el diagnóstico de la fila y las cifras, no un color por chip. */
const CLASE_TALLA = {
  sin_stock: "border-dashed border-taupe/50 bg-transparent font-semibold text-taupe",
  normal: "border-taupe/25 bg-hueso text-tinta",
} as const;

const AYUDA_TALLA = {
  por_colgar: "por colgar: nada para vender en el piso y sí en el almacén",
  sin_atras: "falta en el piso y no hay nada libre atrás",
  sin_stock: "sin nada libre en esta sede",
  normal: "en el piso",
} as const;

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
    <span className="flex flex-wrap gap-1.5 sm:gap-1">
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
            className={`inline-flex min-h-11 min-w-11 cursor-pointer flex-col items-center justify-center rounded-lg border px-1.5 py-0.5 text-xs sm:min-h-0 sm:min-w-[3.25rem] sm:justify-start sm:py-[3px] sm:text-[13px] leading-tight tabular-nums transition-[filter] hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tinta/60 ${
              estado === "sin_stock" ? CLASE_TALLA.sin_stock : CLASE_TALLA.normal
            }`}
          >
            <span className="text-[11px] font-semibold opacity-75 sm:font-normal">{f.talla ?? "Única"}</span>
            <span className={estado === "sin_stock" ? "line-through" : ""}>{cifra}</span>
          </button>
        );
      })}
    </span>
  );
}

/** Lo que la prenda pide hoy, en una línea y SIN botón: el diagnóstico (`queHacerPrenda`), o «Mantener». */
function QueHacer({ prenda, separa }: { prenda: PrendaAgrupada<FilaExistencias>; separa: boolean }) {
  const q = separa ? queHacerPrenda(prenda.tallas) : null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {/* Las mismas palabras y el mismo tono del filtro «Hoy» y de la tarjeta (`lib/existencias-hoy.ts`). */}
      {q?.tipo === "por_colgar" && <ChipAlerta titulo={AYUDA_HOY.por_colgar}>{textoHoyDePrenda(q.tipo, q.n)}</ChipAlerta>}
      {q?.tipo === "sin_stock_atras" && (
        <Chip tono={TONO_HOY[q.tipo]} className="text-xs">
          <span title={AYUDA_HOY[q.tipo]}>{textoHoyDePrenda(q.tipo, q.n)}</span>
        </Chip>
      )}
      {q?.tipo === "en_pausa" && (
        <Chip tono="pizarra" className="text-xs">
          <span title={AYUDA_HOY.en_pausa}>{textoHoyDePrenda(q.tipo, q.n)}</span>
        </Chip>
      )}
      {q?.tipo === "mantener" && <ChipMantener titulo={AYUDA_HOY.mantener} />}
      {/* Otro eje independiente: apartada no es lo mismo que dañada ni que sin stock. */}
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
  onAlternarTodas,
  abiertaClave,
  onAbrir,
}: {
  prendas: PrendaAgrupada<FilaExistencias>[];
  separa: boolean;
  mostrarMarca: boolean;
  /** Casillas para marcar varias prendas y actuar sobre todas (la barra de abajo). */
  conSeleccion: boolean;
  seleccion: ReadonlySet<string>;
  onAlternar: (prenda: PrendaAgrupada<FilaExistencias>) => void;
  /** La casilla del encabezado: marca (o desmarca) todas las prendas de esta página. */
  onAlternarTodas: (prendas: PrendaAgrupada<FilaExistencias>[]) => void;
  /** La prenda cuyo cajón está abierto: su fila se ve seleccionada. */
  abiertaClave: string | null;
  /** Abre el cajón de la prenda; con `varianteId`, parado en esa talla. */
  onAbrir: (prenda: PrendaAgrupada<FilaExistencias>, varianteId?: string) => void;
}) {
  // Casilla | Prenda | Tallas | Piso | Almacén | Qué hacer | ›. Donde no se separa piso y almacén (Taller), Disponible.
  const plantilla = separa
    ? `${conSeleccion ? "sm:grid-cols-[1.125rem_minmax(11rem,25fr)_minmax(15rem,38fr)_4.25rem_4.25rem_minmax(13rem,24fr)_1.25rem]" : "sm:grid-cols-[minmax(11rem,25fr)_minmax(15rem,38fr)_4.25rem_4.25rem_minmax(13rem,24fr)_1.25rem]"}`
    : `${conSeleccion ? "sm:grid-cols-[1.125rem_minmax(11rem,1fr)_minmax(15rem,1.5fr)_5.5rem_minmax(8rem,0.8fr)_1.25rem]" : "sm:grid-cols-[minmax(11rem,1fr)_minmax(15rem,1.5fr)_5.5rem_minmax(8rem,0.8fr)_1.25rem]"}`;
  const marcadasEnPagina = prendas.filter((p) => p.tallas.every((f) => seleccion.has(f.varianteId))).length;
  const algunaMarcada = prendas.some((p) => p.tallas.some((f) => seleccion.has(f.varianteId)));
  const columnas = [
    ...(conSeleccion
      ? [
          {
            titulo: (
              <Casilla
                marcada={prendas.length > 0 && marcadasEnPagina === prendas.length}
                aMedias={algunaMarcada && marcadasEnPagina !== prendas.length}
                onCambio={() => onAlternarTodas(prendas)}
                etiqueta="Marcar todas las prendas de esta página"
              />
            ),
          },
        ]
      : []),
    { titulo: "Prenda" },
    { titulo: separa ? "Disponibilidad por talla (piso · almacén)" : "Disponibilidad por talla" },
    ...(separa ? [{ titulo: "Piso", alinear: "centro" as const }, { titulo: "Almacén", alinear: "centro" as const }] : [{ titulo: "Disponible", alinear: "centro" as const }]),
    { titulo: separa ? <span className="sm:pl-10">Qué hacer</span> : "" },
    { titulo: "" },
  ];
  return (
    <>
      <Encabezado plantilla={plantilla} columnas={columnas} grande />
      {prendas.map((p) => {
        const marcada = p.tallas.some((f) => seleccion.has(f.varianteId));
        const todasMarcadas = p.tallas.every((f) => seleccion.has(f.varianteId));
        const abierta = abiertaClave === p.clave;
        return (
          <div
            key={p.clave}
            role="button"
            tabIndex={0}
            aria-label={`Abrir ${p.referencia}${p.color ? ` ${p.color}` : ""}`}
            aria-current={abierta || undefined}
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
            className={`grid fila-cayla cursor-pointer gap-x-4 gap-y-2.5 px-5 py-1.5 transition-colors focus-visible:outline-none sm:items-center ${plantilla} ${
              abierta ? "bg-hueso/80" : marcada ? "bg-sand/35" : "hover:bg-sand/25 focus-visible:bg-sand/25"
            }`}
          >
            {/* Celular: tarjeta (casilla + foto + nombre, con piso y almacén a la derecha; debajo la curva y el diagnóstico).
                Escritorio: `sm:contents` devuelve cada pieza a su columna. */}
            <div className="flex min-w-0 items-center gap-3 sm:contents">
              {conSeleccion && (
                <span className="flex items-center">
                  <Casilla
                    // La prenda abierta se ve seleccionada (casilla y fondo), aunque no esté entre las marcadas para la barra de abajo.
                    marcada={todasMarcadas || abierta}
                    aMedias={marcada && !todasMarcadas && !abierta}
                    onCambio={() => onAlternar(p)}
                    etiqueta={`Marcar ${p.referencia}${p.color ? ` ${p.color}` : ""}`}
                  />
                </span>
              )}
              <span className="flex min-w-0 flex-1 items-center gap-3.5">
                <MiniaturaPrenda fotoUrl={p.fotoUrl} colorHex={p.colorHex} tamano="md" {...categoriaDe(p)} />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold leading-snug text-tinta">
                    {p.referencia}
                    {mostrarMarca && p.marca && <span className="font-normal text-taupe"> · {p.marca}</span>}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-taupe">
                    {p.color ? <MuestraColor nombre={p.color} hex={p.colorHex} compacta /> : <span>Sin color</span>}
                    <span className="hidden whitespace-nowrap sm:inline">
                      {p.tallas.length} {p.tallas.length === 1 ? "talla" : "tallas"}
                    </span>
                    {p.danado > 0 && (
                      <Chip tono="rojo" versalitas={false} className="text-xs">
                        <AlertTriangle aria-hidden className="h-3 w-3" strokeWidth={2} />
                        {p.danado} {p.danado === 1 ? "dañada" : "dañadas"}
                      </Chip>
                    )}
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
            <span className="min-w-0 sm:pl-10">
              <QueHacer prenda={p} separa={separa} />
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
