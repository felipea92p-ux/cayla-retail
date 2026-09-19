"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { ChipEstado, MetaCompra, formatearHora } from "@/components/ComprasAgrupadas";
import { ImpactoVista } from "@/components/CambioResumen";
import {
  AvisoDeError,
  BotonPrincipal,
  BotonRojo,
  BotonSecundario,
  Dato,
  EncabezadoFlujo,
  OPCION_ACTIVA,
  OPCION_INACTIVA,
  PanelValidaciones,
  PieDelPaso,
  useEscapeRetrocede,
  useFocoAlCambiarDePaso,
} from "@/components/FlujoGuiado";
import type { LineaVentaReciente } from "@/lib/ventas-v2";
import { etiquetaDia, primerBloqueo, unidadesDisponibles, varianteLegible, type Validacion } from "@/lib/cambios-reglas";
import {
  DESTINOS_DANADA,
  MOTIVOS_DEVOLUCION,
  condicionDeItem,
  esDevolucionTotal,
  estadoPrendaDevolucion,
  etiquetaCondicion,
  impactoDevolucion,
  textoMotivo,
  validarDevolucion,
  valorPagado,
  type DestinoDanada,
  type ItemElegido,
  type MotivoDevolucion,
} from "@/lib/devoluciones-reglas";
import { soles } from "@/lib/compras-reglas";
import { codigoPrenda } from "@/lib/prenda-reglas";

const PASOS = ["Venta", "Prendas", "Detalle", "Confirmación"] as const;
type Paso = 2 | 3 | 4 | "exito";

const TITULOS: Record<Paso, string> = {
  2: "¿Qué prendas devuelve?",
  3: "¿Por qué la devuelve y en qué estado?",
  4: "Revisa y registra la devolución",
  exito: "Devolución registrada",
};

type Resultado = {
  operacion: string;
  prendas: { referencia: string; talla: string | null; color: string | null; cantidad: number }[];
  valorPagado: number;
};

/** Por defecto, una unidad y vuelve impecable (lo normal). El motivo y el estado de las
 *  dañadas sí los elige la colaboradora — nada se preselecciona a ciegas (ADR-0044). */
function itemInicial(): ItemElegido {
  return { cantidad: 1, grupo: "vendible", destino: null };
}

/**
 * La devolución guiada (2026-09-18), con el mismo modelo que el cambio guiado (ADR-0104):
 * Venta → Prendas → Detalle → Confirmación → registrada, en la misma página, sin modal.
 *
 * Lo propio de una devolución:
 * - Se elige UNA O VARIAS prendas de la boleta y todas viajan en una sola devolución
 *   (`crear_devolucion` recibe la lista): la pantalla de antes creaba una por prenda, y cada
 *   una aprobada emitía su propia nota de crédito parcial.
 * - Registrar NO mueve nada: queda pendiente y un líder la aprueba. Por eso el impacto se
 *   dice «al aprobarla», y la caja se valida en la aprobación, no acá.
 * - R-37: primero un cambio. En el paso de las prendas hay un salto a Cambios sobre esa
 *   misma prenda.
 */
