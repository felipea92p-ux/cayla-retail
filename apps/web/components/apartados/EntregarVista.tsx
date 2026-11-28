"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArrowDown, ShieldCheck, ShoppingBag, Trash2, Wallet } from "lucide-react";
import { METODOS_PAGO, type MetodoPago } from "@cayla-retail/shared";
import { money } from "@/lib/money";
import { ICONO_METODO } from "@/components/punto-de-venta/iconoMetodo";
import { BilleteRapido } from "@/components/BilleteRapido";
import { EntradaMonto } from "@/components/ui/CampoMonto";
import { avisar } from "@/components/ui/Avisos";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { enviarVentaASunat } from "@/lib/envio-sunat";
import { useIntento } from "@/lib/useIntento";
import { huellaDe } from "@/lib/intento-reglas";
import { AvisoIntentoIncierto } from "@/components/ui/AvisoIntentoIncierto";
import { LEY_REDONDEO, NOMBRE_CORTO, NOMBRE_METODO, TEXTO_REDONDEO } from "@/lib/recibo-reglas";
import { AVISO_EFECTIVO_SIN_MONEDA, cobroDelSaldo, encendida, esConstancia, estadoVisible, pagosParaRpcApartado, type Apartado, type PagoAdelanto } from "@/lib/separaciones-reglas";
import { BarraMovil, DescuentoDePrenda, EstadoChip, FotoPrenda, ImporteDePrenda } from "@/components/apartados/piezas";
import { CanalChip } from "@/components/apartados/CanalChip";
import { prendaDicha } from "@/lib/lista-dicha";
import { opcionesAplazar } from "@/lib/apartado-detalle-reglas";
import { prefiereQuieto } from "@/lib/movimiento-cliente";
import { AbonarModal, ApartadoEntregadoModal, EditarApartadoModal, LiberarModal, RecordarModal, ReimprimirApartadoModal } from "@/components/apartados/ModalesApartado";
import { DetalleApartadoModal, type ModoDetalle } from "@/components/apartados/DetalleApartado";
import type { PrendaApartable } from "@/components/apartados/ApartarVista";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { BotonImprimir } from "@/components/ui/BotonImprimir";
import { MenuAcciones, type ItemMenu } from "@/components/ui/MenuAcciones";
import { Volver } from "@/components/ui/Volver";

const OPCION_INACTIVA = "text-tinta/60 hover:bg-papel/60";
const BOTON_PRINCIPAL =
  "mov-boton flex h-14 w-full items-center justify-between rounded-md bg-tinta px-5 text-crema hover:bg-rojo-profundo disabled:opacity-50 disabled:hover:bg-tinta";
const BILLETES = [10, 20, 50, 100, 200];

// La cara del cliente (<AvatarPersona>, ADR-0358 ronda 8) con las mismas iniciales de siempre: el primer nombre y el primer apellido.
const nombreParaIniciales = (a: Apartado) => `${a.nombres.split(/\s+/)[0] ?? ""} ${a.apellidos.split(/\s+/)[0] ?? ""}`;

