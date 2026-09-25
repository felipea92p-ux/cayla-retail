"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { ETIQUETA_METODO, soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import {
  ETIQUETA_MOTIVO_NOTA,
  chipFactura,
  filtrarFacturas,
  notaMotivoAyuda,
  resaltarFlexible,
  textoDestino,
  validarNota,
  type BorradorNota,
  type DestinoDinero,
  type FacturaParaNota,
  type FilaVista,
  type FiltroFacturas,
  type MotivoNota,
} from "@/lib/notas-credito-reglas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { CampoSaleDe, useCuentasParaElegir } from "@/components/finanzas/CampoCuenta";
import { cuentaEfectiva } from "@/lib/cuenta-sellada-reglas";

/* ====================================================================
   Registrar una nota de crédito de compra (2026-09-19)
   Spike: docs/maquetas/notas-credito-spike-2026-09/ (pantallas 3, 3a y 3b)

   La ÚNICA puerta para registrar una nota. Antes el mismo formulario vivía en dos lados —dentro de la
   guía de Recepción y en el detalle del comprobante—; acá es uno solo, y la recepción vuelve a ser solo
   contar y decidir.

   Tres cosas que el formulario hace y que no son obvias:

   1. La factura de origen se ELIGE con un buscador (por serie-número, proveedor o MONTO, con o sin
      comas ni guiones). Hasta que haya una elegida, el resto del formulario está `inert` y atenuado: no
      hay nada que llenar sin saber contra qué.
   2. «Qué pasa con el dinero» muestra SIEMPRE las tres partes —baja la deuda · se devuelve ahora ·
      queda a favor— porque la pregunta de quien registra es justamente esa. Lo primero que hace una
      nota es bajar lo que aún se le debe al proveedor; el destino solo decide qué pasa con el SOBRANTE,
      y si no sobra nada las dos fichas se ven pero deshabilitadas, con su porqué.
   3. El monto se valida con las MISMAS reglas que la base (`validarNota`, espejo de
      `fn_insertar_nota_credito_compra`): un monto de más se explica con el número exacto y un botón
      para usarlo, en vez de dejar que el error llegue después de llenar todo.

   Movimiento: hereda el del sistema (ADR-0136) por usar `<Modal>`; lo único propio son respuestas a una
   acción —la barra de tres tramos que se reparte, el «visto» que se dibuja— sin bucle y sin rebote.

   MIENTRAS LA BASE NO TENGA EL DESTINO (principio 9): `p_destino` solo se manda cuando es `'reembolso'`.
   Con el valor por omisión (`'a_favor'`, lo que la base ya hace hoy) la llamada es la de siempre y el
   módulo sirve desde el primer día; «Nos lo devuelve ahora» es lo único que espera la migración.
   ==================================================================== */

const MOTIVOS: MotivoNota[] = ["faltante", "devolucion", "descuento", "otro"];
const MEDIOS_DEVOLUCION = ["transferencia", "efectivo", "yape", "plin", "otro"];
const FILTROS: { clave: FiltroFacturas; etiqueta: string }[] = [
  { clave: "todas", etiqueta: "Todas" },
  { clave: "con_saldo", etiqueta: "Con saldo" },
  { clave: "pagadas", etiqueta: "Pagadas" },
];

type Props = {
  facturas: FacturaParaNota[];
  /** Aviso si la base todavía no puede entregar las facturas (la migración no está aplicada). */
  fallaFacturas: string | null;
  /** Todo el tablero: de ahí salen el faltante pendiente y las series ya usadas de cada comprobante. */
  filas: FilaVista[];
  /** Comprobante precargado (se abrió desde una nota por reclamar). */
  compraIdInicial?: string | null;
  hoy: string;
  onCerrar: () => void;
};

