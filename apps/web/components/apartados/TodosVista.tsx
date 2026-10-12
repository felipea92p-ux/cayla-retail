"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Archive, Bell, Check, MessageCircle, Printer, SearchX, SlidersHorizontal } from "lucide-react";
import { money, type VarianteBusqueda } from "@/components/PuntoDeVenta";
import type { ResumenApartados } from "@/lib/separaciones";
import {
  EXTENSIONES_MAX,
  ORDEN_ESTADO,
  apartadoDeFila,
  avisadaHoy,
  coincide,
  colaPorAvisar,
  encendida,
  diaLima,
  estadoVisible,
  formatoCelular,
  paraQuienPedido,
  textoDevolucion,
  textoEstadoPedido,
  type Apartado,
  type PedidoApartado,
  type AvisoApartado,
  type ClaveEstado,
} from "@/lib/separaciones-reglas";
import { BarraPlazo, EstadoChip, FotoPrenda, fechaCorta } from "@/components/apartados/piezas";
import { CancelarPedidoModal, DevolverModal, EnviarPedidoModal, ExtenderModal, LiberarModal, RecordarModal, ReimprimirApartadoModal } from "@/components/apartados/ModalesApartado";
import type { PrendaApartable } from "@/components/apartados/ApartarVista";
import { SubirPedidoAlAlmacenModal } from "@/components/PedidoClienteModales";
import { envioConCliente, type PedidoParaSubir } from "@/lib/pedidos-con-cliente-reglas";
import { Buscador } from "@/components/ui/Buscador";
import { Vacio } from "@/components/ui/Vacio";
import { Boton } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Aviso } from "@/components/ui/Aviso";
import { createClient } from "@/lib/supabase/client";
import {
  PERIODOS_APARTADOS,
  PERIODO_DE_FABRICA,
  esDeFabrica,
  rangoDelPeriodo,
  textoDelPeriodo,
  type PeriodoApartados,
} from "@/lib/historial-apartados-reglas";

type Filtro = "hoy" | "abiertos" | "cerrados" | "todos";
// «Todos» va primero y es lo que se ve al entrar al Historial (Felipe 2026-10-10): el historial muestra todo y los
// demás filtros lo acotan.
const FILTROS: { id: Filtro; etiqueta: string }[] = [
  { id: "todos", etiqueta: "Todos" },
  { id: "hoy", etiqueta: "Necesitan algo" },
  { id: "abiertos", etiqueta: "Por recoger" },
  { id: "cerrados", etiqueta: "Cerrados" },
];
const GRUPOS: { titulo: string; claves: ClaveEstado[] }[] = [
  { titulo: "Hoy, sin falta", claves: ["devolver", "vencida"] },
  { titulo: "Vencen pronto", claves: ["porvencer"] },
  { titulo: "A tiempo", claves: ["vigente"] },
  { titulo: "Cerrados", claves: ["cerrada"] },
];
type ColumnaTodos = "prendas" | "pagado" | "celular" | "estante" | "asesora";
const COLUMNAS_TODOS: { id: ColumnaTodos; etiqueta: string }[] = [
  { id: "prendas", etiqueta: "Prendas" },
  { id: "pagado", etiqueta: "Pagado y saldo" },
  { id: "celular", etiqueta: "Celular" },
  { id: "estante", etiqueta: "Estante" },
  { id: "asesora", etiqueta: "Quién atendió" },
];
const COLUMNAS_DE_FABRICA: Record<ColumnaTodos, boolean> = { prendas: true, pagado: true, celular: true, estante: true, asesora: false };
const CLAVE_QUE_VER = "cayla:apartados:que-ver";
const EVENTO_QUE_VER = "cayla:apartados:que-ver";
function suscribirQueVer(avisar: () => void) {
  window.addEventListener(EVENTO_QUE_VER, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO_QUE_VER, avisar);
    window.removeEventListener("storage", avisar);
  };
}
function leerQueVer(): string | null {
  try {
    return localStorage.getItem(CLAVE_QUE_VER);
  } catch {
    return null;
  }
}
const BOTON_CHICO = "btn-cayla btn-secundario h-8 whitespace-nowrap px-2.5 text-[12.5px]";
const BOTON_CHICO_NEGRO = "btn-cayla btn-primario h-8 whitespace-nowrap px-2.5 text-[12.5px]";