export function EntregarVista({
  ubicacionId,
  ubicacionEtiqueta,
  hoy,
  cajaAbierta,
  puedeGestionar,
  apartados,
  prendas,
  elegido,
  onElegir,
  apagadas = [],
  cabecera,
  redondeoEfectivo = false,
}: {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  hoy: string;
  cajaAbierta: boolean;
  /** Aplazar es de quien gestiona la caja: líder o cuenta de ventas (D5). */
  puedeGestionar: boolean;
  apartados: Apartado[];
  prendas: PrendaApartable[];
  elegido: string | null;
  onElegir: (id: string | null) => void;
  /** Lo que la tienda apagó en «Opciones» (paso 5). */
  apagadas?: string[];
  /** Sede, pestañas, «Opciones» y avisos de la hoja: van al tope de la columna izquierda. */
  cabecera?: React.ReactNode;
  /** La base ya recibe el redondeo del efectivo (`fn_acepta_redondeo_efectivo`, ADR-0311): el saldo en efectivo se cobra al múltiplo
   *  de S/ 0.10, hacia abajo. Con `false` (la base todavía no lo acepta) se cobra exacto, como antes. */
  redondeoEfectivo?: boolean;
}) {
  const router = useRouter();
  const porVariante = useMemo(() => new Map(prendas.map((p) => [p.varianteId, p])), [prendas]);
  const [pagos, setPagos] = useState<PagoAdelanto[]>([]);
  // La marca del envío sigue a lo que se manda (/chaos 2026-10-13): el apartado y los pagos. Si la respuesta se pierde, la vista
  // se congela (ni otro apartado ni otros pagos) hasta saber si la entrega quedó.
  const envio = useIntento("entregar_separacion");
  const enviando = envio.enviando;
  const [revisando, setRevisando] = useState(false);
  const [abonar, setAbonar] = useState(false);
  const [editar, setEditar] = useState(false);
  // El apartado se guarda al abrir: al liberarse deja de estar abierto y la hoja tiene que seguir para ofrecer el WhatsApp.
  const [liberar, setLiberar] = useState<Apartado | null>(null);
  const [reimprimir, setReimprimir] = useState(false);
  const [recordar, setRecordar] = useState(false);
  // El detalle del apartado, abierto desde «Más acciones» en el modo que se pidió (ver, aplazar o marcar enviado).
  const [detalle, setDetalle] = useState<ModoDetalle | null>(null);
  const conAbonos = encendida(apagadas, "abonos");
  const conEditar = encendida(apagadas, "editar");
  const conEstante = encendida(apagadas, "estante");
  const ubicacion = { ubicacionId, etiqueta: ubicacionEtiqueta };
  const [entregado, setEntregado] = useState<{ apartado: Apartado; pagadoHoy: { metodo: string; monto: number }[]; vuelto: number; redondeo: number } | null>(null);
  // Entregar guarda en la tienda (cobra el saldo y cierra la venta): pide Responsable (ADR-0161), vacío en cada entrega
  // (módulo Punto de venta: no propone a quien inició sesión).
  const responsable = useResponsable({ ubicacionId, etiqueta: ubicacionEtiqueta }, { modo: "atencion" });

  /** Cambiar de clienta es otra operación: el combo vuelve a vacío. */
  function elegir(id: string | null) {
    // En duda no se cambia de apartado: la entrega en el aire es la del elegido.
    if (envio.incierto) return;
    responsable.limpiar();
    onElegir(id);
  }

  // Se cobra y se entrega solo lo abierto: lo cancelado de «Pendientes» (ADR-0720) espera su devolución, no un cobro.
  const a = elegido ? apartados.find((x) => x.id === elegido && x.estado === "abierta") ?? null : null;
  const saldo = a ? a.saldo : 0;
  const cobro = cobroDelSaldo(pagos, saldo, redondeoEfectivo);
  const efectivo = pagos.find((p) => p.metodo === "efectivo");

  // Se entregó o se canceló (la lista se refrescó y ya no está abierto): sin una hoja a la vista, se vuelve a la lista de Pendientes.
  const sinApartado = !!elegido && !a;
  useEffect(() => {
    if (sinApartado && !entregado && !liberar) onElegir(null);
  }, [sinApartado, entregado, liberar, onElegir]);

  function tocarMedio(m: MetodoPago) {
    setPagos((ps) => {
      const i = ps.findIndex((p) => p.metodo === m);
      if (i >= 0) return ps.filter((_, j) => j !== i);
      const puesto = ps.reduce((s, p) => s + p.monto, 0);
      return [...ps, { metodo: m, monto: Math.max(0, Math.round((saldo - puesto) * 100) / 100) }];
    });
  }

  async function entregar() {
    if (!a || !cobro.listo || !cajaAbierta || !responsable.listo) return;
    // Con el redondeo del efectivo (ADR-0311) viaja el efectivo YA cobrado en monedas y, aparte, la fila `redondeo`: la suma sigue siendo el
    // saldo exacto. La boleta o factura sale por el TOTAL del apartado y no nombra el adelanto (ADR-0399).
    const pagosRpc = pagosParaRpcApartado(pagos, redondeoEfectivo);
    const params = { p_separacion_id: a.id, p_pagos: pagosRpc };
    const r = await envio.enviar(huellaDe(params), (token, senal) =>
      firmar(createClient().rpc("entregar_separacion", { ...params, p_token: token }), responsable.firma()).abortSignal(senal),
    );
    if (r.tipo === "ocupado" || r.tipo === "congelado") return;
    // Éxito → el combo vuelve a vacío; rechazo por el responsable (marcó salida) → vacía y relee la lista.
    responsable.despues(r.tipo === "error" || r.tipo === "incierto" ? r.error : null);
    // En duda: la vista lo dice arriba y se congela hasta saber qué pasó.
    if (r.tipo === "incierto") return;
    if (r.tipo === "error") {
      avisar.error(traducirError(r.error, "entregar el apartado"));
      return;
    }
    // Como cualquier venta: la boleta o factura se declara a SUNAT en segundo plano; si Lucode no responde queda en la cola de reintento
    // (y, si la respuesta quedó en duda, el barrido la recoge). Un apartado VIEJO (con su boleta de anticipo) no se envía solo: la ruta lo
    // frena hasta que se pruebe el anticipo con Lucode.
    if (esConstancia(a) && r.tipo === "ok" && typeof r.data === "string") enviarVentaASunat(r.data);
    entregadoCon(a, pagosRpc);
  }

  async function revisar() {
    setRevisando(true);
    const res = await envio.revisar();
    setRevisando(false);
    if (res.tipo === "hecho" && a) return entregadoCon(a, pagosParaRpcApartado(pagos, redondeoEfectivo));
    if (res.tipo === "no_llego") {
      avisar.aviso("La entrega no se registró", { detalle: "El apartado sigue abierto y no se cobró el saldo. Revisa los pagos y vuelve a entregar." });
      return;
    }
    if (res.tipo === "sin_respuesta") avisar.error("Todavía no hay respuesta", { detalle: "Revisa el internet y vuelve a tocar «Revisar si se guardó»." });
  }

  function entregadoCon(a: Apartado, pagosRpc: ReturnType<typeof pagosParaRpcApartado>) {
    const pagadoHoy = pagosRpc.flatMap((p) => (p.metodo === "redondeo" ? [] : [{ metodo: NOMBRE_METODO[p.metodo] ?? p.metodo, monto: p.monto }]));
    const redondeo = pagosRpc.find((p) => p.metodo === "redondeo")?.monto ?? 0;
    setEntregado({ apartado: a, pagadoHoy, vuelto: cobro.vuelto, redondeo });
    avisar.exito(`Venta de ${money(a.total)} registrada`, { detalle: `Apartado ${a.codigo} entregado` });
    setPagos([]);
    router.refresh();
  }

  // Lo que se le puede hacer al apartado además de cobrarlo (la Mínima, ADR-0720): en «Más acciones», y «Cancelar apartado» al final, en
  // rojo. Aplazar es de quien gestiona la caja (D5): a quien no, se le ve con su porqué.
  const plazo = a ? opcionesAplazar(a, hoy) : null;
  const acciones: ItemMenu[] = a
    ? [
        ...(a.celular !== "" ? [{ clave: "escribir", etiqueta: "Escribirle", onSelect: () => setRecordar(true) }] : []),
        {
          clave: "aplazar",
          etiqueta: "Aplazar",
          onSelect: () => setDetalle("aplazar"),
          motivo: !puedeGestionar ? "Lo aplaza la líder o la cuenta de ventas de la tienda." : (plazo?.bloqueo ?? undefined),
        },
        ...(a.modoEntrega === "envio" && !a.enviadoEn ? [{ clave: "enviar", etiqueta: "Marcar enviado", onSelect: () => setDetalle("enviar") }] : []),
        { clave: "detalle", etiqueta: "Ver el detalle", onSelect: () => setDetalle("ver") },
        ...(conEditar ? [{ clave: "editar", etiqueta: "Editar prendas", onSelect: () => setEditar(true) }] : []),
        { clave: "cancelar", etiqueta: "Cancelar apartado", onSelect: () => setLiberar(a), peligro: true },
      ]
    : [];

  // El panel de cobro queda quieto donde empieza (en escritorio, vidrio/vender.css): se mide una vez su lugar en la página y su alto llega
  // hasta el borde de la pantalla, con lo de en medio corriendo por dentro. Así el responsable y «Entregar y cobrar» siempre están a la vista.
  const panel = useRef<HTMLElement>(null);
  const idDelCobro = a?.id;
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const medir = () => {
      el.style.removeProperty("--cobro-tope");
      el.style.setProperty("--cobro-tope", `${Math.round(el.getBoundingClientRect().top + window.scrollY)}px`);
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [idDelCobro]);

  // En el celular, mientras falta algo, el botón de la barra dice qué sigue y lleva hasta ahí; con todo listo, entrega.
  const quePide: "pago" | "responsable" | null = !cajaAbierta || enviando ? null : saldo > 0 && !cobro.listo ? "pago" : !responsable.listo ? "responsable" : null;
  function llevarA(que: "pago" | "responsable") {
    const destino = document.getElementById(que === "pago" ? "cobro-como-paga" : "cobro-responsable");
    destino?.scrollIntoView({ block: "center", behavior: prefiereQuieto() ? "auto" : "smooth" });
    destino?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }

  if (!a)
    return (
      <>
        {liberar && <LiberarModal apartado={liberar} ubicacion={ubicacion} onClose={() => setLiberar(null)} />}
        {entregado && <ApartadoEntregadoModal apartado={entregado.apartado} pagadoHoy={entregado.pagadoHoy} vuelto={entregado.vuelto} redondeo={entregado.redondeo} sede={ubicacionEtiqueta} onClose={() => setEntregado(null)} />}
      </>
    );

  const papel = esConstancia(a) ? "constancia" : "boleta";
  return (
    <div className="ap-dos grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_clamp(340px,40%,380px)] xl:grid-cols-[minmax(0,1fr)_420px]">
      {envio.incierto && (
        <div className="ap-dos-aviso px-5 pt-5 sm:px-6 lg:col-span-2">
          <AvisoIntentoIncierto onRevisar={revisar} revisando={revisando} onReintentar={entregar} reintentando={enviando} />
        </div>
      )}
      {/* En duda, nada se toca: otro apartado u otros pagos podrían entregar dos veces. */}
      <fieldset disabled={envio.incierto} className="contents">
      {/* La cabecera va aparte: sobre esta columna si cabe y, si no, a todo el ancho (`.ap-dos-cab`, vidrio/vender.css). */}
      <div className="ap-dos-cab min-w-0">{cabecera}</div>
      <div className="ap-dos-trabajo flex min-w-0 flex-col">
      <div className="ap-cuerpo flex min-w-0 flex-col gap-4 p-5 sm:p-6">
        {/* Lo de arriba es la vuelta a la lista de Pendientes (ADR-0720): aquí ya no se busca. */}
        <Volver onClick={() => elegir(null)} a="Volver a la lista de pendientes" className="self-start" />

        {/* La tarjeta dice quién, cuál y dónde (la Mínima): el nombre con el código del apartado al lado, como en la lista; debajo, cómo
            va, por dónde se vendió y en qué estante está. Lo que se le puede hacer además de cobrarlo, en «Más acciones». */}
        <article className="ap-placa anim-revelar space-y-4 rounded-tarjeta border border-sand p-5">
          <div className="flex items-start gap-3.5">
            <AvatarPersona personaId={null} nombre={nombreParaIniciales(a)} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <span className="font-display text-2xl leading-tight text-tinta">{a.nombres} {a.apellidos}</span>
                <span className="whitespace-nowrap font-mono text-sm text-tenue">{a.codigo}</span>
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <EstadoChip {...estadoVisible(a, hoy)} />
                <CanalChip a={a} className="max-w-full" />
                {conEstante && a.estante && (
                  <span className="inline-flex items-center gap-1 rounded-md vd-gota-chica px-2 py-0.5 font-mono text-sm">
                    <Archive className="h-3 w-3" aria-hidden /> Estante {a.estante}
                  </span>
                )}
              </div>
            </div>
          </div>
          <ul className="divide-y divide-sand border-t border-sand">
            {a.prendas.map((pr) => {
              const v = porVariante.get(pr.varianteId);
              return (
                <li key={pr.itemId || pr.varianteId} className="flex flex-wrap items-center gap-x-3 py-2.5">
                  <FotoPrenda fotoUrl={v?.fotoUrl} referencia={pr.referencia} colorHex={v?.colorHex} categoria={v?.categoria} categoriaPrefijo={v?.categoriaPrefijo} categoriaFamilia={v?.categoriaFamilia} ancho={44} className="w-11" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-tinta">{pr.referencia}</p>
                    <p className="text-sm text-secundario">
                      {prendaDicha({ color: v?.color, talla: v?.talla }) || pr.sku}
                      {pr.cantidad > 1 && `, ${pr.cantidad} unidades`}
                    </p>
                  </div>
                  <ImporteDePrenda prenda={pr} className="font-semibold" />
                  <DescuentoDePrenda prenda={pr} className="mt-1.5 basis-full pl-14" />
                </li>
              );
            })}
          </ul>
          <p className="flex items-start gap-2 rounded-campo border border-sand bg-crema px-3 py-2.5 text-sm text-secundario">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>Mira su DNI o su {papel}; no se anota.</span>
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Lo que más se pide además de cobrar (el papelito perdido): a la vista, con el nombre del papel. */}
            <BotonImprimir chico onClick={() => setReimprimir(true)}>
              Reimprimir {papel}
            </BotonImprimir>
            <MenuAcciones texto="Más acciones" etiqueta={`Más acciones del apartado ${a.codigo}`} items={acciones} deshabilitado={envio.incierto} guia="apartados.mas-acciones" />
          </div>
        </article>
      </div>
      </div>

      {/* El panel de cobro (la Mínima): cuánto cobrar, cómo paga y el botón, que lleva el monto. La cuenta se dice una sola vez; el detalle
          de cada pago está en «Ver el detalle». En escritorio queda quieto bajo la cabecera, con el responsable y el botón a la vista. */}
      <aside ref={panel} data-guia="apartados.entregar-detalle" data-cobro className="ap-ticket flex min-h-0 flex-col">
        <div className="ap-ticket-hilo flex min-h-[65px] items-center gap-3 border-b border-sand px-5 py-2.5">
          <TituloSeccion
            ayuda={
              esConstancia(a)
                ? `Sale la boleta o factura por el total (${money(a.total)}), sin nombrar el adelanto. No se piden datos otra vez.`
                : a.pagos.some((p) => p.abono)
                  ? "Sale la boleta final por lo que falta, que descuenta todos los anticipos (el del apartado y los abonos). No se piden datos otra vez."
                  : `Sale la boleta final por lo que falta, que descuenta el anticipo ${a.comprobanteAnticipo ?? ""}. No se piden datos otra vez.`
            }
          >
            <span className="inline-flex items-center gap-2.5">
              <Wallet className="h-5 w-5 text-secundario" aria-hidden /> Cobrar
            </span>
          </TituloSeccion>
        </div>
        <>
            <div className="scroll-cayla min-h-40 flex-1 overflow-y-auto">
              <div className="anim-revelar space-y-5 px-5 py-4">
                <div className="space-y-1 rounded-campo border border-sand bg-crema p-4 tabular-nums">
                  <p className="flex items-baseline justify-between gap-3 text-tinta">
                    <span className="text-sm">Le falta</span>
                    <b className="font-display text-3xl font-normal lg:[@media(max-height:820px)]:text-2xl">{money(saldo)}</b>
                  </p>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="text-sm text-secundario">{saldo > 0 ? `Ya pagó ${money(Math.round((a.total - saldo) * 100) / 100)} de ${money(a.total)}` : "Ya pagó todo: no se cobra nada más."}</p>
                    {/* Pagar solo una parte: junto a lo que falta, siempre a la vista (abajo, en una pantalla baja quedaba bajo el pie). */}
                    {conAbonos && saldo > 0 && (
                      <button type="button" onClick={() => setAbonar(true)} disabled={!cajaAbierta} title={cajaAbierta ? "Paga una parte; la prenda se queda guardada." : "Abre la caja para registrar un abono."} className="btn-enlace ml-auto text-sm">
                        Solo abona una parte
                      </button>
                    )}
                  </div>
                </div>
                {saldo > 0 && (
                  <fieldset id="cobro-como-paga" className="space-y-2">
                    <legend className="mb-2 text-sm text-secundario">Cómo paga</legend>
                    <div className="grid grid-cols-5 gap-1 rounded-xl vd-hundido p-1">
                      {METODOS_PAGO.map((m) => {
                        const puesto = pagos.some((p) => p.metodo === m);
                        return (
                          <button key={m} type="button" aria-pressed={puesto} onClick={() => tocarMedio(m)} style={puesto ? { backgroundColor: "var(--ct)", color: "var(--cd)" } : undefined} className={`metodo-${m} relative flex h-14 flex-col items-center justify-center gap-1 rounded-lg px-0 text-sm capitalize transition-colors ${puesto ? "anim-pop shadow-sm" : OPCION_INACTIVA}`}>
                            {ICONO_METODO[m]}
                            <span className="max-w-full truncate text-detalle">{NOMBRE_CORTO[m] ?? m}</span>
                          </button>
                        );
                      })}
                    </div>
                    {pagos.length > 0 && (
                      <div className="anim-revelar divide-y divide-sand rounded-lg border border-sand bg-crema">
                        {pagos.map((pg, i) => (
                          <div key={pg.metodo} className="flex items-center gap-3 px-3 py-2">
                            <span className={`metodo-${pg.metodo} flex flex-1 items-center gap-2 text-sm capitalize`} style={{ color: "var(--cd)" }}>
                              {ICONO_METODO[pg.metodo]} {pg.metodo}
                            </span>
                            <span className="flex items-center gap-1 border-b border-tinta/20 text-sm">
                              <span className="text-tinta/50">S/</span>
                              <EntradaMonto aria-label={`Monto en ${pg.metodo}`} valor={pg.monto} onCambio={(v) => setPagos((ps) => ps.map((y, j) => (j === i ? { ...y, monto: v } : y)))} className="w-20 bg-transparent py-1 text-right tabular-nums outline-none" />
                            </span>
                            <button type="button" aria-label={`Quitar ${pg.metodo}`} onClick={() => setPagos((ps) => ps.filter((_, j) => j !== i))} className="p-1 text-rojo-profundo">
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* El efectivo del saldo con la ley: lo que se cobra en monedas y lo que no (ADR-0311). Es la misma frase de la hoja de Vender. */}
                    {cobro.efectivo && cobro.efectivo.redondeo > 0 && cobro.efectivo.aCobrar > 0 && (
                      <p className="anim-revelar rounded-lg vd-placa px-3 py-2 text-sm leading-snug text-tinta/80" data-redondeo>
                        Cobra <b className="font-semibold text-tinta tabular-nums">{money(cobro.efectivo.aCobrar)}</b> en efectivo
                        <span className="block text-sm text-tinta/60">
                          {TEXTO_REDONDEO} −{money(cobro.efectivo.redondeo)} · {LEY_REDONDEO}
                        </span>
                      </p>
                    )}
                    {/* Menos de la moneda más chica: no hay con qué entregarlo. Lo mismo que dice el botón apagado. */}
                    {cobro.sinMoneda && (
                      <p className="rounded-lg vd-placa px-3 py-2 text-sm leading-snug text-ambar-profundo" data-redondeo-sin-moneda>
                        No hay moneda para <b className="font-semibold tabular-nums">{money(cobro.efectivo?.deuda ?? 0)}</b>: la más chica es S/&nbsp;0.10. Cóbralo con otro medio.
                      </p>
                    )}
                    {efectivo && (cobro.efectivo?.aCobrar ?? 0) > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm text-tinta/55">Con cuánto paga en efectivo (toca los billetes)</p>
                        <div className="flex flex-wrap gap-1.5">
                          {BILLETES.map((b) => (
                            <BilleteRapido key={b} valor={b} onSumar={() => setPagos((ps) => ps.map((y) => (y.metodo === "efectivo" ? { ...y, recibido: (y.recibido ?? 0) + b } : y)))} />
                          ))}
                          {efectivo.recibido !== undefined && (
                            <button type="button" onClick={() => setPagos((ps) => ps.map((y) => (y.metodo === "efectivo" ? { ...y, recibido: undefined } : y)))} className="text-sm text-tinta/60 underline">
                              Borrar ({money(efectivo.recibido)})
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {cobro.excede && <Aviso tono="error" chico>Con esos medios no hay vuelto: cobra justo {money(saldo)}.</Aviso>}
                    {cobro.falta > 0 && pagos.length > 0 && <Aviso tono="error" chico>Falta {money(cobro.falta)}</Aviso>}
                    {cobro.noAlcanza && <Aviso tono="error" chico>Lo recibido no alcanza.</Aviso>}
                    {cobro.vueltoExcede && <Aviso tono="error" chico>El vuelto pasa de S/&nbsp;500: revisa cuánto entregó.</Aviso>}
                  </fieldset>
                )}
                {cobro.vuelto > 0 && (
                  <div className="anim-revelar flex items-baseline justify-between rounded-xl border border-tinta/15 bg-papel px-4 py-2.5">
                    <span className="label-cayla text-xs text-tinta/70">Entregar vuelto</span>
                    <span className="font-display text-2xl tabular-nums">{money(cobro.vuelto)}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="ap-ticket-hilo space-y-3 border-t border-sand px-5 py-5">
              {/* El combo «Responsable» (ADR-0161), justo encima del botón que guarda, como en Cobrar; se abre hacia arriba. */}
              {cajaAbierta && (
                <div id="cobro-responsable">
                  <ComboResponsable control={responsable} deshabilitado={enviando} compacto />
                </div>
              )}
              <button
                type="button"
                disabled={enviando || !cobro.listo || !cajaAbierta || !responsable.listo || cobro.noAlcanza}
                title={cajaAbierta ? (responsable.motivo ?? undefined) : undefined}
                onClick={entregar}
                className={`${BOTON_PRINCIPAL} max-lg:hidden`}
              >
                <span className="label-cayla flex items-center gap-2.5 whitespace-nowrap text-xs"><ShoppingBag className="h-4 w-4 max-xl:hidden" aria-hidden /> {enviando ? "Guardando…" : saldo > 0 ? "Entregar y cobrar" : "Entregar" /* unificar-fijo: el botón grande del mostrador con el monto (spike de Vender), como «Cobrar» */}</span>
                <span className="font-display text-xl tabular-nums">{money(saldo)}</span>
              </button>
              <p className="text-center text-sm text-tinta/55">{!cajaAbierta ? "Abre la caja para poder entregar." : cobro.sinMoneda ? AVISO_EFECTIVO_SIN_MONEDA : !cobro.listo ? "Elige cómo paga." : (responsable.motivo ?? "Listo: entrega la prenda y la boleta.")}</p>
            </div>
        </>
      </aside>

      {a && (
        <BarraMovil
          etiqueta="Le falta"
          monto={saldo}
          accion={enviando ? "Guardando…" : quePide === "pago" ? "Elige cómo paga" : quePide === "responsable" ? "Elige quién atiende" : saldo > 0 ? "Entregar y cobrar" : "Entregar" /* unificar-fijo: el botón grande del mostrador con el monto (spike de Vender), como «Cobrar» */}
          icono={quePide ? <ArrowDown className="h-4 w-4" aria-hidden /> : <ShoppingBag className="h-4 w-4" aria-hidden />}
          deshabilitado={quePide ? false : enviando || !cobro.listo || !cajaAbierta || !responsable.listo || cobro.noAlcanza}
          onClick={quePide ? () => llevarA(quePide) : entregar}
        />
      )}

      {abonar && a && <AbonarModal apartado={a} ubicacion={ubicacion} cajaAbierta={cajaAbierta} onClose={() => setAbonar(false)} />}
      {editar && a && <EditarApartadoModal apartado={a} prendas={prendas} ubicacion={ubicacion} onClose={() => setEditar(false)} />}
      {liberar && <LiberarModal apartado={liberar} ubicacion={ubicacion} onClose={() => setLiberar(null)} />}
      {reimprimir && <ReimprimirApartadoModal apartado={a} sede={ubicacionEtiqueta} onClose={() => setReimprimir(false)} />}
      {/* Escribirle: la misma hoja del lote, con este cliente; al cerrar, la lista se relee para que diga «Avisado hoy». */}
      {recordar && <RecordarModal cola={[a]} ubicacion={ubicacion} hoy={hoy} onAvisada={() => router.refresh()} onClose={() => setRecordar(false)} />}
      {detalle && (
        <DetalleApartadoModal
          key={detalle}
          apartado={a}
          ubicacion={ubicacion}
          hoy={hoy}
          cajaAbierta={cajaAbierta}
          puedeGestionar={puedeGestionar}
          conAbonos={conAbonos}
          conEstante={conEstante}
          prendas={prendas}
          modoInicial={detalle}
          onEntregar={() => setDetalle(null)}
          onClose={() => setDetalle(null)}
        />
      )}

      {entregado && <ApartadoEntregadoModal apartado={entregado.apartado} pagadoHoy={entregado.pagadoHoy} vuelto={entregado.vuelto} redondeo={entregado.redondeo} sede={ubicacionEtiqueta} onClose={() => setEntregado(null)} />}
      </fieldset>
    </div>
  );
}
