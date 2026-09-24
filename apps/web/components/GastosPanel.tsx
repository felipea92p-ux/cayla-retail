"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { ComboResponsable } from "@/components/ComboResponsable";
import { RegistrarGastoModal, type ProveedorGasto } from "@/components/RegistrarGastoModal";
import { ActivoDetalleModal, FijosDelMes, GastoFijoModal, NoEsFijoModal, TablaActivos } from "@/components/GastosFijosYActivos";
import { Buscador, CabeceraBloque, CampoFin, GuiaVacia, Herramientas, InputFin, ListaDatos, OpcionesFin, PestanasFin, PieTabla, SelectFin, Superficie } from "@/components/finanzas/kit";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { soles } from "@/lib/compras-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import {
  TEXTO_COMPROBANTE,
  TEXTO_ESTADO_GASTO,
  TEXTO_NO_GASTO,
  estadoGasto,
  fechaCorta,
  mesesRecientes,
  puedeAnular,
  resumenFijos,
  solesRedondo,
  sugerenciaParaEgreso,
  textoMes,
  textoPago,
  validarGasto,
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

// Finanzas ▸ Gastos (ADR-0195 F2), dibujada como el spike aprobado (docs/maquetas/finanzas-2026-09/, vista «Gastos»):
// cabecera con «Ver» y la acción principal → cuatro cifras → pestañas → la tarjeta de la tabla con sus filtros → nota.
// La cabecera = dónde trabajas; «Ver» = qué miras (el líder: una tienda, todas o lo de la empresa). La pantalla solo lee lo
// que la base ya filtró por cuenta, y escribe por RPC firmando con el responsable.