export function TodosVista({
  ubicacionId,
  ubicacionEtiqueta,
  hoy,
  puedeGestionar,
  cajaAbierta,
  apartados,
  resumen,
  prendas,
  avisos,
  irAEntregar,
  buscarInicial = "",
  apagadas = [],
  pedidos = [],
  onApartarPedido,
}: {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  hoy: string;
  puedeGestionar: boolean;
  cajaAbierta: boolean;
  apartados: Apartado[];
  resumen: ResumenApartados;
  prendas: VarianteBusqueda[];
  avisos: Record<string, AvisoApartado>;
  irAEntregar: (id: string) => void;
  /** Llegar buscando un apartado (`?abrir=` de uno ya cerrado, desde Movimientos: ADR-0241): su código escrito y el
   *  filtro en «Todos», para que aparezca aunque ya no necesite nada. */
  buscarInicial?: string;
  /** Lo que la tienda apagó en «Opciones» (paso 5). */
  apagadas?: string[];
  /** Pedidos a otras tiendas para apartar (20260927140000). */
  pedidos?: PedidoApartado[];
  onApartarPedido?: (p: PedidoApartado) => void;
}) {
  const porVariante = useMemo(() => new Map(prendas.map((p) => [p.varianteId, p])), [prendas]);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [texto, setTexto] = useState(buscarInicial);
  // Período (Felipe 2026-10-10): acota SOLO lo cerrado, por el día en que se hizo el apartado; lo que espera algo sale
  // siempre (`buscar_separaciones`, 20261010180000). La página ya trajo los últimos 30 días: otro período se lee aquí,
  // sin recargar la pantalla entera (`buscar_` es lectura: no abre el loader, ADR-0149).
  const [periodo, setPeriodo] = useState<PeriodoApartados>(PERIODO_DE_FABRICA);
  const [fechas, setFechas] = useState<{ desde?: string; hasta?: string }>({});
  const rango = rangoDelPeriodo(periodo, hoy, fechas);
  const deFabrica = esDeFabrica(periodo, rango, hoy);
  const claveRango = `${rango.desde ?? ""}|${rango.hasta ?? ""}`;
  const [intento, setIntento] = useState(0);
  const [leido, setLeido] = useState<{ clave: string; apartados: Apartado[] | null } | null>(null);
  useEffect(() => {
    if (deFabrica) return;
    let vigente = true;
    void createClient()
      .rpc("buscar_separaciones", { p_ubicacion_id: ubicacionId, p_desde: rango.desde ?? undefined, p_hasta: rango.hasta ?? undefined })
      .then(({ data, error }) => {
        if (!vigente) return;
        setLeido({ clave: claveRango, apartados: error ? null : (data ?? []).map((f) => apartadoDeFila(f as unknown as Record<string, unknown>)) });
      });
    return () => {
      vigente = false;
    };
    // `apartados` en la lista: al guardar algo la página se refresca y el período elegido se vuelve a leer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveRango, deFabrica, ubicacionId, apartados, intento]);
  const leidoAhora = !deFabrica && leido?.clave === claveRango ? leido : null;
  const cargandoRango = !deFabrica && !leidoAhora;
  const errorRango = leidoAhora !== null && leidoAhora.apartados === null;
  // Mientras llega el período nuevo (o si falló) se ve lo que ya había, atenuado: nunca una lista vacía de golpe.
  const fuente = deFabrica ? apartados : (leidoAhora?.apartados ?? leido?.apartados ?? apartados);
  const conPeriodo = filtro === "todos" || filtro === "cerrados";
  const elegirPeriodo = (p: PeriodoApartados) => {
    // «Personalizado» arranca con las fechas que rigen: el control dice la verdad (como el Historial de ventas).
    if (p === "personalizado" && periodo !== "personalizado") setFechas({ desde: rango.desde ?? "", hasta: rango.hasta ?? "" });
    setPeriodo(p);
  };
  const [liberar, setLiberar] = useState<Apartado | null>(null);
  const [devolver, setDevolver] = useState<Apartado | null>(null);
  const [extender, setExtender] = useState<Apartado | null>(null);
  // «Reimprimir» (ADR-0367): el ticket de cualquier apartado de la lista, abierto o cerrado.
  const [reimprimir, setReimprimir] = useState<Apartado | null>(null);
  // Recordar (Apartados v2, paso 1): la cola del día o una sola clienta desde su fila. Lo avisado en esta visita se
  // marca al instante; la base lo confirma al refrescar.
  const [recordar, setRecordar] = useState<Apartado[] | null>(null);
  const [avisadasAhora, setAvisadasAhora] = useState<ReadonlySet<string>>(() => new Set());
  const avisoDe = (id: string): AvisoApartado | undefined =>
    avisadasAhora.has(id) ? { avisos: (avisos[id]?.avisos ?? 0) + 1, ultimoEn: new Date().toISOString(), ultimoPor: null } : avisos[id];
  const conAvisosAhora = Object.fromEntries(apartados.map((a) => [a.id, avisoDe(a.id)]).filter(([, v]) => v)) as Record<string, AvisoApartado>;
  const { porAvisar, avisadasHoy } = colaPorAvisar(apartados, conAvisosAhora, hoy);
  const conLote = encendida(apagadas, "lote");
  const conEstante = encendida(apagadas, "estante");
  const conAbonos = encendida(apagadas, "abonos");
  const conOtraSede = encendida(apagadas, "otra_sede");
  const [enviarPedido, setEnviarPedido] = useState<PedidoApartado | null>(null);
  const [cancelarPedido, setCancelarPedido] = useState<PedidoApartado | null>(null);
  // ADR-0328 act. 17 (revisión adversarial): lo colgado sale en dos pasos también desde aquí, con la misma regla que
  // Traslados (`envioConCliente`): una sola forma de enviar un pedido para un cliente.
  const [subirPedido, setSubirPedido] = useState<PedidoParaSubir | null>(null);
  const prendaDe = (id: string) => (prendas as PrendaApartable[]).find((p) => p.varianteId === id);
  // «Qué ver» (spike Apartados v2): qué lleva cada fila. Es comodidad de quien mira, así que vive en SU navegador; si el
  // navegador no deja guardar, queda lo de fábrica.
  const crudo = useSyncExternalStore(suscribirQueVer, leerQueVer, () => null);
  const ver = useMemo<Record<ColumnaTodos, boolean>>(() => {
    try {
      const guardado = JSON.parse(crudo ?? "null");
      return guardado && typeof guardado === "object" ? { ...COLUMNAS_DE_FABRICA, ...guardado } : COLUMNAS_DE_FABRICA;
    } catch {
      return COLUMNAS_DE_FABRICA;
    }
  }, [crudo]);
  const [verAbierto, setVerAbierto] = useState(false);
  const cambiarVer = (siguiente: Record<ColumnaTodos, boolean>) => {
    try {
      localStorage.setItem(CLAVE_QUE_VER, JSON.stringify(siguiente));
    } catch {}
    window.dispatchEvent(new Event(EVENTO_QUE_VER));
  };
  // Extender, liberar y devolver firman con el combo «Responsable» (ADR-0161) dentro de su modal, de esta tienda.
  const ubicacion = { ubicacionId, etiqueta: ubicacionEtiqueta };

  const conEstado = fuente.map((a) => ({ a, e: estadoVisible(a, hoy) }));
  const lista = conEstado
    .filter(({ a }) => coincide(a, texto))
    .filter(({ a, e }) =>
      filtro === "hoy" ? ["porvencer", "vencida", "devolver"].includes(e.clave) : filtro === "abiertos" ? a.estado === "abierta" : filtro === "cerrados" ? e.clave === "cerrada" : true,
    )
    .sort((x, y) => ORDEN_ESTADO[x.e.clave] - ORDEN_ESTADO[y.e.clave] || x.a.venceEl.localeCompare(y.a.venceEl));

  const cifras = [
    { etiqueta: "Por recoger", valor: String(resumen.porRecoger), pie: `${resumen.prendasGuardadas} ${resumen.prendasGuardadas === 1 ? "prenda guardada" : "prendas guardadas"}` },
    { etiqueta: "En custodia", valor: money(resumen.enCustodia), pie: `Anticipos: entran a ventas al entregar${resumen.enCustodiaEfectivo > 0 ? ` · ${money(resumen.enCustodiaEfectivo)} fue en efectivo` : ""}`, custodia: true },
    { etiqueta: "Por devolver", valor: money(resumen.montoPorDevolver), pie: `${resumen.porDevolver} ${resumen.porDevolver === 1 ? "cliente espera" : "clientes esperan"} su dinero`, alerta: resumen.porDevolver > 0 },
    { etiqueta: "Vencen en 2 días", valor: String(resumen.vencenPronto), pie: "Buen momento para escribirles" },
  ];

  return (
    <div className="space-y-5 p-5 sm:p-6">
      <div className="grid overflow-hidden rounded-2xl border border-sand sm:grid-cols-2 lg:grid-cols-4">
        {cifras.map((c, i) => (
          <div
            key={c.etiqueta}
            style={{ ["--i" as string]: i }}
            className={`anim-sube border-sand px-5 py-4 max-lg:[&:nth-child(n+3)]:border-t sm:[&:nth-child(even)]:border-l lg:[&:not(:first-child)]:border-l ${c.custodia ? "bg-[repeating-linear-gradient(135deg,transparent_0_9px,color-mix(in_srgb,var(--color-sand)_35%,transparent)_9px_10px)]" : ""} max-sm:[&:not(:first-child)]:border-t`}
          >
            <p className={`label-cayla text-[11px] ${c.alerta ? "text-rojo-profundo" : "text-tinta/60"}`}>{c.etiqueta}</p>
            <p className={`font-display mt-1 text-3xl leading-tight tabular-nums ${c.alerta ? "text-rojo-profundo" : "text-tinta"}`}>{c.valor}</p>
            <p className="text-xs text-tinta/60">{c.pie}</p>
          </div>
        ))}
      </div>

      {conLote && porAvisar.length + avisadasHoy.length > 0 && (
        <div className={`anim-revelar flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl px-4 py-3.5 ${porAvisar.length ? "bg-ambar/10 text-ambar-profundo" : "bg-verde/10 text-verde-profundo"}`}>
          {porAvisar.length ? <Bell className="h-5 w-5 shrink-0" aria-hidden /> : <Check className="h-5 w-5 shrink-0" aria-hidden />}
          <div className="min-w-0 flex-1 text-[13px]">
            <p className="font-semibold">
              {porAvisar.length
                ? `${porAvisar.length} ${porAvisar.length === 1 ? "cliente por avisar" : "clientes por avisar"} hoy`
                : "Todos avisados hoy"}
              {avisadasHoy.length > 0 && <span className="font-normal"> · {avisadasHoy.length} ya {avisadasHoy.length === 1 ? "avisado" : "avisados"}</span>}
            </p>
            {porAvisar.length > 0 && <p>Vencen pronto o ya vencieron. Se abre WhatsApp con el mensaje listo, una tras otra.</p>}
          </div>
          {porAvisar.length > 0 && (
            <button type="button" onClick={() => setRecordar(porAvisar)} className={`${BOTON_CHICO_NEGRO} inline-flex h-10 items-center gap-2 max-sm:w-full max-sm:justify-center`}>
              <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Escribirles en lote
            </button>
          )}
        </div>
      )}

      {conOtraSede && pedidos.length > 0 && (
        <section className="rounded-2xl border border-sand">
          <h3 className="font-display flex items-baseline gap-2 border-b border-sand px-5 py-3 text-lg text-tinta">
            Pedidos entre tiendas <span className="font-sans text-[11px] text-tinta/55">{pedidos.length}</span>
          </h3>
          <ul className="divide-y divide-sand">
            {pedidos.map((pe) => {
              const pr = prendaDe(pe.varianteId);
              const activo = pe.estado === "pedido" || pe.estado === "en_camino" || pe.estado === "llego";
              const envio = pe.direccion === "me_piden" && pe.estado === "pedido" ? envioConCliente(pe.reservaEn) : null;
              const prendaTexto = [pr?.referencia ?? "Prenda", pr?.color, pr?.talla].filter(Boolean).join(" · ");
              return (
                <li key={pe.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <FotoPrenda fotoUrl={pr?.fotoUrl} referencia={pr?.referencia ?? "Prenda"} colorHex={pr?.colorHex} categoria={pr?.categoria} categoriaPrefijo={pr?.categoriaPrefijo} categoriaFamilia={pr?.categoriaFamilia} ancho={32} className="w-8" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {pr?.referencia ?? "Prenda"} <span className="font-normal text-tinta/60">{[pr?.color, pr?.talla].filter(Boolean).join(" · ")}</span>
                    </p>
                    <p className="text-xs text-tinta/60">
                      {paraQuienPedido(pe)}
                      {pe.guardadaHasta && ` · guardada hasta el ${fechaCorta(pe.guardadaHasta)}`}
                      {pe.trasladoNumero != null && ` · traslado N.º ${pe.trasladoNumero}`}
                      {pe.estado === "cancelado" && pe.canceladoMotivo && ` · ${pe.canceladoMotivo}`}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] ${pe.estado === "llego" ? "bg-verde/10 text-verde-profundo" : pe.estado === "cancelado" ? "bg-hueso text-tinta/60" : "bg-pizarra/10 text-pizarra"}`}>
                    {textoEstadoPedido(pe)}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {envio?.subirAlAlmacen && (
                      <button
                        type="button"
                        onClick={() => setSubirPedido({ id: pe.id, prenda: prendaTexto, otraSede: pe.otraSede, reservaEn: pe.reservaEn })}
                        className={envio.enviar ? BOTON_CHICO : BOTON_CHICO_NEGRO}
                      >
                        Subir al almacén
                      </button>
                    )}
                    {envio?.enviar && (
                      <button type="button" onClick={() => setEnviarPedido(pe)} className={BOTON_CHICO_NEGRO}>Enviar</button>
                    )}
                    {pe.direccion === "pedi" && pe.estado === "llego" && onApartarPedido && (
                      <button type="button" onClick={() => onApartarPedido(pe)} disabled={!cajaAbierta} title={cajaAbierta ? undefined : "Abre la caja para cobrar el adelanto."} className={BOTON_CHICO_NEGRO}>
                        Apartar con adelanto
                      </button>
                    )}
                    {activo && pe.estado !== "en_camino" && (
                      <button type="button" onClick={() => setCancelarPedido(pe)} className={BOTON_CHICO}>
                        {pe.direccion === "me_piden" ? "No la tenemos" : "Cancelar"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          // Filtro de un valor = la píldora del sistema (ADR-0358): deja menos apartados, no cambia de vista.
          <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)} className="pildora-cayla">
            {f.etiqueta}
          </button>
        ))}
        <div className="relative flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
        <Buscador valor={texto} onCambio={setTexto} placeholder="Nombre, DNI, celular, APT- o B004-" etiqueta="Buscar en los apartados" className="min-w-0 flex-1 sm:w-80 sm:flex-none" />
        <button type="button" onClick={() => setVerAbierto((v) => !v)} aria-expanded={verAbierto} className={`${BOTON_CHICO} inline-flex h-10 items-center gap-1.5`}>
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden /> <span className="max-sm:hidden">Qué ver</span>
        </button>
        {verAbierto && (
          <div className="anim-revelar absolute top-12 right-0 z-30 w-64 rounded-xl border border-sand bg-papel p-2 shadow-lg">
            <p className="label-cayla px-2 pt-1 pb-1.5 text-[10px] text-tinta/55">Qué ver en cada apartado</p>
            {COLUMNAS_TODOS.filter((c) => c.id !== "estante" || conEstante).map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] hover:bg-crema">
                <input type="checkbox" checked={ver[c.id]} onChange={(e) => cambiarVer({ ...ver, [c.id]: e.target.checked })} className="accent-tinta" />
                <span className="flex-1">{c.etiqueta}</span>
                {COLUMNAS_DE_FABRICA[c.id] && <span className="text-[10.5px] text-tinta/45">de fábrica</span>}
              </label>
            ))}
            <div className="mt-1 flex items-center justify-between border-t border-sand px-2 pt-2">
              <button type="button" onClick={() => cambiarVer(COLUMNAS_DE_FABRICA)} className="label-cayla text-[10px] text-tinta/60 hover:text-tinta">Lo de fábrica</button>
              <button type="button" onClick={() => setVerAbierto(false)} className={BOTON_CHICO_NEGRO}>Listo</button>
            </div>
          </div>
        )}
        </div>
      </div>

      {conPeriodo && (
        <div className="-mt-2 space-y-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {/* Las mismas píldoras de período que el Historial de ventas (ADR-0358): Hoy, 7, 30, 90 días y Personalizado. En el
                celular corren de lado en vez de partirse en dos líneas. */}
            <div role="group" aria-label="Período de los cerrados" className="-mx-5 flex min-w-0 items-center gap-1.5 overflow-x-auto px-5 py-0.5 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
              {PERIODOS_APARTADOS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={p.id === "personalizado" ? periodo === "personalizado" || periodo === "todo" : periodo === p.id}
                  onClick={() => elegirPeriodo(p.id)}
                  className="pildora-cayla shrink-0"
                >
                  {p.etiqueta}
                </button>
              ))}
            </div>
            <p className="text-[12px] text-tinta/60" aria-live="polite">
              Cerrados {textoDelPeriodo(periodo, rango)} · los que siguen abiertos se ven siempre{cargandoRango ? " · Buscando…" : ""}
            </p>
          </div>
          {(periodo === "personalizado" || periodo === "todo") && (
            // `relative z-20`: el calendario se abre hacia abajo y no debe quedar bajo la lista (como en el Historial de ventas).
            <div className="anim-revelar relative z-20 flex flex-wrap items-end gap-x-4 gap-y-1 rounded-xl bg-sand/50 px-4 py-2.5">
              <div className="w-44">
                <CampoFecha etiqueta="Desde" valor={periodo === "todo" ? "" : (fechas.desde ?? "")} onValor={(v) => { setFechas((f) => ({ ...f, desde: v })); setPeriodo("personalizado"); }} />
              </div>
              <div className="w-44">
                <CampoFecha etiqueta="Hasta" valor={periodo === "todo" ? "" : (fechas.hasta ?? "")} onValor={(v) => { setFechas((f) => ({ ...f, hasta: v })); setPeriodo("personalizado"); }} />
              </div>
              <button
                type="button"
                onClick={() => setPeriodo("todo")}
                aria-pressed={periodo === "todo"}
                className={`label-cayla pb-2 text-[11px] underline-offset-2 hover:text-rojo hover:underline ${periodo === "todo" ? "text-tinta" : "text-tinta/65"}`}
              >
                Todo el historial
              </button>
            </div>
          )}
          {errorRango && (
            <Aviso
              tono="error"
              titulo="No se pudo leer ese período"
              accion={
                <Boton peso="fantasma" onClick={() => setIntento((n) => n + 1)}>
                  Intentar de nuevo
                </Boton>
              }
            >
              Mientras tanto se ven los cerrados de los últimos 30 días.
            </Aviso>
          )}
        </div>
      )}

      <div aria-busy={cargandoRango} data-resultados className={`space-y-5 transition-opacity duration-200 ${cargandoRango ? "opacity-55" : ""}`}>
      {lista.length === 0 ? (
        <div className="card-cayla">
          {texto.trim() ? (
            <Vacio
              icono={<SearchX />}
              titulo={`Ningún apartado con «${texto.trim()}»`}
              acciones={
                <>
                  {/* Lo cerrado de antes del período no se leyó: un toque lo busca en todo el historial. */}
                  {conPeriodo && periodo !== "todo" && (
                    <Boton peso="primario" onClick={() => setPeriodo("todo")}>
                      Buscar en todo el historial
                    </Boton>
                  )}
                  <Boton peso="fantasma" onClick={() => setTexto("")}>
                    Borrar la búsqueda
                  </Boton>
                </>
              }
            >
              Se busca por nombre, DNI, celular, código (APT-) o boleta{conPeriodo && periodo !== "todo" ? `, entre los cerrados ${textoDelPeriodo(periodo, rango)} y todos los abiertos` : ""}.
            </Vacio>
          ) : filtro === "hoy" ? (
            <Vacio icono={<Check />} titulo="Todo al día">
              Ningún apartado vence ni espera devolución hoy.
            </Vacio>
          ) : conPeriodo && periodo !== "todo" ? (
            <Vacio
              icono={<Archive />}
              titulo={filtro === "cerrados" ? `Ningún apartado cerrado ${textoDelPeriodo(periodo, rango)}` : `Ningún apartado ${textoDelPeriodo(periodo, rango)}`}
              acciones={
                <Boton peso="fantasma" onClick={() => setPeriodo("todo")}>
                  Ver todo el historial
                </Boton>
              }
            >
              Elige otro período arriba, o mira todo el historial.
            </Vacio>
          ) : (
            <Vacio icono={<Archive />} titulo="Nada por aquí">
              Cambia lo que ves con «Qué ver» o el filtro de arriba.
            </Vacio>
          )}
        </div>
      ) : (
        GRUPOS.map((g) => {
          const filas = lista.filter(({ e }) => g.claves.includes(e.clave));
          if (filas.length === 0) return null;
          return (
            <section key={g.titulo}>
              <h3 className="font-display mb-2.5 flex items-baseline gap-2 text-lg text-tinta">
                {g.titulo} <span className="font-sans text-[11px] text-tinta/55">{filas.length}</span>
              </h3>
              <ul className="divide-y divide-sand overflow-hidden rounded-2xl border border-sand">
                {filas.map(({ a, e }, i) => (
                  <li key={a.id} style={{ ["--i" as string]: i }} className="anim-sube grid items-center gap-x-5 gap-y-2 px-5 py-3.5 hover:bg-crema/60 md:grid-cols-[minmax(190px,1.3fr)_minmax(130px,1fr)_150px_170px_auto]">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="font-display grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sand/70 text-sm">{`${a.nombres[0] ?? ""}${a.apellidos[0] ?? ""}`.toUpperCase()}</span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-tinta">{a.nombres} {a.apellidos}</p>
                        <p className="text-xs text-tinta/60 tabular-nums">
                          {ver.celular && a.celular && `${formatoCelular(a.celular)} · `}<span className="font-mono">{a.codigo}</span>
                          {ver.estante && conEstante && a.estante && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-hueso px-1.5 font-mono text-[10.5px] text-tinta/80"><Archive className="h-2.5 w-2.5" aria-hidden />{a.estante}</span>
                          )}
                        </p>
                        {ver.asesora && a.asesora && <p className="text-[11.5px] text-tinta/55">atendió {a.asesora}</p>}
                      </div>
                    </div>
                    <div className={`flex min-w-0 items-center gap-2 max-md:hidden ${ver.prendas ? "" : "invisible"}`}>
                      <span className="flex">
                        {a.prendas.slice(0, 3).map((pr, j) => (
                          <FotoPrenda key={pr.varianteId} fotoUrl={porVariante.get(pr.varianteId)?.fotoUrl} referencia={pr.referencia} colorHex={porVariante.get(pr.varianteId)?.colorHex} categoria={porVariante.get(pr.varianteId)?.categoria} categoriaPrefijo={porVariante.get(pr.varianteId)?.categoriaPrefijo} categoriaFamilia={porVariante.get(pr.varianteId)?.categoriaFamilia} ancho={32} className={`w-8 border border-papel ${j ? "-ml-3.5" : ""}`} />
                        ))}
                      </span>
                      <span className="truncate text-[12.5px] text-tinta/60">{a.prendas.map((pr) => pr.referencia.split(" ")[0]).join(", ")}</span>
                    </div>
                    <div className={`text-sm tabular-nums max-md:hidden ${ver.pagado ? "" : "invisible"}`}>
                      <b className="font-semibold">{money(a.adelanto)}</b> <span className="text-xs text-tinta/55">de {money(a.total)}</span>
                      <p className="text-xs text-tinta/60">
                        {a.estado === "liberada" ? `por ${textoDevolucion(a)}` : a.estado === "abierta" ? `saldo ${money(a.saldo)}` : "cerrado"}
                        {conAbonos && a.pagos.some((p) => p.abono) && (
                          <span className="text-verde-profundo"> · {a.pagos.filter((p) => p.abono).length} {a.pagos.filter((p) => p.abono).length === 1 ? "abono" : "abonos"}</span>
                        )}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <EstadoChip {...e} />
                      {a.estado === "abierta" && <BarraPlazo creadaEl={a.creadaEn.slice(0, 10)} hoy={hoy} />}
                      <p className="text-[11.5px] text-tinta/60">
                        {a.estado === "abierta" ? `vence ${fechaCorta(a.venceEl)}${a.extensiones ? " · extendido" : ""}` : a.estado === "liberada" ? (a.liberadaSola ? "se liberó solo" : "liberado") : a.estado === "entregada" ? `boleta ${a.comprobanteFinal ?? a.comprobanteAnticipo ?? ""}` : a.notaCredito ? `NC ${a.notaCredito}` : "devuelto"}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {a.comprobanteAnticipo && (
                        <button
                          type="button"
                          onClick={() => setReimprimir(a)}
                          aria-label={`Reimprimir el ticket de ${a.codigo}`}
                          title="Reimprimir el ticket"
                          className={`${BOTON_CHICO} inline-flex items-center`}
                        >
                          <Printer className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      )}
                      {(e.clave === "vigente" || e.clave === "porvencer" || e.clave === "vencida") && a.celular !== "" &&
                        (() => {
                          // El botón de cada fila abre la misma ventana que el lote, con esta sola clienta: así todo
                          // aviso queda registrado, y el que ya se dio hoy se ve en verde.
                          const aviso = avisoDe(a.id);
                          const hoyYa = avisadaHoy(aviso, hoy);
                          return (
                            <button
                              type="button"
                              onClick={() => setRecordar([a])}
                              aria-label={hoyYa ? `Ya se le avisó hoy a ${a.nombres}; escribirle otra vez` : `Escribir a ${a.nombres} por WhatsApp`}
                              title={hoyYa ? `Se le avisó hoy${aviso?.ultimoPor ? ` por ${aviso.ultimoPor}` : ""}` : aviso ? `Último aviso: ${fechaCorta(diaLima(aviso.ultimoEn))}` : "Escribirle por WhatsApp"}
                              className={`${BOTON_CHICO} inline-flex items-center ${hoyYa ? "border-verde/40 text-verde-profundo" : ""}`}
                            >
                              {hoyYa ? <Check className="h-3.5 w-3.5" aria-hidden /> : <MessageCircle className="h-3.5 w-3.5" aria-hidden />}
                            </button>
                          );
                        })()}
                      {e.clave === "vencida" && puedeGestionar && (
                        <>
                          <button type="button" disabled={a.extensiones >= EXTENSIONES_MAX} title={a.extensiones >= EXTENSIONES_MAX ? "Ya se extendió una vez" : undefined} onClick={() => setExtender(a)} className={BOTON_CHICO}>
                            +7 días
                          </button>
                          <button type="button" onClick={() => setLiberar(a)} className={BOTON_CHICO}>Liberar</button>
                        </>
                      )}
                      {a.estado === "abierta" && (
                        <button type="button" onClick={() => irAEntregar(a.id)} className={BOTON_CHICO_NEGRO}>Entregar</button>
                      )}
                      {e.clave === "devolver" &&
                        (puedeGestionar ? (
                          <button type="button" onClick={() => setDevolver(a)} className={BOTON_CHICO_NEGRO}>Devolver {money(a.adelanto)}</button>
                        ) : (
                          <span className="text-[11px] text-tinta/55">Lo devuelve la líder</span>
                        ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
      </div>

      {enviarPedido && <EnviarPedidoModal pedido={enviarPedido} prenda={prendaDe(enviarPedido.varianteId)} ubicacion={ubicacion} onClose={() => setEnviarPedido(null)} />}
      {cancelarPedido && <CancelarPedidoModal pedido={cancelarPedido} ubicacion={ubicacion} onClose={() => setCancelarPedido(null)} />}
      {subirPedido && <SubirPedidoAlAlmacenModal pedido={subirPedido} ubicacion={ubicacion} onClose={() => setSubirPedido(null)} />}
      {recordar && (
        <RecordarModal
          cola={recordar}
          ubicacion={ubicacion}
          hoy={hoy}
          onAvisada={(id) => setAvisadasAhora((s) => new Set([...s, id]))}
          onClose={() => setRecordar(null)}
        />
      )}
      {reimprimir && <ReimprimirApartadoModal apartado={reimprimir} sede={ubicacionEtiqueta} onClose={() => setReimprimir(null)} />}
      {extender && <ExtenderModal apartado={extender} ubicacion={ubicacion} onClose={() => setExtender(null)} />}
      {liberar && <LiberarModal apartado={liberar} ubicacion={ubicacion} onClose={() => setLiberar(null)} />}
      {devolver && <DevolverModal apartado={devolver} ubicacion={ubicacion} cajaAbierta={cajaAbierta} onClose={() => setDevolver(null)} />}
    </div>
  );
}
