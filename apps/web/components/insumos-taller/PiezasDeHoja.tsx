"use client";

import type { CSSProperties, ReactNode } from "react";
import { X } from "lucide-react";
import { Ayuda } from "@/components/Ayuda";
import { Punto } from "@/components/alta-producto/Punto";
import { CampoTexto } from "@/components/ui/campos";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import type { ColorAlta } from "@/lib/alta-producto";
import { columnasDeColores } from "@/lib/insumos-hojas";
import { montoIlegible } from "@/lib/monto-plata-reglas";
import { numeroMalEscrito, type FilaDeColor } from "@/lib/tela-nueva-reglas";

// Las piezas que comparten las hojas de Insumos desde «Producción más clara» (Felipe 2026-11-26; maqueta docs/maquetas/produccion-resumen-2026-11/): el título de cada paso con su «?»,
// la unidad dentro de la caja («30 m») y la tabla de colores de «Nueva tela» y «Nuevo avío». Solo cambian cómo se ve y con qué palabras: lo que se escribe, se valida y se guarda es lo de siempre.

/** El título de un paso de la hoja: su número, su nombre y, detrás del «?», lo que antes era una nota larga a la vista. Sin `paso` (una hoja de un solo bloque, como «Agregar colores») no lleva número. */
export function TituloDePaso({
  paso,
  cuenta,
  ayuda,
  nombre,
  children,
}: {
  paso?: number;
  cuenta?: number;
  ayuda?: ReactNode;
  /** El nombre del paso para el globo del «?», si el título no es solo texto (lleva la marca de la guía de foco). */
  nombre?: string;
  children: ReactNode;
}) {
  return (
    <TituloGrupo paso={paso} cuenta={cuenta}>
      {children}
      {ayuda && <Ayuda titulo={nombre ?? (typeof children === "string" ? children : undefined)}>{ayuda}</Ayuda>}
    </TituloGrupo>
  );
}

/** La unidad de lo que se escribe, dentro de la caja y a la derecha («30 m», «3 %»): el título del campo queda con palabras y sin paréntesis (vidrio/insumos.css). */
export function ConUnidad({ unidad, children }: { unidad: string; children: ReactNode }) {
  return (
    <div className="insumo-con-unidad" style={{ ["--unidad" as string]: JSON.stringify(unidad) } as CSSProperties}>
      {children}
    </div>
  );
}

/** Lo que comparten el encabezado y cada fila. Sin `grid`: el encabezado lo pide solo cuando la tabla es ancha (angosta va escondido), y cada fila lo trae siempre. */
const FILA = "items-center gap-x-3 gap-y-2 px-4 py-2.5";
const CELDA = "min-w-0";
/** El nombre del campo sobre su caja cuando la tabla va apilada (hoja angosta): ahí el encabezado no se ve. */
export const ROTULO_APILADO = "mb-1 block text-xs text-tenue @min-[36rem]:hidden";

/**
 * La tabla de colores de «Nueva tela» y «Nuevo avío»: una fila por color con lo que ya hay, lo que costó y desde cuánto avisar.
 * Ancha, es una tabla con su encabezado; angosta (el celular), cada color se apila: su nombre arriba y sus campos debajo, cada uno con su nombre.
 * El código de cada color ya no se muestra: lo arma la base al guardar.
 */