export type PestanaGastos = "gastos" | "fijos" | "activos" | "egresos";
const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

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
  pestanaInicial = "gastos",
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
  pestanaInicial?: PestanaGastos;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [pestana, setPestana] = useState<PestanaGastos>(pestanaInicial);
  const [registrar, setRegistrar] = useState<{ egreso?: EgresoPorClasificar; fijo?: GastoFijoMes; clase?: "gasto" | "activo" } | null>(null);
  const [detalle, setDetalle] = useState<GastoFila | null>(null);
  const [activo, setActivo] = useState<ActivoFila | null>(null);
  const [nuevoFijo, setNuevoFijo] = useState<FijoSugerido | null>(null);
  const [noEsFijo, setNoEsFijo] = useState<FijoSugerido | null>(null);
  const [clasificar, setClasificar] = useState<EgresoPorClasificar | null>(null);
  const rf = resumenFijos(fijos);

  const ir = (cambios: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) p.set(k, v);
    p.set("tab", pestana);
    router.push(`${ruta}?${p.toString()}`, { scroll: false });
  };
  const verTodas = !ver.ubicacionId && !ver.soloEmpresa;
  const nombreCorto = ver.soloEmpresa ? "la empresa" : ver.ubicacionId ? (ubicaciones.find((u) => u.id === ver.ubicacionId)?.nombre ?? "la tienda") : "todas las tiendas";
  const titulo = ver.soloEmpresa ? "Gastos de la empresa" : ver.ubicacionId ? `Gastos de ${nombreCorto}` : `Gastos de ${textoMes(mes).split(" ")[0]}`;
  const ubicacionParaRegistrar = ver.soloEmpresa ? "empresa" : (ver.ubicacionId ?? ubicaciones[0]?.id ?? "empresa");
  const enUso = activos.filter((a) => a.estado === "activo").length;

  return (
    <div className="space-y-6">
      <CabeceraPantalla
        sobretitulo="Finanzas · Gastos"
        titulo={titulo}
        accionesAbajo
        bajada="Lo que se paga para que el negocio funcione y no es mercadería. Si llegó con comprobante de un proveedor, comparte la factura con Compras: un solo Por pagar y un solo IGV."
        acciones={
          <>
            {esLider ? (
              <label className="fin-ver">
                <span className="label-cayla text-[11px] text-taupe">Ver</span>
                <SelectFin value={ver.clave} onChange={(e) => ir({ ver: e.target.value })} aria-label="Qué mirar">
                  <option value="todas">Todas las tiendas</option>
                  {ubicaciones.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                  <option value="empresa">De la empresa</option>
                </SelectFin>
              </label>
            ) : (
              <Chip versalitas={false}>{nombreCorto}</Chip>
            )}
            {pestana === "activos" ? (
              <button type="button" className="btn-cayla btn-primario" onClick={() => setRegistrar({ clase: "activo" })}>
                + Registrar activo
              </button>
            ) : (
              <button type="button" className="btn-cayla btn-primario" onClick={() => setRegistrar({})}>
                + Registrar gasto
              </button>
            )}
          </>
        }
      />

      {fallas.map((f) => (
        <p key={f} className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">
          {f}
        </p>
      ))}

      <section className="fin-cifras">
        <TarjetaCifra compacta etiqueta="Gastado en el mes" valor={panel ? solesRedondo(panel.total) : "—"} {...entra(1)}>
          {panel ? `${panel.n} ${panel.n === 1 ? "gasto vigente" : "gastos vigentes"} · ${nombreCorto}` : "Sin datos"}
        </TarjetaCifra>
        <TarjetaCifra compacta etiqueta="IGV que puedes descontar" valor={panel ? solesRedondo(panel.igv) : "—"} {...entra(2)}>
          {panel ? `Solo de facturas. ${panel.boletas} ${panel.boletas === 1 ? "boleta" : "boletas"} sin IGV descontable.` : ""}
        </TarjetaCifra>
        <TarjetaCifra compacta etiqueta="Por pagar de gastos" tono={panel?.porPagar ? "text-ambar" : undefined} valor={panel ? solesRedondo(panel.porPagar) : "—"} {...entra(3)}>
          {panel ? (panel.nPorPagar ? `${panel.nPorPagar} con factura a crédito` : "Nada a crédito") : ""}
        </TarjetaCifra>
        <TarjetaCifra
          compacta
          etiqueta="Egresos de caja sin clasificar"
          tono={panel?.egresosSinClasificar ? "text-ambar" : undefined}
          valor={panel ? String(panel.egresosSinClasificar) : "—"}
          onClick={() => setPestana("egresos")}
          {...entra(4)}
        >
          {panel?.egresosSinClasificar ? "No cuentan en ningún número hasta clasificarlos" : "Todo clasificado"}
        </TarjetaCifra>
      </section>

      <div {...entra(5)}>
        <PestanasFin
          etiqueta="Secciones de Gastos"
          valor={pestana}
          onCambio={(v) => setPestana(v as PestanaGastos)}
          items={[
            { clave: "gastos", etiqueta: "Gastos" },
            { clave: "fijos", etiqueta: "Fijos del mes", conteo: rf.faltan + rf.vienen },
            { clave: "activos", etiqueta: "Activos fijos", conteo: enUso },
            { clave: "egresos", etiqueta: "Egresos de caja por clasificar", conteo: egresos.length },
          ]}
        />
      </div>

      {pestana === "gastos" && (
        <TablaGastos gastos={gastos} categorias={categorias} verTodas={verTodas} mes={mes} hoy={hoy} onMes={(m) => ir({ mes: m })} onAbrir={setDetalle} />
      )}

      {pestana === "fijos" && (
        <FijosDelMes
          fijos={fijos}
          sugeridos={sugeridos}
          verTodas={verTodas}
          esLider={esLider}
          onRegistrar={(f) => setRegistrar({ fijo: f })}
          onMarcarFijo={setNuevoFijo}
          onNoEsFijo={setNoEsFijo}
        />
      )}

      {pestana === "activos" && <TablaActivos activos={activos} verTodas={verTodas} onAbrir={setActivo} />}

      {pestana === "egresos" && (
        <>
          {egresos.length === 0 ? (
            <GuiaVacia sobre="Todo en orden" titulo="No hay egresos de caja por clasificar">
              Cada salida de plata de los cajones ya dice si fue gasto, depósito o retiro.
            </GuiaVacia>
          ) : (
            <Superficie className="anim-sube">
              <div className="fin-tabla-wrap">
                <table className="fin-tabla">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tienda</th>
                      <th>Lo que escribió la tienda</th>
                      <th className="fin-num">Monto</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {egresos.map((e) => (
                      <tr key={e.id}>
                        <td data-l="Fecha">{fechaCorta(hoyLima(new Date(e.creadoEn)))}</td>
                        <td data-l="Tienda">{e.ubicacionNombre}</td>
                        <td className="fin-ancha" data-l="Motivo">
                          <b>{e.motivo}</b>
                          {(e.nota || e.registradoPor) && <span className="fin-sub">{[e.nota, e.registradoPor ? `lo registró ${e.registradoPor}` : null].filter(Boolean).join(" · ")}</span>}
                        </td>
                        <td className="fin-num" data-l="Monto">
                          {soles(e.monto)}
                        </td>
                        <td className="fin-ancha fin-num">
                          <button type="button" className="btn-cayla btn-secundario btn-chico" onClick={() => setClasificar(e)}>
                            Clasificar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Superficie>
          )}
          {marcas.length > 0 && <MarcasNoGasto marcas={marcas} />}
          <p className="nota-cayla">
            Un egreso de caja es <b>cómo salió la plata</b>, no qué se compró (ADR-0117). Solo cuenta como gasto cuando alguien dice qué fue; un depósito al banco o un retiro del dueño no son gastos.
          </p>
        </>
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
      {nuevoFijo && (
        <GastoFijoModal inicial={nuevoFijo} categorias={categorias} ubicaciones={ubicaciones} proveedores={proveedores} esLider={esLider} ubicacionInicial={ubicacionParaRegistrar} onCerrar={() => setNuevoFijo(null)} />
      )}
      {noEsFijo && <NoEsFijoModal sugerido={noEsFijo} onCerrar={() => setNoEsFijo(null)} />}
      {detalle && <GastoDetalleModal gasto={detalle} onCerrar={() => setDetalle(null)} />}
      {clasificar && (
        <ClasificarEgresoModal
          egreso={clasificar}
          categorias={categorias}
          hoy={hoy}
          onCerrar={() => setClasificar(null)}
          onRegistroCompleto={(clase) => {
            setClasificar(null);
            setRegistrar({ egreso: clasificar, clase });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// La tabla de gastos: filtros arriba (buscar, categoría, mes), la tabla y el pie, en una sola tarjeta.

function TablaGastos({
  gastos,
  categorias,
  verTodas,
  mes,
  hoy,
  onMes,
  onAbrir,
}: {
  gastos: GastoFila[];
  categorias: CategoriaGasto[];
  verTodas: boolean;
  mes: string;
  hoy: string;
  onMes: (mes: string) => void;
  onAbrir: (g: GastoFila) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("");
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return gastos.filter(
      (g) =>
        (!categoria || g.categoria === categoria) &&
        (!q || [g.descripcion, g.proveedorNombre ?? "", g.comprobante ?? ""].some((t) => t.toLowerCase().includes(q))),
    );
  }, [gastos, busqueda, categoria]);

  return (
    <>
      <Superficie className="anim-sube">
        <Herramientas>
          <Buscador valor={busqueda} onValor={setBusqueda} placeholder="Buscar por descripción, proveedor o número" />
          <SelectFin value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría">
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.nombre}
              </option>
            ))}
          </SelectFin>
          <SelectFin value={mes} onChange={(e) => onMes(e.target.value)} aria-label="Mes">
            {mesesRecientes(hoy, 12).map((m) => (
              <option key={m} value={m}>
                {mayuscula(textoMes(m))}
              </option>
            ))}
          </SelectFin>
        </Herramientas>
        {visibles.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-taupe">
            {gastos.length === 0 ? `Sin gastos en ${textoMes(mes)}. Registra la luz, el alquiler o un mototaxi con «+ Registrar gasto».` : "Ningún gasto calza con esa búsqueda."}
          </p>
        ) : (
          <div className="fin-tabla-wrap">
            <table className="fin-tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Gasto</th>
                  <th>Categoría · cuenta</th>
                  {verTodas && <th>Unidad</th>}
                  <th>Comprobante</th>
                  <th>Cómo se pagó</th>
                  <th className="fin-num">Monto</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((g) => {
                  const e = TEXTO_ESTADO_GASTO[estadoGasto(g)];
                  const pago = textoPago(g, (iso) => fechaCorta(iso));
                  return (
                    <tr
                      key={g.id}
                      data-clic
                      tabIndex={0}
                      className={g.estado === "anulado" ? "fin-anulada" : undefined}
                      onClick={() => onAbrir(g)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          onAbrir(g);
                        }
                      }}
                    >
                      <td data-l="Fecha">{fechaCorta(g.fecha)}</td>
                      <td className="fin-ancha" data-l="Gasto">
                        <b>{g.descripcion}</b>
                        <span className="fin-sub">{g.proveedorNombre ?? "Sin proveedor"}</span>
                      </td>
                      <td data-l="Categoría">
                        {g.categoriaNombre} <span className="fin-tenue">· {g.cuenta}</span>
                      </td>
                      {verTodas && <td data-l="Unidad">{g.ubicacionNombre ?? "De la empresa"}</td>}
                      <td data-l="Comprobante">
                        {TEXTO_COMPROBANTE[g.comprobanteTipo]}
                        {g.comprobante && <span className="fin-sub">{g.comprobante}</span>}
                      </td>
                      <td data-l="Pago" className={pago.startsWith("vence") ? "fin-tenue" : undefined}>
                        {pago}
                      </td>
                      <td className="fin-num" data-l="Monto">
                        <b>{soles(g.montoTotal)}</b>
                        {g.igv > 0 && <span className="fin-sub">IGV {soles(g.igv)}</span>}
                      </td>
                      <td data-l="Estado">
                        <Chip tono={e.tono}>{e.texto}</Chip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <PieTabla>
          <span>
            {visibles.length === gastos.length ? `${gastos.length} ${gastos.length === 1 ? "gasto" : "gastos"}` : `${visibles.length} de ${gastos.length} gastos`} · los anulados se quedan a la vista, nunca se borran
          </span>
        </PieTabla>
      </Superficie>
      <p className="nota-cayla">
        La planilla <b>no se registra aquí</b>: se lee de Dynamic. La mercadería va por Compras y la tela por Producción; aquí solo lo que se consume en el mes. No existe la categoría «Otros»: si un gasto no calza, falta una categoría.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

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

  const pendiente = g.compraId && g.estado === "vigente" && (g.saldo ?? 0) > 0;
  const bajada = [g.ubicacionNombre ?? "De la empresa", fechaCorta(g.fecha, true), g.comprobante ? `${TEXTO_COMPROBANTE[g.comprobanteTipo]} ${g.comprobante}` : "Sin comprobante", g.proveedorNombre].filter(Boolean).join(" · ");

  if (anulando) {
    return (
      <Modal variante="hoja" titulo="Anular gasto" subtitulo={`No se borra: queda a la vista como anulado, con el motivo y quién lo hizo.${g.cajaMovimientoId ? " Si salió de un cajón, la plata no vuelve sola: se corrige en la caja." : ""}`} onClose={onCerrar} ancho="max-w-[520px]">
        <CampoFin etiqueta="Motivo" htmlFor="anular-motivo">
          <InputFin id="anular-motivo" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Ej. se registró dos veces" />
        </CampoFin>
        <ComboResponsable control={responsable} deshabilitado={guardando} />
        <div className="fin-botones mt-4">
          <button type="button" className="btn-cayla btn-secundario" onClick={() => setAnulando(false)} disabled={guardando}>
            Volver
          </button>
          <button type="button" className="btn-cayla btn-primario" onClick={anular} disabled={guardando || !responsable.listo}>
            {guardando ? "Anulando…" : "Anular gasto"}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      variante="hoja"
      titulo={
        <>
          <span className="label-cayla mb-1 block font-sans text-[11px] font-semibold text-taupe">
            {g.categoriaNombre} · cuenta {g.cuenta}
          </span>
          {g.descripcion}
        </>
      }
      subtitulo={bajada}
      onClose={onCerrar}
      ancho="max-w-[520px]"
    >
      <ListaDatos
        filas={[
          { dato: "Total", valor: soles(g.montoTotal) },
          { dato: "IGV descontable", valor: soles(g.igv) },
          { dato: "Pago", valor: pendiente ? `A crédito, vence ${fechaCorta(g.fechaVencimiento)}` : textoPago(g, (iso) => fechaCorta(iso)) },
          ...(pendiente && g.saldo !== g.montoTotal ? [{ dato: "Falta pagar", valor: soles(g.saldo ?? 0) }] : []),
          { dato: "Estado", valor: <Chip tono={e.tono}>{e.texto}</Chip> },
          ...(g.registradoPor ? [{ dato: "Lo registró", valor: g.registradoPor, tenue: true }] : []),
          ...(g.motivoAnulacion ? [{ dato: "Anulado", valor: g.motivoAnulacion, tenue: true }] : []),
        ]}
      />
      {pendiente && <p className="nota-cayla mb-4">Se paga desde <b>Compras ▸ Por pagar</b>, como cualquier factura de proveedor.</p>}
      <div className="fin-botones">
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
    </Modal>
  );
}

// «¿Qué fue esta salida?»: un gasto chico (el mototaxi) se guarda aquí mismo con su categoría; si trae factura o es un
// activo, se sigue al registro completo con el monto y la tienda fijos.
function ClasificarEgresoModal({
  egreso: e,
  categorias,
  hoy,
  onCerrar,
  onRegistroCompleto,
}: {
  egreso: EgresoPorClasificar;
  categorias: CategoriaGasto[];
  hoy: string;
  onCerrar: () => void;
  onRegistroCompleto: (clase: "gasto" | "activo") => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [que, setQue] = useState<"gasto" | "activo" | TipoNoGasto>(() => sugerenciaParaEgreso(e.motivo));
  const [categoria, setCategoria] = useState("");
  const [descripcion, setDescripcion] = useState(e.nota ?? "");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const cat = categorias.find((c) => c.codigo === categoria) ?? null;

  async function guardar() {
    if (que === "activo") return onRegistroCompleto("activo");
    if (que === "otro" && !motivo.trim()) return avisar.error("Escribe qué fue.");
    let payload: Record<string, unknown> | null = null;
    if (que === "gasto") {
      const v = validarGasto(
        {
          ubicacion: e.ubicacionId,
          categoria,
          descripcion,
          fecha: hoyLima(new Date(e.creadoEn)),
          monto: String(e.monto),
          comprobante: "sin_comprobante",
          proveedorId: "",
          serie: "",
          numero: "",
          condicion: "contado",
          vence: "",
          medio: "efectivo",
          cajaId: "",
          egresoId: e.id,
          referencia: "",
        },
        hoy,
      );
      if (!v.ok) return avisar.error(v.error);
      payload = v.valor;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const supabase = createClient();
    const { error } = await firmar(
      que === "gasto"
        ? supabase.rpc("registrar_gasto" as never, { ...payload, p_token: crypto.randomUUID() } as never)
        : supabase.rpc("marcar_egreso_no_gasto" as never, { p_caja_movimiento_id: e.id, p_tipo: que, p_motivo: motivo.trim() || null } as never),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, que === "gasto" ? "registrar el gasto" : "clasificar el egreso"));
    avisar.exito(que === "gasto" ? "Registrado como gasto" : `Registrado como ${TEXTO_NO_GASTO[que].titulo.replace(/^Un[a]? /, "").toLowerCase()}`, {
      detalle: que === "gasto" ? undefined : "No cuenta como gasto. Si fue un error, se revierte en esta misma pestaña.",
    });
    onCerrar();
    router.refresh();
  }

  const opciones: { valor: "gasto" | "activo" | TipoNoGasto; titulo: string; detalle: string }[] = [
    { valor: "gasto", titulo: "Un gasto", detalle: "Se consumió en el negocio: movilidad, insumos, útiles." },
    { valor: "activo", titulo: "Un activo fijo", detalle: "Algo que sirve varios años: un mueble, un equipo, una máquina." },
    ...(["deposito", "retiro", "ajuste", "otro"] as TipoNoGasto[]).map((t) => ({ valor: t, titulo: TEXTO_NO_GASTO[t].titulo, detalle: TEXTO_NO_GASTO[t].detalle })),
  ];

  return (
    <Modal
      variante="hoja"
      titulo="¿Qué fue esta salida?"
      subtitulo={
        <>
          {e.ubicacionNombre} · {fechaCorta(hoyLima(new Date(e.creadoEn)))} · <b className="font-semibold text-tinta">{soles(e.monto)}</b> · «{e.motivo}
          {e.nota ? ` — ${e.nota}` : ""}»
        </>
      }
      onClose={onCerrar}
      ancho="max-w-[560px]"
    >
      <OpcionesFin nombre="que-fue" etiqueta="Qué fue" valor={que} onValor={setQue} opciones={opciones} />
      {que === "gasto" && (
        <div data-sin-cascada>
          <div className="fin-dos-campos">
            <CampoFin etiqueta="Categoría" htmlFor="clas-categoria" ayuda={cat ? `Va a la cuenta ${cat.cuenta}. Nadie la elige: viene con la categoría.` : undefined}>
              <SelectFin id="clas-categoria" value={categoria} onChange={(ev) => setCategoria(ev.target.value)}>
                <option value="">Elige…</option>
                {categorias.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {c.nombre}
                  </option>
                ))}
              </SelectFin>
            </CampoFin>
            <CampoFin etiqueta="Qué se pagó" htmlFor="clas-descripcion">
              <InputFin id="clas-descripcion" value={descripcion} onChange={(ev) => setDescripcion(ev.target.value)} placeholder="Mototaxi al banco" />
            </CampoFin>
          </div>
          <p className="-mt-2 mb-4 text-[12.5px] text-taupe">
            ¿Llegó con factura o boleta?{" "}
            <button type="button" className="btn-enlace text-[12.5px]" onClick={() => onRegistroCompleto("gasto")}>
              Regístralo con su comprobante
            </button>
          </p>
        </div>
      )}
      {que !== "gasto" && que !== "activo" && (
        <div data-sin-cascada>
          <CampoFin etiqueta={que === "otro" ? "Qué fue" : "Nota (opcional)"} htmlFor="clas-motivo">
            <InputFin id="clas-motivo" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder={que === "deposito" ? "Depósito BCP, op. 12345" : ""} />
          </CampoFin>
        </div>
      )}
      {que !== "activo" && <ComboResponsable control={responsable} deshabilitado={guardando} />}
      <div className="fin-botones mt-4">
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </button>
        <button type="button" className="btn-cayla btn-primario" onClick={guardar} disabled={guardando || (que !== "activo" && !responsable.listo)}>
          {que === "activo" ? "Seguir: registrar el activo" : guardando ? "Guardando…" : "Guardar"}
        </button>
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
    <Superficie pad>
      <CabeceraBloque titulo="Marcados como «no es gasto»" bajada={`${marcas.length} ${marcas.length === 1 ? "salida" : "salidas"} del cajón que no cuentan como gasto. Si una se marcó mal, se revierte.`}>
        <button type="button" className="btn-cayla btn-sutil btn-chico" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto}>
          {abierto ? "Ocultar" : "Ver"}
        </button>
      </CabeceraBloque>
      {abierto && (
        <div data-sin-cascada>
          <ComboResponsable control={responsable} deshabilitado={revirtiendo !== null} />
          <ul className="fin-fijos mt-3">
            {marcas.map((m) => (
              <li key={m.id} className="fin-fijo">
                <div>
                  <b>
                    {TEXTO_NO_GASTO[m.tipo].titulo} · {m.ubicacionNombre}
                  </b>
                  <span className="fin-sub">
                    «{m.motivoEgreso}
                    {m.notaEgreso ? ` — ${m.notaEgreso}` : ""}»{m.motivo ? ` · ${m.motivo}` : ""}
                    {m.revisadoPor ? ` · ${m.revisadoPor}` : ""}
                  </span>
                </div>
                <span className="fin-monto">{soles(m.monto)}</span>
                <button type="button" className="btn-cayla btn-sutil btn-chico" disabled={revirtiendo !== null} onClick={() => revertir(m)}>
                  {revirtiendo === m.id ? "Revirtiendo…" : "Revertir"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Superficie>
  );
}
