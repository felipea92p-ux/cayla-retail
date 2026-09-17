"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { clave } from "@/lib/buscar-prenda-v2";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { CampoTexto, CampoSelect } from "@/components/ui/campos";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { ReponerPisoModal } from "@/components/ReponerPisoModal";
import { AjustarInventarioModal } from "@/components/AjustarInventarioModal";
import { MuestraColor } from "@/components/ui/MuestraColor";
import { resumenRed } from "@/lib/stock-por-sede";
import { ACCION_ESTADO_STOCK, ETIQUETA_ESTADO_STOCK, UMBRAL_REPOSICION_PISO, type EstadoStock } from "@/lib/inventario-reglas";
import type { FilaExistencias, ResumenExistencias } from "@/lib/inventario-v2";
import type { Sububicacion } from "@/lib/sububicaciones";

// Silueta de perchero — el mismo trazo que ya usa IC.inventario en
// AppShell.tsx — como marcador cuando el producto todavía no tiene foto
// cargada. Nunca un roto de <img>, nunca un cuadro vacío sin explicación.
function SinFoto() {
  return (
    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-tinta/10 bg-sand/50 text-tinta/25">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M4 7l8-4 8 4v10l-8 4-8-4V7zm8 4L4 7m8 4l8-4m-8 4v10" />
      </svg>
    </span>
  );
}

// «Normal» no lleva chip: es la mayoría de las filas y un chip verde en cada
// una sería decoración (brandbook: el semáforo nunca es adorno). Los tres
// estados que piden algo sí se pintan — el ojo va solo a donde hay tarea.
const TONO_ESTADO: Record<Exclude<EstadoStock, "normal">, TonoChip> = {
  reponer_piso: "ambar",
  stock_bajo: "rojo",
  sin_stock: "neutro",
};

const PUNTO_ESTADO: Record<EstadoStock, string> = {
  normal: "bg-verde",
  reponer_piso: "bg-ambar",
  stock_bajo: "bg-rojo",
  sin_stock: "bg-tinta/35",
};

const TODAS = "__todas__";
/** Filtro compuesto: las tres que piden acción, sin elegir cuál. */
const ATENCION = "__atencion__";
const ESTADOS: EstadoStock[] = ["normal", "reponer_piso", "stock_bajo", "sin_stock"];

function fechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" });
}

