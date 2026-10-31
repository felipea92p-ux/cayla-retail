"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { FunnelX } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { Buscador } from "@/components/ui/Buscador";
import { Paginas } from "@/components/ui/Paginas";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { Vacio } from "@/components/ui/Vacio";
import { Tabla, Encabezado, fila, celda, type OrdenTabla } from "@/components/ui/Tabla";
import { soles } from "@/lib/compras-reglas";
import { fechaCorta, solesRedondo, type UbicacionGastos } from "@/lib/gastos-reglas";
import { paginar } from "@/lib/paginacion";
import { colorDeGrupo } from "@/lib/dinero-telar-reglas";
import type { SedeTelar } from "@/lib/finanzas-telar-reglas";
import {
  TEXTO_NATURALEZA,
  TONO_NATURALEZA,
  TRAMOS,
  diasHasta,
  puedePagar,
  textoUnidad,
  textoVence,
  tramoDe,
  totalPorPagar,
  type ClaveTramo,
  type FilaPorPagar,
  type NaturalezaDeuda,
} from "@/lib/por-pagar-consolidado-reglas";
import { TAMANOS_PAGINA, filtrarDeudas, filtrarPorUnidad, ordenarDeudas, ORDEN_DEUDA_INICIAL, type CampoOrdenDeuda, type OrdenDeuda, type TamanoPagina } from "@/lib/que-debes-reglas";

// Finanzas ▸ Cuentas y dinero ▸ Qué debes: la ventana «Todo lo que CAYLA debe» (Felipe 2026-10-31). La pantalla muestra solo lo que
// vence primero; aquí está todo, con búsqueda, filtros por vencimiento, tipo y sede, orden por columna y páginas de 30 o 40 (como el
// historial de «Dónde está»). Solo lee: «Pagar» abre el pago de siempre (`?pagar=`), y la ventana se cierra para que no queden dos hojas.

const PLANTILLA = "sm:grid-cols-[6.5rem_minmax(0,1.7fr)_9rem_9rem_6.5rem_6.5rem_7rem_4.5rem]";
/** Una fila de filtros con su título («Vence», «Tipo», «Sede») a la izquierda. */
function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="label-cayla w-16 shrink-0">{titulo}</span>
      {children}
    </div>
  );
}
const plural = (n: number) => `${n} ${n === 1 ? "factura" : "facturas"}`;