export function DevolucionesFlujo({
  venta,
  lineaInicialId,
  ubicacionId,
  sede,
  colaboradora,
  esLider,
  ahora,
  onCerrar,
  onNuevo,
  onIrAAprobar,
}: {
  /** Las prendas de la compra elegida (el paso "Venta" ya quedó hecho al entrar). */
  venta: LineaVentaReciente[];
  lineaInicialId: string | null;
  ubicacionId: string;
  sede: string;
  colaboradora: string;
  esLider: boolean;
  ahora: Date;
  onCerrar: () => void;
  onNuevo: () => void;
  onIrAAprobar: () => void;
}) {
  const router = useRouter();
  const compra = venta[0]!;
  const [paso, setPaso] = useState<Paso>(2);
  const [elegidas, setElegidas] = useState<Record<string, ItemElegido>>(() => (lineaInicialId ? { [lineaInicialId]: itemInicial() } : {}));
  const [motivo, setMotivo] = useState<MotivoDevolucion | null>(null);
  const [detalle, setDetalle] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [avisoContinuar, setAvisoContinuar] = useState<string | null>(null);
  // Doble clic: el estado `enviando` tarda un render en apagar el botón; el ref es inmediato.
  const enviandoAhora = useRef(false);

  const titulo = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const refMotivo = useRef<HTMLFieldSetElement>(null);
  const refDetalle = useRef<HTMLInputElement>(null);
  const refEstados = useRef<HTMLDivElement>(null);

  const lineasElegidas = venta.filter((l) => elegidas[l.ventaItemId]);
  const validaciones: Validacion[] = validarDevolucion({
    venta: { comprobante: compra.comprobante, creadoEn: compra.creadoEn, anulada: compra.anulada },
    ahora,
    elegidas: lineasElegidas.map((l) => ({ referencia: l.referencia, disponible: unidadesDisponibles(l), item: elegidas[l.ventaItemId]! })),
    motivo,
    detalle,
  });
  const bloqueo = primerBloqueo(validaciones);

  const valorTotal = Math.round(lineasElegidas.reduce((suma, l) => suma + valorPagado(l, elegidas[l.ventaItemId]!.cantidad), 0) * 100) / 100;
  const cantidades = Object.fromEntries(lineasElegidas.map((l) => [l.ventaItemId, elegidas[l.ventaItemId]!.cantidad]));
  const impacto = impactoDevolucion({
    prendas: lineasElegidas.flatMap((l) => {
      const condicion = condicionDeItem(elegidas[l.ventaItemId]!);
      return condicion ? [{ prenda: `${l.referencia} · ${varianteLegible(l)}`, cantidad: elegidas[l.ventaItemId]!.cantidad, condicion }] : [];
    }),
    sede,
    valorPagado: valorTotal,
    comprobanteAceptado: compra.comprobanteAceptado,
    esTotal: esDevolucionTotal(venta, cantidades),
  });

  useFocoAlCambiarDePaso(titulo, paso);
  // Si la base rechazó la devolución, el foco va al aviso, al lado del botón.
  useFocoAlCambiarDePaso(errorRef, error);

  function retroceder() {
    setAvisoContinuar(null);
    setError(null);
    if (paso === 4) setPaso(3);
    else if (paso === 3) setPaso(2);
    else onCerrar();
  }
  useEscapeRetrocede(retroceder, !enviando && paso !== "exito");

  function alternarPrenda(l: LineaVentaReciente) {
    setAvisoContinuar(null);
    setElegidas((actual) => {
      if (!actual[l.ventaItemId]) return { ...actual, [l.ventaItemId]: itemInicial() };
      return Object.fromEntries(Object.entries(actual).filter(([id]) => id !== l.ventaItemId));
    });
  }

  function cambiarItem(id: string, cambio: Partial<ItemElegido>) {
    setAvisoContinuar(null);
    setElegidas((actual) => (actual[id] ? { ...actual, [id]: { ...actual[id]!, ...cambio } } : actual));
  }

  function continuarDesdePrendas() {
    if (lineasElegidas.length === 0) {
      setAvisoContinuar("Elige al menos una prenda.");
      return;
    }
    setAvisoContinuar(null);
    setPaso(3);
  }

  function continuarAConfirmar() {
    if (!bloqueo) {
      setAvisoContinuar(null);
      setPaso(4);
      return;
    }
    setAvisoContinuar(bloqueo.detalle ? `${bloqueo.titulo}. ${bloqueo.detalle}` : `${bloqueo.titulo}.`);
    // Lo de la compra o la cantidad de las prendas se corrige en el paso anterior; el resto,
    // en este mismo paso, con el foco en el campo que falta.
    if (bloqueo.clave === "compra" || bloqueo.clave === "prendas") {
      setPaso(2);
      return;
    }
    const destino =
      bloqueo.clave === "motivo"
        ? motivo === "otro"
          ? refDetalle.current
          : refMotivo.current?.querySelector<HTMLElement>("button")
        : bloqueo.clave === "estado"
          ? refEstados.current?.querySelector<HTMLElement>("[data-falta-destino] button")
          : null;
    destino?.focus();
  }

  async function registrar() {
    if (enviandoAhora.current) return;
    if (bloqueo || !motivo) {
      setPaso(3);
      return;
    }
    const items = lineasElegidas.map((l) => ({
      venta_item_id: l.ventaItemId,
      cantidad: elegidas[l.ventaItemId]!.cantidad,
      condicion: condicionDeItem(elegidas[l.ventaItemId]!),
    }));
    enviandoAhora.current = true;
    setEnviando(true);
    setError(null);
    const { data, error: fallo } = await createClient().rpc("crear_devolucion", {
      p_venta_id: compra.ventaId,
      p_ubicacion_id: ubicacionId,
      p_items: items,
      p_motivo: textoMotivo(motivo, detalle),
    });
    enviandoAhora.current = false;
    setEnviando(false);
    if (fallo) {
      setError(traducirError(fallo, "registrar la devolución"));
      return;
    }
    setResultado({
      operacion: String(data ?? "").slice(0, 8).toUpperCase(),
      prendas: lineasElegidas.map((l) => ({ referencia: l.referencia, talla: l.talla, color: l.color, cantidad: elegidas[l.ventaItemId]!.cantidad })),
      valorPagado: valorTotal,
    });
    setPaso("exito");
    // «Por aprobar» y las cifras de arriba se ponen al día por detrás.
    router.refresh();
  }

  // Un salto a Cambios sobre la prenda elegida; con varias (o ninguna), a la compra.
  const idParaCambio = lineasElegidas.length === 1 ? lineasElegidas[0]!.ventaItemId : null;
  const enlaceCambios = idParaCambio
    ? `/cambios?item=${idParaCambio}`
    : compra.comprobante
      ? `/cambios?q=${encodeURIComponent(compra.comprobante.split(" ").pop() ?? "")}`
      : "/cambios";

  return (
    <div className="space-y-6">
      {paso !== "exito" && (
        <EncabezadoFlujo
          volverA="Volver a Devoluciones"
          onVolver={onCerrar}
          deshabilitado={enviando}
          pasos={PASOS}
          actual={paso}
          onIrAPaso={(n) => (n === 1 ? onCerrar() : setPaso(n as Paso))}
          titulo={TITULOS[paso]}
          refTitulo={titulo}
        />
      )}

      {paso === 2 && (
        <div className="anim-revelar space-y-5">
          <div className="rounded-[22px] bg-papel p-5 ring-1 ring-tinta/[0.07] sm:p-6">
            <MetaCompra compra={compra} dia={etiquetaDia(compra.creadoEn, ahora)} />
            <fieldset className="mt-4">
              <legend className="sr-only">Prendas que la clienta quiere devolver</legend>
              <div className="space-y-1.5">
                {venta.map((l) => {
                  const estado = estadoPrendaDevolucion(l, ahora);
                  const item = elegidas[l.ventaItemId];
                  const disponibles = unidadesDisponibles(l);
                  return (
                    <div key={l.ventaItemId} className={`rounded-lg transition-colors duration-200 ${item ? "bg-crema ring-1 ring-tinta/30" : ""}`}>
                      <label
                        className={`flex items-center gap-4 rounded-lg p-3 transition-colors duration-200 ${
                          estado.devolvible ? "cursor-pointer hover:bg-crema/70" : "cursor-not-allowed"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={!!item}
                          disabled={!estado.devolvible}
                          onChange={() => alternarPrenda(l)}
                          className="h-4 w-4 shrink-0 accent-tinta"
                        />
                        <MiniaturaPrenda fotoUrl={l.fotoUrl} colorHex={l.colorHex} tamano="lg" />
                        <span className={`min-w-0 flex-1 ${estado.devolvible ? "" : "opacity-60"}`}>
                          <span className="block text-[15px] font-semibold text-tinta">{l.referencia}</span>
                          <span className="block text-sm text-tinta/75">{varianteLegible(l)}</span>
                          <span className="mt-0.5 block text-xs text-tinta/70">
                            <span className="font-mono">{codigoPrenda(l)}</span> · {soles(l.precioUnitario)}
                          </span>
                        </span>
                        <ChipEstado estado={estado} />
                      </label>
                      {item && disponibles > 1 && (
                        <div className="flex items-center gap-3 px-3 pb-3 pl-[3.25rem]">
                          <label htmlFor={`cantidad-${l.ventaItemId}`} className="text-sm text-tinta/75">
                            ¿Cuántas devuelve? <span className="text-tinta/65">(quedan {disponibles})</span>
                          </label>
                          <input
                            id={`cantidad-${l.ventaItemId}`}
                            type="number"
                            min={1}
                            max={disponibles}
                            value={item.cantidad}
                            onChange={(e) => cambiarItem(l.ventaItemId, { cantidad: Math.max(1, Math.min(disponibles, Number(e.target.value) || 1)) })}
                            className="h-10 w-20 rounded-lg border border-tinta/15 bg-papel px-3 text-sm text-tinta outline-none transition-colors duration-200 focus:border-tinta"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          </div>

          {/* R-37: primero se intenta un cambio; la devolución es para cuando no hay talla ni
              nada de su agrado. */}
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-[22px] bg-papel/60 px-5 py-4 text-sm">
            <p className="max-w-xl text-tinta/80">
              <span className="font-semibold text-tinta">¿Le sirve otra talla o color?</span> Primero prueba un cambio; si no hay lo que busca, sigue con la devolución.
            </p>
            <Link
              href={enlaceCambios}
              className="inline-flex items-center gap-1.5 font-semibold text-tinta underline decoration-tinta/30 underline-offset-4 transition-colors duration-200 hover:decoration-tinta"
            >
              Cambiar por otra prenda
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          <PieDelPaso aviso={avisoContinuar}>
            <BotonSecundario onClick={onCerrar}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Otra venta
            </BotonSecundario>
            <BotonPrincipal onClick={continuarDesdePrendas}>
              Continuar
              <ArrowRight className="h-4 w-4" aria-hidden />
            </BotonPrincipal>
          </PieDelPaso>
        </div>
      )}

      {paso === 3 && (
        <div className="anim-revelar space-y-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="space-y-9 rounded-[22px] bg-papel p-5 ring-1 ring-tinta/[0.07] sm:p-7">
              <fieldset ref={refMotivo}>
                <legend className="text-[15px] font-semibold text-tinta">¿Por qué la devuelve?</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {MOTIVOS_DEVOLUCION.map((m) => (
                    <button
                      key={m.valor}
                      type="button"
                      aria-pressed={motivo === m.valor}
                      className={motivo === m.valor ? OPCION_ACTIVA : OPCION_INACTIVA}
                      onClick={() => {
                        setAvisoContinuar(null);
                        setMotivo(m.valor);
                      }}
                    >
                      {m.etiqueta}
                    </button>
                  ))}
                </div>
                <div className="mt-4 max-w-md">
                  <label htmlFor="devolucion-detalle" className="text-xs font-semibold text-tinta/70">
                    {motivo === "otro" ? "¿Cuál es el motivo?" : "Algo más que anotar (opcional)"}
                  </label>
                  <input
                    ref={refDetalle}
                    id="devolucion-detalle"
                    type="text"
                    value={detalle}
                    onChange={(e) => {
                      setAvisoContinuar(null);
                      setDetalle(e.target.value);
                    }}
                    placeholder={motivo === "defecto" ? "Ej. costura abierta en la manga" : "Lo que la clienta cuente"}
                    className="mt-1.5 h-10 w-full rounded-lg border border-tinta/15 bg-papel px-3 text-sm text-tinta outline-none transition-colors duration-200 placeholder:text-tinta/55 focus:border-tinta"
                  />
                </div>
              </fieldset>

              <div ref={refEstados} className="space-y-6">
                <h3 className="text-[15px] font-semibold text-tinta">¿En qué estado vuelve cada prenda?</h3>
                {lineasElegidas.map((l) => (
                  <EstadoDeLaPrenda key={l.ventaItemId} linea={l} item={elegidas[l.ventaItemId]!} onCambio={(c) => cambiarItem(l.ventaItemId, c)} />
                ))}
              </div>
            </div>
            {/* El impacto aparece en cuanto hay al menos una prenda con su estado elegido. */}
            <PanelValidaciones validaciones={validaciones} impacto={impacto.inventario.length > 0 ? impacto : null} />
          </div>
          <PieDelPaso aviso={avisoContinuar}>
            <BotonSecundario onClick={retroceder}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Atrás
            </BotonSecundario>
            <BotonPrincipal onClick={continuarAConfirmar}>
              Revisar la devolución
              <ArrowRight className="h-4 w-4" aria-hidden />
            </BotonPrincipal>
          </PieDelPaso>
        </div>
      )}

      {paso === 4 && (
        <div className="anim-revelar space-y-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="space-y-8 rounded-[22px] bg-papel p-5 ring-1 ring-tinta/[0.07] sm:p-7">
              <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                <Dato titulo="Venta">
                  {compra.comprobante ?? "Venta sin comprobante"} · {etiquetaDia(compra.creadoEn, ahora).toLowerCase()} {formatearHora(compra.creadoEn)}
                </Dato>
                <Dato titulo="Clienta">{compra.clienta ?? "No quedó registrada en la venta"}</Dato>
                <Dato titulo="Se registra en">{sede}</Dato>
                <Dato titulo="Lo registra">{colaboradora || "—"}</Dato>
                <Dato titulo="Motivo">{textoMotivo(motivo, detalle) || "—"}</Dato>
                <Dato titulo="Lo que pagó por esto">{soles(valorTotal)}</Dato>
              </dl>

              <div>
                <h3 className="text-xs font-semibold text-tinta/70">{lineasElegidas.length === 1 ? "Prenda que devuelve" : "Prendas que devuelve"}</h3>
                <ul className="mt-3 space-y-2.5">
                  {lineasElegidas.map((l) => {
                    const item = elegidas[l.ventaItemId]!;
                    const condicion = condicionDeItem(item);
                    return (
                      <li key={l.ventaItemId} className="flex flex-wrap items-center gap-3 rounded-xl bg-crema/70 p-3">
                        <MiniaturaPrenda fotoUrl={l.fotoUrl} colorHex={l.colorHex} tamano="lg" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-semibold text-tinta">
                            {l.referencia} <span className="font-normal text-tinta/70">× {item.cantidad}</span>
                          </p>
                          <p className="text-sm text-tinta/75">{varianteLegible(l)}</p>
                          <p className="mt-0.5 text-xs text-tinta/70">
                            <span className="font-mono">{codigoPrenda(l)}</span> · {soles(valorPagado(l, item.cantidad))}
                          </p>
                        </div>
                        <Chip tono={condicion === "vendible" ? "neutro" : "ambar"} versalitas={false}>
                          {condicion ? etiquetaCondicion(condicion) : "—"}
                        </Chip>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="border-t border-tinta/[0.08] pt-7">
                <ImpactoVista impacto={impacto} />
              </div>
            </div>
            <PanelValidaciones validaciones={validaciones} />
          </div>

          <p className="text-sm text-tinta/75">
            Al registrarla queda <span className="font-semibold text-tinta">pendiente de aprobación</span>: un líder la revisa y recién ahí se mueve el stock.
          </p>

          {error && <AvisoDeError error={error} refAviso={errorRef} queNoSeHizo="No se registró la devolución." />}

          <PieDelPaso aviso={null}>
            <BotonSecundario onClick={retroceder} disabled={enviando}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Atrás
            </BotonSecundario>
            <div className="flex flex-wrap items-center gap-2">
              <BotonSecundario onClick={onCerrar} disabled={enviando}>
                Cancelar
              </BotonSecundario>
              <BotonRojo onClick={registrar} disabled={enviando}>
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                {enviando ? "Registrando…" : "Registrar devolución"}
              </BotonRojo>
            </div>
          </PieDelPaso>
        </div>
      )}

      {paso === "exito" && resultado && (
        <div className="anim-revelar mx-auto max-w-2xl rounded-[22px] bg-papel p-6 text-center ring-1 ring-tinta/[0.07] sm:p-10">
          <CheckCircle2 className="anim-asentar mx-auto h-11 w-11 text-verde-profundo" aria-hidden />
          <h2 ref={titulo} tabIndex={-1} className="font-display mt-4 text-3xl text-tinta outline-none">
            {TITULOS.exito}
          </h2>
          <p className="mt-2 text-sm text-tinta/75">Queda pendiente de aprobación de un líder. El stock y la caja no cambian hasta entonces.</p>
          <dl className="mt-8 grid gap-4 text-left text-sm sm:grid-cols-2">
            <Dato titulo="Devuelve">
              {resultado.prendas.map((p) => `${p.referencia} · ${varianteLegible(p)}${p.cantidad > 1 ? ` (×${p.cantidad})` : ""}`).join(", ")}
            </Dato>
            <Dato titulo="Lo que pagó por esto">{soles(resultado.valorPagado)}</Dato>
            <Dato titulo="Estado">Pendiente de aprobación</Dato>
            <Dato titulo="N.º de operación">
              <span className="font-mono">{resultado.operacion}</span>
            </Dato>
          </dl>
          <div className="mt-9 flex flex-wrap justify-center gap-2">
            {esLider ? <BotonPrincipal onClick={onIrAAprobar}>Revisar y aprobar</BotonPrincipal> : null}
            {esLider ? <BotonSecundario onClick={onNuevo}>Nueva devolución</BotonSecundario> : <BotonPrincipal onClick={onNuevo}>Nueva devolución</BotonPrincipal>}
            <BotonSecundario onClick={onCerrar}>Volver a la actividad</BotonSecundario>
          </div>
        </div>
      )}
    </div>
  );
}

/** «¿En qué estado vuelve?» de UNA prenda: impecable (al piso) o con defecto o uso (a
 *  cuarentena) y, si es lo segundo, qué se piensa hacer con ella. Las tres opciones de
 *  destino entran igual a cuarentena; el destino real lo decide después un líder. */
function EstadoDeLaPrenda({ linea, item, onCambio }: { linea: LineaVentaReciente; item: ItemElegido; onCambio: (c: Partial<ItemElegido>) => void }) {
  const sinDestino = item.grupo === "danada" && item.destino === null;
  return (
    <div className="space-y-3">
      <p className="text-sm text-tinta">
        <span className="font-semibold">{linea.referencia}</span> <span className="text-tinta/70">{varianteLegible(linea)}</span>
        {item.cantidad > 1 && <span className="text-tinta/70"> · {item.cantidad} unidades</span>}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            { grupo: "vendible", titulo: "Impecable", detalle: "Vuelve al piso de venta." },
            { grupo: "danada", titulo: "Con defecto o uso", detalle: "Va a cuarentena hasta que un líder decida." },
          ] as const
        ).map((o) => {
          const activa = item.grupo === o.grupo;
          return (
            <button
              key={o.grupo}
              type="button"
              aria-pressed={activa}
              onClick={() => onCambio({ grupo: o.grupo, destino: o.grupo === "vendible" ? null : item.destino })}
              className={`rounded-lg border px-4 py-3 text-left transition-colors duration-200 ${
                activa ? "border-tinta bg-tinta text-crema" : "border-tinta/15 bg-papel text-tinta hover:border-tinta/40"
              }`}
            >
              <span className="block text-sm font-semibold">{o.titulo}</span>
              <span className={`mt-0.5 block text-xs ${activa ? "text-crema/85" : "text-tinta/70"}`}>{o.detalle}</span>
            </button>
          );
        })}
      </div>
      {item.grupo === "danada" && (
        <fieldset data-falta-destino={sinDestino ? "" : undefined} className="anim-revelar">
          <legend className="text-xs font-semibold text-tinta/70">¿Qué se piensa hacer con ella?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {DESTINOS_DANADA.map((d) => (
              <button
                key={d.valor}
                type="button"
                aria-pressed={item.destino === d.valor}
                className={item.destino === d.valor ? OPCION_ACTIVA : OPCION_INACTIVA}
                onClick={() => onCambio({ destino: d.valor as DestinoDanada })}
              >
                {d.etiqueta}
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