export function TablaDeColores({
  filas,
  porCodigo,
  puedeSaldo,
  unidadYa,
  unidadMinimo,
  rotuloCosto,
  metrosDe,
  onCambiar,
  onQuitar,
}: {
  filas: readonly FilaDeColor[];
  porCodigo: ReadonlyMap<string, ColorAlta>;
  /** Quien guarda es el líder: anota lo que ya hay de cada color y su costo. */
  puedeSaldo: boolean;
  /** En qué se escribe «Ya tengo»: «m», «kg», «rollos», «unid.». */
  unidadYa: string;
  /** En qué se escribe «Avísame si baja de». */
  unidadMinimo: string;
  /** «Me costó el metro», «Me costó cada uno». */
  rotuloCosto: string;
  /** Solo en una tela que se compra por kilo o por rollo: los metros que son lo escrito (`null` si falta un dato para pasarlo). */
  metrosDe?: (f: FilaDeColor) => number | null;
  onCambiar: (color: string, cambio: Partial<FilaDeColor>) => void;
  onQuitar: (color: string) => void;
}) {
  const conMetros = puedeSaldo && metrosDe !== undefined;
  const tabla = columnasDeColores({ puedeSaldo, conMetros });
  const estilo = { ["--cols" as string]: tabla.plantilla, ["--campos" as string]: Math.min(3, tabla.campos) } as CSSProperties;
  return (
    <div className="@container">
      <div className="overflow-hidden rounded-xl border border-sand" style={estilo}>
        <div className={`${FILA} hidden vd-placa text-xs font-semibold uppercase tracking-[0.1em] text-secundario @min-[36rem]:grid @min-[36rem]:grid-cols-[var(--cols)]`}>
          <span>Color</span>
          {puedeSaldo && <span>Ya tengo</span>}
          {conMetros && <span>Son en metros</span>}
          {puedeSaldo && <span>{rotuloCosto}</span>}
          <span>Avísame si baja de</span>
          <span />
        </div>
        {filas.map((f, k) => {
          const c = porCodigo.get(f.color);
          const nombreColor = c?.nombre ?? f.color;
          const metros = metrosDe ? metrosDe(f) : null;
          return (
            <div key={f.color} className={`${FILA} grid grid-cols-[minmax(0,1fr)_2rem] @min-[36rem]:grid-cols-[var(--cols)] ${k > 0 ? "border-t border-sand" : "@min-[36rem]:border-t @min-[36rem]:border-sand"}`}>
              <span className="order-1 flex min-w-0 items-center gap-2.5 text-sm font-semibold text-tinta @min-[36rem]:order-none">
                <Punto hex={c?.hex ?? null} familia={c?.familiaColor} tipo={c?.tipo} grande />
                <span className="truncate">{nombreColor}</span>
              </span>
              <div className="order-3 col-span-2 grid grid-cols-[repeat(var(--campos),minmax(0,1fr))] items-end gap-2 @min-[36rem]:order-none @min-[36rem]:contents">
                {puedeSaldo && (
                  <div className={CELDA}>
                    <span aria-hidden className={ROTULO_APILADO}>
                      Ya tengo
                    </span>
                    <ConUnidad unidad={unidadYa}>
                      <CampoTexto caja sinPie etiqueta={`Cuánto tengo ya de ${nombreColor}, en ${unidadYa}`} inputMode="decimal" className="tabular-nums" placeholder="0" value={f.ya} onChange={(ev) => onCambiar(f.color, { ya: ev.target.value })} tono={numeroMalEscrito(f.ya) ? "error" : undefined} />
                    </ConUnidad>
                  </div>
                )}
                {conMetros && (
                  <div className={`${CELDA} text-detalle tabular-nums text-secundario`}>
                    <span aria-hidden className={ROTULO_APILADO}>
                      Son en metros
                    </span>
                    <span className="flex min-h-10 items-center">{metros === null ? <span className="text-tenue">Sin dato</span> : `${metros.toLocaleString("es-PE", { maximumFractionDigits: 1 })} m`}</span>
                  </div>
                )}
                {puedeSaldo && (
                  <div className={CELDA}>
                    <span aria-hidden className={ROTULO_APILADO}>
                      {rotuloCosto}
                    </span>
                    <CampoTexto caja sinPie antes="S/" etiqueta={`${rotuloCosto}, ${nombreColor}`} inputMode="decimal" className="tabular-nums" placeholder="0.00" value={f.costo} onChange={(ev) => onCambiar(f.color, { costo: ev.target.value })} tono={montoIlegible(f.costo) ? "error" : undefined} />
                  </div>
                )}
                <div className={CELDA}>
                  <span aria-hidden className={ROTULO_APILADO}>
                    Avísame si baja de
                  </span>
                  <ConUnidad unidad={unidadMinimo}>
                    <CampoTexto caja sinPie etiqueta={`Avísame si ${nombreColor} baja de, en ${unidadMinimo}`} inputMode="decimal" className="tabular-nums" value={f.minimo} onChange={(ev) => onCambiar(f.color, { minimo: ev.target.value })} tono={numeroMalEscrito(f.minimo) ? "error" : undefined} />
                  </ConUnidad>
                </div>
              </div>
              <button type="button" onClick={() => onQuitar(f.color)} aria-label={`Quitar ${nombreColor}`} title={`Quitar ${nombreColor}`} className="icono-fila order-2 grid h-8 w-8 place-items-center justify-self-end @min-[36rem]:order-none">
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
