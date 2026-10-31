"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, CircleCheck } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { Globito } from "@/components/ui/Globito";
import { Pestanas } from "@/components/ui/Pestanas";
import { Tabla, Encabezado, fila, celda, type OrdenTabla } from "@/components/ui/Tabla";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";
import { useAbrirMovimiento } from "@/components/finanzas/CuentasDinero";
import { EVENTO_ABRIR_CAMPANA } from "@/components/finanzas/dinero/PanoramaDinero";
import { PieDePaginas } from "@/components/finanzas/dinero/PieDePaginas";
import { SalidasPlanillaModal } from "@/components/finanzas/dinero/SalidasPlanillaModal";
import { montoConSigno } from "@/lib/dinero-telar-reglas";
import { soles } from "@/lib/compras-reglas";
import type { AvisoPlanilla } from "@/lib/planilla-salidas-reglas";
import type { CuentaDinero } from "@/lib/cuentas-dinero-reglas";
import {
  filtrosDeCierres,
  filtrosDeEstado,
  FILTROS_ESTADO,
  ordenarEstados,
  ORDEN_ESTADO_INICIAL,
  paginar,
  pasaCierre,
  TEXTO_ETAPA,
  type CampoOrdenEstado,
  type FilaCierre,
  type FilaEstado,
  type FiltroEstado,
  type OrdenEstado,
  type PorRegistrar,
  type TamanoPagina,
} from "@/lib/dinero-estados-reglas";

// Cuentas y dinero ▸ Dónde está: la campana de la cabecera y su ventana «Estado de las cuentas» (Felipe 2026-10-31). La composición es la de la
// maqueta aprobada (docs/maquetas/finanzas-dinero-rediseno-2026-10/): pestañas con su número, píldoras de filtro con su cuenta, la tabla y el pie
// con las páginas; cada pieza es la del sistema (ADR-0358): `Pestanas`, `pildora-cayla`, `Tabla`, `Paginas`. Tres vistas de lo que pide mirada: las cuentas con su estado, los cierres con
// diferencia y lo que falta registrar. Cada acción abre la hoja que ya existía («Registrar movimiento», las salidas de planilla) o lleva a
// «Cuadrar con el banco». Estilos: `app/estilos/finanzas-dinero.css`. Sin reglas nuevas: `lib/dinero-estados-reglas.ts`.

type Vista = "cuentas" | "cierres" | "pendientes";
const PLANTILLA = "sm:grid-cols-[minmax(0,1.7fr)_9rem_11rem_13rem_8rem]";
const PLANTILLA_CIERRES = "sm:grid-cols-[10rem_minmax(0,1fr)_9rem_10rem_minmax(0,1fr)]";

