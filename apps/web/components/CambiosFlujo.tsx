"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { EstadoPrendaChip, MetaCompra, formatearHora } from "@/components/CambiosVentas";
import { ImpactoVista, ListaValidaciones, ComparacionPrendas, type PrendaFicha } from "@/components/CambioResumen";
import {
  CambioReemplazo,
  agruparCatalogo,
  derivarReemplazo,
  opcionesDePrenda,
  seleccionInicial,
  type Seleccion,
  type VarianteCatalogo,
} from "@/components/CambioReemplazo";
import type { LineaVentaReciente } from "@/lib/ventas-v2";
import {
  estadoPrendaVendida,
  etiquetaDia,
  etiquetaMotivo,
  impactoCambio,
  primerBloqueo,
  validarCambio,
  varianteLegible,
  type Validacion,
} from "@/lib/cambios-reglas";
import { soles } from "@/lib/compras-reglas";
import { codigoPrenda } from "@/lib/prenda-reglas";

const PASOS = ["Venta", "Prenda", "Reemplazo", "Confirmación"] as const;
type Paso = 2 | 3 | 4 | "exito";

const TITULOS: Record<Paso, string> = {
  2: "¿Qué prenda cambia?",
  3: "¿Por cuál la cambia?",
  4: "Revisa y confirma",
  exito: "Cambio registrado",
};

type Resultado = {
  operacion: string;
  devuelta: PrendaFicha;
  nueva: PrendaFicha;
  cantidad: number;
  diferencia: number;
  vaACuarentena: boolean;
};

function ficha(p: { referencia: string; talla: string | null; color: string | null; colorHex: string | null; fotoUrl: string | null }, precio: number): PrendaFicha {
  return { referencia: p.referencia, talla: p.talla, color: p.color, colorHex: p.colorHex, fotoUrl: p.fotoUrl, precio };
}

/**
 * El cambio guiado (2026-09-18): Venta → Prenda → Reemplazo → Confirmación → éxito, en
 * la misma página y sin modal (mismo criterio que ADR-0044 para el cobro: el panel es
 * la unidad que cambia de momento). La persona siempre ve dónde está ("Paso 3 de 4"),
 * qué está haciendo (el título del paso) y qué falta (las validaciones, en vivo).
 *
 * Teclado: Escape retrocede un paso; al cambiar de paso el foco va al título; si falta
 * algo al apretar "Continuar", el foco va al campo que falta y el motivo se dice al lado
 * del botón.
 */