export function RegistrarNotaCreditoModal({ facturas, fallaFacturas, filas, compraIdInicial = null, hoy, onCerrar }: Props) {
  const router = useRouter();
  const inicial = compraIdInicial ?? null;
  const [borrador, setBorrador] = useState<BorradorNota>({
    compraId: inicial,
    motivo: "faltante",
    serieNumero: "",
    fecha: hoy,
    montoTxt: null,
    destino: "a_favor",
    reembolsoMetodo: "transferencia",
    reembolsoFecha: hoy,
    reembolsoReferencia: "",
  });
  const [cambiando, setCambiando] = useState(false);
  const [texto, setTexto] = useState("");
  const [filtro, setFiltro] = useState<FiltroFacturas>("todas");
  const [activa, setActiva] = useState(0);
  const [intento, setIntento] = useState(false);
  const [tocoMonto, setTocoMonto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // Quién registra la nota (ADR-0161/0162): `registrar_nota_credito_compra` firma con esa persona.
  const responsable = useResponsable();
  // «Entra a» (ADR-0195 F3b, situación 6): con reembolso, a qué cuenta entró la plata. Al cajón, con su ingreso de caja.
  const cuentasReembolso = useCuentasParaElegir("reembolso", null);
  const [cuentaElegida, setCuentaElegida] = useState<string | null>(null);
  const cuentaEntra = cuentaEfectiva(cuentasReembolso.cuentas, "reembolso", borrador.reembolsoMetodo, cuentaElegida);
  const [exito, setExito] = useState<{ serie: string; lineas: [string, string][]; titulo: string; frase: string } | null>(null);

  const refBuscador = useRef<HTMLInputElement>(null);
  const refSerie = useRef<HTMLInputElement>(null);
  const refMonto = useRef<HTMLInputElement>(null);

  const factura = useMemo(() => facturas.find((f) => f.id === borrador.compraId) ?? null, [facturas, borrador.compraId]);
  const buscando = !factura || cambiando;

  const pendiente = useMemo(() => {
    const p = filas.find((f) => f.clase === "pendiente" && f.compraId === borrador.compraId);
    return p ? { montoEsperado: p.montoEsperado, unidadesCerradas: p.unidadesCerradas, bloqueada: p.bloqueada, cierreId: p.cierreId } : null;
  }, [filas, borrador.compraId]);
  const notasDeLaFactura = useMemo(() => filas.filter((f) => f.clase === "nota" && f.compraId === borrador.compraId), [filas, borrador.compraId]);
  const yaTieneNotaFaltante = notasDeLaFactura.some((f) => f.motivo === "faltante");
  const seriesUsadas = notasDeLaFactura.map((f) => f.serieNumero ?? "");

  const v = validarNota({ borrador, factura, pendiente, yaTieneNotaFaltante, seriesUsadas, hoy });
  const faltanteDisponible = !!pendiente && !pendiente.bloqueada && !yaTieneNotaFaltante;

  const resultados = useMemo(
    () => filtrarFacturas(facturas, { texto, filtro, proveedorId: null }).slice(0, 60),
    [facturas, texto, filtro],
  );

  // El foco arranca donde toca: en el buscador si hay que elegir factura, en la serie si ya viene una.
  useEffect(() => {
    const t = setTimeout(() => (borrador.compraId ? refSerie.current : refBuscador.current)?.focus({ preventScroll: true }), 220);
    return () => clearTimeout(t);
    // Solo al montar: después el foco lo mueve cada acción.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function elegirFactura(id: string) {
    const f = facturas.find((x) => x.id === id);
    const hayFaltante = filas.some((x) => x.clase === "pendiente" && x.compraId === id && !x.bloqueada) && !filas.some((x) => x.clase === "nota" && x.compraId === id && x.motivo === "faltante");
    setBorrador((b) => ({ ...b, compraId: id, motivo: hayFaltante ? "faltante" : b.motivo === "faltante" ? "devolucion" : b.motivo, montoTxt: null }));
    setTocoMonto(false);
    setCambiando(false);
    setTexto("");
    setActiva(0);
    if (f) setTimeout(() => refSerie.current?.focus({ preventScroll: true }), 300);
  }

  function tecladoBuscador(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      if (resultados.length) setActiva((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + resultados.length) % resultados.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const f = resultados[activa];
      if (f) elegirFactura(f.id);
    } else if (e.key === "Escape") {
      // Escape borra primero lo escrito; recién después cancela el cambio de factura. Nunca cierra el
      // modal de una: se perdería todo lo llenado por querer limpiar una búsqueda.
      if (texto) {
        e.preventDefault();
        e.stopPropagation();
        setTexto("");
        setActiva(0);
      } else if (factura && cambiando) {
        e.preventDefault();
        e.stopPropagation();
        setCambiando(false);
      }
    }
  }

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (enviando) return;
    setIntento(true);
    if (!factura) {
      refBuscador.current?.focus();
      return;
    }
    const primero = (["serie", "fecha", "monto", "reembolsoFecha"] as const).find((k) => v.errores[k]);
    if (v.errores.motivo || primero) {
      (primero === "monto" ? refMonto.current : refSerie.current)?.focus();
      avisar.error(v.errores[primero ?? "motivo"] ?? "Falta corregir un dato de la nota.");
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }

    setEnviando(true);
    const supabase = createClient();
    const devuelve = v.destino === "reembolso";
    const { error } = await firmar(supabase.rpc("registrar_nota_credito_compra", {
      p_compra_id: factura.id,
      p_serie_numero: borrador.serieNumero.trim().toUpperCase(),
      p_fecha: borrador.fecha,
      p_monto: v.monto,
      p_motivo: borrador.motivo,
      ...(pendiente?.cierreId && borrador.motivo === "faltante" ? { p_cierre_id: pendiente.cierreId } : {}),
      // Solo se manda cuando cambia lo que la base ya hace por omisión: así la pantalla funciona
      // también contra la versión de la función que todavía no conoce el destino.
      ...(devuelve
        ? {
            p_destino: "reembolso",
            p_reembolso_metodo: borrador.reembolsoMetodo,
            p_reembolso_fecha: borrador.reembolsoFecha,
            ...(borrador.reembolsoReferencia.trim() ? { p_reembolso_referencia: borrador.reembolsoReferencia.trim() } : {}),
            ...(cuentaEntra ? { p_reembolso_cuenta_id: cuentaEntra } : {}),
          }
        : {}),
    } as never), responsable.firma());
    setEnviando(false);
    responsable.despues(error);

    if (error) {
      avisar.error(traducirError(error, "registrar la nota de crédito", { confirmarAntesDeRepetir: true }));
      return;
    }

    const r = v.reparto!;
    const serie = borrador.serieNumero.trim().toUpperCase();
    const lineas: [string, string][] = [];
    lineas.push(r.baja > 0 ? [`Lo que se debe de ${factura.documento}`, `${soles(factura.saldo)} → ${soles(r.deudaDespues)}`] : [`${factura.documento} ya estaba pagado`, "sin cambio"]);
    if (r.devuelve > 0) lineas.push([`Reembolso registrado · ${ETIQUETA_METODO[borrador.reembolsoMetodo] ?? borrador.reembolsoMetodo}`, soles(r.devuelve)]);
    if (r.aFavor > 0) lineas.push([`Saldo a favor con ${factura.proveedorNombre}`, `+ ${soles(r.aFavor)}`]);
    lineas.push(["Crédito fiscal (IGV) del mes", `− ${soles(Math.round((v.monto - v.monto / 1.18) * 100) / 100)}`]);

    setExito({
      serie,
      lineas,
      titulo: devuelve ? `Nota ${serie} y reembolso registrados` : `Nota ${serie} registrada`,
      frase: textoDestino(r, { documento: factura.documento, proveedor: factura.proveedorNombre, saldo: factura.saldo, destino: v.destino ?? "a_favor", pasado: true }),
    });
    avisar.exito(devuelve ? `Nota ${serie} y reembolso de ${soles(r.devuelve)} registrados` : `Nota ${serie} registrada`, {
      detalle:
        r.devuelve > 0
          ? `${factura.proveedorNombre} devolvió ${soles(r.devuelve)} por ${(ETIQUETA_METODO[borrador.reembolsoMetodo] ?? borrador.reembolsoMetodo).toLowerCase()}.`
          : r.aFavor > 0
            ? `Quedan ${soles(r.aFavor)} a favor con ${factura.proveedorNombre}.`
            : `Bajó lo que se debe de ${factura.documento} en ${soles(r.baja)}.`,
    });
    router.refresh();
  }

  // -------------------------------------------------------------------------

  if (exito) {
    return (
      <Modal titulo={exito.titulo} variante="papel" ancho="max-w-xl" onClose={onCerrar}>
        {(cerrar) => (
          <div className="pt-2 text-center" data-sin-cascada>
            <svg aria-hidden viewBox="0 0 64 64" className="mx-auto mb-3 h-16 w-16 fill-none stroke-verde" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <circle pathLength={1} cx="32" cy="32" r="29" className="trazo-linea anim-trazo" style={{ ["--i" as string]: 0 }} />
              <path pathLength={1} d="M19 33l9 9 17-20" className="trazo-linea anim-trazo" style={{ ["--i" as string]: 12 }} />
            </svg>
            <p className="mx-auto max-w-md text-sm text-tinta/70">{exito.frase}</p>
            <ul className="mx-auto mt-5 max-w-md text-left">
              {exito.lineas.map(([a, b], i) => (
                <li key={a} className="anim-revelar flex items-center justify-between gap-3 border-t border-tinta/10 py-2 text-[13.5px]" style={{ animationDelay: `${420 + i * 90}ms` }}>
                  <span className="text-tinta/75">{a}</span>
                  <span className="whitespace-nowrap font-semibold tabular-nums text-tinta">{b}</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={cerrar} className="label-cayla boton-brillo mt-6 rounded-md bg-tinta px-5 py-3 text-[11px] text-crema transition-colors hover:bg-rojo">
              Listo
            </button>
          </div>
        )}
      </Modal>
    );
  }

  const bajada = !factura || cambiando ? "Busca la factura contra la que el proveedor emitió la nota." : compraIdInicial ? "Viene de una nota por reclamar: la factura, el motivo y el monto ya están puestos." : "Revisa la factura y completa la nota.";

  return (
    <Modal titulo="Registrar nota de crédito" subtitulo={bajada} variante="papel" ancho="max-w-3xl" onClose={onCerrar}>
      {(cerrar) => (
        <form onSubmit={registrar} noValidate className="mt-4 space-y-5">
          {/* --- factura de origen: ficha o buscador ------------------------------------ */}
          <section>
            <p className="label-cayla mb-2 text-[11px] text-tinta/65">Factura de origen</p>

            <div className="nc-colapsa" data-abierto={factura && !cambiando ? "true" : "false"}>
              <div>{factura && <FichaFactura factura={factura} filas={filas} onCambiar={() => { setCambiando(true); setActiva(0); setTimeout(() => refBuscador.current?.focus(), 120); }} />}</div>
            </div>

            <div className="nc-colapsa" data-abierto={buscando ? "true" : "false"}>
              <div>
                <div className="flex items-center gap-2.5 rounded-lg border border-tinta/25 bg-papel px-3 py-2 transition-colors focus-within:border-rojo">
                  <Search aria-hidden className="h-4 w-4 shrink-0 text-tinta/45" />
                  <input
                    ref={refBuscador}
                    type="search"
                    role="combobox"
                    aria-expanded={resultados.length > 0}
                    aria-controls="nc-fb-lista"
                    aria-autocomplete="list"
                    aria-activedescendant={resultados[activa] ? `nc-fb-${resultados[activa].id}` : undefined}
                    aria-label="Buscar factura por serie-número, proveedor o monto"
                    placeholder="Serie-número, proveedor o monto"
                    autoComplete="off"
                    spellCheck={false}
                    value={texto}
                    onChange={(e) => { setTexto(e.target.value); setActiva(0); }}
                    onKeyDown={tecladoBuscador}
                    className="h-6 min-w-0 flex-1 bg-transparent text-sm text-tinta outline-none placeholder:text-tinta/45"
                  />
                  <span className="whitespace-nowrap text-xs tabular-nums text-tinta/55">{resultados.length ? `${resultados.length} ${resultados.length === 1 ? "factura" : "facturas"}` : "Sin resultados"}</span>
                  <kbd className="rounded border border-tinta/15 px-1.5 text-[10.5px] font-semibold text-tinta/55">↑↓</kbd>
                </div>

                <div role="radiogroup" aria-label="Filtrar facturas" className="mt-2.5 flex flex-wrap gap-1.5">
                  {FILTROS.map((f) => (
                    <button
                      key={f.clave}
                      type="button"
                      role="radio"
                      aria-checked={filtro === f.clave}
                      onClick={() => { setFiltro(f.clave); setActiva(0); refBuscador.current?.focus(); }}
                      className={`label-cayla rounded-full border px-3 py-1 text-[10px] leading-4 transition-colors ${filtro === f.clave ? "border-tinta bg-tinta text-crema" : "border-tinta/15 bg-tinta/[0.04] text-tinta/75 hover:border-rojo hover:text-rojo"}`}
                    >
                      {f.etiqueta}
                    </button>
                  ))}
                </div>

                <div id="nc-fb-lista" role="listbox" aria-label="Facturas de compra" className="scroll-cayla mt-2.5 max-h-[250px] overflow-y-auto overscroll-contain rounded-xl border border-sand">
                  {fallaFacturas ? (
                    <p className="px-3.5 py-5 text-center text-[13px] text-tinta/65">{fallaFacturas}</p>
                  ) : resultados.length === 0 ? (
                    <div className="px-3.5 py-5 text-center">
                      <p className="font-display text-[18px] italic text-tinta/65">No hay facturas que coincidan</p>
                      <p className="mt-0.5 text-[12.5px] text-tinta/55">Prueba con otra serie, otro proveedor o un monto.</p>
                      {(texto || filtro !== "todas") && (
                        <button type="button" onClick={() => { setTexto(""); setFiltro("todas"); setActiva(0); refBuscador.current?.focus(); }} className="mt-2 text-[13px] text-rojo hover:underline">
                          Ver todas las facturas
                        </button>
                      )}
                    </div>
                  ) : (
                    resultados.map((f, i) => {
                      const chip = chipFactura(f, hoy);
                      return (
                        <button
                          key={f.id}
                          id={`nc-fb-${f.id}`}
                          type="button"
                          role="option"
                          aria-selected={i === activa}
                          onMouseMove={() => i !== activa && setActiva(i)}
                          onClick={() => elegirFactura(f.id)}
                          className={`nc-fb-op ${i > 0 ? "border-t border-tinta/10" : ""}`}
                        >
                          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                            <span className="text-sm font-semibold tabular-nums text-tinta"><Marcado texto={f.documento} busqueda={texto} /></span>
                            <span className="text-[13px] text-tinta/65"><Marcado texto={f.proveedorNombre} busqueda={texto} /></span>
                          </span>
                          <span className="col-start-1 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
                            <Chip tono={chip.tono}>{chip.texto}</Chip>
                            {f.tieneNota && <Chip tono="neutro">Con nota</Chip>}
                            <span className="text-tinta/55">emitida {diaMes(f.fechaEmision)}</span>
                          </span>
                          <span className="col-start-2 row-span-2 row-start-1 flex flex-col justify-center text-right text-sm">
                            <span className="tabular-nums text-tinta"><Marcado texto={soles(f.total)} busqueda={texto} /></span>
                            <span className="text-xs tabular-nums text-tinta/55">{f.saldo > 0.004 ? <>Saldo <Marcado texto={soles(f.saldo)} busqueda={texto} /></> : "Sin saldo"}</span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Todo lo que depende de la factura: mientras no haya una, se ve pero no se puede usar. */}
          <fieldset disabled={buscando || enviando} className={`m-0 space-y-5 border-0 p-0 ${buscando ? "nc-tenue" : "nc-tenue opacity-100"}`}>
            {/* --- motivo ------------------------------------------------------------- */}
            <section>
              <p className="label-cayla mb-2 text-[11px] text-tinta/65">Motivo</p>
              <div role="radiogroup" aria-label="Motivo de la nota" className="flex flex-wrap gap-1.5">
                {MOTIVOS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={borrador.motivo === m}
                    disabled={m === "faltante" && !faltanteDisponible}
                    title={m === "faltante" && !faltanteDisponible ? "Todavía no disponible en este comprobante" : undefined}
                    onClick={() => { setBorrador((b) => ({ ...b, motivo: m, montoTxt: null })); setTocoMonto(false); }}
                    className={`label-cayla rounded-full border px-3 py-1 text-[10px] leading-4 transition-colors disabled:opacity-40 ${borrador.motivo === m ? "border-tinta bg-tinta text-crema" : "border-tinta/15 bg-tinta/[0.04] text-tinta/75 enabled:hover:border-rojo enabled:hover:text-rojo"}`}
                  >
                    {ETIQUETA_MOTIVO_NOTA[m]}
                  </button>
                ))}
              </div>
              {factura && <p className="mt-2 text-xs leading-relaxed text-tinta/65">{notaMotivoAyuda({ motivo: borrador.motivo, pendiente: pendiente ? { bloqueada: pendiente.bloqueada } : null, yaTieneNotaFaltante })}</p>}
            </section>

            {/* --- serie, fecha, monto ------------------------------------------------ */}
            <section className="grid gap-4 sm:grid-cols-[1.4fr_1fr_1fr]">
              <label className="block">
                <span className="label-cayla text-[11px] text-tinta/70">Serie-número</span>
                <input
                  ref={refSerie}
                  value={borrador.serieNumero}
                  onChange={(e) => setBorrador((b) => ({ ...b, serieNumero: e.target.value.toUpperCase() }))}
                  placeholder="FC01-000018"
                  autoComplete="off"
                  className={`mt-1 w-full border-b bg-transparent px-0.5 py-2 font-mono text-sm uppercase tabular-nums tracking-wider text-tinta outline-none placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-tinta/45 ${intento && v.errores.serie ? "border-rojo" : "border-tinta/20 focus:border-rojo"}`}
                />
                {intento && v.errores.serie && <span role="alert" className="anim-revelar mt-1 block text-xs text-rojo">{v.errores.serie}</span>}
              </label>
              <CampoFecha etiqueta="Fecha de la nota" valor={borrador.fecha} onValor={(iso) => setBorrador((b) => ({ ...b, fecha: iso }))} tono={v.errores.fecha ? "error" : undefined} pie={v.errores.fecha} required />
              <label className="block">
                <span className="label-cayla text-[11px] text-tinta/70">Monto (con IGV)</span>
                <span className={`mt-1 flex items-center gap-2 border-b ${(tocoMonto || intento) && v.errores.monto ? "border-rojo" : "border-tinta/20 focus-within:border-rojo"}`}>
                  <span className="text-sm text-tinta/55">S/</span>
                  <input
                    ref={refMonto}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    value={v.montoMostrado}
                    onChange={(e) => { setBorrador((b) => ({ ...b, montoTxt: e.target.value })); setTocoMonto(true); }}
                    className="w-full min-w-0 bg-transparent py-2 font-mono text-sm tabular-nums tracking-wider text-tinta outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-tinta/45"
                  />
                </span>
                <span className="mt-1 block text-xs text-tinta/55">
                  {borrador.motivo === "faltante" && v.sugerido > 0 ? `Lo cerrado a su costo + IGV. Puedes ajustarlo hasta ${soles(v.tope)}.` : factura ? `Hasta ${soles(v.tope)}: lo que aún queda por acreditar de ${factura.documento}.` : ""}
                </span>
                {(tocoMonto || intento) && v.errores.monto && <span role="alert" className="anim-revelar mt-1 block text-xs text-rojo">{v.errores.monto}</span>}
              </label>
            </section>

            {/* --- qué pasa con el dinero --------------------------------------------- */}
            <section>
              <p className="label-cayla mb-2 text-[11px] text-tinta/65">Qué pasa con el dinero</p>
              <p className="mb-3 text-[13px] leading-relaxed text-tinta/70">
                Lo primero que hace una nota es <b className="font-semibold">bajar lo que aún le debes al proveedor</b> por esa factura. El dinero que sobra —o todo el monto, si la factura ya
                estaba pagada— es el que <b className="font-semibold">se devuelve o queda a favor</b>.
              </p>
              <TresPartes reparto={v.reparto} monto={v.monto} />

              <div role="radiogroup" aria-label="Qué se hace con el dinero que sobra" className="mt-3 grid gap-2.5 sm:grid-cols-2">
                <FichaDestino
                  valor="reembolso"
                  titulo="Nos lo devuelve ahora"
                  detalle="El proveedor nos paga el sobrante en este momento (reembolso)."
                  elegido={v.destino === "reembolso"}
                  habilitada={v.haySobrante}
                  onElegir={(d) => setBorrador((b) => ({ ...b, destino: d }))}
                />
                <FichaDestino
                  valor="a_favor"
                  titulo="Queda a favor para otra compra"
                  detalle="Es saldo a favor del proveedor. Se sugiere al pagar; nunca se descuenta solo."
                  elegido={v.destino === "a_favor"}
                  habilitada={v.haySobrante}
                  onElegir={(d) => setBorrador((b) => ({ ...b, destino: d }))}
                />
              </div>

              <p className="mt-2.5 text-xs leading-relaxed text-tinta/65">
                {!factura
                  ? "Elige primero la factura."
                  : !v.reparto
                    ? "Escribe el monto y verás cuánto baja la deuda y cuánto sobra."
                    : !v.haySobrante
                      ? "Esta nota solo baja la deuda: no hay dinero que devolver. Las fichas se activan cuando la nota es mayor que lo que aún debes (o la factura ya está pagada)."
                      : v.destino === "reembolso"
                        ? "Se registra el reembolso junto con la nota, en un solo paso. El saldo a favor de este proveedor no cambia."
                        : "Queda como saldo a favor del proveedor. Se te sugiere en «Pagar juntos»; lo decide quien paga, nunca se descuenta solo."}
              </p>

              <div className="nc-colapsa mt-3" data-abierto={v.destino === "reembolso" ? "true" : "false"}>
                <div>
                  <div className="rounded-xl border border-sand p-4">
                    <p className="label-cayla text-[11px] text-tinta/70">Cómo lo devuelve</p>
                    <div role="radiogroup" aria-label="Medio de devolución" className="mt-2 flex flex-wrap gap-1.5">
                      {MEDIOS_DEVOLUCION.map((m) => (
                        <button
                          key={m}
                          type="button"
                          role="radio"
                          aria-checked={borrador.reembolsoMetodo === m}
                          onClick={() => setBorrador((b) => ({ ...b, reembolsoMetodo: m }))}
                          className={`label-cayla rounded-full border px-3 py-1 text-[10px] leading-4 transition-colors ${borrador.reembolsoMetodo === m ? "border-tinta bg-tinta text-crema" : "border-tinta/15 bg-tinta/[0.04] text-tinta/75 hover:border-rojo hover:text-rojo"}`}
                        >
                          {ETIQUETA_METODO[m] ?? m}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3.5">
                      <CampoSaleDe
                        etiqueta="Entra a"
                        sentido="entra"
                        cuentas={cuentasReembolso.cuentas}
                        listo={cuentasReembolso.listo}
                        clase="reembolso"
                        medio={borrador.reembolsoMetodo}
                        valor={cuentaEntra}
                        onValor={setCuentaElegida}
                      />
                    </div>
                    <div className="mt-3.5 grid gap-4 sm:grid-cols-[1fr_1.4fr]">
                      <CampoFecha etiqueta="Fecha en que lo devuelve" valor={borrador.reembolsoFecha} onValor={(iso) => setBorrador((b) => ({ ...b, reembolsoFecha: iso }))} tono={v.errores.reembolsoFecha ? "error" : undefined} pie={v.errores.reembolsoFecha} required />
                      <label className="block">
                        <span className="label-cayla text-[11px] text-tinta/70">
                          N.° de operación <span className="font-normal normal-case tracking-normal">(opcional)</span>
                        </span>
                        <input
                          value={borrador.reembolsoReferencia}
                          onChange={(e) => setBorrador((b) => ({ ...b, reembolsoReferencia: e.target.value }))}
                          placeholder="Op. 00881230"
                          autoComplete="off"
                          className="mt-1 w-full border-b border-tinta/20 bg-transparent px-0.5 py-2 font-mono text-sm tabular-nums tracking-wider text-tinta outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-tinta/45 focus:border-rojo"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* --- cómo quedan tus cuentas -------------------------------------------- */}
            <section>
              <p className="label-cayla mb-2 text-[11px] text-tinta/65">Cómo quedan tus cuentas</p>
              {!factura ? (
                <p className="rounded-xl border border-dashed border-tinta/25 px-4 py-3 text-[13px] text-tinta/55">Elige primero la factura de origen.</p>
              ) : v.explicacionMonto && (tocoMonto || intento) ? (
                <div role="alert" className="anim-revelar rounded-xl border border-l-2 border-rojo/40 border-l-rojo bg-rojo/[0.06] px-4 py-3 text-sm">
                  <b className="mb-0.5 block font-semibold text-rojo-profundo">Este monto no cuadra</b>
                  <span className="text-tinta/80">{v.explicacionMonto}</span>
                  {v.topeSugerido != null && (
                    <button type="button" onClick={() => { setBorrador((b) => ({ ...b, montoTxt: v.topeSugerido!.toFixed(2) })); setTocoMonto(true); refMonto.current?.focus(); }} className="mt-2 block text-[13px] text-rojo underline underline-offset-2">
                      Usar {soles(v.topeSugerido)}
                    </button>
                  )}
                </div>
              ) : v.reparto ? (
                <div className="rounded-xl border border-sand bg-sand/35 px-4 py-3.5">
                  <p className="text-sm font-semibold leading-relaxed text-tinta">
                    {textoDestino(v.reparto, { documento: factura.documento, proveedor: factura.proveedorNombre, saldo: factura.saldo, destino: v.destino ?? "a_favor" })}
                  </p>
                  <dl className="mt-3 border-t border-tinta/10">
                    {factura.saldo > 0.004 && <FilaEfecto etiqueta={`Lo que se debe de ${factura.documento}`} antes={soles(factura.saldo)} despues={soles(v.reparto.deudaDespues)} />}
                    {v.reparto.devuelve > 0 && <FilaEfecto etiqueta="Vuelve a CAYLA ahora" antes={soles(0)} despues={soles(v.reparto.devuelve)} />}
                    {v.reparto.aFavor > 0 && <FilaEfecto etiqueta={`Saldo a favor con ${factura.proveedorNombre}`} antes={soles(0)} despues={`+ ${soles(v.reparto.aFavor)}`} />}
                    <FilaEfecto etiqueta="Crédito fiscal (IGV) del mes" antes="" despues={`− ${soles(Math.round((v.monto - v.monto / 1.18) * 100) / 100)}`} />
                  </dl>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-tinta/25 px-4 py-3 text-[13px] text-tinta/55">Escribe el monto y aquí verás qué le pasa a la deuda del comprobante y a tu saldo a favor.</p>
              )}
            </section>
          </fieldset>

          <ComboResponsable control={responsable} deshabilitado={enviando} />

          <div className="flex flex-wrap items-center gap-3 border-t border-tinta/10 pt-4">
            <p className="hidden flex-1 text-xs text-tinta/55 sm:block">Queda como un registro nuevo: no se edita ni se borra. El IGV de la nota resta del crédito fiscal del mes.</p>
            <button type="button" onClick={cerrar} disabled={enviando} className="label-cayla rounded-md border border-tinta/25 px-4 py-2.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo">
              Cancelar
            </button>
            <button type="submit" disabled={enviando || buscando} className="label-cayla boton-brillo rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-50">
              {enviando ? "Registrando…" : v.destino === "reembolso" ? "Registrar nota y reembolso" : "Registrar nota"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Las tres partes del dinero, siempre visibles, con su barra de tres tramos. */
function TresPartes({ reparto, monto }: { reparto: { baja: number; devuelve: number; aFavor: number } | null; monto: number }) {
  const r = reparto ?? { baja: 0, devuelve: 0, aFavor: 0 };
  const total = Math.max(Number.isFinite(monto) && monto > 0 ? monto : 0, 0.01);
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / total) * 100))}%`;
  return (
    <div className="nc-tres" aria-live="polite">
      <div>
        <span className="label-cayla block text-[10.5px] text-tinta/55">Baja la deuda</span>
        <span className="font-display block text-[22px] leading-snug tabular-nums text-tinta">{soles(r.baja)}</span>
      </div>
      <div>
        <span className="label-cayla block text-[10.5px] text-tinta/55">Se devuelve ahora</span>
        <span className="font-display block text-[22px] leading-snug tabular-nums text-taupe-profundo">{soles(r.devuelve)}</span>
      </div>
      <div>
        <span className="label-cayla block text-[10.5px] text-tinta/55">Queda a favor</span>
        <span className="font-display block text-[22px] leading-snug tabular-nums text-verde-profundo">{soles(r.aFavor)}</span>
      </div>
      <span aria-hidden className="nc-barra">
        <i className="bg-tinta" style={{ width: pct(r.baja) }} />
        <i className="bg-taupe" style={{ width: pct(r.devuelve) }} />
        <i className="bg-verde" style={{ width: pct(r.aFavor) }} />
      </span>
    </div>
  );
}

function FichaDestino({ valor, titulo, detalle, elegido, habilitada, onElegir }: { valor: DestinoDinero; titulo: string; detalle: string; elegido: boolean; habilitada: boolean; onElegir: (d: DestinoDinero) => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-label={titulo}
      aria-checked={elegido}
      aria-disabled={!habilitada}
      tabIndex={elegido ? 0 : -1}
      onClick={() => habilitada && onElegir(valor)}
      onKeyDown={(e) => {
        if (!habilitada) return;
        if (["ArrowRight", "ArrowDown"].includes(e.key)) { e.preventDefault(); onElegir(valor === "reembolso" ? "a_favor" : "reembolso"); }
        if (["ArrowLeft", "ArrowUp"].includes(e.key)) { e.preventDefault(); onElegir(valor === "reembolso" ? "a_favor" : "reembolso"); }
      }}
      className="nc-opc"
    >
      <span aria-hidden className="nc-radio" />
      <span className="min-w-0">
        <b className="block text-sm font-semibold text-tinta">{titulo}</b>
        <span className="mt-0.5 block text-xs leading-relaxed text-tinta/65">{detalle}</span>
      </span>
    </button>
  );
}

function FilaEfecto({ etiqueta, antes, despues }: { etiqueta: string; antes: string; despues: string }) {
  return (
    <div className="anim-revelar grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-3 border-b border-tinta/10 py-2 text-[13.5px] last:border-b-0">
      <dt className="text-tinta/80">{etiqueta}</dt>
      <dd className="tabular-nums text-tinta/55">{antes}</dd>
      <dd aria-hidden className="text-tinta/45">{antes ? "→" : ""}</dd>
      <dd className="font-semibold tabular-nums text-tinta">{despues}</dd>
    </div>
  );
}

/** La ficha compacta de la factura elegida: lo que hay que saber antes de escribir el monto. */
function FichaFactura({ factura: c, filas, onCambiar }: { factura: FacturaParaNota; filas: FilaVista[]; onCambiar: () => void }) {
  const pendiente = filas.find((f) => f.clase === "pendiente" && f.compraId === c.id);
  const notas = filas.filter((f) => f.clase === "nota" && f.compraId === c.id);
  return (
    <div className="anim-revelar overflow-hidden rounded-xl border border-sand">
      <div className="flex flex-wrap items-center gap-3 px-3.5 py-3">
        <span className="min-w-0 flex-1">
          <b className="mr-1.5 font-semibold tabular-nums text-tinta">{c.documento}</b>
          {c.tieneNota && <Chip tono="neutro">Con nota</Chip>}
          <span className="mt-0.5 block text-xs text-tinta/65">
            {c.proveedorNombre} · emitida {diaMes(c.fechaEmision)}
            {c.fechaVencimiento ? ` · vence ${diaMes(c.fechaVencimiento)}` : ""}
          </span>
        </span>
        <button type="button" onClick={onCambiar} className="label-cayla text-[11px] text-rojo hover:underline">
          Cambiar
        </button>
      </div>
      <dl className="grid grid-cols-2 border-t border-tinta/10 bg-sand/25 sm:grid-cols-4">
        {([["Total", c.total], ["Pagado", c.pagado], ["Debes", c.saldo], ["Notas ya emitidas", c.notasMonto]] as const).map(([k, val], i) => (
          <div key={k} className={`px-3.5 py-2.5 ${i > 0 ? "sm:border-l sm:border-tinta/10" : ""} ${i >= 2 ? "border-t border-tinta/10 sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""}`}>
            <dt className="label-cayla text-[10.5px] text-tinta/55">{k}</dt>
            <dd className="font-display text-[17px] tabular-nums text-tinta">{soles(val)}</dd>
          </div>
        ))}
      </dl>
      {notas.length > 0 && (
        <p className="border-t border-tinta/10 px-3.5 py-2 text-[12.5px] text-tinta/75">
          <span className="label-cayla mr-2 text-[10.5px] text-tinta/55">Notas</span>
          {notas.map((n) => `${n.serieNumero} · ${soles(n.monto)}`).join(" | ")}
        </p>
      )}
      {pendiente && (
        <p className="border-t border-tinta/10 bg-ambar/[0.06] px-3.5 py-2 text-[12.5px] text-tinta">
          <span className="label-cayla mr-2 text-[10.5px] text-tinta/55">Pendiente</span>
          {pendiente.unidadesCerradas.toLocaleString("es-PE")} {pendiente.unidadesCerradas === 1 ? "unidad" : "unidades"} sin llegar → nota esperada de <b className="font-semibold">{soles(pendiente.montoEsperado)}</b>
          {pendiente.bloqueada ? " (todavía no se puede registrar por faltante)" : ""}
        </p>
      )}
    </div>
  );
}

/** El texto con la coincidencia marcada, aunque se haya escrito sin comas, guiones ni «S/». */
function Marcado({ texto, busqueda }: { texto: string; busqueda: string }) {
  if (!busqueda.trim()) return <>{texto}</>;
  return (
    <>
      {resaltarFlexible(texto, busqueda).map((t, i) =>
        t.coincide ? (
          <mark key={i} className="anim-revelar rounded-[3px] bg-rojo/15 px-px text-inherit">
            {t.texto}
          </mark>
        ) : (
          <span key={i}>{t.texto}</span>
        ),
      )}
    </>
  );
}