export function CampanaDinero({
  filas,
  cierres,
  pendientes,
  planilla,
  cuentas,
  contador,
  esLider,
}: {
  filas: FilaEstado[];
  cierres: FilaCierre[];
  pendientes: PorRegistrar[];
  planilla: AvisoPlanilla[];
  cuentas: CuentaDinero[];
  contador: number;
  esLider: boolean;
}) {
  const abrirMovimiento = useAbrirMovimiento();
  const [abierta, setAbierta] = useState(false);
  const [vista, setVista] = useState<Vista>("cuentas");
  const [filtro, setFiltro] = useState<FiltroEstado>("todas");
  const [filtroCierre, setFiltroCierre] = useState("todos");
  const [orden, setOrden] = useState<OrdenEstado>(ORDEN_ESTADO_INICIAL);
  const [tamano, setTamano] = useState<TamanoPagina>(30);
  const [pagina, setPagina] = useState(1);
  const [filaAbierta, setFilaAbierta] = useState<string | null>(null);
  const [salidasDe, setSalidasDe] = useState<AvisoPlanilla | null>(null);

  // Un aviso de «Pide tu atención» abre esta ventana en la vista que le toca (los cierres, lo que falta registrar).
  useEffect(() => {
    const abrir = (e: Event) => {
      setVista((e as CustomEvent<Vista>).detail);
      setPagina(1);
      setAbierta(true);
    };
    window.addEventListener(EVENTO_ABRIR_CAMPANA, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_CAMPANA, abrir);
  }, []);

  const hayQueVer = filas.length > 0 || cierres.length > 0 || pendientes.length > 0;
  if (!hayQueVer) return null;

  const filtros = filtrosDeEstado(filas);
  const pasa = FILTROS_ESTADO.find((f) => f.clave === filtro)?.pasa ?? (() => true);
  const visibles = ordenarEstados(filas.filter(pasa), orden);
  const pag = paginar(visibles, pagina, tamano);

  const cierresVis = cierres.filter((c) => pasaCierre(c, filtroCierre));
  const pagCierres = paginar(cierresVis, pagina, tamano);
  const faltaron = cierres.filter((c) => c.diferencia < 0).length;
  const neto = cierresVis.reduce((a, c) => a + c.diferencia, 0);

  const vistas: { clave: Vista; etiqueta: string; conteo: number }[] = [
    { clave: "cuentas", etiqueta: "Cuentas", conteo: filas.filter((f) => f.pide !== null).length },
    { clave: "cierres", etiqueta: "Cierres con diferencia", conteo: faltaron },
    { clave: "pendientes", etiqueta: "Por registrar", conteo: pendientes.length },
  ];

  const cambiarVista = (v: Vista) => {
    setVista(v);
    setPagina(1);
    setFilaAbierta(null);
  };
  const ordenarPor = (campo: CampoOrdenEstado) => {
    setOrden((o) => (o.campo === campo ? { campo, dir: o.dir === "asc" ? "desc" : "asc" } : { campo, dir: campo === "saldo" ? "desc" : "asc" }));
    setPagina(1);
  };

  const ordenTabla: OrdenTabla = { campo: orden.campo, dir: orden.dir };

  const etiquetaBoton = contador > 0 ? `Estado de las cuentas: ${contador} ${contador === 1 ? "pide" : "piden"} atención` : "Estado de las cuentas: todo en orden";

  return (
    <>
      <button type="button" className="campana-dinero" onClick={() => setAbierta(true)} aria-haspopup="dialog" aria-label={etiquetaBoton} title={etiquetaBoton} data-guia="fin-dinero.campana">
        <Bell aria-hidden className="h-5 w-5" />
        <Globito n={contador} pide esquina className="absolute -right-1 -top-1" />
      </button>

      {abierta && (
        <Modal
          titulo="Estado de las cuentas"
          subtitulo={contador > 0 ? `${contador} ${contador === 1 ? "cosa pide" : "cosas piden"} tu atención. Toca una fila para ver qué hacer.` : "Todo en orden: ninguna cuenta ni cierre pide revisión."}
          onClose={() => setAbierta(false)}
          conCerrar
          ancho="max-w-[80rem]" /* unificar-fijo: la ventana del estado de las cuentas es de diseño propio, con tabla de 5 columnas, filtros y páginas (Felipe 2026-10-31) */
        >
          <div data-sin-cascada>
            {/* Las tres pestañas se ven siempre (con 0 si no hay nada): una que aparece y desaparece según el día desorienta. */}
            <Pestanas
                etiquetaAccesible="Qué mirar"
                idIndicador="campana-dinero"
                activa={vista}
                onCambio={(c) => cambiarVista(c as Vista)}
                className="mb-4"
                items={vistas.map((v) => ({ clave: v.clave, etiqueta: v.etiqueta, conteo: v.conteo, pide: "piden atención" }))}
              />

            {vista === "cuentas" && (
              <>
                <div className="dp-filtros" role="group" aria-label="Filtrar por estado">
                  {filtros.map((f) => (
                    <button
                      key={f.clave}
                      type="button"
                      className="pildora-cayla"
                      aria-pressed={filtro === f.clave}
                      data-vacio={f.n === 0 && f.clave !== "todas" ? "" : undefined}
                      title={f.n === 0 && f.clave !== "todas" ? "Hoy no hay cuentas en este estado" : undefined}
                      onClick={() => {
                        setFiltro(f.clave);
                        setPagina(1);
                        setFilaAbierta(null);
                      }}
                    >
                      {f.texto}
                      {f.clave !== "todas" && <Globito n={f.n} etiqueta="cuentas" />}
                    </button>
                  ))}
                </div>
                <div className="mt-4">
                  {visibles.length === 0 ? (
                    <Vacio tamano="chico" icono={<CircleCheck />}>
                      Ninguna cuenta está en ese estado.
                    </Vacio>
                  ) : (
                    <Tabla className="@container">
                      <Encabezado
                        plantilla={PLANTILLA}
                        orden={ordenTabla}
                        onOrden={(c) => ordenarPor(c as CampoOrdenEstado)}
                        columnas={[
                          { titulo: "Cuenta", campo: "cuenta" },
                          { titulo: "Sede", campo: "sede" },
                          { titulo: "Etapa", campo: "etapa" },
                          { titulo: "Estado", campo: "estado" },
                          { titulo: "Saldo", campo: "saldo", alinear: "der" },
                        ]}
                      />
                      {pag.visibles.map((f) => (
                        <div key={f.id}>
                          <button type="button" className={fila(PLANTILLA, "w-full text-left")} aria-expanded={filaAbierta === f.id} onClick={() => setFilaAbierta(filaAbierta === f.id ? null : f.id)}>
                            <span className={celda("izq", "!whitespace-normal")}>
                              <b className="block font-semibold text-tinta">{f.nombre}</b>
                              {f.detalle && <small className="block text-xs text-tinta/65">{f.detalle}</small>}
                            </span>
                            <span className={celda()}>{f.sinSede ? <span className="dp-sin-sede">sin sede</span> : f.sede}</span>
                            <span className={celda()}>{TEXTO_ETAPA[f.etapa]}</span>
                            <span className={celda()}>{f.estado ? <Chip tono={f.estado.tono}>{f.estado.texto}</Chip> : <span className="text-tinta/45">—</span>}</span>
                            <span className={celda("der", f.saldo !== null && Math.round(f.saldo) < 0 ? "text-rojo-profundo" : "")}>{f.saldo === null ? "—" : montoConSigno(f.saldo)}</span>
                          </button>
                          {filaAbierta === f.id && <DetalleDeCuenta f={f} abrirMovimiento={abrirMovimiento} onCerrar={() => setAbierta(false)} />}
                        </div>
                      ))}
                    </Tabla>
                  )}
                </div>
                <PieDePaginas
                  texto={`${pag.desde}–${pag.hasta} de ${pag.total} cuentas · suman ${soles(visibles.reduce((a, f) => a + (f.saldo ?? 0), 0))}`}
                  tamano={tamano}
                  onTamano={(t) => {
                    setTamano(t);
                    setPagina(1);
                  }}
                  pagina={pag.pagina}
                  totalPaginas={pag.totalPaginas}
                  onPagina={setPagina}
                />
              </>
            )}

            {vista === "cierres" && cierres.length === 0 && (
              <Vacio tamano="chico" icono={<CircleCheck />}>
                Ningún cierre de caja cerró con diferencia.
              </Vacio>
            )}
            {vista === "cierres" && cierres.length > 0 && (
              <>
                <div className="dp-filtros" role="group" aria-label="Filtrar cierres">
                  {filtrosDeCierres(
                    cierres,
                    cuentas.map((c) => c.ubicacionNombre).filter((n): n is string => !!n),
                  ).map((f) => (
                    <button
                      key={f.clave}
                      type="button"
                      className="pildora-cayla"
                      aria-pressed={filtroCierre === f.clave}
                      data-vacio={f.n === 0 && filtroCierre !== f.clave ? "" : undefined}
                      onClick={() => {
                        setFiltroCierre(f.clave);
                        setPagina(1);
                      }}
                    >
                      {f.texto}
                      <Globito n={f.n} etiqueta="cierres" />
                    </button>
                  ))}
                </div>
                <Tabla className="@container mt-4">
                  <Encabezado plantilla={PLANTILLA_CIERRES} columnas={[{ titulo: "Día" }, { titulo: "Sede" }, { titulo: "Qué pasó" }, { titulo: "Diferencia", alinear: "der" }, { titulo: "Quién cerró" }]} />
                  {pagCierres.visibles.map((c) => (
                    <div key={c.id} className={fila(PLANTILLA_CIERRES)}>
                      <span className={celda("izq", "capitalize font-semibold text-tinta")}>{c.dia}</span>
                      <span className={celda()}>{c.sede}</span>
                      <span className={celda()}>
                        <Chip tono={c.diferencia < 0 ? "rojo" : "ambar"}>{c.diferencia < 0 ? "Faltaron" : "Sobraron"}</Chip>
                      </span>
                      <span className={celda("der", c.diferencia < 0 ? "text-rojo-profundo" : "")}>
                        {c.diferencia < 0 ? "−" : "+"}
                        {soles(Math.abs(c.diferencia))}
                      </span>
                      <span className={celda()}>{c.cerradaPor ?? "—"}</span>
                    </div>
                  ))}
                </Tabla>
                <PieDePaginas
                  texto={`${pagCierres.desde}–${pagCierres.hasta} de ${pagCierres.total} cierres · neto ${neto < 0 ? "−" : "+"}${soles(Math.abs(neto))}`}
                  tamano={tamano}
                  onTamano={(t) => {
                    setTamano(t);
                    setPagina(1);
                  }}
                  pagina={pagCierres.pagina}
                  totalPaginas={pagCierres.totalPaginas}
                  onPagina={setPagina}
                />
              </>
            )}

            {vista === "pendientes" && pendientes.length === 0 && (
              <Vacio tamano="chico" icono={<CircleCheck />}>
                Nada espera que lo registres: ni depósitos de máquinas ni salidas de planilla.
              </Vacio>
            )}
            {vista === "pendientes" && pendientes.length > 0 && (
              <div className="mt-4 space-y-3">
                {pendientes.map((p) => (
                  <Aviso
                    key={p.clave}
                    tono="atencion"
                    titulo={p.titulo}
                    accion={
                      p.accion && esLider ? (
                        <button
                          type="button"
                          className="btn-cayla btn-enlace"
                          aria-haspopup="dialog"
                          onClick={() => {
                            const a = p.accion!;
                            if (a.tipo === "maquina") {
                              setAbierta(false);
                              abrirMovimiento("abono_tarjeta", a.cuentaId);
                            } else {
                              const aviso = planilla.find((x) => x.clave === a.clave);
                              if (aviso) setSalidasDe(aviso);
                            }
                          }}
                        >
                          {p.accion.texto}
                        </button>
                      ) : undefined
                    }
                  >
                    {p.lineas.length > 0 && (
                      <ul className="mb-1 space-y-0.5 tabular-nums">
                        {p.lineas.map((l) => (
                          <li key={l}>{l}</li>
                        ))}
                      </ul>
                    )}
                    {p.detalle}
                  </Aviso>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
      {salidasDe && <SalidasPlanillaModal aviso={salidasDe} cuentas={cuentas} onCerrar={() => setSalidasDe(null)} />}
    </>
  );
}

/** Lo que se puede hacer con una cuenta, según por qué pide atención; sin nada pendiente, solo lo que es. */
function DetalleDeCuenta({ f, abrirMovimiento, onCerrar }: { f: FilaEstado; abrirMovimiento: ReturnType<typeof useAbrirMovimiento>; onCerrar: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-sand bg-hueso px-5 py-3 text-sm" data-sin-cascada>
      <span className="font-semibold text-tinta">{f.sinSede ? "Todavía no tiene sede" : f.sede}</span>
      <span className="text-tinta/70">{TEXTO_ETAPA[f.etapa]}</span>
      {f.detalle && <span className="text-tinta/70">{f.detalle}</span>}
      {f.pide === "conciliar" && (
        <Link href="/finanzas/dinero/conciliacion" className="btn-cayla btn-enlace" onClick={onCerrar}>
          Cuadrar con el banco
        </Link>
      )}
      {f.pide === "abonar" && (
        <button type="button" className="btn-cayla btn-enlace" onClick={() => { onCerrar(); abrirMovimiento("abono_tarjeta", f.id); }}>
          Registrar el depósito
        </button>
      )}
      {f.pide === "depositar" && (
        <button type="button" className="btn-cayla btn-enlace" onClick={() => { onCerrar(); abrirMovimiento("deposito", f.id); }}>
          Registrar el depósito
        </button>
      )}
      {f.pide === "negativo" && <span className="text-rojo-profundo">Lo entregado al líder no puede quedar en negativo: revisa sus movimientos.</span>}
      {f.pide === null && <span className="text-tinta/55">Sin nada pendiente.</span>}
    </div>
  );
}
