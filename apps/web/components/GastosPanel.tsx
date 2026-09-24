"use client";

import { useState, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TabsSubrayado } from "@/components/ui/TabsSubrayado";
import { Tabla, Encabezado, celda, fila } from "@/components/ui/Tabla";
import { CampoTexto, SelectNativo } from "@/components/ui/campos";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { ComboResponsable } from "@/components/ComboResponsable";
import { RegistrarGastoModal, type ProveedorGasto } from "@/components/RegistrarGastoModal";
import { ActivoDetalleModal, FijosDelMes, GastoFijoModal, TablaActivos } from "@/components/GastosFijosYActivos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import {
  TEXTO_COMPROBANTE,
  TEXTO_ESTADO_GASTO,
  TEXTO_NO_GASTO,
  estadoGasto,
  mesesRecientes,
  nombreVer,
  puedeAnular,
  resumenFijos,
  sugerenciaParaEgreso,
  textoMes,
  textoPago,
  type ActivoFila,
  type CategoriaGasto,
  type EgresoPorClasificar,
  type FijoSugerido,
  type GastoFijoMes,
  type GastoFila,
  type MarcaNoGasto,
  type PanelGastos,
  type TipoActivo,
  type TipoNoGasto,
  type UbicacionGastos,
  type Ver,
} from "@/lib/gastos-reglas";

// Finanzas ▸ Gastos (ADR-0195 F2; spike docs/maquetas/finanzas-2026-09/, vista «Gastos»).
// Cabecera = dónde trabajas; «Ver» = qué miras (el líder: una tienda, todas o lo de la empresa). La pantalla solo lee
// lo que la base ya filtró por cuenta, y escribe por RPC firmando con el responsable.

type Pestana = "gastos" | "fijos" | "activos" | "egresos" | "categorias";
const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });
const PLANTILLA_GASTOS = "sm:grid-cols-[4.5rem_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_7rem_7rem]";
const PLANTILLA_EGRESOS = "sm:grid-cols-[5rem_minmax(0,1fr)_minmax(0,2fr)_7rem_8rem]";