// Piso de venta / almacén de tienda (Felipe, 2026-09-14): la pantalla no
// asume que toda ubicación separa piso y almacén — se adapta según lo que
// `getSububicaciones` encontró para ESA ubicación (`resumen.separaPisoAlmacen`),
// nunca por el nombre ("Taller" vs. "Tienda X"). Taller sigue viendo una
// tabla más corta: sin piso/almacén ni semáforo, pero con tránsito y red.
//
// Existencias (Felipe, 2026-09-16): tres tarjetas arriba, una fila por prenda
// con su estado, lo que viene en camino y dónde más hay, y la leyenda del
// semáforo abajo. Las acciones viven en la fila: «Reponer» (bajar del
// almacén, modal que ya existía) y «Ajustar» (el modal de ajuste que hasta
// hoy solo se abría desde Productos).
export function InventarioPanel({
  ubicacionId,
  stock,
  resumen,
  enCamino,
  sububicaciones,
  sububicacionPiso,
  sububicacionAlmacen,
}: {
  ubicacionId: string;
  stock: FilaExistencias[];
  resumen: ResumenExistencias;
  enCamino: { traslados: number; proximaLlegada: string | null; atrasados: number };
  sububicaciones: Sububicacion[];
  sububicacionPiso: Sububicacion | null;
  sububicacionAlmacen: Sububicacion | null;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState(TODAS);
  const [talla, setTalla] = useState(TODAS);
  const [color, setColor] = useState(TODAS);
  const [estado, setEstado] = useState(TODAS);
  const [reponiendo, setReponiendo] = useState<FilaExistencias | null>(null);
  const [ajustando, setAjustando] = useState<FilaExistencias | null>(null);

  const categorias = useMemo(
    () => Array.from(new Set(stock.map((f) => f.categoria).filter((c): c is string => !!c))).sort((a, b) => a.localeCompare(b, "es")),
    [stock]
  );
  const tallas = useMemo(() => Array.from(new Set(stock.map((f) => f.talla).filter((t): t is string => !!t))).sort(), [stock]);
  const colores = useMemo(
    () => Array.from(new Set(stock.map((f) => f.color).filter((c): c is string => !!c))).sort((a, b) => a.localeCompare(b, "es")),
    [stock]
  );

  const k = clave(busqueda);
  const filtradas = useMemo(() => {
    return stock.filter((f) => {
      if (k && !clave(f.referencia).includes(k) && !clave(f.sku).includes(k) && !f.codigosBarras.some((c) => clave(c) === k)) {
        return false;
      }
      if (categoria !== TODAS && f.categoria !== categoria) return false;
      if (talla !== TODAS && f.talla !== talla) return false;
      if (color !== TODAS && f.color !== color) return false;
      if (estado === ATENCION) return f.estado !== null && f.estado !== "normal";
      if (estado !== TODAS && f.estado !== estado) return false;
      return true;
    });
  }, [stock, k, categoria, talla, color, estado]);

  const puedeReponer = Boolean(resumen.separaPisoAlmacen && sububicacionPiso && sububicacionAlmacen);
  const separa = resumen.separaPisoAlmacen;
  const pidenAtencion = resumen.porEstado.reponer_piso + resumen.porEstado.stock_bajo;
  const porcentajePiso = resumen.total > 0 && resumen.piso !== null ? Math.round((resumen.piso / resumen.total) * 100) : null;

  // `minmax(13.5rem,1.4fr)`, no `1fr` a secas: con columnas fijas + `truncate`
  // (que habilita min-width automático 0 en la pista), una ventana angosta
  // dejaba "Prenda" en 0px — invisible, no acortado. El piso de 13.5rem es
  // la miniatura (36px) más «Casaca Ximena» y su SKU debajo antes de que la
  // Tabla entre a scroll horizontal (ver `ui/Tabla.tsx`). "En la red" subió
  // a 10.5rem: ahora son dos líneas («Disponible en 3 sedes: 36 uds» y el
  // detalle por sede), no una.
  const plantilla = separa
    ? "sm:grid-cols-[minmax(13.5rem,1.4fr)_7.5rem_5rem_11rem_5.5rem_minmax(10.5rem,1.2fr)_4.5rem]"
    : "sm:grid-cols-[minmax(13.5rem,1.4fr)_5rem_5.5rem_minmax(10.5rem,1.2fr)_4.5rem]";

  return (
    <div className="space-y-6">
      {/* Tres cifras, de la más tranquila a la que más pide (diseño de
          Felipe): cuánto hay, cuántas prendas piden algo, cuánto viene. La
          del medio se puede tocar y filtra la tabla a esas prendas. */}
      <div className={`grid gap-3 ${separa ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <Tarjeta etiqueta="Prendas disponibles" valor={resumen.total} unidad="unidades">
          {separa && porcentajePiso !== null
            ? `${porcentajePiso}% en el piso de venta · ${resumen.piso} piso · ${resumen.almacen} almacén`
            : `${stock.length} ${stock.length === 1 ? "prenda distinta" : "prendas distintas"}`}
        </Tarjeta>
        {separa && (
          <Tarjeta
            etiqueta="Piden atención"
            valor={pidenAtencion}
            unidad={pidenAtencion === 1 ? "prenda" : "prendas"}
            tono={pidenAtencion > 0 ? "text-ambar-profundo" : undefined}
            acento={pidenAtencion > 0}
            onClick={pidenAtencion > 0 ? () => setEstado(estado === ATENCION ? TODAS : ATENCION) : undefined}
            activa={estado === ATENCION}
          >
            {pidenAtencion === 0 && resumen.porEstado.sin_stock === 0
              ? "Nada pendiente: piso cubierto y stock holgado"
              : [
                  resumen.porEstado.reponer_piso > 0 && `${resumen.porEstado.reponer_piso} bajar del almacén`,
                  resumen.porEstado.stock_bajo > 0 && `${resumen.porEstado.stock_bajo} pedir traslado`,
                  resumen.porEstado.sin_stock > 0 && `${resumen.porEstado.sin_stock} sin stock`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </Tarjeta>
        )}
        <Tarjeta etiqueta="En camino hacia acá" valor={resumen.enTransito} unidad="unidades" href="/inventario/traslados">
          {enCamino.traslados === 0
            ? "Ningún traslado en camino"
            : `${enCamino.traslados} ${enCamino.traslados === 1 ? "traslado" : "traslados"}${
                enCamino.proximaLlegada ? ` · el próximo llega ${fechaHora(enCamino.proximaLlegada)}` : ""
              }${enCamino.atrasados > 0 ? ` · ${enCamino.atrasados} ${enCamino.atrasados === 1 ? "atrasado" : "atrasados"}` : ""}`}
        </Tarjeta>
      </div>

      {stock.length > 0 && (
        <div className={`card-cayla grid gap-4 p-5 ${separa ? "sm:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]" : "sm:grid-cols-[1.4fr_1fr_1fr_1fr]"}`}>
          <CampoTexto etiqueta="Buscar" placeholder="Producto, SKU o código de barras" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <CampoSelect
            etiqueta="Categoría"
            valor={categoria}
            onValor={setCategoria}
            marcador="Todas"
            opciones={[{ valor: TODAS, texto: "Todas" }, ...categorias.map((c) => ({ valor: c, texto: c }))]}
          />
          <CampoSelect
            etiqueta="Talla"
            valor={talla}
            onValor={setTalla}
            marcador="Todas"
            opciones={[{ valor: TODAS, texto: "Todas" }, ...tallas.map((t) => ({ valor: t, texto: t }))]}
          />
          <CampoSelect
            etiqueta="Color"
            valor={color}
            onValor={setColor}
            marcador="Todos"
            opciones={[{ valor: TODAS, texto: "Todos" }, ...colores.map((c) => ({ valor: c, texto: c }))]}
          />
          {separa && (
            <CampoSelect
              etiqueta="Estado"
              valor={estado}
              onValor={setEstado}
              marcador="Todos"
              opciones={[
                { valor: TODAS, texto: "Todos" },
                { valor: ATENCION, texto: "Piden atención" },
                ...ESTADOS.map((e) => ({ valor: e, texto: ETIQUETA_ESTADO_STOCK[e] })),
              ]}
            />
          )}
        </div>
      )}

      {stock.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Esta ubicación no tiene stock todavía.</p>
      ) : filtradas.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Ningún producto coincide con la búsqueda.</p>
      ) : (
        <Tabla>
          {/* Toda la tabla centrada (Felipe, 2026-09-15) salvo la prenda, que
              va a la izquierda como en su diseño: dos líneas (nombre, y SKU ·
              talla · color) se leen mal centradas. */}
          <Encabezado
            plantilla={plantilla}
            columnas={
              separa
                ? [
                    { titulo: "Prenda · variante" },
                    { titulo: "Piso · Almacén", alinear: "centro" },
                    { titulo: "Disponible", alinear: "centro" },
                    { titulo: "Estado", alinear: "centro" },
                    { titulo: "En camino", alinear: "centro" },
                    { titulo: "En la red", alinear: "centro" },
                    { titulo: "", alinear: "centro" },
                  ]
                : [
                    { titulo: "Prenda · variante" },
                    { titulo: "Disponible", alinear: "centro" },
                    { titulo: "En camino", alinear: "centro" },
                    { titulo: "En la red", alinear: "centro" },
                    { titulo: "", alinear: "centro" },
                  ]
            }
          />
          {filtradas.map((f) => {
            const red = resumenRed(f.enRed);
            return (
              <div key={f.varianteId} className={fila(plantilla)}>
                {/* `items-start`, no `items-center`: con dos líneas de texto la
                    miniatura se ve mejor alineada arriba, como una etiqueta
                    colgada de la prenda, no flotando a media altura. */}
                <span className="flex min-w-0 items-start gap-2.5">
                  {f.fotoUrl ? (
                    <Image
                      src={f.fotoUrl}
                      alt=""
                      width={36}
                      height={36}
                      unoptimized
                      className="h-9 w-9 shrink-0 rounded-md border border-tinta/10 object-cover"
                    />
                  ) : (
                    <SinFoto />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-tinta" title={f.referencia}>
                      {f.referencia}
                    </span>
                    {/* `overflow-visible`: la pastilla con el nombre del color flota
                        fuera de la celda al pasar el mouse. */}
                    <span className="flex items-center gap-1.5 overflow-visible text-xs text-tinta/65">
                      <span className="font-mono">{f.sku}</span>
                      {f.talla && <span>· {f.talla}</span>}
                      <span>·</span>
                      <MuestraColor nombre={f.color} hex={f.colorHex} />
                    </span>
                  </span>
                </span>
                {separa && (
                  <span className={celda("centro", "text-sm tabular-nums")}>
                    <span className="label-cayla mr-1 text-[10px] text-tinta/45 sm:hidden">Piso · Almacén</span>
                    <span className={f.piso !== null && f.piso <= UMBRAL_REPOSICION_PISO ? "text-ambar-profundo" : "text-tinta"}>{f.piso}</span>
                    <span className="text-tinta/45"> · </span>
                    <span className="text-tinta">{f.almacen}</span>
                  </span>
                )}
                <span className={celda("centro", "text-sm font-semibold tabular-nums text-tinta")}>
                  <span className="label-cayla mr-1 text-[10px] font-normal text-tinta/45 sm:hidden">Disponible</span>
                  {f.total}
                </span>
                {separa && (
                  <span className={celda("centro", "overflow-visible")}>
                    <span className="inline-flex items-center justify-center gap-2">
                      {f.estado === "normal" || f.estado === null ? (
                        <span className="label-cayla text-[10px] text-tinta/45" title={ACCION_ESTADO_STOCK.normal}>
                          Normal
                        </span>
                      ) : (
                        <Chip tono={TONO_ESTADO[f.estado]}>
                          <span title={ACCION_ESTADO_STOCK[f.estado]}>{ETIQUETA_ESTADO_STOCK[f.estado]}</span>
                        </Chip>
                      )}
                      {/* Solo en el estado «Reponer piso»: es la única situación en
                          que bajar del almacén es la acción correcta (diseño de
                          Felipe, 2026-09-16) — en «Stock bajo» bajaría lo poco que
                          queda de reserva sin arreglar el problema real. */}
                      {puedeReponer && f.estado === "reponer_piso" && (
                        <button
                          type="button"
                          onClick={() => setReponiendo(f)}
                          className="label-cayla text-[10px] text-rojo underline underline-offset-2 hover:no-underline"
                        >
                          Reponer
                        </button>
                      )}
                    </span>
                  </span>
                )}
                <span className={celda("centro", `text-sm tabular-nums ${f.enTransito > 0 ? "text-verde-profundo" : "text-tinta/35"}`)}>
                  <span className="label-cayla mr-1 text-[10px] font-normal text-tinta/45 sm:hidden">En camino</span>
                  {f.enTransito > 0 ? `+${f.enTransito}` : "—"}
                </span>
                <span className={celda("centro", "text-xs")} title={red?.detalle}>
                  <span className="label-cayla mr-1 text-[10px] font-normal text-tinta/45 sm:hidden">En la red</span>
                  {red ? (
                    <>
                      <span className="block text-tinta">
                        Disponible en {red.sedes} {red.sedes === 1 ? "sede" : "sedes"}: {red.total} {red.total === 1 ? "ud" : "uds"}
                      </span>
                      <span className="block truncate text-tinta/55">{red.detalle}</span>
                    </>
                  ) : (
                    <span className="text-tinta/35">—</span>
                  )}
                </span>
                <span className={celda("centro")}>
                  <button
                    type="button"
                    onClick={() => setAjustando(f)}
                    className="label-cayla text-[10px] text-tinta/55 underline-offset-2 hover:text-rojo hover:underline"
                  >
                    Ajustar
                  </button>
                </span>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-xs text-tinta/55">
            <span>
              Mostrando {filtradas.length} de {stock.length} {stock.length === 1 ? "prenda" : "prendas"}
            </span>
            {separa && (
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {ESTADOS.map((e) => (
                  <span key={e} className="inline-flex items-center gap-1.5" title={ACCION_ESTADO_STOCK[e]}>
                    <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${PUNTO_ESTADO[e]}`} />
                    <span className="text-tinta/75">{ETIQUETA_ESTADO_STOCK[e]}</span>
                    <span className="hidden text-tinta/45 lg:inline">· {ACCION_ESTADO_STOCK[e]}</span>
                  </span>
                ))}
              </span>
            )}
          </div>
        </Tabla>
      )}

      {reponiendo && sububicacionPiso && sububicacionAlmacen && (
        <ReponerPisoModal
          fila={reponiendo}
          ubicacionId={ubicacionId}
          sububicacionPisoId={sububicacionPiso.id}
          sububicacionAlmacenId={sububicacionAlmacen.id}
          onClose={() => setReponiendo(null)}
        />
      )}

      {ajustando && (
        <AjustarInventarioModal
          productoId={ajustando.productoId}
          ubicacionId={ubicacionId}
          sububicaciones={sububicaciones}
          onClose={() => setAjustando(null)}
        />
      )}
    </div>
  );
}

function Tarjeta({
  etiqueta,
  valor,
  unidad,
  tono,
  acento = false,
  activa = false,
  href,
  onClick,
  children,
}: {
  etiqueta: string;
  valor: number;
  unidad: string;
  tono?: string;
  /** Borde izquierdo en rojo: la tarjeta que pide algo (diseño de Felipe). */
  acento?: boolean;
  activa?: boolean;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const clase = `card-cayla block p-5 text-left transition-colors ${acento ? "border-l-2 border-l-rojo" : ""} ${
    onClick || href ? "hover:bg-sand/30" : ""
  } ${activa ? "bg-sand/40" : ""}`;
  const contenido = (
    <>
      <p className="label-cayla text-[11px] text-tinta/65">{etiqueta}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className={`font-display text-3xl tabular-nums ${tono ?? "text-tinta"}`}>{valor.toLocaleString("es-PE")}</span>
        <span className="text-sm text-tinta/55">{unidad}</span>
      </p>
      <p className="mt-1 text-xs text-tinta/65">{children}</p>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={clase}>
        {contenido}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${clase} w-full`} aria-pressed={activa}>
        {contenido}
      </button>
    );
  }
  return <div className={clase}>{contenido}</div>;
}