export function CambiosFlujo({
  venta,
  lineaInicialId,
  ubicacionId,
  sede,
  colaboradora,
  cajaAbierta,
  catalogo,
  ahora,
  onCerrar,
  onNuevo,
}: {
  /** Las prendas de la compra elegida (el paso "Venta" ya quedó hecho al entrar). */
  venta: LineaVentaReciente[];
  lineaInicialId: string | null;
  ubicacionId: string;
  sede: string;
  colaboradora: string;
  cajaAbierta: boolean;
  catalogo: VarianteCatalogo[];
  ahora: Date;
  onCerrar: () => void;
  onNuevo: () => void;
}) {
  const router = useRouter();
  const compra = venta[0]!;
  const [lineaId, setLineaId] = useState<string | null>(lineaInicialId);
  const [paso, setPaso] = useState<Paso>(lineaInicialId ? 3 : 2);
  const linea = venta.find((l) => l.ventaItemId === lineaId) ?? null;
  const [seleccion, setSeleccion] = useState<Seleccion | null>(linea ? seleccionInicial(linea) : null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [avisoContinuar, setAvisoContinuar] = useState<string | null>(null);
  // Reintento (doble clic, o red que se corta después del commit y antes de la
  // respuesta — ADR-0032) debe mandar el MISMO token para que el índice único de
  // `retail.cambios.token_cliente` lo reconozca como el mismo envío.
  const token = useRef<string>(crypto.randomUUID());

  const titulo = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const refMotivo = useRef<HTMLFieldSetElement>(null);
  const refPrenda = useRef<HTMLDivElement>(null);
  const refMetodo = useRef<HTMLSelectElement>(null);

  const porProducto = useMemo(() => agruparCatalogo(catalogo), [catalogo]);
  const opcionesPrenda = useMemo(() => (linea ? opcionesDePrenda(linea, porProducto) : []), [linea, porProducto]);
  const r = linea && seleccion ? derivarReemplazo(linea, porProducto, seleccion) : null;

  const validaciones: Validacion[] =
    linea && seleccion && r
      ? validarCambio({
          venta: { comprobante: compra.comprobante, creadoEn: compra.creadoEn, anulada: compra.anulada },
          ahora,
          cantidadComprada: linea.cantidad,
          disponible: linea.cantidad - linea.yaCambiado,
          motivo: seleccion.motivo,
          eligioPrenda: r.eligioTodo,
          nueva: r.varianteNueva ? { descripcion: r.descripcionNueva, stockAqui: r.varianteNueva.stockAqui, otrasSedes: r.otrasSedes } : null,
          sede,
          diferencia: r.diferencia,
          metodo: seleccion.metodo,
          cajaAbierta,
        })
      : [];
  const bloqueo = primerBloqueo(validaciones);

  const devueltaTexto = linea ? `${linea.referencia} · ${varianteLegible(linea)}` : "";
  const nuevaTexto = r?.varianteNueva ? `${r.varianteNueva.referencia} · ${varianteLegible(r.varianteNueva)}` : "";
  const impacto =
    linea && seleccion && r
      ? impactoCambio({
          devuelta: devueltaTexto,
          entregada: nuevaTexto,
          cantidad: seleccion.cantidad,
          condicion: r.condicion,
          diferencia: r.diferencia,
          metodo: seleccion.metodo,
          sede,
        })
      : null;

  // El foco sigue al paso: quien navega con teclado o lector de pantalla oye dónde está.
  useEffect(() => {
    titulo.current?.focus();
  }, [paso]);

  // Y si la base rechazó el cambio, el foco va al aviso, al lado del botón.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function retroceder() {
    setAvisoContinuar(null);
    setError(null);
    if (paso === 4) setPaso(3);
    else if (paso === 3) setPaso(2);
    else onCerrar();
  }

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented || enviando || paso === "exito") return;
      // Escape dentro de un campo es del campo (borrar, cerrar su lista), no del flujo.
      const destino = e.target as HTMLElement | null;
      if (destino && ["INPUT", "SELECT", "TEXTAREA"].includes(destino.tagName)) return;
      retroceder();
    }
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  });

  function elegirLinea(id: string) {
    const nueva = venta.find((l) => l.ventaItemId === id);
    if (!nueva) return;
    setLineaId(id);
    setSeleccion(seleccionInicial(nueva));
  }

  function continuarDesdePrenda() {
    if (!linea || !estadoPrendaVendida(linea, ahora).cambiable) {
      setAvisoContinuar("Elige una prenda que se pueda cambiar.");
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
    // El foco va al campo que hay que corregir.
    const destino =
      bloqueo.clave === "motivo"
        ? refMotivo.current?.querySelector<HTMLElement>("button")
        : bloqueo.clave === "stock"
          ? (refPrenda.current?.querySelector<HTMLElement>("fieldset button") ?? refPrenda.current?.querySelector<HTMLElement>("input"))
          : bloqueo.clave === "caja"
            ? refMetodo.current
            : null;
    destino?.focus();
  }

  async function confirmar() {
    if (!linea || !seleccion || !r || !r.varianteNueva || !seleccion.motivo || bloqueo) {
      setPaso(3);
      return;
    }
    setEnviando(true);
    setError(null);
    const { data, error: fallo } = await createClient().rpc("registrar_cambio", {
      p_venta_item_id: linea.ventaItemId,
      p_ubicacion_id: ubicacionId,
      p_variante_nueva_id: r.varianteNueva.varianteId,
      p_cantidad: seleccion.cantidad,
      p_metodo_pago_diferencia: r.diferencia !== 0 ? seleccion.metodo : undefined,
      p_token: token.current,
      p_motivo: seleccion.motivo,
      p_condicion: r.condicion,
    });
    setEnviando(false);
    if (fallo) {
      setError(traducirError(fallo, "registrar el cambio"));
      return;
    }
    setResultado({
      operacion: String(data ?? "").slice(0, 8).toUpperCase(),
      devuelta: ficha(linea, linea.precioUnitario),
      nueva: ficha(r.varianteNueva, r.varianteNueva.precio),
      cantidad: seleccion.cantidad,
      diferencia: r.diferencia,
      vaACuarentena: r.condicion === "no_vendible",
    });
    token.current = crypto.randomUUID();
    setPaso("exito");
    // La actividad y las cifras de arriba se ponen al día por detrás.
    router.refresh();
  }

  const numeroPaso = paso === "exito" ? 5 : paso;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onCerrar}
          disabled={enviando}
          className="inline-flex h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-tinta/75 transition-colors duration-200 hover:bg-papel hover:text-tinta disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Volver a Cambios
        </button>
        {paso !== "exito" && (
          <p className="text-sm text-tinta/70" aria-live="polite">
            Paso {numeroPaso} de {PASOS.length} · <span className="font-semibold text-tinta">{PASOS[numeroPaso - 1]}</span>
          </p>
        )}
      </div>

      {paso !== "exito" && <Pasos actual={numeroPaso} onIr={(n) => (n === 1 ? onCerrar() : setPaso(n as Paso))} />}

      {paso !== "exito" && (
        <h2 ref={titulo} tabIndex={-1} className="font-display scroll-mt-28 text-2xl text-tinta outline-none">
          {TITULOS[paso]}
        </h2>
      )}

      {paso === 2 && (
        <div className="anim-revelar space-y-5">
          <div className="rounded-xl bg-papel p-5 ring-1 ring-tinta/[0.07] sm:p-6">
            <MetaCompra compra={compra} dia={etiquetaDia(compra.creadoEn, ahora)} />
            <fieldset className="mt-4">
              <legend className="sr-only">Prenda que la clienta quiere cambiar</legend>
              <div className="space-y-1.5">
                {venta.map((l) => {
                  const estado = estadoPrendaVendida(l, ahora);
                  const elegida = l.ventaItemId === lineaId;
                  return (
                    <label
                      key={l.ventaItemId}
                      className={`flex items-center gap-4 rounded-lg p-3 transition-colors duration-200 ${
                        estado.cambiable ? "cursor-pointer hover:bg-crema/70" : "cursor-not-allowed"
                      } ${elegida ? "bg-crema ring-1 ring-tinta/30" : ""}`}
                    >
                      <input
                        type="radio"
                        name="prenda-a-cambiar"
                        checked={elegida}
                        disabled={!estado.cambiable}
                        onChange={() => elegirLinea(l.ventaItemId)}
                        className="h-4 w-4 shrink-0 accent-tinta"
                      />
                      <MiniaturaPrenda fotoUrl={l.fotoUrl} colorHex={l.colorHex} tamano="lg" />
                      <span className={`min-w-0 flex-1 ${estado.cambiable ? "" : "opacity-60"}`}>
                        <span className="block text-[15px] font-semibold text-tinta">{l.referencia}</span>
                        <span className="block text-sm text-tinta/75">{varianteLegible(l)}</span>
                        <span className="mt-0.5 block text-xs text-tinta/70">
                          <span className="font-mono">{codigoPrenda(l)}</span> · {soles(l.precioUnitario)}
                        </span>
                      </span>
                      <EstadoPrendaChip estado={estado} />
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </div>
          <PieDelPaso aviso={avisoContinuar}>
            <BotonSecundario onClick={onCerrar}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Otra venta
            </BotonSecundario>
            <BotonPrincipal onClick={continuarDesdePrenda}>
              Continuar
              <ArrowRight className="h-4 w-4" aria-hidden />
            </BotonPrincipal>
          </PieDelPaso>
        </div>
      )}

      {paso === 3 && linea && seleccion && r && (
        <div className="anim-revelar space-y-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="rounded-xl bg-papel p-5 ring-1 ring-tinta/[0.07] sm:p-7">
              <CambioReemplazo
                linea={linea}
                seleccion={seleccion}
                r={r}
                opcionesPrenda={opcionesPrenda}
                refMotivo={refMotivo}
                refPrenda={refPrenda}
                refMetodo={refMetodo}
                onCambio={(cambio) => {
                  setAvisoContinuar(null);
                  setSeleccion((actual) => (actual ? { ...actual, ...cambio } : actual));
                }}
              />
            </div>
            <PanelValidaciones validaciones={validaciones} />
          </div>
          <PieDelPaso aviso={avisoContinuar}>
            <BotonSecundario onClick={retroceder}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Atrás
            </BotonSecundario>
            <BotonPrincipal onClick={continuarAConfirmar}>
              Revisar el cambio
              <ArrowRight className="h-4 w-4" aria-hidden />
            </BotonPrincipal>
          </PieDelPaso>
        </div>
      )}

      {paso === 4 && linea && seleccion && r && r.varianteNueva && impacto && (
        <div className="anim-revelar space-y-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="space-y-8 rounded-xl bg-papel p-5 ring-1 ring-tinta/[0.07] sm:p-7">
              <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                <Dato titulo="Venta">
                  {compra.comprobante ?? "Venta sin comprobante"} · {etiquetaDia(compra.creadoEn, ahora).toLowerCase()} {formatearHora(compra.creadoEn)}
                </Dato>
                <Dato titulo="Clienta">{compra.clienta ?? "No quedó registrada en la venta"}</Dato>
                <Dato titulo="Se registra en">{sede}</Dato>
                <Dato titulo="Lo registra">{colaboradora || "—"}</Dato>
                <Dato titulo="Motivo">{seleccion.motivo ? etiquetaMotivo(seleccion.motivo) : "—"}</Dato>
                <Dato titulo="La prenda que trae">{r.condicion === "vendible" ? "Impecable: vuelve al piso" : "Con defecto o uso: va a cuarentena"}</Dato>
              </dl>
              <ComparacionPrendas
                devuelta={ficha(linea, linea.precioUnitario)}
                nueva={ficha(r.varianteNueva, r.varianteNueva.precio)}
                cantidad={seleccion.cantidad}
                diferencia={r.diferencia}
              />
              <div className="border-t border-tinta/[0.08] pt-7">
                <ImpactoVista impacto={impacto} />
              </div>
            </div>
            <PanelValidaciones validaciones={validaciones} />
          </div>

          {error && (
            <div
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              className="anim-revelar flex gap-3 rounded-xl border border-rojo/30 bg-rojo/[0.06] px-4 py-3 text-sm text-rojo-profundo outline-none"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {/* `traducirError` ya abre con "No se pudo registrar…" cuando no reconoce el
                  error; con un mensaje de la base ("Stock insuficiente…") hay que decir
                  que no se guardó nada. */}
              <p>
                {!error.startsWith("No se pudo") && <span className="font-semibold">No se registró el cambio. </span>}
                {error}
              </p>
            </div>
          )}

          <PieDelPaso aviso={null}>
            <BotonSecundario onClick={retroceder} disabled={enviando}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Atrás
            </BotonSecundario>
            <div className="flex flex-wrap items-center gap-2">
              <BotonSecundario onClick={onCerrar} disabled={enviando}>
                Cancelar
              </BotonSecundario>
              {/* La única acción roja del flujo: la que mueve stock y plata de verdad. */}
              <button
                type="button"
                onClick={confirmar}
                disabled={enviando}
                className="alza-cayla inline-flex h-11 items-center gap-2 rounded-lg bg-rojo px-6 text-sm font-semibold text-crema transition-colors duration-200 hover:bg-rojo-profundo disabled:opacity-70"
              >
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                {enviando ? "Registrando…" : "Confirmar cambio"}
              </button>
            </div>
          </PieDelPaso>
        </div>
      )}

      {paso === "exito" && resultado && (
        <div className="anim-revelar mx-auto max-w-2xl rounded-xl bg-papel p-6 text-center ring-1 ring-tinta/[0.07] sm:p-10">
          <CheckCircle2 className="anim-asentar mx-auto h-11 w-11 text-verde-profundo" aria-hidden />
          <h2 ref={titulo} tabIndex={-1} className="font-display mt-4 text-3xl text-tinta outline-none">
            {TITULOS.exito}
          </h2>
          <p className="mt-2 text-sm text-tinta/75">
            {resultado.vaACuarentena
              ? "La prenda que trajo quedó en cuarentena, esperando que un líder decida qué hacer con ella."
              : "El stock ya refleja la prenda que volvió y la que salió."}
          </p>
          <dl className="mt-8 grid gap-4 text-left text-sm sm:grid-cols-2">
            <Dato titulo="Devolvió">{`${resultado.devuelta.referencia} · ${varianteLegible(resultado.devuelta)}${resultado.cantidad > 1 ? ` (×${resultado.cantidad})` : ""}`}</Dato>
            <Dato titulo="Se llevó">{`${resultado.nueva.referencia} · ${varianteLegible(resultado.nueva)}${resultado.cantidad > 1 ? ` (×${resultado.cantidad})` : ""}`}</Dato>
            <Dato titulo="Diferencia">
              {resultado.diferencia === 0
                ? "Sin diferencia"
                : resultado.diferencia > 0
                  ? `${soles(resultado.diferencia)} cobrados`
                  : `${soles(-resultado.diferencia)} devueltos`}
            </Dato>
            <Dato titulo="N.º de operación">
              <span className="font-mono">{resultado.operacion}</span>
            </Dato>
          </dl>
          <div className="mt-9 flex flex-wrap justify-center gap-2">
            <BotonPrincipal onClick={onNuevo}>Nuevo cambio</BotonPrincipal>
            <BotonSecundario onClick={onCerrar}>Volver a la actividad</BotonSecundario>
          </div>
        </div>
      )}
    </div>
  );
}

function Pasos({ actual, onIr }: { actual: number; onIr: (n: number) => void }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3" aria-label="Pasos del cambio">
      {PASOS.map((nombre, i) => {
        const n = i + 1;
        const hecho = n < actual;
        const esActual = n === actual;
        return (
          <li key={nombre} className={`flex items-center gap-2 sm:gap-3 ${n < PASOS.length ? "min-w-0 flex-1" : ""}`}>
            <button
              type="button"
              disabled={!hecho}
              onClick={() => onIr(n)}
              aria-current={esActual ? "step" : undefined}
              title={hecho ? `Volver a «${nombre}»` : undefined}
              className="group flex shrink-0 items-center gap-2 rounded-md disabled:cursor-default"
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-200 ${
                  hecho
                    ? "bg-tinta text-crema group-hover:bg-tinta/80"
                    : esActual
                      ? "bg-papel text-tinta ring-2 ring-tinta"
                      : "bg-papel text-tinta/65 ring-1 ring-tinta/20"
                }`}
              >
                {hecho ? <Check className="h-3.5 w-3.5" aria-hidden /> : n}
              </span>
              <span
                className={`hidden text-sm md:inline ${esActual ? "font-semibold text-tinta" : hecho ? "text-tinta/80 group-hover:underline" : "text-tinta/65"}`}
              >
                {nombre}
              </span>
              <span className="sr-only">{hecho ? `${nombre}, hecho` : esActual ? `${nombre}, paso actual` : `${nombre}, pendiente`}</span>
            </button>
            {n < PASOS.length && <span aria-hidden className={`h-px min-w-3 flex-1 transition-colors duration-200 ${hecho ? "bg-tinta/50" : "bg-tinta/15"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

function PanelValidaciones({ validaciones }: { validaciones: readonly Validacion[] }) {
  return (
    <aside className="self-start rounded-xl bg-papel p-5 ring-1 ring-tinta/[0.07] lg:sticky lg:top-24">
      <h3 className="mb-4 text-sm font-semibold text-tinta">Lo que el sistema revisa</h3>
      <ListaValidaciones validaciones={validaciones} />
    </aside>
  );
}

function Dato({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-tinta/70">{titulo}</dt>
      <dd className="mt-0.5 text-tinta">{children}</dd>
    </div>
  );
}

function PieDelPaso({ aviso, children }: { aviso: string | null; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">{children}</div>
      {aviso && (
        <p className="anim-revelar flex items-start justify-end gap-1.5 text-sm text-ambar-profundo" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {aviso}
        </p>
      )}
    </div>
  );
}

function BotonPrincipal({ onClick, children, disabled = false }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="alza-cayla inline-flex h-11 items-center gap-2 rounded-lg bg-tinta px-6 text-sm font-semibold text-crema transition-colors duration-200 hover:bg-tinta/85 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function BotonSecundario({ onClick, children, disabled = false }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium text-tinta ring-1 ring-tinta/15 transition-colors duration-200 hover:bg-papel hover:ring-tinta/30 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