export function PorPagarTodas({
  filas,
  unidades,
  sedes,
  esLider,
  pagaCompras,
  hoy,
  qInicial = "",
  tramoInicial = null,
  hrefPagar,
  onCerrar,
}: {
  filas: FilaPorPagar[];
  unidades: UbicacionGastos[];
  sedes: SedeTelar[];
  esLider: boolean;
  pagaCompras: boolean;
  hoy: string;
  qInicial?: string;
  tramoInicial?: ClaveTramo | null;
  hrefPagar: (id: string) => string;
  onCerrar: () => void;
}) {
  const [q, setQ] = useState(qInicial);
  const [tramo, setTramo] = useState<ClaveTramo | null>(tramoInicial);
  const [tipo, setTipo] = useState<NaturalezaDeuda | null>(null);
  const [unidad, setUnidad] = useState("todas");
  const [orden, setOrden] = useState<OrdenDeuda>(ORDEN_DEUDA_INICIAL);
  const [tamano, setTamano] = useState<TamanoPagina>(30);
  const [pagina, setPagina] = useState(1);
  const cuenta = { esLider, pagaCompras };

  const vistas = useMemo(
    () => ordenarDeudas(filtrarPorUnidad(filtrarDeudas(filas, { tramo, tipo, q: q.trim() }, hoy), unidad), orden),
    [filas, tramo, tipo, q, unidad, orden, hoy],
  );
  const pag = paginar(vistas, pagina, tamano);
  const total = totalPorPagar(vistas);
  const hayPagables = vistas.some((x) => puedePagar(x, cuenta));
  const tipos = (Object.keys(TEXTO_NATURALEZA) as NaturalezaDeuda[]).filter((t) => filas.some((x) => x.naturaleza === t));
  const unidadesConFacturas = [...unidades.filter((u) => filas.some((x) => x.ubicacionId === u.id)).map((u) => ({ clave: u.id, texto: u.nombre.replace(/^Tienda\s+/i, "") })), ...(filas.some((x) => x.ubicacionId === null) ? [{ clave: "empresa", texto: "De la empresa" }] : [])];

  const poner = <T,>(f: (v: T) => void) => (v: T) => {
    f(v);
    setPagina(1);
  };
  const ordenarPor = (campo: string) => {
    setOrden((o) => (o.campo === campo ? { campo: o.campo, dir: o.dir === "asc" ? "desc" : "asc" } : { campo: campo as CampoOrdenDeuda, dir: campo === "total" || campo === "pagado" || campo === "saldo" ? "desc" : "asc" }));
    setPagina(1);
  };
  const ordenTabla: OrdenTabla = { campo: orden.campo, dir: orden.dir };
  const limpiar = () => {
    setQ("");
    setTramo(null);
    setTipo(null);
    setUnidad("todas");
    setPagina(1);
  };
  const conFiltros = q.trim() !== "" || tramo !== null || tipo !== null || unidad !== "todas";

  return (
    <Modal
      titulo="Todo lo que CAYLA debe"
      subtitulo="Mercadería, gastos, activos e insumos del Taller en una sola lista. Lo pagado y lo anulado no aparecen."
      onClose={onCerrar}
      conCerrar
      ancho="max-w-[80rem]" /* unificar-fijo: la ventana de todas las deudas es de diseño propio, con tabla de 8 columnas, filtros y páginas (Felipe 2026-10-31) */
    >
      <div className="space-y-4" data-sin-cascada>
        <div className="space-y-3">
          <div className="max-w-md">
            <Buscador valor={q} onCambio={poner(setQ)} etiqueta="Buscar un proveedor o una factura" placeholder="Busca un proveedor o una factura" /* sugerir-fijo: dice qué se busca, no un ejemplo que dependa de lo elegido */ />
          </div>
          <Grupo titulo="Vence">
            <button type="button" className="pildora-cayla" aria-pressed={tramo === null} onClick={() => poner(setTramo)(null)}>
              Todas<span className="pildora-cayla__n">{filas.length}</span>
            </button>
            {TRAMOS.map((t) => (
              <button key={t.clave} type="button" className="pildora-cayla" aria-pressed={tramo === t.clave} onClick={() => poner(setTramo)(tramo === t.clave ? null : t.clave)}>
                {t.etiqueta}
                <span className="pildora-cayla__n">{filas.filter((x) => tramoDe(x, hoy) === t.clave).length}</span>
              </button>
            ))}
          </Grupo>
          {tipos.length > 1 && (
            <Grupo titulo="Tipo">
              {tipos.map((t) => (
                <button key={t} type="button" className="pildora-cayla" aria-pressed={tipo === t} onClick={() => poner(setTipo)(tipo === t ? null : t)}>
                  {TEXTO_NATURALEZA[t]}
                  <span className="pildora-cayla__n">{filas.filter((x) => x.naturaleza === t).length}</span>
                </button>
              ))}
            </Grupo>
          )}
          {unidadesConFacturas.length > 1 && (
            <Grupo titulo="Sede">
              {unidadesConFacturas.map((u) => (
                <button key={u.clave} type="button" className="pildora-cayla" aria-pressed={unidad === u.clave} onClick={() => poner(setUnidad)(unidad === u.clave ? "todas" : u.clave)}>
                  {u.texto}
                  <span className="pildora-cayla__n">{filtrarPorUnidad(filas, u.clave).length}</span>
                </button>
              ))}
            </Grupo>
          )}
        </div>

        {vistas.length === 0 ? (
          <Vacio icono={<FunnelX />} titulo="Nada coincide con estos filtros" acciones={conFiltros ? <button type="button" className="btn-cayla btn-enlace" onClick={limpiar}>Limpiar filtros</button> : undefined}>
            Quita un filtro para ver más.
          </Vacio>
        ) : (
          <Tabla className="@container">
            <Encabezado
              plantilla={PLANTILLA}
              orden={ordenTabla}
              onOrden={ordenarPor}
              columnas={[
                { titulo: "Vence", campo: "vence" },
                { titulo: "Proveedor · factura", campo: "proveedor" },
                { titulo: "Tipo", campo: "tipo" },
                { titulo: "Sede", campo: "sede" },
                { titulo: "Total", campo: "total", alinear: "der" },
                { titulo: "Pagado", campo: "pagado", alinear: "der" },
                { titulo: "Saldo", campo: "saldo", alinear: "der" },
                { titulo: hayPagables ? <span className="sr-only">Pagar</span> : "" },
              ]}
            />
            {pag.filas.map((x) => {
              const vencida = diasHasta(x.vence, hoy) < 0;
              return (
                <div key={`${x.origen}-${x.id}`} className={fila(PLANTILLA, "sm:items-center")}>
                  <span className={celda("izq", "whitespace-nowrap")}>
                    {fechaCorta(x.vence)}
                    <small className={`block text-xs ${vencida ? "text-rojo-profundo" : "text-tinta/65"}`}>{textoVence(x, hoy)}</small>
                  </span>
                  <span className={celda("izq", "!whitespace-normal")}>
                    <b className="block font-semibold text-tinta">{x.proveedor}</b>
                    <small className="block text-xs text-tinta/65">{x.concepto ? `${x.documento} · ${x.concepto}` : x.documento}</small>
                  </span>
                  <span className={celda()}>
                    <Chip versalitas={false} tono={TONO_NATURALEZA[x.naturaleza]}>
                      {TEXTO_NATURALEZA[x.naturaleza]}
                    </Chip>
                  </span>
                  <span className={celda()}>
                    <span className="din-sede-chip" style={{ ["--c" as string]: colorDeGrupo(x.ubicacionId, sedes) } as CSSProperties}>
                      <i aria-hidden="true" />
                      {textoUnidad(x)}
                    </span>
                  </span>
                  <span className={celda("der")}>{soles(x.total)}</span>
                  <span className={celda("der")}>{soles(x.pagado)}</span>
                  <span className={celda("der", vencida ? "text-rojo-profundo" : "")}>
                    <b>{soles(x.saldo)}</b>
                  </span>
                  <span className={celda("der")}>
                    {puedePagar(x, cuenta) && (
                      <Link href={hrefPagar(x.id)} scroll={false} onClick={onCerrar} className="btn-cayla btn-secundario btn-chico" aria-label={`Pagar ${x.proveedor} ${x.documento}`}>
                        Pagar
                      </Link>
                    )}
                  </span>
                </div>
              );
            })}
          </Tabla>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[12.5px] text-tinta/70">
          <span className="flex flex-wrap items-center gap-3 tabular-nums">
            {pag.desde}–{pag.hasta} de {plural(total.n)} · {solesRedondo(total.saldo)} por pagar
            <SegmentoDeslizante
              etiqueta="Cuántas por página"
              valor={String(tamano)}
              onCambio={(c) => {
                setTamano(Number(c) as TamanoPagina);
                setPagina(1);
              }}
              opciones={TAMANOS_PAGINA.map((n) => ({ clave: String(n), etiqueta: String(n) }))}
            />
            por página
          </span>
          <Paginas pagina={pag.pagina} totalPaginas={pag.totalPaginas} onPagina={setPagina} />
        </div>
      </div>
    </Modal>
  );
}
