"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { ChipEstado, MetaCompra, formatearHora } from "@/components/ComprasAgrupadas";
import { ImpactoVista, ComparacionPrendas, type PrendaFicha } from "@/components/CambioResumen";
import {
  AvisoDeError,
  BotonPrincipal,
  BotonRojo,
  BotonSecundario,
  Dato,
  EncabezadoFlujo,
  PanelValidaciones,
  PieDelPaso,
  useEscapeRetrocede,
  useFocoAlCambiarDePaso,
} from "@/components/FlujoGuiado";
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
  unidadesDisponibles,
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
  /** Nombre de la sesión. Ya no se muestra: «Lo registra» es el responsable elegido (ADR-0161). */
  colaboradora: string;
  cajaAbierta: boolean;
  catalogo: VarianteCatalogo[];
  ahora: Date;
  onCerrar: () => void;
  onNuevo: () => void;
}) {
  const router = useRouter();
  const compra = venta[0]!;
  // Quién registra el cambio (ADR-0161): se elige al confirmar, entre quienes están de turno en la tienda.
  const responsable = useResponsable({ ubicacionId, etiqueta: sede });
  const nombreResponsable = responsable.lista.elegibles.find((p) => p.personaId === responsable.elegidoId)?.nombre ?? null;
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
          disponible: unidadesDisponibles(linea),
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

  useFocoAlCambiarDePaso(titulo, paso);
  // Si la base rechazó el cambio, el foco va al aviso, al lado del botón.
  useFocoAlCambiarDePaso(errorRef, error);

  function retroceder() {
    setAvisoContinuar(null);
    setError(null);
    if (paso === 4) setPaso(3);
    else if (paso === 3) setPaso(2);
    else onCerrar();
  }
  useEscapeRetrocede(retroceder, !enviando && paso !== "exito");

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
    if (!responsable.listo) {
      setError(responsable.motivo);
      return;
    }
    setEnviando(true);
    setError(null);
    const { data, error: fallo } = await firmar(
      createClient().rpc("registrar_cambio", {
        p_venta_item_id: linea.ventaItemId,
        p_ubicacion_id: ubicacionId,
        p_variante_nueva_id: r.varianteNueva.varianteId,
        p_cantidad: seleccion.cantidad,
        p_metodo_pago_diferencia: r.diferencia !== 0 ? seleccion.metodo : undefined,
        p_token: token.current,
        p_motivo: seleccion.motivo,
        p_condicion: r.condicion,
      }),
      responsable.firma(),
    );
    setEnviando(false);
    responsable.despues(fallo);
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

  return (
    <div className="space-y-6">
      {paso !== "exito" && (
        <EncabezadoFlujo
          volverA="Volver a Cambios"
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
                      <ChipEstado estado={estado} />
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
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="rounded-[22px] bg-papel p-5 ring-1 ring-tinta/[0.07] sm:p-7">
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
            {/* Con la prenda nueva ya elegida, el panel muestra también qué pasará en el
                inventario y en la caja: se ve mientras se elige, no solo en la confirmación. */}
            <PanelValidaciones validaciones={validaciones} impacto={r.varianteNueva && !r.sinStockAqui ? impacto : null} />
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
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="space-y-8 rounded-[22px] bg-papel p-5 ring-1 ring-tinta/[0.07] sm:p-7">
              <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                <Dato titulo="Venta">
                  {compra.comprobante ?? "Venta sin comprobante"} · {etiquetaDia(compra.creadoEn, ahora).toLowerCase()} {formatearHora(compra.creadoEn)}
                </Dato>
                <Dato titulo="Clienta">{compra.clienta ?? "No quedó registrada en la venta"}</Dato>
                <Dato titulo="Se registra en">{sede}</Dato>
                {/* Con el combo (ADR-0161) lo registra el responsable elegido, no la cuenta de la sesión. */}
                <Dato titulo="Lo registra">{nombreResponsable ?? "Elige abajo en «Responsable»"}</Dato>
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

          <ComboResponsable control={responsable} deshabilitado={enviando} className="max-w-sm" />

          {error && <AvisoDeError error={error} refAviso={errorRef} queNoSeHizo="No se registró el cambio." />}

          <PieDelPaso aviso={null}>
            <BotonSecundario onClick={retroceder} disabled={enviando}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Atrás
            </BotonSecundario>
            <div className="flex flex-wrap items-center gap-2">
              <BotonSecundario onClick={onCerrar} disabled={enviando}>
                Cancelar
              </BotonSecundario>
              {/* Como «Cobrar» en Vender: qué se hace a la izquierda; cuánto, a la derecha. Solo si
                  hay diferencia que mover: sin ella, el botón no promete plata. */}
              <BotonRojo onClick={confirmar} disabled={enviando || !responsable.listo} monto={r.diferencia !== 0 ? soles(Math.abs(r.diferencia)) : undefined}>
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                {enviando ? "Registrando…" : "Confirmar cambio"}
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
