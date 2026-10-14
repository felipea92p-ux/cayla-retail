"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { useIntento } from "@/lib/useIntento";
import { huellaDe } from "@/lib/intento-reglas";
import { AvisoIntentoIncierto } from "@/components/ui/AvisoIntentoIncierto";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { ChipEstado, MetaCompra, formatearHora } from "@/components/ComprasAgrupadas";
import { ImpactoVista, ComparacionPrendas, type PrendaFicha } from "@/components/CambioResumen";
import {
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
import { CambioReemplazo } from "@/components/CambioReemplazo";
import { EscanerBusqueda } from "@/components/EscanerBusqueda";
import { usePistola } from "@/components/ui/usePistola";
import type { TonoAvisoLinea } from "@/components/ui/Aviso";
import { CambioTicketHoja, type TicketCambio } from "@/components/CambioTicket";
import type { SedeConId } from "@/lib/cambios-atajos-reglas";
import {
  agruparCatalogo,
  derivarReemplazo,
  opcionesDePrenda,
  pagadoPorUnidad,
  seleccionDesdeLectura,
  seleccionInicial,
  textoPagoConDescuento,
  type Seleccion,
  type VarianteCatalogo,
} from "@/lib/cambio-reemplazo-reglas";
import type { LineaVentaReciente } from "@/lib/ventas-v2";
import { conApartadoAjustado, conStockAjustado } from "@/lib/vender-stock-local";
import { useStockEnVivo } from "@/lib/useStockEnVivo";
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
import { Volver } from "@/components/ui/Volver";
import { Aviso } from "@/components/ui/Aviso";
import { useTrabajoPorSede } from "@/components/ui/TrabajoPorSede";
import { avisosDelCambio, type CambioArmado } from "@/lib/cambios-cambio-de-sede";

const PASOS = ["Venta", "Prenda", "Reemplazo", "Confirmación"] as const;
type Paso = 2 | 3 | 4 | "exito";

const TITULOS: Record<Paso, string> = {
  2: "¿Qué prenda cambia?",
  3: "¿Por cuál la cambia?",
  4: "Revisa y confirma",
  exito: "Cambio registrado",
};

function ficha(p: { referencia: string; talla: string | null; color: string | null; colorHex: string | null; fotoUrl: string | null }, precio: number, detalle: string | null = null): PrendaFicha {
  return { referencia: p.referencia, talla: p.talla, color: p.color, colorHex: p.colorHex, fotoUrl: p.fotoUrl, precio, detalle };
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
  esLider,
  sedes,
  catalogo: catalogoProp,
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
  /** Un líder puede pedir la prenda a otra sede desde aquí (el traslado prellenado solo respeta su origen). */
  esLider: boolean;
  sedes: SedeConId[];
  catalogo: VarianteCatalogo[];
  ahora: Date;
  onCerrar: () => void;
  onNuevo: () => void;
}) {
  const router = useRouter();
  const compra = venta[0]!;
  // El cambio a medio armar es de SU sede (Felipe, 2026-10-11): si se vuelve a una sede con un cambio guardado, se sigue en el mismo
  // paso (el panel ya retomó la venta).
  const { inicial: guardado, reportar: reportarCambio } = useTrabajoPorSede<CambioArmado>(ubicacionId);
  // Stock en vivo (2026-09-25, mismo hueco que Vender — ADR-0018, `lib/useStockEnVivo.ts`): `catalogoProp` es
  // la foto del servidor al entrar; `ajustesStock` la corrige con lo que releyó el sondeo mientras la pantalla
  // sigue abierta. Se reinicia si llega una foto nueva del servidor: esa ya es la verdad.
  // Lo apartado en el piso se corrige igual (`ajustesApartado`): con el stock al día pero lo apartado de la carga, una
  // prenda que otra caja aparta mientras esta pantalla sigue abierta diría «agotada» y no «apartada para un cliente».
  const [ajustesStock, setAjustesStock] = useState<Map<string, number>>(() => new Map());
  const [ajustesApartado, setAjustesApartado] = useState<Map<string, number>>(() => new Map());
  const [catalogoPropPrevio, setCatalogoPropPrevio] = useState(catalogoProp);
  if (catalogoProp !== catalogoPropPrevio) {
    setCatalogoPropPrevio(catalogoProp);
    setAjustesStock(new Map());
    setAjustesApartado(new Map());
  }
  const catalogo = useMemo(
    () => conApartadoAjustado(conStockAjustado(catalogoProp, ajustesStock), ajustesApartado),
    [catalogoProp, ajustesStock, ajustesApartado],
  );
  useStockEnVivo(
    ubicacionId,
    useMemo(() => catalogoProp.map((v) => v.varianteId), [catalogoProp]),
    cajaAbierta,
    // El almacén (2.º argumento) es de Vender: Cambios no ofrece lo del almacén, solo necesita lo apartado (3.º).
    (releido, _almacen, apartado) => {
      setAjustesStock((prev) => new Map([...prev, ...releido]));
      setAjustesApartado((prev) => new Map([...prev, ...apartado]));
    },
  );
  // Quién registra el cambio (ADR-0161): se elige al confirmar, entre quienes están de turno en la tienda.
  const responsable = useResponsable({ ubicacionId, etiqueta: sede }, { modo: "atencion" }); // atiende a la clienta: vacío al abrir
  const nombreResponsable = responsable.lista.elegibles.find((p) => p.personaId === responsable.elegidoId)?.nombre ?? null;
  const [lineaId, setLineaId] = useState<string | null>(guardado ? guardado.lineaId : lineaInicialId);
  const [paso, setPaso] = useState<Paso>(guardado ? guardado.paso : lineaInicialId ? 3 : 2);
  const linea = venta.find((l) => l.ventaItemId === lineaId) ?? null;
  const [seleccion, setSeleccion] = useState<Seleccion | null>(guardado ? guardado.seleccion : linea ? seleccionInicial(linea) : null);
  // La marca del envío sigue a lo que se manda (/chaos 2026-10-13): la prenda que vuelve, la que se lleva, la cantidad, el motivo y
  // el pago de la diferencia. Si la respuesta se pierde, el paso se congela (ni volver ni cambiar nada) hasta saber si el cambio
  // quedó; con otra prenda y la marca vieja, la base devolvía el cambio anterior. La marca viaja con lo guardado al cambiar de sede.
  const envio = useIntento("registrar_cambio", guardado?.intento ?? null);
  const enviando = envio.enviando;
  const [revisando, setRevisando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<TicketCambio | null>(null);
  const [avisoContinuar, setAvisoContinuar] = useState<string | null>(null);
  const [camara, setCamara] = useState(false);
  const [esperandoPistola, setEsperandoPistola] = useState(false);
  const [lectura, setLectura] = useState<{ tono: TonoAvisoLinea; texto: string } | null>(null);
  const campoPrenda = useRef<HTMLInputElement>(null);

  // Lo armado, al día, para `TrabajoPorSede`: si la sede cambia, el cambio queda guardado en ESTA sede. Registrado, ya no hay nada que
  // guardar.
  // La marca del envío viaja con lo guardado (y si quedó en duda, sigue en duda al volver).
  const instantaneaDelEnvio = envio.instantanea;
  const faseDelEnvio = envio.fase;
  useEffect(() => {
    reportarCambio(
      paso !== "exito"
        ? {
            etiqueta: sede,
            unidades: seleccion?.cantidad ?? 1,
            trabajo: { venta, lineaInicialId, lineaId, paso, seleccion, intento: instantaneaDelEnvio() },
            ...avisosDelCambio({ etiqueta: sede, clienta: compra.clienta, comprobante: compra.comprobante }),
          }
        : null,
    );
  }, [reportarCambio, paso, sede, seleccion, venta, lineaInicialId, lineaId, compra.clienta, compra.comprobante, faseDelEnvio, instantaneaDelEnvio]);

  const titulo = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const refMotivo = useRef<HTMLFieldSetElement>(null);
  const refPrenda = useRef<HTMLDivElement>(null);
  const refMetodo = useRef<HTMLButtonElement>(null);

  const porProducto = useMemo(() => agruparCatalogo(catalogo), [catalogo]);
  const elegidoId = seleccion?.productoId;
  const opcionesPrenda = useMemo(() => (linea ? opcionesDePrenda(linea, porProducto, elegidoId) : []), [linea, porProducto, elegidoId]);
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
          nueva: r.varianteNueva
            ? {
                descripcion: r.descripcionNueva,
                stockAqui: r.varianteNueva.stockAqui,
                apartadoAqui: r.varianteNueva.apartadoAqui,
                otrasSedes: r.otrasSedes,
                precio: r.precioNueva ?? r.varianteNueva.precio,
              }
            : null,
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
    // En duda no se vuelve: cambiar la prenda o el pago y reenviar podría registrar el cambio dos veces.
    if (envio.incierto) return;
    setAvisoContinuar(null);
    setError(null);
    if (paso === 4) setPaso(3);
    else if (paso === 3) setPaso(2);
    else onCerrar();
  }
  useEscapeRetrocede(retroceder, !enviando && !envio.incierto && paso !== "exito" && !camara);

  // Escanear la prenda que se lleva (Felipe 2026-10-09: «que se escanee y se seleccione automáticamente»). La pistola
  // escucha todo el paso 3, dentro del combo de prenda o con el foco en cualquier botón (`fuera: "leer"`, sin robar
  // teclas a «¿Cuántas cambia?»); en el celular, la cámara. Lo leído elige prenda, talla y color de una vez.
  function alLeerPrenda(codigo: string) {
    setCamara(false);
    setEsperandoPistola(false);
    const r = seleccionDesdeLectura(codigo, catalogo);
    if (r.tipo === "no-encontrada") {
      setLectura({ tono: "atencion", texto: `No encontramos «${r.codigo}» en el catálogo. Revisa la etiqueta o búscala por su nombre.` });
      return;
    }
    navigator.vibrate?.(35);
    setAvisoContinuar(null);
    setSeleccion((actual) => (actual ? { ...actual, ...r.cambio } : actual));
    const detalle = varianteLegible(r.variante);
    setLectura({ tono: "exito", texto: `Escaneada: ${r.variante.referencia}${detalle ? ` · ${detalle}` : ""}` });
  }
  usePistola(campoPrenda, {
    activa: paso === 3 && !camara,
    fuera: "leer",
    alLeer: ({ codigo, dentro }) => {
      // Lo que la pistola escribió en el combo no es una búsqueda: se suelta el campo y vuelve a mostrar la prenda elegida.
      if (dentro) campoPrenda.current?.blur();
      alLeerPrenda(codigo);
    },
  });
  function escanearPrenda() {
    setLectura(null);
    // Un teléfono no tiene pistola: con pantalla táctil, se lee con la cámara (mismo criterio que `BuscadorVentas`).
    if (window.matchMedia?.("(pointer: coarse)").matches) return setCamara(true);
    setEsperandoPistola(true);
    campoPrenda.current?.focus();
  }

  function elegirLinea(id: string) {
    const nueva = venta.find((l) => l.ventaItemId === id);
    if (!nueva) return;
    setLineaId(id);
    setSeleccion(seleccionInicial(nueva));
    setLectura(null);
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
    setError(null);
    const params = {
      p_venta_item_id: linea.ventaItemId,
      p_ubicacion_id: ubicacionId,
      p_variante_nueva_id: r.varianteNueva.varianteId,
      p_cantidad: seleccion.cantidad,
      p_metodo_pago_diferencia: r.diferencia !== 0 ? seleccion.metodo : undefined,
      p_motivo: seleccion.motivo,
      p_condicion: r.condicion,
    };
    const res = await envio.enviar(huellaDe(params), (token, senal) =>
      firmar(createClient().rpc("registrar_cambio", { ...params, p_token: token }), responsable.firma()).abortSignal(senal),
    );
    if (res.tipo === "ocupado" || res.tipo === "congelado") return;
    responsable.despues(res.tipo === "error" || res.tipo === "incierto" ? res.error : null);
    // En duda: el paso lo dice sobre los botones y se congela hasta saber qué pasó.
    if (res.tipo === "incierto") return;
    if (res.tipo === "error") {
      setError(traducirError(res.error, "registrar el cambio"));
      return;
    }
    registrado(res.tipo === "ok" ? res.data : res.datos.id);
  }

  async function revisar() {
    setRevisando(true);
    const res = await envio.revisar();
    setRevisando(false);
    if (res.tipo === "hecho") return registrado(res.datos.id);
    if (res.tipo === "no_llego") {
      setError("El cambio no se registró: no se movió ninguna prenda ni plata. Revisa los datos y vuelve a confirmar.");
      return;
    }
    if (res.tipo === "sin_respuesta") setError("Todavía no hay respuesta. Revisa el internet y vuelve a tocar «Revisar si se guardó».");
  }

  function registrado(data: unknown) {
    if (!linea || !seleccion || !r || !r.varianteNueva) return;
    // El ticket del cambio (spike 2026-09-26): lo que la clienta se lleva. `nombreResponsable` se lee ANTES de que el
    // combo se vacíe tras guardar.
    setResultado({
      operacion: String(data ?? "").slice(0, 8).toUpperCase(),
      comprobante: compra.comprobante,
      clienta: compra.clienta,
      devolvio: `${linea.referencia} · ${varianteLegible(linea)}`,
      sellevo: `${r.varianteNueva.referencia} · ${varianteLegible(r.varianteNueva)}`,
      cantidad: seleccion.cantidad,
      diferencia: r.diferencia,
      vaACuarentena: r.condicion === "no_vendible",
      sede,
      atendio: nombreResponsable,
      registradoEn: new Date().toISOString(),
    });
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
          deshabilitado={enviando || envio.incierto}
          pasos={PASOS}
          actual={paso}
          onIrAPaso={(n) => (envio.incierto ? undefined : n === 1 ? onCerrar() : setPaso(n as Paso))}
          titulo={TITULOS[paso]}
          refTitulo={titulo}
        />
      )}

      {paso === 2 && (
        <div className="anim-revelar space-y-5">
          <div data-guia="cambios.flujo-prendas" className="rounded-[22px] bg-papel p-5 ring-1 ring-tinta/[0.07] sm:p-6">
            <MetaCompra compra={compra} dia={etiquetaDia(compra.creadoEn, ahora)} />
            <fieldset className="mt-4">
              <legend className="sr-only">Prenda que el cliente quiere cambiar</legend>
              <div className="space-y-1.5">
                {venta.map((l) => {
                  const estado = estadoPrendaVendida(l, ahora);
                  const elegida = l.ventaItemId === lineaId;
                  return (
                    <label
                      key={l.ventaItemId}
                      data-guia="cambios.prenda-elegir"
                      // En el celular el chip baja a su propia línea (con 375 px se salía de la tarjeta).
                      className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg p-3 transition-colors duration-200 ${
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
                          <span className="font-mono">{codigoPrenda(l)}</span> · {soles(pagadoPorUnidad(l))}
                        </span>
                      </span>
                      <span className="max-sm:basis-full max-sm:pl-8">
                        <ChipEstado estado={estado} />
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </div>
          <PieDelPaso aviso={avisoContinuar} guia="cambios.pie-prenda">
            <Volver onClick={onCerrar} a="Volver a elegir otra venta" />
            <BotonPrincipal guia="cambios.continuar" onClick={continuarDesdePrenda}>
              Continuar
              <ArrowRight className="h-4 w-4" aria-hidden />
            </BotonPrincipal>
          </PieDelPaso>
        </div>
      )}

      {paso === 3 && linea && seleccion && r && (
        <div className="anim-revelar space-y-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
            <div data-guia="cambios.reemplazo" className="rounded-[22px] bg-papel p-5 ring-1 ring-tinta/[0.07] sm:p-7">
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
                  // Elegir a mano otra prenda deja viejo lo que dijo la última lectura.
                  if (cambio.productoId !== undefined) setLectura(null);
                  setSeleccion((actual) => (actual ? { ...actual, ...cambio } : actual));
                }}
                salidas={{ sedes, ubicacionId, sede, esLider, responsable }}
                campoPrenda={campoPrenda}
                onEscanear={escanearPrenda}
                lectura={lectura}
                esperandoPistola={esperandoPistola}
              />
              {camara && (
                <EscanerBusqueda
                  titulo="Escanear la prenda nueva"
                  pista="Centra la etiqueta de la prenda que se lleva en el cuadro"
                  onCodigo={alLeerPrenda}
                  onEscribir={() => {
                    setCamara(false);
                    requestAnimationFrame(() => campoPrenda.current?.focus());
                  }}
                  onClose={() => setCamara(false)}
                />
              )}
            </div>
            {/* Con la prenda nueva ya elegida, el panel muestra también qué pasará en el
                inventario y en la caja: se ve mientras se elige, no solo en la confirmación. */}
            <PanelValidaciones guia="cambios.validaciones" validaciones={validaciones} impacto={r.varianteNueva && !r.sinStockAqui ? impacto : null} />
          </div>
          <PieDelPaso aviso={avisoContinuar} guia="cambios.pie-reemplazo">
            <Volver onClick={retroceder} a="Volver al paso anterior" />
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
                <Dato titulo="Cliente">{compra.clienta ?? "No quedó registrado en la venta"}</Dato>
                <Dato titulo="Se registra en">{sede}</Dato>
                {/* Con el combo (ADR-0161) lo registra el responsable elegido, no la cuenta de la sesión. */}
                <Dato titulo="Lo registra">{nombreResponsable ?? "Elige abajo en «Responsable»"}</Dato>
                <Dato titulo="Motivo">{seleccion.motivo ? etiquetaMotivo(seleccion.motivo) : "—"}</Dato>
                <Dato titulo="La prenda que trae">{r.condicion === "vendible" ? "Impecable: vuelve al piso" : "Con defecto o uso: va a cuarentena"}</Dato>
              </dl>
              <ComparacionPrendas
                devuelta={ficha(linea, r.pagadoUnitario, textoPagoConDescuento(linea))}
                nueva={ficha(r.varianteNueva, r.precioNueva ?? r.varianteNueva.precio)}
                cantidad={seleccion.cantidad}
                diferencia={r.diferencia}
              />
              <div className="border-t border-tinta/[0.08] pt-7">
                <ImpactoVista impacto={impacto} />
              </div>
            </div>
            <PanelValidaciones validaciones={validaciones} />
          </div>

          <ComboResponsable control={responsable} deshabilitado={enviando || envio.incierto} className="max-w-sm" />

          {envio.incierto && <AvisoIntentoIncierto onRevisar={revisar} revisando={revisando} />}

          {error && (
            // La base rechazó la operación: el aviso recibe el foco para que se lea y se oiga sin buscarlo. `traducirError` abre con
            // «No se pudo …» cuando no reconoce el error; con un mensaje de la base hay que decir además que no se guardó nada.
            <Aviso tono="error" ref={errorRef} enfocable titulo={error.startsWith("No se pudo") ? undefined : "No se registró el cambio."}>
              {error}
            </Aviso>
          )}

          <PieDelPaso aviso={null}>
            <Volver onClick={retroceder} deshabilitado={enviando || envio.incierto} a="Volver al paso anterior" />
            <div className="flex flex-wrap items-center gap-2">
              <BotonSecundario onClick={onCerrar} disabled={enviando || envio.incierto}>
                Cancelar
              </BotonSecundario>
              {/* Como «Cobrar» en Vender: qué se hace a la izquierda; cuánto, a la derecha. Solo si
                  hay diferencia que mover: sin ella, el botón no promete plata. */}
              <BotonRojo onClick={confirmar} cargando={enviando} textoCargando="Registrando…" disabled={revisando || !responsable.listo} monto={r.diferencia !== 0 ? soles(Math.abs(r.diferencia)) : undefined}>
                <Check className="h-4 w-4" aria-hidden />
                {envio.incierto ? "Volver a intentar" : "Confirmar cambio"}
              </BotonRojo>
            </div>
          </PieDelPaso>
        </div>
      )}

      {paso === "exito" && resultado && <CambioTicketHoja ticket={resultado} onNuevo={onNuevo} onCerrar={onCerrar} />}
    </div>
  );
}