export function GastosPanel({
  panel,
  gastos,
  egresos,
  marcas,
  activos,
  fijos,
  sugeridos,
  tiposActivo,
  categorias,
  ubicaciones,
  proveedores,
  cajasAbiertas,
  esLider,
  ver,
  mes,
  hoy,
  fallas,
}: {
  panel: PanelGastos | null;
  gastos: GastoFila[];
  egresos: EgresoPorClasificar[];
  marcas: MarcaNoGasto[];
  activos: ActivoFila[];
  fijos: GastoFijoMes[];
  sugeridos: FijoSugerido[];
  tiposActivo: TipoActivo[];
  categorias: CategoriaGasto[];
  ubicaciones: UbicacionGastos[];
  proveedores: ProveedorGasto[];
  cajasAbiertas: { id: string; ubicacionId: string }[];
  esLider: boolean;
  ver: Ver;
  mes: string;
  hoy: string;
  fallas: string[];
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [pestana, setPestana] = useState<Pestana>("gastos");
  const [registrar, setRegistrar] = useState<{ egreso?: EgresoPorClasificar; fijo?: GastoFijoMes; clase?: "gasto" | "activo" } | null>(null);
  const [detalle, setDetalle] = useState<GastoFila | null>(null);
  const [activo, setActivo] = useState<ActivoFila | null>(null);
  const [editarFijo, setEditarFijo] = useState<{ fijo?: GastoFijoMes; inicial?: FijoSugerido } | null>(null);
  const rf = resumenFijos(fijos);
  const [clasificar, setClasificar] = useState<EgresoPorClasificar | null>(null);

  const ir = (cambios: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) p.set(k, v);
    router.push(`${ruta}?${p.toString()}`);
  };
  const verTodas = !ver.ubicacionId;
  const titulo = `Gastos ${nombreVer(ver, ubicaciones)}`;
  const ubicacionParaRegistrar = ver.soloEmpresa ? "empresa" : (ver.ubicacionId ?? ubicaciones[0]?.id ?? "empresa");
  const vigentes = gastos.filter((g) => g.estado === "vigente");

  return (
    <div className="space-y-6">
      <CabeceraPantalla
        sobretitulo="Finanzas · Gastos"
        titulo={titulo}
        bajada="Lo que se paga para que el negocio funcione y no es mercadería. Si llegó con factura, comparte la cabecera con Compras: un solo Por pagar y un solo IGV."
        acciones={
          pestana === "activos" ? (
            <button type="button" className="btn-cayla btn-primario" onClick={() => setRegistrar({ clase: "activo" })}>
              Registrar activo
            </button>
          ) : pestana === "fijos" ? (
            <button type="button" className="btn-cayla btn-primario" onClick={() => setEditarFijo({})}>
              Nuevo gasto fijo
            </button>
          ) : (
            <button type="button" className="btn-cayla btn-primario" onClick={() => setRegistrar({})}>
              Registrar gasto
            </button>
          )
        }
      />

      <div {...entra(1)} className="anim-entra flex flex-wrap items-end gap-3">
        {esLider && (
          <label className="block">
            <span className="label-cayla block text-[11px] text-tinta/65">Ver</span>
            <SelectNativo value={ver.clave} onChange={(e) => ir({ ver: e.target.value })} aria-label="Qué tienda mirar">
              <option value="todas">Todas las tiendas</option>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
              <option value="empresa">De la empresa</option>
            </SelectNativo>
          </label>
        )}
        <label className="block">
          <span className="label-cayla block text-[11px] text-tinta/65">Mes</span>
          <SelectNativo value={mes} onChange={(e) => ir({ mes: e.target.value })} aria-label="Mes">
            {mesesRecientes(hoy, 12).map((m) => (
              <option key={m} value={m}>
                {textoMes(m)}
              </option>
            ))}
          </SelectNativo>
        </label>
      </div>

      {fallas.map((f) => (
        <p key={f} className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">
          {f}
        </p>
      ))}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TarjetaCifra compacta punto="neutro" etiqueta={`Gastado en ${textoMes(mes).split(" ")[0]}`} valor={panel ? soles(panel.total) : "—"} {...entra(2)}>
          {panel ? `${panel.n} ${panel.n === 1 ? "gasto" : "gastos"} ${nombreVer(ver, ubicaciones)}` : "Sin datos"}
        </TarjetaCifra>
        <TarjetaCifra compacta punto="verde" etiqueta="IGV que puedes descontar" valor={panel ? soles(panel.igv) : "—"} {...entra(3)}>
          {panel ? (panel.boletas ? `Solo de facturas. ${panel.boletas} ${panel.boletas === 1 ? "boleta" : "boletas"} sin IGV.` : "Solo de facturas.") : ""}
        </TarjetaCifra>
        <TarjetaCifra compacta punto={panel?.porPagar ? "ambar" : "neutro"} tono={panel?.porPagar ? "text-ambar-profundo" : undefined} etiqueta="Por pagar de gastos" valor={panel ? soles(panel.porPagar) : "—"} {...entra(4)}>
          {panel?.nPorPagar ? `${panel.nPorPagar} con factura a crédito · se pagan en Por pagar` : "Nada a crédito"}
        </TarjetaCifra>
        <TarjetaCifra
          compacta
          punto={panel?.egresosSinClasificar ? "ambar" : "verde"}
          acentoTrazo={!!panel?.egresosSinClasificar}
          etiqueta="Egresos de caja por clasificar"
          valor={panel ? String(panel.egresosSinClasificar) : "—"}
          onClick={() => setPestana("egresos")}
          {...entra(5)}
        >
          {panel?.egresosSinClasificar ? `${soles(panel.egresosSinClasificarMonto)} que salieron del cajón y nadie dijo qué fueron` : "Todo clasificado"}
        </TarjetaCifra>
      </div>

      <div {...entra(6)}>
        <TabsSubrayado
          etiqueta="Secciones de Gastos"
          valor={pestana}
          onCambio={(v) => setPestana(v as Pestana)}
          items={[
            { clave: "gastos", etiqueta: "Gastos", conteo: vigentes.length || undefined },
            { clave: "fijos", etiqueta: "Fijos del mes", conteo: rf.faltan || undefined, tono: rf.faltan ? "ambar" : undefined },
            { clave: "activos", etiqueta: "Activos fijos", conteo: activos.filter((a) => a.estado === "activo").length || undefined },
            { clave: "egresos", etiqueta: "Egresos de caja por clasificar", conteo: egresos.length || undefined, tono: egresos.length ? "ambar" : undefined },
            { clave: "categorias", etiqueta: "Por categoría" },
          ]}
        />
      </div>

      {pestana === "gastos" && (
        <>
          {gastos.length === 0 ? (
            <div className="card-cayla anim-entra px-6 py-8 text-center" style={{ ["--i" as string]: 7 }}>
              <p className="font-display text-xl text-tinta">Sin gastos en {textoMes(mes)}</p>
              <p className="mt-1 text-sm text-taupe">Registra la luz, el alquiler o un mototaxi con «Registrar gasto».</p>
            </div>
          ) : (
            <Tabla className="anim-entra" style={{ ["--i" as string]: 7 }}>
              <Encabezado
                plantilla={PLANTILLA_GASTOS}
                columnas={[
                  { titulo: "Fecha" },
                  { titulo: "Gasto" },
                  { titulo: "Categoría", subtitulo: "cuenta" },
                  { titulo: verTodas ? "Tienda" : "Comprobante" },
                  { titulo: "Cómo se pagó" },
                  { titulo: "Monto", alinear: "der" },
                  { titulo: "Estado" },
                ]}
              />
              {gastos.map((g) => {
                const e = TEXTO_ESTADO_GASTO[estadoGasto(g)];
                return (
                  <button key={g.id} type="button" onClick={() => setDetalle(g)} className={`${fila(PLANTILLA_GASTOS, "w-full text-left hover:bg-hueso/60")} ${g.estado === "anulado" ? "opacity-60" : ""}`}>
                    <span className={celda()}>{diaMes(g.fecha)}</span>
                    <span className={celda()}>
                      <b className="font-semibold text-tinta">{g.descripcion}</b>
                      <span className="block truncate text-[12px] text-taupe">{g.proveedorNombre ?? "Sin proveedor"}</span>
                    </span>
                    <span className={celda()}>
                      {g.categoriaNombre}
                      <span className="block text-[12px] text-taupe">{g.cuenta}</span>
                    </span>
                    <span className={celda()}>
                      {verTodas ? (g.ubicacionNombre ?? "De la empresa") : TEXTO_COMPROBANTE[g.comprobanteTipo]}
                      {g.comprobante && <span className="block truncate text-[12px] text-taupe">{verTodas ? `${TEXTO_COMPROBANTE[g.comprobanteTipo]} ${g.comprobante}` : g.comprobante}</span>}
                    </span>
                    <span className={celda()}>{textoPago(g, diaMes)}</span>
                    <span className={celda("der")}>
                      <b className="font-semibold text-tinta">{soles(g.montoTotal)}</b>
                      {g.igv > 0 && <span className="block text-[12px] text-taupe">IGV {soles(g.igv)}</span>}
                    </span>
                    <span className={celda()}>
                      <Chip tono={e.tono}>{e.texto}</Chip>
                    </span>
                  </button>
                );
              })}
              <p className="px-5 py-2.5 text-xs text-taupe">{gastos.length} en {textoMes(mes)} · los anulados se quedan a la vista, nunca se borran</p>
            </Tabla>
          )}
          <p className="nota-cayla">
            La planilla <b>no se registra aquí</b>: se lee de Dynamic. La mercadería va por Compras y la tela por Producción. No existe la categoría «Otros»: si un gasto no calza, falta una categoría.
          </p>
        </>
      )}

      {pestana === "fijos" && (
        <FijosDelMes
          fijos={fijos}
          sugeridos={sugeridos}
          mes={mes}
          verTodas={verTodas}
          onRegistrar={(f) => setRegistrar({ fijo: f })}
          onEditar={(f) => setEditarFijo({ fijo: f })}
          onNuevoDesdeSugerido={(s) => setEditarFijo({ inicial: s })}
        />
      )}

      {pestana === "activos" && <TablaActivos activos={activos} verTodas={verTodas} onAbrir={setActivo} />}

      {pestana === "egresos" && (
        <>
          {egresos.length === 0 ? (
            <div className="card-cayla px-6 py-8 text-center">
              <p className="font-display text-xl text-tinta">No hay egresos de caja por clasificar</p>
              <p className="mt-1 text-sm text-taupe">Cada salida de plata de los cajones ya dice si fue gasto, depósito o retiro.</p>
            </div>
          ) : (
            <Tabla>
              <Encabezado plantilla={PLANTILLA_EGRESOS} columnas={[{ titulo: "Fecha" }, { titulo: "Tienda" }, { titulo: "Lo que escribió la tienda" }, { titulo: "Monto", alinear: "der" }, { titulo: "" }]} />
              {egresos.map((e) => (
                <div key={e.id} className={fila(PLANTILLA_EGRESOS)}>
                  <span className={celda()}>{diaMes(e.creadoEn.slice(0, 10))}</span>
                  <span className={celda()}>{e.ubicacionNombre}</span>
                  <span className={celda()}>
                    <b className="font-semibold text-tinta">{e.motivo}</b>
                    {e.nota && <span className="block truncate text-[12px] text-taupe">{e.nota}</span>}
                    {e.registradoPor && <span className="block truncate text-[12px] text-taupe">por {e.registradoPor}</span>}
                  </span>
                  <span className={celda("der")}>{soles(e.monto)}</span>
                  <span className={celda("der")}>
                    <button type="button" className="btn-cayla btn-secundario btn-chico" onClick={() => setClasificar(e)}>
                      Clasificar
                    </button>
                  </span>
                </div>
              ))}
            </Tabla>
          )}
          {marcas.length > 0 && <MarcasNoGasto marcas={marcas} />}
          <p className="nota-cayla">
            Un egreso de caja es <b>cómo salió la plata</b>, no qué se compró. Solo cuenta como gasto cuando alguien dice qué fue; un depósito al banco o un retiro del dueño no son gastos.
          </p>
        </>
      )}

      {pestana === "categorias" && panel && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Reparto titulo={`Por categoría · ${textoMes(mes)}`} filas={panel.porCategoria.map((c) => ({ clave: c.categoria, nombre: c.nombre, detalle: `cuenta ${c.cuenta} · ${c.n}`, monto: c.monto }))} total={panel.total} />
          {verTodas && <Reparto titulo="Por tienda" filas={panel.porUbicacion.map((u) => ({ clave: u.ubicacionId ?? "empresa", nombre: u.nombre, detalle: `${u.n}`, monto: u.monto }))} total={panel.total} />}
        </div>
      )}

      {registrar && (
        <RegistrarGastoModal
          categorias={categorias}
          ubicaciones={ubicaciones}
          proveedores={proveedores}
          cajasAbiertas={cajasAbiertas}
          esLider={esLider}
          ubicacionInicial={ubicacionParaRegistrar}
          egreso={registrar.egreso}
          fijo={registrar.fijo}
          clase={registrar.clase}
          tiposActivo={tiposActivo}
          hoy={hoy}
          onCerrar={() => setRegistrar(null)}
        />
      )}
      {activo && <ActivoDetalleModal activo={activo} hoy={hoy} onCerrar={() => setActivo(null)} />}
      {editarFijo && (
        <GastoFijoModal
          fijo={editarFijo.fijo}
          inicial={editarFijo.inicial}
          categorias={categorias}
          ubicaciones={ubicaciones}
          proveedores={proveedores}
          esLider={esLider}
          ubicacionInicial={ubicacionParaRegistrar}
          onCerrar={() => setEditarFijo(null)}
        />
      )}
      {detalle && <GastoDetalleModal gasto={detalle} onCerrar={() => setDetalle(null)} />}
      {clasificar && (
        <ClasificarEgresoModal
          egreso={clasificar}
          onCerrar={() => setClasificar(null)}
          onEsGasto={(clase) => {
            setClasificar(null);
            setRegistrar({ egreso: clasificar, clase });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

function Reparto({ titulo, filas, total }: { titulo: string; filas: { clave: string; nombre: string; detalle: string; monto: number }[]; total: number }) {
  return (
    <section className="card-cayla px-5 py-4">
      <h2 className="text-sm font-semibold text-tinta">{titulo}</h2>
      {filas.length === 0 ? (
        <p className="mt-2 text-sm text-taupe">Sin gastos en este mes.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {filas.map((f) => (
            <li key={f.clave}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-tinta">
                  {f.nombre} <span className="text-[12px] text-taupe">· {f.detalle}</span>
                </span>
                <span className="tabular-nums font-semibold text-tinta">{soles(f.monto)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sand">
                <div className="h-full rounded-full bg-tinta/70" style={{ width: `${total > 0 ? Math.max(2, (f.monto / total) * 100) : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GastoDetalleModal({ gasto: g, onCerrar }: { gasto: GastoFila; onCerrar: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const e = TEXTO_ESTADO_GASTO[estadoGasto(g)];

  async function anular() {
    if (!motivo.trim()) return avisar.error("Di por qué se anula.");
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { error } = await firmar(createClient().rpc("anular_gasto" as never, { p_gasto_id: g.id, p_motivo: motivo } as never), responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "anular el gasto"));
    avisar.exito("Gasto anulado", { detalle: g.cajaMovimientoId ? "El egreso de caja vuelve a «por clasificar»: la plata sí salió del cajón." : undefined });
    onCerrar();
    router.refresh();
  }

  return (
    <Modal titulo={g.descripcion} subtitulo={`${g.ubicacionNombre ?? "De la empresa"} · ${diaMes(g.fecha)} · ${g.categoriaNombre}`} onClose={onCerrar} ancho="max-w-lg">
      <div className="space-y-4">
        <dl className="divide-y divide-sand rounded-md border border-sand text-sm">
          {[
            ["Total", soles(g.montoTotal)],
            ["IGV descontable", soles(g.igv)],
            ["Comprobante", g.comprobante ? `${TEXTO_COMPROBANTE[g.comprobanteTipo]} ${g.comprobante}${g.proveedorNombre ? ` · ${g.proveedorNombre}` : ""}` : "Sin comprobante"],
            ["Cómo se pagó", textoPago(g, diaMes)],
            ["Cuenta contable", g.cuenta],
            ...(g.saldo !== null && g.saldo > 0 && g.estado === "vigente" ? [["Falta pagar", soles(g.saldo)]] : []),
            ...(g.registradoPor ? [["Lo registró", g.registradoPor]] : []),
            ...(g.motivoAnulacion ? [["Anulado", g.motivoAnulacion]] : []),
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-4 py-2">
              <dt className="text-taupe">{k}</dt>
              <dd className="text-right text-tinta">{v}</dd>
            </div>
          ))}
        </dl>
        <Chip tono={e.tono}>{e.texto}</Chip>
        {g.compraId && g.estado === "vigente" && (g.saldo ?? 0) > 0 && (
          <p className="nota-cayla text-[13px]">Se paga desde <b>Compras ▸ Por pagar</b>, como cualquier factura de proveedor.</p>
        )}

        {anulando ? (
          <div className="space-y-3" data-sin-cascada>
            <CampoTexto etiqueta="Por qué se anula" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Se registró dos veces" />
            <p className="text-[13px] text-taupe">No se borra: queda a la vista como anulado, con el motivo y quién lo hizo.{g.cajaMovimientoId ? " La plata que salió del cajón no vuelve sola: se corrige en la caja." : ""}</p>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-cayla btn-secundario" onClick={() => setAnulando(false)} disabled={guardando}>
                Volver
              </button>
              <button type="button" className="btn-cayla btn-peligro" onClick={anular} disabled={guardando || !responsable.listo}>
                {guardando ? "Anulando…" : "Anular gasto"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            {g.estado === "vigente" && !puedeAnular(g) && <p className="mr-auto self-center text-[12.5px] text-taupe">Su factura ya tiene pagos: no se anula (como en Compras).</p>}
            {puedeAnular(g) && (
              <button type="button" className="btn-cayla btn-sutil" onClick={() => setAnulando(true)}>
                Anular…
              </button>
            )}
            <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar}>
              Cerrar
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ClasificarEgresoModal({ egreso: e, onCerrar, onEsGasto }: { egreso: EgresoPorClasificar; onCerrar: () => void; onEsGasto: (clase: "gasto" | "activo") => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [que, setQue] = useState<"gasto" | "activo" | TipoNoGasto>(() => sugerenciaParaEgreso(e.motivo));
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (que === "gasto" || que === "activo") return onEsGasto(que);
    if (que === "otro" && !motivo.trim()) return avisar.error("Escribe qué fue.");
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { error } = await firmar(
      createClient().rpc("marcar_egreso_no_gasto" as never, { p_caja_movimiento_id: e.id, p_tipo: que, p_motivo: motivo.trim() || null } as never),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "clasificar el egreso"));
    avisar.exito(`Marcado: ${TEXTO_NO_GASTO[que].titulo.toLowerCase()}`, { detalle: "No cuenta como gasto. Si fue un error, se revierte abajo." });
    onCerrar();
    router.refresh();
  }

  const opciones: ("gasto" | "activo" | TipoNoGasto)[] = ["gasto", "activo", "deposito", "retiro", "ajuste", "otro"];
  return (
    <Modal titulo="¿Qué fue esta salida?" subtitulo={`${e.ubicacionNombre} · ${diaMes(e.creadoEn.slice(0, 10))} · ${soles(e.monto)} · «${e.motivo}${e.nota ? ` — ${e.nota}` : ""}»`} onClose={onCerrar} ancho="max-w-lg">
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Qué fue" className="space-y-2">
          {opciones.map((o) => {
            const t =
              o === "gasto"
                ? { titulo: "Un gasto", detalle: "Se consumió en el negocio: movilidad, útiles, un arreglo." }
                : o === "activo"
                  ? { titulo: "Un activo fijo", detalle: "Algo que sirve varios años: un mueble, un equipo, una máquina." }
                  : TEXTO_NO_GASTO[o];
            return (
              <label key={o} className={`flex cursor-pointer gap-3 rounded-md border px-4 py-3 text-sm ${que === o ? "border-tinta bg-hueso" : "border-sand hover:border-tinta/40"}`}>
                <input type="radio" name="que-fue" value={o} checked={que === o} onChange={() => setQue(o)} className="mt-1 accent-[var(--color-tinta)]" />
                <span>
                  <b className="font-semibold text-tinta">{t.titulo}</b>
                  <span className="block text-[13px] text-taupe">{t.detalle}</span>
                </span>
              </label>
            );
          })}
        </div>
        {que !== "gasto" && que !== "activo" && (
          <div className="space-y-3" data-sin-cascada>
            <CampoTexto etiqueta={que === "otro" ? "Qué fue" : "Nota (opcional)"} value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder={que === "deposito" ? "Depósito BCP, op. 12345" : ""} />
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="button" className="btn-cayla btn-primario" onClick={guardar} disabled={guardando || (que !== "gasto" && que !== "activo" && !responsable.listo)}>
            {que === "gasto" ? "Seguir: registrar el gasto" : que === "activo" ? "Seguir: registrar el activo" : guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function MarcasNoGasto({ marcas }: { marcas: MarcaNoGasto[] }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [abierto, setAbierto] = useState(false);
  const [revirtiendo, setRevirtiendo] = useState<string | null>(null);

  async function revertir(m: MarcaNoGasto) {
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setRevirtiendo(m.id);
    const { error } = await firmar(createClient().rpc("revertir_egreso_no_gasto" as never, { p_id: m.id } as never), responsable.firma());
    setRevirtiendo(null);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "revertir la marca"));
    avisar.exito("Marca revertida", { detalle: "El egreso vuelve a estar por clasificar." });
    router.refresh();
  }

  return (
    <section className="card-cayla px-5 py-4">
      <button type="button" className="flex w-full items-center justify-between text-left text-sm font-semibold text-tinta" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto}>
        <span>Marcados como «no es gasto» ({marcas.length})</span>
        <span className="text-taupe">{abierto ? "Ocultar" : "Ver"}</span>
      </button>
      {abierto && (
        <div className="mt-3 space-y-3" data-sin-cascada>
          <ComboResponsable control={responsable} deshabilitado={revirtiendo !== null} />
          <ul className="divide-y divide-sand">
            {marcas.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                <span>
                  <b className="font-semibold text-tinta">{TEXTO_NO_GASTO[m.tipo].titulo}</b> · {m.ubicacionNombre} · {soles(m.monto)}
                  <span className="block text-[12px] text-taupe">
                    «{m.motivoEgreso}
                    {m.notaEgreso ? ` — ${m.notaEgreso}` : ""}»{m.motivo ? ` · ${m.motivo}` : ""}
                    {m.revisadoPor ? ` · ${m.revisadoPor}` : ""}
                  </span>
                </span>
                <button type="button" className="btn-cayla btn-sutil btn-chico" disabled={revirtiendo !== null} onClick={() => revertir(m)}>
                  {revirtiendo === m.id ? "Revirtiendo…" : "Revertir"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
