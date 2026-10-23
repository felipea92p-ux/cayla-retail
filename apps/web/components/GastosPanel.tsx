"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Orillo } from "@/components/finanzas/telar/Orillo";
import { DockTelar } from "@/components/finanzas/telar/DockTelar";
import { RespuestaTelar } from "@/components/finanzas/telar/RespuestaTelar";
import { nombreCortoSede, porSedeDe, type SedeTelar } from "@/lib/finanzas-telar-reglas";
import { calendarioDelMes, chipsDeGastos, fallaLegible, filtrarGastos, filtrosPuestosDeGastos, preguntaDeGastos, retazoDeGastos, sedeDeLaCabecera as sedeDeLaCabeceraDe, type FiltrosLista } from "@/lib/gastos-telar-reglas";
import { Buscador as BuscadorLista } from "@/components/ui/Buscador";
import { DesplegablePildora, TODOS } from "@/components/ui/FiltrosPildora";
import { BotonLimpiar, FiltroPuesto } from "@/components/ui/FiltrosPuestos";
import { Aviso } from "@/components/ui/Aviso";
import { Volver } from "@/components/ui/Volver";
import { RetazoGastos } from "@/components/finanzas/gastos/RetazoGastos";
import { CalendarioGastos } from "@/components/finanzas/gastos/CalendarioGastos";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { ComboResponsable } from "@/components/ComboResponsable";
import { RegistrarGastoModal, type ProveedorGasto } from "@/components/RegistrarGastoModal";
import { ActivoDetalleModal, FijosDelMes, GastoFijoModal, NoEsFijoModal, ResumenActivosPorSede, TablaActivos } from "@/components/GastosFijosYActivos";
import { CabeceraBloque, CampoFin, Herramientas, InputFin, ListaDatos, OpcionesFin, PestanasFin, PieTabla, SelectFin, Superficie } from "@/components/finanzas/kit";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaLima } from "@/lib/fechas-lima";
import {
  TEXTO_ESTADO_GASTO,
  TEXTO_NO_GASTO,
  bajadaIgvDelMes,
  estadoGasto,
  fechaCorta,
  igvBajoElMonto,
  igvDelGasto,
  igvEnRiesgo,
  igvParaLaTarjeta,
  notaIgvPerdido,
  papelDelGasto,
  papelEnUnaLinea,
  perdidoEnOtroMes,
  puedeAnular,
  resumenActivosPorSede,
  resumenFijos,
  solesRedondo,
  sugerenciaParaEgreso,
  textoIgvPerdido,
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
import { Boton } from "@/components/ui/campos";
import { GastosPulso } from "@/components/finanzas/GastosPulso";
import { bandejaPulso, gastastePulso } from "@/lib/gastos-pulso-reglas";
import { Vacio } from "@/components/ui/Vacio";
import { Armchair, Check, FunnelX, Plus, Receipt, Repeat, SearchX, Tag, Wallet } from "lucide-react";
import { MAX_MOTIVO_ANULAR_GASTO } from "@/lib/finanzas-topes";

// Finanzas ▸ Gastos (ADR-0195 F2), dibujada como el spike aprobado (docs/maquetas/finanzas-2026-09/, vista «Gastos»):
// cabecera con «Ver» y la acción principal → cuatro cifras → pestañas → la tarjeta de la tabla con sus filtros → nota.
// La cabecera = dónde trabajas; «Ver» = qué miras (el líder: una tienda, todas o lo de la empresa). La pantalla solo lee lo
// que la base ya filtró por cuenta, y escribe por RPC firmando con el responsable.

export type PestanaGastos = "gastos" | "fijos" | "activos" | "egresos";
const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });

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
  puedeConfigurar = esLider,
  puedeVerImpuestos = esLider,
  ver,
  mes,
  hoy,
  sedesTelar,
  fallas,
  pestanaInicial = "gastos",
  destinosDeposito = [],
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
  /** ¿Ve el módulo Configuración? Ahí se editan los gastos fijos (ADR-0253: ya no es solo del líder). */
  puedeConfigurar?: boolean;
  /** ¿Ve el módulo Impuestos? La nota del IGV perdido enlaza al mes del pago solo para quien lo ve (si no, sería «Sin acceso»). */
  puedeVerImpuestos?: boolean;
  ver: Ver;
  mes: string;
  hoy: string;
  fallas: string[];
  pestanaInicial?: PestanaGastos;
  /** Los bancos a los que se deposita (Cuentas y dinero, F3). Vacío si la cuenta no tiene ese módulo: entonces un depósito
   *  se marca «no es gasto» como antes, y quien tenga Cuentas y dinero dice después a qué banco llegó. */
  destinosDeposito?: { id: string; nombre: string }[];
  /** Los hilos de sede del telar, para el orillo (`getSedesDelTelar`). */
  sedesTelar: SedeTelar[];
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [pestana, setPestana] = useState<PestanaGastos>(pestanaInicial);
  // «Registrar gasto» de la mesa de mando del telar llega con `?registrar=1` desde otro submódulo: Gastos nace con la hoja abierta.
  const [registrar, setRegistrar] = useState<{ egreso?: EgresoPorClasificar; fijo?: GastoFijoMes; clase?: "gasto" | "activo" } | null>(() =>
    params.get("registrar") === "1" ? {} : null,
  );
  const [detalle, setDetalle] = useState<GastoFila | null>(null);
  const [activo, setActivo] = useState<ActivoFila | null>(null);
  const [nuevoFijo, setNuevoFijo] = useState<FijoSugerido | null>(null);
  const [noEsFijo, setNoEsFijo] = useState<FijoSugerido | null>(null);
  const [clasificar, setClasificar] = useState<EgresoPorClasificar | null>(null);
  // Los filtros de la lista: los ponen la lista misma, el retazo (una categoría), el calendario (un día) y «Por ordenar» (sin comprobante).
  const [filtros, setFiltros] = useState<FiltrosLista>({ q: "", categoria: "", dia: null, comprobante: "todos" });
  const elegirFiltro = (f: Partial<FiltrosLista>) => {
    setFiltros((a) => ({ ...a, ...f }));
    setPestana("gastos");
  };
  const retazo = useMemo(() => retazoDeGastos(gastos), [gastos]);
  const calendario = useMemo(() => calendarioDelMes(gastos, mes, hoy), [gastos, mes, hoy]);
  // El `?registrar=1` se quita apenas se abrió la hoja, para que recargar o volver atrás no la abra otra vez.
  useEffect(() => {
    if (params.get("registrar") !== "1") return;
    const p = new URLSearchParams(params.toString());
    p.delete("registrar");
    router.replace(p.size ? `${ruta}?${p.toString()}` : ruta, { scroll: false });
  }, [params, ruta, router]);
  const rf = resumenFijos(fijos);

  const ir = (cambios: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) p.set(k, v);
    // La sede ahora es `?sede=` (la mesa de mando del telar); un `?ver=` viejo ganaría sobre ella.
    p.delete("ver");
    p.set("tab", pestana);
    router.push(`${ruta}?${p.toString()}`, { scroll: false });
  };
  const verTodas = !ver.ubicacionId && !ver.soloEmpresa;
  const ubicacionParaRegistrar = ver.soloEmpresa ? "empresa" : (ver.ubicacionId ?? ubicaciones[0]?.id ?? "empresa");
  const enUso = activos.filter((a) => a.estado === "activo").length;
  const sedeDeLaCabecera = sedeDeLaCabeceraDe(ver, ubicaciones);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={sedeDeLaCabecera}
        titulo="Gastos"
        subtitulo="Lo que se paga para que el negocio funcione y no es mercadería. Si llegó con factura de un proveedor, compártela con Compras: un solo Por pagar y un solo IGV."
        acciones={
          pestana === "activos" ? (
            <Boton type="button" peso="primario" onClick={() => setRegistrar({ clase: "activo" })} aria-haspopup="dialog" data-guia="fin-gastos.registrar">
              + Registrar activo
            </Boton>
          ) : (
            <Boton type="button" peso="primario" onClick={() => setRegistrar({})} aria-haspopup="dialog" data-guia="fin-gastos.registrar">
              + Registrar gasto
            </Boton>
          )
        }
      >
        <RespuestaTelar pregunta={preguntaDeGastos(ver, ubicaciones, mes)} valor={panel ? panel.total : null} chips={panel ? chipsDeGastos(panel) : []} />
      </EncabezadoPagina>
      <Orillo porSede={porSedeDe(panel?.porUbicacion ?? [])} sedes={sedesTelar} que="gastado" hoy={hoy} />
      <DockTelar
        acciones={[
          { texto: "Registrar gasto", tecla: "g", icono: <Plus aria-hidden />, principal: true, onClick: () => setRegistrar({}) },
          { texto: "Fijos del mes", tecla: "f", icono: <Repeat aria-hidden />, onClick: () => setPestana("fijos") },
          { texto: "Salidas de caja", tecla: "e", icono: <Wallet aria-hidden />, onClick: () => setPestana("egresos") },
          { texto: "Activos fijos", tecla: "a", icono: <Armchair aria-hidden />, onClick: () => setPestana("activos") },
        ]}
      />

      {fallas.length > 0 && (
        <Aviso tono="atencion" titulo="Una parte de Gastos no respondió">
          {fallas.map(fallaLegible).join(" ")} Lo demás está al día; vuelve a entrar en un rato.
        </Aviso>
      )}

      {/* El telar (ADR-0493): en qué se va la plata (el retazo) y cuándo (el calendario); tocar uno filtra la lista. Después, la bandeja. */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
        <Superficie pad className="anim-entra min-w-0">
          <TituloSeccion dato={gastastePulso(panel)?.frase}>En qué se va</TituloSeccion>
          {retazo.length ? (
            <div className="mt-3">
              <RetazoGastos piezas={retazo} sedes={sedesTelar} elegida={filtros.categoria} onElegir={(c) => elegirFiltro({ categoria: c })} />
            </div>
          ) : (
            <Vacio tamano="chico" icono={<Receipt />}>
              Sin gastos en {textoMes(mes)} todavía.
            </Vacio>
          )}
        </Superficie>
        <Superficie pad className="anim-entra min-w-0">
          <TituloSeccion dato="más oscuro, más gasto">Cuándo</TituloSeccion>
          <div className="mt-3">
            <CalendarioGastos huecos={calendario.huecos} dias={calendario.dias} mesNombre={textoMes(mes).split(" ")[0]!} elegido={filtros.dia} onElegir={(d) => elegirFiltro({ dia: d })} />
          </div>
        </Superficie>
      </section>

      <GastosPulso
        bandeja={bandejaPulso(egresos, fijos)}
        sinComprobante={panel?.sinComprobante ?? 0}
        onVerSinComprobante={() => elegirFiltro({ comprobante: "sin" })}
        onResolver={(cosa) => (cosa.tipo === "egreso" ? setClasificar(cosa.egreso) : setRegistrar({ fijo: cosa.fijo }))}
        onVerTodas={() => setPestana(bandejaPulso(egresos, fijos).cosas[0]?.tipo === "fijo" ? "fijos" : "egresos")}
      />

      <section className="fin-cifras" data-guia="fin-gastos.cifras">
        {/* Sin `panel` es porque la lectura falló (la falla se dice arriba): «no se pudo leer», no «sin dato» (ADR-0358). */}
        {/* ADR-0362, fase 6 (decisión 76): lo perdido por pagar sin banco se resta en el mes del pago, como Impuestos; la tarjeta nunca dice
            un negativo y la bajada explica lo que se pierde en otro mes. */}
        <TarjetaCifra etiqueta="IGV que puedes descontar" valor={panel ? solesRedondo(igvParaLaTarjeta(panel)) : null} noSePudoLeer={!panel} {...entra(1)}>
          {panel ? bajadaIgvDelMes({ ...panel, mes }, perdidoEnOtroMes(gastos, mes)) : ""}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Por pagar de gastos" tono={panel?.porPagar ? "text-ambar" : undefined} valor={panel ? solesRedondo(panel.porPagar) : null} noSePudoLeer={!panel} {...entra(2)}>
          {panel ? (panel.nPorPagar ? `${panel.nPorPagar} con factura a crédito` : "Nada a crédito") : ""}
        </TarjetaCifra>
        <TarjetaCifra
          etiqueta="Egresos de caja sin clasificar"
          tono={panel?.egresosSinClasificar ? "text-ambar" : undefined}
          valor={panel ? String(panel.egresosSinClasificar) : null}
          noSePudoLeer={!panel}
          onClick={() => setPestana("egresos")}
          {...entra(3)}
        >
          {panel?.egresosSinClasificar ? "No cuentan en ningún número hasta clasificarlos" : "Todo clasificado"}
        </TarjetaCifra>
      </section>

      <div {...entra(5)}>
        <PestanasFin
          etiqueta="Secciones de Gastos"
          guia="fin-gastos.pestanas"
          valor={pestana}
          onCambio={(v) => setPestana(v as PestanaGastos)}
          items={[
            { clave: "gastos", etiqueta: "Gastos", guia: "fin-gastos.tab-gastos" },
            { clave: "fijos", etiqueta: "Fijos del mes", conteo: rf.faltan + rf.vienen, guia: "fin-gastos.tab-fijos" },
            { clave: "activos", etiqueta: "Activos fijos", conteo: enUso, guia: "fin-gastos.tab-activos" },
            { clave: "egresos", etiqueta: "Egresos de caja por clasificar", conteo: egresos.length, guia: "fin-gastos.tab-egresos" },
          ]}
        />
      </div>

      {pestana === "gastos" && (
        <TablaGastos
          gastos={gastos}
          categorias={categorias}
          verTodas={verTodas}
          mes={mes}
          onAbrir={setDetalle}
          filtros={filtros}
          onFiltros={(f) => setFiltros((a) => ({ ...a, ...f }))}
        />
      )}

      {pestana === "fijos" && (
        <FijosDelMes
          fijos={fijos}
          sugeridos={sugeridos}
          verTodas={verTodas}
          puedeConfigurar={puedeConfigurar}
          onRegistrar={(f) => setRegistrar({ fijo: f })}
          onMarcarFijo={setNuevoFijo}
          onNoEsFijo={setNoEsFijo}
        />
      )}

      {pestana === "activos" && (
        <>
          {verTodas && <ResumenActivosPorSede resumen={resumenActivosPorSede(activos, ubicaciones)} onVer={(id) => ir({ sede: id })} />}
          <TablaActivos activos={activos} verTodas={verTodas} onAbrir={setActivo} />
        </>
      )}

      {pestana === "egresos" && (
        <>
          {egresos.length === 0 ? (
            <Superficie>
              <Vacio icono={<Check />} titulo="Todo en orden: no hay egresos de caja por clasificar">
                Cada salida de plata de los cajones ya dice si fue gasto, depósito o retiro.
              </Vacio>
            </Superficie>
          ) : (
            <Superficie className="anim-sube" guia="fin-gastos.egresos">
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
                        <td data-l="Fecha">{fechaCorta(diaLima(e.creadoEn))}</td>
                        <td data-l="Tienda">{e.ubicacionNombre}</td>
                        <td className="fin-ancha" data-l="Motivo">
                          <b>{e.motivo}</b>
                          {(e.nota || e.registradoPor) && <span className="fin-sub">{[e.nota, e.registradoPor ? `lo registró ${e.registradoPor}` : null].filter(Boolean).join(" · ")}</span>}
                        </td>
                        <td className="fin-num" data-l="Monto">
                          {soles(e.monto)}
                        </td>
                        <td className="fin-ancha fin-num">
                          <button type="button" className="btn-cayla btn-secundario btn-chico" onClick={() => setClasificar(e)} data-guia="fin-gastos.clasificar">
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
      {detalle && <GastoDetalleModal gasto={detalle} puedeVerImpuestos={puedeVerImpuestos} onCerrar={() => setDetalle(null)} />}
      {clasificar && (
        <ClasificarEgresoModal
          egreso={clasificar}
          categorias={categorias}
          destinosDeposito={destinosDeposito}
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
  onAbrir,
  filtros,
  onFiltros,
}: {
  gastos: GastoFila[];
  categorias: CategoriaGasto[];
  verTodas: boolean;
  mes: string;
  onAbrir: (g: GastoFila) => void;
  /** Los filtros los comparte con el retazo, el calendario y «Por ordenar»; el mes lo elige la mesa de mando de arriba. */
  filtros: FiltrosLista;
  onFiltros: (f: Partial<FiltrosLista>) => void;
}) {
  const visibles = useMemo(() => filtrarGastos(gastos, filtros, mes), [gastos, filtros, mes]);
  const nombreCategoria = (c: string) => categorias.find((x) => x.codigo === c)?.nombre ?? c;
  const puestos = filtrosPuestosDeGastos(filtros, nombreCategoria, textoMes(mes).split(" ")[0]!);
  const limpiar = () => onFiltros({ q: "", categoria: "", dia: null, comprobante: "todos" });

  return (
    <>
      <Superficie className="anim-sube" guia="fin-gastos.lista">
        <Herramientas guia="fin-gastos.filtros">
          <BuscadorLista
            valor={filtros.q}
            onCambio={(q) => onFiltros({ q })}
            etiqueta="Buscar un gasto"
            placeholder="Busca «luz», un proveedor o un número" // sugerir-fijo: lo que se busca no depende de lo elegido arriba
            conteo={filtros.q.trim() ? visibles.length : undefined}
            className="min-w-[14rem] flex-1"
          />
          <DesplegablePildora
            icono={Tag}
            etiqueta="Categoría"
            valor={filtros.categoria || TODOS}
            onValor={(v) => onFiltros({ categoria: v === TODOS ? "" : v })}
            opciones={[{ valor: TODOS, texto: "Todas" }, ...categorias.map((c) => ({ valor: c.codigo, texto: c.nombre }))]}
          />
          <DesplegablePildora
            icono={Receipt}
            etiqueta="Comprobante"
            valor={filtros.comprobante === "todos" ? TODOS : filtros.comprobante}
            onValor={(v) => onFiltros({ comprobante: v === TODOS ? "todos" : (v as "sin" | "con") })}
            opciones={[
              { valor: TODOS, texto: "Todos" },
              { valor: "con", texto: "Con boleta o factura" },
              { valor: "sin", texto: "Sin comprobante" },
            ]}
          />
        </Herramientas>
        {puestos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-3" data-guia="fin-gastos.puestos">
            {puestos.map((f) => (
              <FiltroPuesto
                key={f.clave}
                etiqueta={`Quitar el filtro ${f.texto}`}
                onQuitar={() => onFiltros(f.clave === "q" ? { q: "" } : f.clave === "categoria" ? { categoria: "" } : f.clave === "dia" ? { dia: null } : { comprobante: "todos" })}
              >
                {f.texto}
              </FiltroPuesto>
            ))}
            {puestos.length > 1 && <BotonLimpiar onClick={limpiar}>Limpiar todo</BotonLimpiar>}
          </div>
        )}
        {visibles.length === 0 ? (
          gastos.length === 0 ? (
            <Vacio tamano="chico" icono={<Receipt />}>
              Sin gastos en {textoMes(mes)}. Registra la luz, el alquiler o un mototaxi con «+ Registrar gasto».
            </Vacio>
          ) : (
            <Vacio
              tamano="chico"
              icono={filtros.q.trim() ? <SearchX /> : <FunnelX />}
              accion={{
                texto: puestos.length === 1 && filtros.q.trim() ? "Borrar la búsqueda" : "Limpiar filtros",
                onClick: limpiar,
              }}
            >
              Ningún gasto calza con esa búsqueda.
            </Vacio>
          )
        ) : (
          <div className="fin-tabla-wrap">
            <table className="fin-tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Gasto</th>
                  <th>Categoría · cuenta</th>
                  {verTodas && <th>Sede</th>}
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
                  const papel = papelDelGasto(g);
                  const igvFila = igvBajoElMonto(g);
                  return (
                    <tr
                      key={g.id}
                      data-clic
                      tabIndex={0}
                      className={g.estado === "anulado" ? "fin-anulada" : undefined}
                      data-guia="fin-gastos.fila"
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
                      {verTodas && <td data-l="Sede">{g.ubicacionNombre ? nombreCortoSede(g.ubicacionNombre) : "Empresa"}</td>}
                      <td data-l="Comprobante">
                        {papel.tipo}
                        {papel.detalle && <span className="fin-sub">{papel.detalle}</span>}
                      </td>
                      <td data-l="Pago" className={pago.startsWith("vence") ? "fin-tenue" : undefined}>
                        {pago}
                      </td>
                      <td className="fin-num" data-l="Monto">
                        <b>{soles(g.montoTotal)}</b>
                        {igvFila && <span className="fin-sub">{igvFila.igv}</span>}
                        {igvFila?.perdido && (
                          <span className="fin-sub">
                            <span className="text-ambar-profundo">{igvFila.perdido}</span>
                          </span>
                        )}
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

function GastoDetalleModal({ gasto: g, puedeVerImpuestos, onCerrar }: { gasto: GastoFila; puedeVerImpuestos: boolean; onCerrar: () => void }) {
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
  const bajada = [g.ubicacionNombre ?? "De la empresa", fechaCorta(g.fecha, true), papelEnUnaLinea(g), g.proveedorNombre].filter(Boolean).join(" · ");
  // ADR-0362, fase 6 (decisión 76): el IGV que se perdió por pagar sin banco no se llama «descontable».
  const igv = igvDelGasto(g);
  const perdido = textoIgvPerdido(g);
  const notaPerdido = notaIgvPerdido(g);
  const enRiesgo = igvEnRiesgo(g);

  if (anulando) {
    return (
      <Modal variante="hoja" titulo="Anular gasto" subtitulo={`No se borra: queda a la vista como anulado, con el motivo y quién lo hizo.${g.cajaMovimientoId ? " Si salió de un cajón, la plata no vuelve sola: se corrige en la caja." : ""}`} onClose={onCerrar} tamano="mediana">
        <CampoFin etiqueta="Motivo" htmlFor="anular-motivo">
          <InputFin id="anular-motivo" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Ej. se registró dos veces" maxLength={MAX_MOTIVO_ANULAR_GASTO} />
        </CampoFin>
        <ComboResponsable control={responsable} deshabilitado={guardando} />
        <div className="pie-acciones mt-4">
          <Volver onClick={() => setAnulando(false)} a="Volver al gasto" />
          <Boton peso="peligro" cargando={guardando} textoCargando="Anulando…" type="button" onClick={anular} disabled={guardando || !responsable.listo} className="ml-auto">
            Anular gasto
          </Boton>
        </div>
      </Modal>
    );
  }

  return (
    <Modal conCerrar
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
      tamano="mediana"
    >
      <ListaDatos
        guia="fin-gastos.detalle"
        filas={[
          { dato: "Total", valor: soles(g.montoTotal) },
          { dato: "IGV descontable", valor: soles(igv.descontable) },
          // El valor puede ser largo («… · 3 pagos en efectivo (3 oct, 9 oct y 14 oct)»): se parte en renglones en vez de salirse de la
          // hoja (a 375 px se cortaba), y el título no se parte.
          ...(perdido
            ? [{ dato: <span className="whitespace-nowrap">IGV perdido</span>, valor: <span className="whitespace-normal text-ambar-profundo">{perdido}</span> }]
            : []),
          { dato: "Pago", valor: pendiente ? `A crédito, vence ${fechaCorta(g.fechaVencimiento)}` : textoPago(g, (iso) => fechaCorta(iso)) },
          ...(pendiente && g.saldo !== g.montoTotal ? [{ dato: "Falta pagar", valor: soles(g.saldo ?? 0) }] : []),
          { dato: "Estado", valor: <Chip tono={e.tono}>{e.texto}</Chip> },
          ...(g.registradoPor ? [{ dato: "Lo registró", valor: g.registradoPor, tenue: true }] : []),
          ...(g.motivoAnulacion ? [{ dato: "Anulado", valor: g.motivoAnulacion, tenue: true }] : []),
        ]}
      />
      {notaPerdido && (
        <p className="nota-cayla mb-4">
          {notaPerdido.texto}
          {puedeVerImpuestos && (
            <>
              {" "}Míralo en{" "}
              <Link href={`/finanzas/impuestos?mes=${notaPerdido.mes}`} className="btn-enlace">
                Impuestos
              </Link>
              .
            </>
          )}
        </p>
      )}
      {pendiente &&
        (enRiesgo > 0 ? (
          <p className="nota-cayla mb-4">
            Lo que falta ({soles(g.saldo ?? 0)}) se paga desde <b>Compras ▸ Por pagar</b> por el banco: en efectivo o desde un fondo se pierde su IGV
            ({soles(enRiesgo)}).
          </p>
        ) : (
          <p className="nota-cayla mb-4">Se paga desde <b>Compras ▸ Por pagar</b>, como cualquier factura de proveedor.</p>
        ))}
      <div className="fin-botones" data-guia="fin-gastos.detalle-botones">
        {g.estado === "vigente" && !puedeAnular(g) && <p className="mr-auto self-center text-[12.5px] text-taupe">Su factura ya tiene pagos: no se anula (como en Compras).</p>}
        {puedeAnular(g) && (
          <button type="button" className="btn-cayla btn-peligro" onClick={() => setAnulando(true)}>
            Anular…
          </button>
        )}
      </div>
    </Modal>
  );
}

// «¿Qué fue esta salida?»: un gasto chico (el mototaxi) se guarda aquí mismo con su categoría; si trae factura o es un
// activo, se sigue al registro completo con el monto y la tienda fijos. Un depósito al banco pide «¿A qué cuenta llegó?» y
// queda como movimiento de dinero (ADR-0195 F3): el banco sube y el egreso ya no respalda otra cosa.
function ClasificarEgresoModal({
  egreso: e,
  categorias,
  destinosDeposito,
  hoy,
  onCerrar,
  onRegistroCompleto,
}: {
  egreso: EgresoPorClasificar;
  categorias: CategoriaGasto[];
  destinosDeposito: { id: string; nombre: string }[];
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
  const [destino, setDestino] = useState(destinosDeposito[0]?.id ?? "");
  const [guardando, setGuardando] = useState(false);
  const cat = categorias.find((c) => c.codigo === categoria) ?? null;
  const aBanco = que === "deposito" && destinosDeposito.length > 0;

  async function guardar() {
    if (que === "activo") return onRegistroCompleto("activo");
    if (que === "otro" && !motivo.trim()) return avisar.error("Escribe qué fue.");
    if (aBanco && !destino) return avisar.error("Elige a qué cuenta llegó.");
    let payload: Record<string, unknown> | null = null;
    if (que === "gasto") {
      const v = validarGasto(
        {
          ubicacion: e.ubicacionId,
          categoria,
          descripcion,
          fecha: diaLima(e.creadoEn) ?? "",
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
        : aBanco
          ? // El origen es el cajón de esa tienda: la base lo toma del egreso.
            supabase.rpc(
              "registrar_movimiento_dinero" as never,
              { p_tipo: "deposito", p_monto: e.monto, p_cuenta_destino_id: destino, p_referencia: motivo.trim() || e.nota || null, p_caja_movimiento_id: e.id, p_token: crypto.randomUUID() } as never,
            )
          : supabase.rpc("marcar_egreso_no_gasto" as never, { p_caja_movimiento_id: e.id, p_tipo: que, p_motivo: motivo.trim() || null } as never),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, que === "gasto" ? "registrar el gasto" : "clasificar el egreso"));
    avisar.exito(que === "gasto" ? "Registrado como gasto" : aBanco ? "Registrado como depósito al banco" : `Registrado como ${TEXTO_NO_GASTO[que].titulo.replace(/^Un[a]? /, "").toLowerCase()}`, {
      detalle:
        que === "gasto"
          ? undefined
          : aBanco
            ? `${destinosDeposito.find((d) => d.id === destino)?.nombre ?? "El banco"} sube en Cuentas y dinero. No cuenta como gasto; si fue un error, se anula allí.`
            : "No cuenta como gasto. Si fue un error, se revierte en esta misma pestaña.",
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
          {e.ubicacionNombre} · {fechaCorta(diaLima(e.creadoEn))} · <b className="font-semibold text-tinta">{soles(e.monto)}</b> · «{e.motivo}
          {e.nota ? ` — ${e.nota}` : ""}»
        </>
      }
      onClose={onCerrar}
      tamano="mediana"
    >
      <OpcionesFin nombre="que-fue" etiqueta="Qué fue" valor={que} onValor={setQue} opciones={opciones} guia="fin-gastos.clasificar-opciones" />
      {que === "gasto" && (
        <div data-sin-cascada data-guia="fin-gastos.clasificar-gasto">
          <div className="fin-dos-campos">
            <CampoFin etiqueta="Categoría" htmlFor="clas-categoria" ayuda={cat ? `Va a la cuenta ${cat.cuenta}. Nadie la elige: viene con la categoría.` : undefined}>
              <SelectFin
                id="clas-categoria"
                valor={categoria}
                onValor={setCategoria}
                marcador="Elige…"
                opciones={categorias.map((c) => ({ valor: c.codigo, texto: c.nombre }))}
              />
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
      {aBanco && (
        <div data-sin-cascada>
          <CampoFin etiqueta="¿A qué cuenta llegó?" htmlFor="clas-destino" ayuda="Queda como depósito en Cuentas y dinero: el cajón ya bajó con esta salida y ahora sube el banco.">
            <SelectFin id="clas-destino" valor={destino} onValor={setDestino} opciones={destinosDeposito.map((d) => ({ valor: d.id, texto: d.nombre }))} />
          </CampoFin>
        </div>
      )}
      {que !== "gasto" && que !== "activo" && (
        <div data-sin-cascada>
          <CampoFin etiqueta={que === "otro" ? "Qué fue" : aBanco ? "Voucher o nota (opcional)" : "Nota (opcional)"} htmlFor="clas-motivo">
            <InputFin id="clas-motivo" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder={que === "deposito" ? "Depósito BCP, op. 12345" : ""} />
          </CampoFin>
        </div>
      )}
      {que !== "activo" && <ComboResponsable control={responsable} deshabilitado={guardando} />}
      <div className="fin-botones mt-4" data-guia="fin-gastos.clasificar-guardar">
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </button>
        <Boton type="button" peso="primario" cargando={guardando} onClick={guardar} disabled={que !== "activo" && !responsable.listo}>
          {que === "activo" ? "Seguir: registrar el activo" : "Guardar"}
        </Boton>
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
                <Boton peso="discreto" cargando={revirtiendo === m.id} textoCargando="Revirtiendo…" type="button" className="btn-chico" disabled={revirtiendo !== null} onClick={() => revertir(m)}>
                  Revertir
                </Boton>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Superficie>
  );
}
