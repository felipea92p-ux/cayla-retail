"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Check, ChevronRight, Info, ScanBarcode, Shirt, Truck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { clave } from "@/lib/buscar-prenda-v2";
import { teclaSueltaVaAlEscaner } from "@/lib/escaner-tecla-suelta";
import { Boton, CampoSelectNativo, CampoTexto, SelectNativo } from "@/components/ui/campos";
import { BarraFija } from "@/components/ui/BarraFija";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { EnvioRecibido, type ResultadoEnvio as Resultado } from "@/components/EnvioRecibido";
import { ResumenPrevioEnvio } from "@/components/ResumenPrevioEnvio";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { Resaltado } from "@/components/ui/Resaltado";
import { TabsSubrayado } from "@/components/ui/TabsSubrayado";
import { useFlip } from "@/lib/useFlip";
import { DecidirTodas, EditorDecision, etiquetaDecision, ResumenDecision, type Decision } from "@/components/DecisionFaltanteFila";
import { compararTallas } from "@/lib/tallas";
import { textoDeLaParte } from "@/lib/reparto-reglas";
import { diaMes } from "@/lib/fechas-lima";
import {
  chipLlegada,
  cierresElegidos,
  diasDeAtraso,
  estadoLinea,
  etiquetaConfirmar,
  faltanteDeLinea,
  notasPorReclamar,
  ordenarPorUrgencia,
  sinDecidir,
  textoEsperada,
  valorPorLlegar,
  type EstadoLinea,
} from "@/lib/recepciones-reglas";
import { ETIQUETA_TIPO_DOCUMENTO, soles, type CompraResumen, type LineaCompra } from "@/lib/compras-reglas";
import {
  armarPedidoEnvio,
  bloquesDelEnvio,
  comprobantesQueTraen,
  EVENTO_MARCAR,
  extraCompleto,
  guiaConFormato,
  inicialesProveedor,
  llegoLinea,
  movimientosDelEnvio,
  proveedoresDelEnvio,
  resolverEscaneo,
  restarUnidad,
  resumenPorComprobante,
  sumarUnidad,
  totalesEnvio,
  trasladoContadoEntero,
  type ConteoTraslado,
  type ExtraEnvio,
  type MovimientoDelEnvio,
  type PedidoEnvio,
  type Reparto,
  type TrasladoEnCamino,
} from "@/lib/envio-reglas";

// Recibir mercadería POR ENVÍO (ADR-0113). Lo que llega a la puerta es un envío —una agencia, una guía,
// varios bultos— y puede traer comprobantes de VARIOS proveedores, prendas que ningún comprobante lista y
// hasta mercadería de otra sede de CAYLA. Todo se cuenta acá y se registra JUNTO, en una sola llamada
// atómica (`recibir_envio`): si algo falla no queda nada y el conteo sigue en pantalla para corregirlo.
//
// Sale de `RecepcionCompraFormV2` (lista + panel de Felipe, 2026-09-14), con estas diferencias:
// · La lista se MARCA (casillas) y admite comprobantes de cualquier proveedor; antes, elegir uno de otro
//   proveedor descartaba la guía. Cada comprobante marcado es un bloque plegable.
// · Una sola guía para todo el envío (los proveedores no traen la suya: la recepción es por envío).
// · Los cuatro indicadores viven DEBAJO de «¿Qué llegó?» y desaparecen al marcar un comprobante.
// · Escaneo: cada lectura suma 1 al comprobante que trae esa prenda, sea del proveedor que sea.
// · Fuera de comprobante lleva ORIGEN: de qué proveedor viene y si es regalo. Lo que viene de otra sede
//   no crea stock de la nada: se cuenta y confirma como traslado en tránsito (ADR-0068).
// · Cuenta CUALQUIER colaborador de la sede. Quien no es líder no ve dinero (llega en cero desde el
//   servidor) y no decide qué pasa con lo que faltó: lo deja pendiente y un líder lo cierra después.
//
// La NOTA DE CRÉDITO ya no se registra acá (2026-09-19, módulo `/compras/notas-credito`): contar prendas y
// mover dinero eran dos cosas en la misma pantalla, y una de ellas no es de dinero. Lo que queda es contar y
// decidir qué pasó con lo que faltó; cuando un cierre deja al proveedor debiendo el documento, un aviso
// discreto lo dice y apunta al módulo («Se reclama en Notas de crédito ↗», solo líder). El faltante se cierra
// igual acá: eso es operación, no dinero. La RPC `recibir_envio` sigue aceptando `p_notas_credito` —la base
// no se tocó—, pero esta pantalla lo manda siempre vacío.
//
// Se conserva de la versión anterior: D1 (una línea vacía es «sin contar»; un 0 es «no llegó nada»),
// D2 (lo que faltó se decide en la misma fila y se registra junto al confirmar), la curva de tallas para
// lo facturado sin talla ni color, y − / + grandes en celular (recibir es de pie, con una mano).
type Variante = {
  varianteId: string;
  sku: string;
  talla: string | null;
  color: string | null;
  productoId: string;
  referencia: string;
  codigosBarras: string[];
  /** El color como color (`retail.colores.hex`): la miniatura de la fila. `null` = sin hex. */
  colorHex?: string | null;
  /** La foto de la prenda en ESE color (`producto_fotos`); `null` = sin foto. */
  fotoUrl?: string | null;
};
type Ubicacion = { id: string; nombre: string };
type Proveedor = { id: string; nombre: string };


type Pestana = "prendas" | "fuera" | "notas";
type FiltroLista = "todas" | "atrasadas" | "proximas";

const NUMERO =
  "w-16 border-b bg-transparent px-1 py-1 text-center text-sm tabular-nums text-tinta outline-none [appearance:textfield] focus:border-b-2 focus:border-rojo [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

// Prenda · SKU · Pendiente · Llegó · Dif. · Estado
// El diseño de la tabla lo decide el ANCHO DEL PANEL (`@container` en la columna derecha), no el de la ventana: con el menú
// lateral abierto una ventana de 1440 px deja al panel en ~700 px, y ahí la tabla de 6 columnas aprieta el nombre (ADR-0128).
// Panel angosto: cada línea es una tarjeta con su − / +; ancho: la tabla de siempre.
const PLANTILLA_LINEA = "@[46rem]:grid-cols-[1fr_4rem_6.5rem_3rem_9rem] @[60rem]:grid-cols-[1fr_8.5rem_4rem_7rem_3rem_10rem]";

const CHIP_ESTADO: Record<EstadoLinea, TonoChip> = { sin_contar: "neutro", completa: "verde", faltan: "ambar", excede: "rojo" };
const ETIQUETA_ESTADO: Record<EstadoLinea, (faltan: number) => string> = {
  sin_contar: () => "Sin contar",
  completa: () => "Completa",
  faltan: (n) => `Faltan ${n}`,
  excede: () => "Excede",
};

const FRASES_NOTA = ["Caja abierta al llegar", "Faltan bultos", "Etiquetas dañadas", "Llegó mojado", "Guía sin sello"];

const CASILLA_TEXTO =
  "h-10 w-full rounded-lg border border-tinta/15 bg-transparent px-3 text-sm text-tinta outline-none placeholder:text-tinta/45 focus:border-rojo";

export function RecepcionEnvio({
  compras,
  lineas,
  variantes,
  proveedores,
  ubicaciones,
  ubicacionInicialId,
  compraInicialId,
  esLider,
  verMontos = esLider,
  comprasConNotaFaltante,
  trasladosPorUbicacion,
  resumen,
}: {
  compras: CompraResumen[];
  lineas: LineaCompra[];
  variantes: Variante[];
  proveedores: Proveedor[];
  ubicaciones: Ubicacion[];
  ubicacionInicialId: string;
  compraInicialId: string | null;
  esLider: boolean;
  /** Los montos de cada comprobante (ADR-0161 P2): quien ve el dinero de Compras, no solo el líder. Las DECISIONES sobre lo que
   *  faltó siguen siendo `esLider`. */
  verMontos?: boolean;
  /** Comprobantes que ya tienen su nota por faltante (es una sola por comprobante): esos no se avisan. */
  comprasConNotaFaltante: string[];
  /** Traslados en tránsito que vienen hacia cada ubicación (el «envío interno»). */
  trasladosPorUbicacion: Record<string, TrasladoEnCamino[]>;
  /** Los indicadores: se dibujan bajo «¿Qué llegó?» mientras no haya nada marcado. */
  resumen: ReactNode;
}) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  const escaneoRef = useRef<HTMLInputElement>(null);
  const ahora = useMemo(() => new Date(), []);
  const comprasOrdenadas = useMemo(() => ordenarPorUrgencia(compras, ahora), [compras, ahora]);

  const inicial = compraInicialId && compras.some((c) => c.id === compraInicialId) ? [compraInicialId] : [];
  const [seleccionadas, setSeleccionadas] = useState<string[]>(inicial);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>(() => Object.fromEntries(inicial.map((id) => [id, true])));
  // Las cantidades arrancan VACÍAS (D1): sin valor = sin contar.
  const [reparto, setReparto] = useState<Reparto>({});
  const [extras, setExtras] = useState<ExtraEnvio[]>([]);
  const [trasladosElegidos, setTrasladosElegidos] = useState<string[]>([]);
  const [conteoTraslados, setConteoTraslados] = useState<Record<string, ConteoTraslado>>({});
  const [pestana, setPestana] = useState<Pestana>("prendas");
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroLista>("todas");
  const [numeroGuia, setNumeroGuia] = useState("");
  const [nota, setNota] = useState("");
  const [ubicacionId, setUbicacionId] = useState(ubicacionInicialId || ubicaciones[0]?.id || "");
  const [escaneo, setEscaneo] = useState("");
  const [ultimaLectura, setUltimaLectura] = useState<{
    bueno: boolean;
    texto: string;
    /** Solo en una lectura que sumó: el «Deshacer» resta esa unidad. */
    deshacer?: { lineaId: string; varianteId: string };
    /** Solo cuando la prenda viene en un comprobante que no está marcado: ofrece agregarlo y volver a leer. */
    agregar?: { compraId: string; codigo: string; documento: string };
  } | null>(null);
  // La fila que acaba de leer la pistola (se tiñe de verde y se apaga) y el comprobante que acaba de marcarse (destello rojo suave).
  // `n` sube en cada evento: es la `key` que hace repetir el destello aunque sea la misma fila.
  const [destello, setDestello] = useState<{ id: string; n: number } | null>(null);
  const [recienMarcada, setRecienMarcada] = useState<{ id: string; n: number } | null>(null);
  // Menú «Agregar comprobante» y las sugerencias del escáner (visibles solo con el campo enfocado).
  const [menuAgregar, setMenuAgregar] = useState(false);
  // En celular la lista de pendientes se pliega al marcar (queda «Cambiar») para dejarle la pantalla al conteo; en escritorio no aplica.
  const [listaPlegada, setListaPlegada] = useState(false);
  // Lo que se está yendo (chip de comprobante, fila fuera de comprobante): sale con una animación de 200 ms y recién ahí se quita.
  const [saliendoChip, setSaliendoChip] = useState<string | null>(null);
  const [saliendoExtra, setSaliendoExtra] = useState<number | null>(null);
  const [verSugerencias, setVerSugerencias] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // El resumen previo a recibir: el pedido ya armado y validado, a la espera del «Confirmar».
  const [pedidoListo, setPedidoListo] = useState<{ pedido: PedidoEnvio; movimientos: MovimientoDelEnvio[] } | null>(null);
  // Un token por envío: reintentar (un doble toque, una red lenta) no duplica el stock. Se renueva al terminar.
  const [token, setToken] = useState(() => crypto.randomUUID());
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<Resultado | null>(null);
  const [quitarPendiente, setQuitarPendiente] = useState<CompraResumen | null>(null);
  // Qué se hace con lo que faltó, por línea (solo líder): ausente = todavía sin decidir (bloquea el confirmar).
  const [decisiones, setDecisiones] = useState<Record<string, Decision | undefined>>({});
  // La fila cuya decisión se está corrigiendo, y la fila cuyo campo tiene el foco (el editor no se abre mientras se teclea).
  const [editando, setEditando] = useState<string | null>(null);
  const [enfocada, setEnfocada] = useState<string | null>(null);

  const variantesPorProducto = useMemo(() => {
    const m = new Map<string, Variante[]>();
    for (const v of variantes) m.set(v.productoId, [...(m.get(v.productoId) ?? []), v]);
    return m;
  }, [variantes]);
  const variantePorId = useMemo(() => new Map(variantes.map((v) => [v.varianteId, v])), [variantes]);

  // Catálogo completo, agrupado por producto: cualquier prenda del catálogo puede llegar fuera de comprobante.
  const opcionesProducto = useMemo(
    () =>
      [...variantesPorProducto.entries()].map(([productoId, vs]) => ({
        valor: productoId,
        texto: vs[0].referencia,
        detalle: `${vs.length} ${vs.length === 1 ? "variante" : "variantes"}`,
      })),
    [variantesPorProducto],
  );

  const bloques = useMemo(() => bloquesDelEnvio(comprasOrdenadas, seleccionadas, lineas), [comprasOrdenadas, seleccionadas, lineas]);
  const lineasActivas = useMemo(() => bloques.flatMap((b) => b.lineas), [bloques]);
  const proveedoresEnvio = useMemo(() => proveedoresDelEnvio(bloques), [bloques]);
  const hayEnvio = seleccionadas.length > 0;

  const trasladosDeAca = trasladosPorUbicacion[ubicacionId] ?? [];
  const trasladosMarcados = trasladosDeAca.filter((t) => trasladosElegidos.includes(t.id));
  const totales = totalesEnvio(
    bloques,
    reparto,
    extras,
    trasladosMarcados.map((t) => ({ lineas: t.lineas, conteo: conteoTraslados[t.id] ?? {} })),
  );
  const unidadesRecibiendo = totales.contadas + totales.fueraDeComprobante + totales.deOtraSede;
  const ubicacionNombre = ubicaciones.find((u) => u.id === ubicacionId)?.nombre ?? "";
  // Quién recibe (ADR-0161/0162): `recibir_envio` firma con esa persona, elegida entre quienes están de turno en la
  // ubicación a la que ENTRA la mercadería (la que se elige arriba), no en la sede de la cabecera.
  const responsable = useResponsable(ubicacionId ? { ubicacionId, etiqueta: ubicacionNombre || "esta ubicación" } : undefined);
  const proveedorPorDefecto = proveedoresEnvio[0]?.id ?? proveedores[0]?.id ?? "";

  // ---- la lista de la izquierda -------------------------------------------------------------------
  const k = clave(busqueda);
  const nAtrasadas = comprasOrdenadas.filter((c) => diasDeAtraso(c, ahora) > 0).length;
  const visibles = comprasOrdenadas.filter(
    (c) =>
      (!k || clave(`${c.documento} ${c.proveedorNombre} ${c.proveedorRuc ?? ""}`).includes(k)) &&
      (filtro === "todas" || (filtro === "atrasadas") === diasDeAtraso(c, ahora) > 0),
  );
  // Al filtrar o buscar, las filas que quedan se deslizan a su lugar en vez de saltar (ADR-0128).
  const refFila = useFlip(visibles.map((c) => c.id).join("|"));

  const cantidadLinea = (l: LineaCompra): number => llegoLinea(l, reparto) ?? 0;

  // Sugerencias del escáner mientras se teclea: las prendas del envío que coinciden (por SKU, nombre, talla o color).
  const kEsc = clave(escaneo);
  // Salen del catálogo, no de las líneas: una línea agrupada («Vestido Sofía surtido») trae todas las variantes de su producto.
  const traeLinea = (l: LineaCompra, v: Variante) => l.varianteId === v.varianteId || (l.varianteId === null && l.productoId === v.productoId);
  const sugerencias =
    kEsc.length >= 2 ? variantes.filter((v) => clave(`${v.sku} ${v.referencia} ${v.talla ?? ""} ${v.color ?? ""}`).includes(kEsc) && lineasActivas.some((l) => traeLinea(l, v))).slice(0, 5) : [];
  const documentoDe = (v: Variante) => bloques.find((b) => b.lineas.some((l) => traeLinea(l, v)))?.compra.documento ?? "";

  // «/» lleva al escáner (si ya hay envío) o al buscador de la lista: el teclado antes que el mouse.
  useEffect(() => {
    if (ok) return;
    const alTeclear = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const enCampo = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (e.key !== "/" || enCampo || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      (hayEnvio ? escaneoRef.current : document.getElementById("recibir-buscar"))?.focus();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [hayEnvio, ok]);
  // Si la ventana pasa a escritorio, la lista nunca queda plegada (allí siempre se ve).
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const alCambiar = () => mq.matches && setListaPlegada(false);
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, []);
  // El menú de comprobantes se cierra al tocar fuera.
  useEffect(() => {
    if (!menuAgregar) return;
    const fuera = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenuAgregar(false);
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [menuAgregar]);
  const tieneCantidades = (compraId: string) => lineas.some((l) => l.compraId === compraId && (reparto[l.id] || decisiones[l.id]));

  // El escáner es un teclado: si el foco quedó en un botón, lo escaneado se perdería (y el Enter activaría el botón).
  useEffect(() => {
    if (!hayEnvio || ok || quitarPendiente) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (teclaSueltaVaAlEscaner(e, document.activeElement)) escaneoRef.current?.focus();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [hayEnvio, ok, quitarPendiente]);

  function irAlPanel() {
    // En celular la lista y el panel se apilan: al marcar, bajar al panel para que se vea que pasó algo.
    if (typeof window !== "undefined" && window.innerWidth < 1024) panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Marcar / desmarcar un comprobante. Quitar uno con cantidades anotadas pregunta primero: un toque en falso
  // no debe perder la cuenta de decenas de líneas.
  function alternar(c: CompraResumen) {
    if (seleccionadas.includes(c.id)) {
      if (tieneCantidades(c.id)) return void setQuitarPendiente(c);
      return quitar(c.id);
    }
    setSeleccionadas((s) => [...s, c.id]);
    setAbiertos((a) => ({ ...a, [c.id]: true }));
    setRecienMarcada((r) => ({ id: c.id, n: (r?.n ?? 0) + 1 }));
    if (window.innerWidth < 1024) setListaPlegada(true);
    irAlPanel();
  }

  // «Marcar las N atrasadas»: lo que casi siempre se recibe junto, de un solo clic.
  function marcarAtrasadas() {
    const nuevas = comprasOrdenadas.filter((c) => diasDeAtraso(c, ahora) > 0 && !seleccionadas.includes(c.id));
    if (nuevas.length === 0) return;
    setSeleccionadas((s) => [...s, ...nuevas.map((c) => c.id)]);
    setAbiertos((a) => ({ ...a, ...Object.fromEntries(nuevas.map((c) => [c.id, true])) }));
    setRecienMarcada((r) => ({ id: nuevas[0].id, n: (r?.n ?? 0) + 1 }));
    if (window.innerWidth < 1024) setListaPlegada(true);
    irAlPanel();
  }

  // Los indicadores (`KpisRecibir`) viven en el servidor y no conocen este estado: «La más atrasada» les avisa por evento.
  const alAvisarMarcar = useEffectEvent((id: string) => {
    const c = compras.find((x) => x.id === id);
    if (c && !seleccionadas.includes(c.id)) alternar(c);
  });
  useEffect(() => {
    const alMarcar = (e: Event) => alAvisarMarcar((e as CustomEvent<string>).detail);
    window.addEventListener(EVENTO_MARCAR, alMarcar);
    return () => window.removeEventListener(EVENTO_MARCAR, alMarcar);
  }, []);

  function quitar(compraId: string) {
    const ids = lineas.filter((l) => l.compraId === compraId).map((l) => l.id);
    const resto = seleccionadas.filter((id) => id !== compraId);
    setSeleccionadas(resto);
    setReparto((r) => {
      const copia = { ...r };
      ids.forEach((id) => delete copia[id]);
      return copia;
    });
    setDecisiones((m) => {
      const copia = { ...m };
      ids.forEach((id) => delete copia[id]);
      return copia;
    });
    // Sin ningún comprobante no hay envío: lo fuera de comprobante y lo de otra sede tampoco tienen dónde vivir.
    if (resto.length === 0) {
      setExtras([]);
      setTrasladosElegidos([]);
      setConteoTraslados({});
      setPestana("prendas");
    }
    setQuitarPendiente(null);
  }

  // Quitar un comprobante del envío: el chip se va con una salida corta. Si tiene cantidades, primero se pregunta (sin animación).
  function quitarConSalida(c: CompraResumen) {
    if (tieneCantidades(c.id)) return alternar(c);
    setSaliendoChip(c.id);
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => {
      setSaliendoChip(null);
      alternar(c);
    }, reducido ? 0 : 200);
  }

  function agregarDesdeSelect(compraId: string) {
    const c = compras.find((x) => x.id === compraId);
    if (c && !seleccionadas.includes(c.id)) alternar(c);
  }

  // `valor` null = borrar lo anotado (vuelve a «sin contar»). Una línea que queda sin ninguna anotación se
  // quita del reparto, para que «sin contar» sea siempre la ausencia y no un objeto vacío.
  function fijar(lineaId: string, varianteId: string, valor: number | null) {
    setReparto((r) => {
      const propias = { ...(r[lineaId] ?? {}) };
      if (valor === null) delete propias[varianteId];
      else propias[varianteId] = Math.max(0, Math.floor(valor) || 0);
      const copia = { ...r };
      if (Object.keys(propias).length === 0) delete copia[lineaId];
      else copia[lineaId] = propias;
      return copia;
    });
  }

  // «Todo llegó» / «Nada llegó» / «Vaciar» sobre un comprobante. Las líneas agrupadas no se pueden adivinar
  // (hay que repartirlas mirando la caja), salvo «Nada llegó», que es lo mismo para todas.
  function marcarTodas(compraId: string, que: "todo" | "nada" | "vaciar") {
    // «Todo llegó» se llena fila por fila (50 ms entre una y otra): se ve DÓNDE se anotó. Con movimiento reducido, de golpe.
    if (que === "todo" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      lineas
        .filter((x) => x.compraId === compraId && x.pendiente > 0 && x.varianteId)
        .forEach((l, i) => setTimeout(() => setReparto((r) => ({ ...r, [l.id]: { [l.varianteId!]: l.pendiente } })), i * 50));
      return;
    }
    setReparto((r) => {
      const copia = { ...r };
      for (const l of lineas.filter((x) => x.compraId === compraId && x.pendiente > 0)) {
        if (que === "vaciar") delete copia[l.id];
        else if (l.varianteId) copia[l.id] = { [l.varianteId]: que === "todo" ? l.pendiente : 0 };
        else if (que === "nada") copia[l.id] = {};
      }
      return copia;
    });
  }

  const nadaLlegoDe = (lineaId: string) => setReparto((r) => ({ ...r, [lineaId]: {} }));

  // ---- escaneo ------------------------------------------------------------------------------------
  // `marcados`: los comprobantes contra los que se lee. Casi siempre son los del envío; «Agregar y volver a leer» lo llama
  // con el comprobante recién agregado, que el estado todavía no refleja en este render.
  function escanear(texto: string, marcados: string[] = seleccionadas) {
    const codigo = texto.trim();
    if (!codigo) return;
    const bloquesDeLectura = marcados === seleccionadas ? bloques : bloquesDelEnvio(comprasOrdenadas, marcados, lineas);
    const r = resolverEscaneo(codigo, variantes, bloquesDeLectura, reparto);
    if (r.tipo === "sumado") {
      const linea = bloquesDeLectura.flatMap((b) => b.lineas).find((l) => l.id === r.lineaId);
      if (linea) setReparto((rep) => sumarUnidad(rep, linea, r.varianteId));
      setAbiertos((a) => ({ ...a, [r.compraId]: true }));
      setPestana("prendas");
      setDestello((d) => ({ id: r.lineaId, n: (d?.n ?? 0) + 1 }));
      setUltimaLectura({ bueno: true, texto: `${r.referencia} ${r.detalle} → ${r.proveedorNombre} · ${r.documento} (+1)`, deshacer: { lineaId: r.lineaId, varianteId: r.varianteId } });
      // La fila puede estar en un bloque que recién se abrió: se espera a que pinte para llevarla a la vista.
      setTimeout(() => document.getElementById(`recibir-linea-${r.lineaId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
    } else if (r.tipo === "completo") {
      setUltimaLectura({ bueno: false, texto: `${r.referencia} ${r.detalle}: ya está completo en todos los comprobantes del envío.` });
    } else if (r.tipo === "fuera") {
      // Ningún comprobante MARCADO la trae. Si otro comprobante pendiente sí, lo primero es ofrecerlo: quien recibe casi
      // siempre olvidó marcarlo, y anotar la prenda como «fuera de comprobante» la deja sin descontar de lo que se le debe.
      const otro = comprobantesQueTraen(r.varianteId, r.productoId, compras, lineas, marcados)[0];
      if (otro) {
        setUltimaLectura({ bueno: false, texto: `${r.referencia} ${r.detalle} viene en ${otro.documento} (${otro.proveedorNombre}), que no marcaste.`, agregar: { compraId: otro.id, codigo, documento: otro.documento } });
        setEscaneo("");
        return;
      }
      // Ningún comprobante la trae: pasa a «fuera de comprobante», con el proveedor del envío por defecto.
      setExtras((actual) => {
        const i = actual.findIndex((e) => e.varianteId === r.varianteId && !e.esRegalo);
        if (i >= 0) return actual.map((e, n) => (n === i ? { ...e, cantidad: e.cantidad + 1 } : e));
        return [...actual, { productoId: r.productoId, varianteId: r.varianteId, cantidad: 1, costoUnitario: "", proveedorId: proveedorPorDefecto, esRegalo: false }];
      });
      setPestana("fuera");
      setUltimaLectura({ bueno: false, texto: `${r.referencia} ${r.detalle} no viene en ningún comprobante marcado: quedó en «Fuera de comprobante». Revisa de qué proveedor es.` });
    } else {
      setUltimaLectura({ bueno: false, texto: `No encontré «${codigo}» en el catálogo.` });
    }
    setEscaneo("");
  }

  // «Deshacer» la última lectura: resta esa unidad (una lectura repetida por error es lo más común con la pistola).
  function deshacerLectura() {
    const u = ultimaLectura?.deshacer;
    const linea = u && lineasActivas.find((l) => l.id === u.lineaId);
    if (!u || !linea) return;
    setReparto((rep) => restarUnidad(rep, linea, u.varianteId));
    setUltimaLectura(null);
  }
  // Agrega el comprobante que traía la prenda y vuelve a leer el código, ya con el comprobante marcado.
  function agregarYReleer() {
    const a = ultimaLectura?.agregar;
    const c = a && compras.find((x) => x.id === a.compraId);
    if (!a || !c) return;
    alternar(c);
    escanear(a.codigo, [...seleccionadas, c.id]);
  }


  // ---- fuera de comprobante (ADR-0076) y con origen (ADR-0113) ------------------------------------
  const agregarExtra = () => setExtras((a) => [...a, { productoId: "", varianteId: "", cantidad: 1, costoUnitario: "", proveedorId: proveedorPorDefecto, esRegalo: false }]);
  const quitarExtra = (i: number) => {
    setSaliendoExtra(i);
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => {
      setSaliendoExtra(null);
      setExtras((a) => a.filter((_, n) => n !== i));
    }, reducido ? 0 : 200);
  };
  const actualizarExtra = (i: number, cambio: Partial<ExtraEnvio>) => setExtras((a) => a.map((e, n) => (n === i ? { ...e, ...cambio } : e)));
  // Cambiar de producto olvida la variante elegida — la talla/color de la prenda anterior casi nunca aplica a la nueva.
  const elegirProductoExtra = (i: number, productoId: string) => actualizarExtra(i, { productoId, varianteId: "" });

  // ---- envío interno: traslados en tránsito ------------------------------------------------------
  function alternarTraslado(id: string) {
    setTrasladosElegidos((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function fijarTraslado(trasladoId: string, varianteId: string, valor: number | null) {
    setConteoTraslados((m) => {
      const propias = { ...(m[trasladoId] ?? {}) };
      if (valor === null) delete propias[varianteId];
      else propias[varianteId] = Math.max(0, Math.floor(valor) || 0);
      return { ...m, [trasladoId]: propias };
    });
  }
  function cambiarUbicacion(id: string) {
    // Los traslados en camino dependen de a qué sede entra el envío.
    setUbicacionId(id);
    setTrasladosElegidos([]);
    setConteoTraslados({});
  }

  // ---- lo que faltó (D2, solo líder) --------------------------------------------------------------
  function guardarDecision(lineaId: string, d: Decision) {
    setDecisiones((m) => ({ ...m, [lineaId]: d }));
    setEditando(null);
  }
  // «Decidir todas»: la misma decisión para todas las filas cortas de UN comprobante.
  function decidirTodas(compraId: string, d: Decision) {
    setDecisiones((m) => ({ ...m, ...Object.fromEntries(faltantes.filter((f) => f.compraId === compraId).map((f) => [f.lineaId, d])) }));
    setEditando(null);
  }
  // «Los espero todas»: la misma respuesta —lo que falta sigue pendiente— para todas las filas cortas que aún no tienen decisión.
  function esperarTodas() {
    setDecisiones((m) => ({ ...m, ...Object.fromEntries(porDecidir.map((f) => [f.lineaId, "espero" as Decision])) }));
  }
  const mostrarEditor = (lineaId: string) => esLider && (editando === lineaId || (!decisiones[lineaId] && enfocada !== lineaId));
  // El foco «dentro de la línea»: pasar de una celda a otra de la misma línea no cuenta como salir.
  const alEnfocar = (lineaId: string) => () => setEnfocada(lineaId);
  const alDesenfocar = (lineaId: string) => (e: React.FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEnfocada((actual) => (actual === lineaId ? null : actual));
  };
  // Lo que llegó corto: solo las líneas CONTADAS con menos de lo pendiente. Un colaborador no decide qué pasa
  // con lo que faltó (queda pendiente y un líder lo cierra), así que para él no hay decisiones ni cierres.
  const lineasCortas = lineasActivas.filter((l) => estadoLinea(llegoLinea(l, reparto), l.pendiente) === "faltan");
  const faltantes = lineasCortas.map((l) => ({ lineaId: l.id, compraId: l.compraId, faltan: faltanteDeLinea(llegoLinea(l, reparto), l.pendiente), costoUnitario: l.costoUnitario }));
  const cierres = esLider ? cierresElegidos(faltantes, decisiones) : [];
  const porDecidir = esLider ? sinDecidir(faltantes, decisiones) : [];

  // Qué le va a quedar debiendo el proveedor: lo cerrado en esta guía más lo que ya estaba cerrado, por
  // comprobante. No se registra nada acá — es un aviso que apunta a `/compras/notas-credito` (solo líder,
  // porque lleva monto y va a una pantalla de dinero que a un integrante le daría un error de permiso).
  const reclamos = esLider
    ? notasPorReclamar(
        bloques.map(({ compra }) => ({
          compra,
          cierresAhora: cierres.filter((c) => c.compraId === compra.id).map((c) => ({ faltan: c.faltan, costoUnitario: c.costoUnitario })),
          cerradoAntes: lineas.filter((l) => l.compraId === compra.id && l.cerrado > 0).map((l) => ({ faltan: l.cerrado, costoUnitario: l.costoUnitario })),
          yaTieneNotaFaltante: comprasConNotaFaltante.includes(compra.id),
        })),
      )
    : [];

  const trasladosSinContar = trasladosMarcados.filter((t) => !trasladoContadoEntero(t.lineas, conteoTraslados[t.id] ?? {}));
  const sinComprobanteContado = totales.contadas === 0 && (totales.fueraDeComprobante > 0 || trasladosMarcados.length > 0);
  const puedeConfirmar =
    (unidadesRecibiendo > 0 || cierres.length > 0) && totales.excedidas === 0 && porDecidir.length === 0 && trasladosSinContar.length === 0 && !sinComprobanteContado;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (seleccionadas.length === 0) return void avisar.error("Marca al menos un comprobante.", { enfocar: "recibir-buscar" });
    if (porDecidir.length > 0) {
      const primera = lineas.find((l) => l.id === porDecidir[0].lineaId);
      return void avisar.error(
        `Falta decidir qué pasó con lo que faltó en ${porDecidir.length === 1 ? "1 fila" : `${porDecidir.length} filas`}: elige si lo esperas o por qué no llegó y da «Guardar».`,
        { enfocar: primera ? `recibir-linea-${primera.id}` : undefined },
      );
    }
    if (unidadesRecibiendo === 0 && cierres.length === 0)
      return void avisar.error(
        "Cuenta lo que llegó: al menos una línea con cantidad. Si llegó sin comprobante, usa «Ingreso sin comprobante».",
        { enfocar: panel.current },
      );
    if (sinComprobanteContado)
      return void avisar.error("Lo que llegó fuera de comprobante o de otra sede necesita al menos una línea de comprobante contada en este envío.", { enfocar: panel.current });
    const excedida = lineasActivas.find((l) => cantidadLinea(l) > l.pendiente);
    if (excedida) return void avisar.error(`${excedida.referencia}: se intenta recibir ${cantidadLinea(excedida)} pero solo faltan ${excedida.pendiente}.`, { enfocar: `recibir-linea-${excedida.id}` });
    if (!ubicacionId) return void avisar.error("Elige a qué ubicación entra la mercadería.", { enfocar: "recibir-ubicacion" });
    if (trasladosSinContar.length > 0) {
      setPestana("fuera");
      return void avisar.error(`Cuenta cada prenda del traslado ${trasladosSinContar[0].numero} (aunque alguna sea 0) antes de recibir.`);
    }

    const pedido = armarPedidoEnvio({
      ubicacionId,
      bloques,
      reparto,
      extras,
      traslados: trasladosMarcados.map((t) => ({ transferenciaId: t.id, lineas: t.lineas, conteo: conteoTraslados[t.id] ?? {} })),
      cierres: cierres.map((c) => ({ lineaId: c.lineaId, faltan: c.faltan, motivo: c.motivo })),
      numeroGuia,
      nota,
      token,
    });

    // Antes de escribir nada, un último vistazo: lo que entra queda como movimientos que no se editan (`ResumenPrevioEnvio`).
    const movimientos = movimientosDelEnvio({
      bloques,
      reparto,
      extras,
      traslados: trasladosMarcados.map((t) => ({ numero: t.numero, lineas: t.lineas, conteo: conteoTraslados[t.id] ?? {} })),
      dePrenda: (id) => {
        const v = variantePorId.get(id);
        return v ? { referencia: v.referencia, detalle: [v.talla, v.color].filter(Boolean).join(" / ") || v.sku } : null;
      },
    });
    setPedidoListo({ pedido, movimientos });
  }

  // «Confirmar y recibir» del resumen: UNA llamada, UNA transacción, con el mismo token (reintentar no duplica).
  async function registrar() {
    if (!pedidoListo || loading) return;
    const { pedido, movimientos } = pedidoListo;
    if (!responsable.listo) return void (responsable.motivo && avisar.error(responsable.motivo));
    setLoading(true);
    const cerrarProceso = avisar.proceso(unidadesRecibiendo > 0 ? "Recibiendo el envío…" : "Cerrando faltantes…");
    const supabase = createClient();
    // UNA sola llamada, UNA transacción: todos los proveedores, lo fuera de comprobante, lo de otra sede y los
    // cierres se registran juntos o no se registra nada. Con el mismo token, reintentar no duplica.
    const { data, error } = await firmar(supabase.rpc("recibir_envio", pedido), responsable.firma());
    cerrarProceso();
    setLoading(false);
    responsable.despues(error);
    if (error) {
      setPedidoListo(null);
      avisar.error(traducirError(error, "registrar el envío"), { detalle: "No se registró nada: tu conteo sigue aquí para corregirlo." });
      return;
    }

    const r = (data ?? {}) as { ya_registrado?: boolean; lotes?: { lote_id: string }[]; extras?: number; traslados?: { resultado: string }[]; cierres?: number };
    const resultado: Resultado = {
      unidades: unidadesRecibiendo,
      proveedores: r.lotes?.length ?? proveedoresEnvio.length,
      lotes: (r.lotes ?? []).map((l) => l.lote_id),
      extras: r.extras ?? 0,
      deOtraSede: totales.deOtraSede,
      traslados: r.traslados ?? [],
      cierres: r.cierres ?? 0,
      // Lo que el proveedor queda debiendo en documentos: se reclama en el módulo, no acá (0 = nada, o no es líder).
      porReclamar: reclamos.reduce((a, x) => a + x.monto, 0),
      yaRegistrado: r.ya_registrado === true,
      movimientos,
    };
    avisar.exito(
      resultado.yaRegistrado ? "Este envío ya estaba registrado" : unidadesRecibiendo > 0 ? `${unidadesRecibiendo} unidades recibidas en ${ubicacionNombre || "la ubicación"}` : `${resultado.cierres} faltantes cerrados`,
      { detalle: resultado.yaRegistrado ? "No se sumó nada de nuevo." : undefined },
    );
    setPedidoListo(null);
    setOk(resultado);
    router.refresh();
  }

  function nuevoEnvio() {
    setOk(null);
    setSeleccionadas([]);
    setAbiertos({});
    setReparto({});
    setExtras([]);
    setTrasladosElegidos([]);
    setConteoTraslados({});
    setDecisiones({});
    setNumeroGuia("");
    setNota("");
    setEscaneo("");
    setUltimaLectura(null);
    setPestana("prendas");
    setToken(crypto.randomUUID());
  }

  if (ok) return <EnvioRecibido resultado={ok} ubicacionNombre={ubicacionNombre} onOtroEnvio={nuevoEnvio} />;

  // ---- una línea de un comprobante: fila de tabla en escritorio, tarjeta con − y + en celular ---------
  function renderLinea(l: LineaCompra) {
    const llego = llegoLinea(l, reparto);
    const recibiendoLinea = llego ?? 0;
    const estado = estadoLinea(llego, l.pendiente);
    const completa = estado === "completa";
    const excede = estado === "excede";
    const dif = llego === null ? null : llego - l.pendiente;
    const nombre = `${l.referencia}${l.varianteId && (l.talla || l.color) ? ` · ${[l.talla, l.color].filter(Boolean).join(" / ")}` : ""}`;
    const decision = estado === "faltan" && !mostrarEditor(l.id) ? decisiones[l.id] : undefined;

    if (l.varianteId) {
      return (
        <div key={l.id} id={`recibir-linea-${l.id}`} onFocus={alEnfocar(l.id)} onBlur={alDesenfocar(l.id)} className={`group relative px-5 py-3 before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:origin-center before:scale-y-0 before:rounded before:bg-rojo before:transition-transform before:duration-300 before:ease-cayla focus-within:before:scale-y-100 sm:py-2.5 ${completa ? "bg-verde/[0.045]" : estado === "faltan" ? "bg-ambar/[0.05]" : ""}`}>
          {/* la pistola acaba de leer esta fila: se tiñe de verde y se apaga sola */}
          {destello?.id === l.id && <span key={destello.n} aria-hidden className="anim-destello-lectura pointer-events-none absolute inset-0" />}
          {/* UNA sola pieza, dos formas según el ancho del panel (igual que el spike): en tarjeta —nombre arriba, paso − / + y estado
              abajo— y en tabla —prenda · [SKU] · pendiente · llegó · dif. · estado—. El − / + se ve siempre en tarjeta; en tabla aparece
              al pasar el mouse o enfocar. Enter salta a la siguiente prenda. */}
          <div className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2.5 @[46rem]:gap-x-3 ${PLANTILLA_LINEA}`}>
            <span className="col-span-2 flex min-w-0 items-center gap-3 @[46rem]:col-span-1">
              <Miniatura hex={variantePorId.get(l.varianteId)?.colorHex ?? null} fotoUrl={variantePorId.get(l.varianteId)?.fotoUrl ?? null} />
              <span className="min-w-0 text-sm text-tinta">
                <span className="block truncate font-medium @[46rem]:font-normal">{l.referencia}</span>
                <span className="block truncate text-xs text-tinta/55">
                  {[l.talla, l.color].filter(Boolean).join(" · ") || l.descripcion}
                  <span className="@[46rem]:hidden"> · pendiente {l.pendiente}</span>
                </span>
                {/* ADR-0139: una línea repartida entre tiendas dice cuánto le toca a ESTA (y, al líder, dónde más falta). */}
                {textoDeLaParte(l) && <span className="block text-[11px] leading-snug text-ambar-profundo">{textoDeLaParte(l)}</span>}
              </span>
            </span>
            <span className="hidden truncate text-[12.5px] tabular-nums text-tinta/65 @[60rem]:block">{l.sku ?? "—"}</span>
            <span className="hidden text-center text-sm tabular-nums text-tinta/65 @[46rem]:block">{l.pendiente}</span>
            <span className="text-left @[46rem]:text-center">
              <span
                key={destello?.id === l.id ? destello.n : 0}
                className={`${destello?.id === l.id ? "anim-pop" : ""} inline-flex items-center overflow-hidden rounded-[10px] border transition-colors focus-within:border-rojo ${
                  excede ? "border-rojo bg-rojo/[0.08]" : completa ? "border-verde bg-verde/[0.09]" : estado === "faltan" ? "border-ambar bg-ambar/10" : "border-tinta/25"
                }`}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Una unidad menos"
                  onClick={() => fijar(l.id, l.varianteId!, Math.max(0, (llego ?? 0) - 1))}
                  className="grid h-[42px] w-10 place-items-center overflow-hidden text-lg text-tinta/65 transition-[width,color] duration-200 hover:text-rojo @[46rem]:h-9 @[46rem]:w-0 @[46rem]:group-focus-within:w-6 @[46rem]:group-hover:w-6"
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  max={l.pendiente}
                  data-conteo
                  aria-label={`Llegó de ${l.referencia} ${[l.talla, l.color].filter(Boolean).join(" ")}`}
                  value={reparto[l.id]?.[l.varianteId] ?? ""}
                  placeholder="—"
                  onChange={(e) => fijar(l.id, l.varianteId!, e.target.value === "" ? null : Number(e.target.value))}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const todos = [...document.querySelectorAll<HTMLInputElement>("input[data-conteo]")].filter((i) => i.offsetParent);
                    const siguiente = todos[todos.indexOf(e.currentTarget) + 1];
                    if (siguiente) siguiente.focus();
                    else escaneoRef.current?.focus();
                  }}
                  className={`h-[42px] w-14 bg-transparent text-center text-[15px] tabular-nums outline-none [appearance:textfield] @[46rem]:h-9 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${excede ? "text-rojo" : completa ? "text-verde-profundo" : estado === "faltan" ? "text-ambar-profundo" : "text-tinta/45"}`}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Una unidad más"
                  onClick={() => fijar(l.id, l.varianteId!, (llego ?? 0) + 1)}
                  className="grid h-[42px] w-10 place-items-center overflow-hidden text-lg text-tinta/65 transition-[width,color] duration-200 hover:text-rojo @[46rem]:h-9 @[46rem]:w-0 @[46rem]:group-focus-within:w-6 @[46rem]:group-hover:w-6"
                >
                  +
                </button>
              </span>
            </span>
            <span className={`hidden text-center text-sm tabular-nums @[46rem]:block ${dif === null || dif === 0 ? "text-tinta/45" : dif < 0 ? "font-semibold text-ambar-profundo" : "font-semibold text-rojo"}`}>
              {dif === null ? "—" : dif === 0 ? "0" : dif < 0 ? `−${-dif}` : `+${dif}`}
            </span>
            <span className="justify-self-end text-right @[46rem]:justify-self-start @[46rem]:text-left">
              <EstadoDeLinea key={estado} estado={estado} faltan={l.pendiente - recibiendoLinea} decision={decision} onEditar={() => setEditando(l.id)} esLider={esLider} />
            </span>
          </div>
          {esLider && estado === "faltan" && (
            <div className={`grid transition-[grid-template-rows] duration-[320ms] ease-cayla ${mostrarEditor(l.id) ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`} inert={!mostrarEditor(l.id)}>
              <div className="min-h-0 overflow-hidden">
                <EditorDecision
              key={`${l.id}-${editando === l.id ? "edita" : "nueva"}`}
              nombre={nombre}
              faltan={l.pendiente - recibiendoLinea}
              inicial={decisiones[l.id]}
              onGuardar={(d) => guardarDecision(l.id, d)}
              onCancelar={decisiones[l.id] ? () => setEditando(null) : undefined}
                />
              </div>
            </div>
          )}
        </div>
      );
    }

    // Línea agrupada: el comprobante dice «Blusa Lino x 24» sin talla ni color, y se reparte acá mirando lo que llegó.
    const opciones = variantesPorProducto.get(l.productoId) ?? [];
    return (
      <div key={l.id} id={`recibir-linea-${l.id}`} onFocus={alEnfocar(l.id)} onBlur={alDesenfocar(l.id)} className={`relative space-y-3 px-5 py-3 ${completa ? "bg-verde/[0.045]" : ""}`}>
        {destello?.id === l.id && <span key={destello.n} aria-hidden className="anim-destello-lectura pointer-events-none absolute inset-0" />}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="min-w-0 text-sm text-tinta">
            {l.referencia} <span className="text-xs text-tinta/55">· {textoDeLaParte(l) ? `a esta tienda le tocan ${l.pendiente}` : `el comprobante dice ${l.pendiente}`} sin talla ni color — anota lo que llegó de cada una</span>
            {l.descripcion && <span className="block text-xs text-tinta/55">{l.descripcion}</span>}
          </span>
          <span className="flex flex-col items-end gap-1">
            <Chip tono={CHIP_ESTADO[estado]}>{estado === "sin_contar" ? "Sin contar" : `${recibiendoLinea} de ${l.pendiente}`}</Chip>
            {estado === "sin_contar" && (
              <button type="button" onClick={() => nadaLlegoDe(l.id)} className="label-cayla text-[10px] text-tinta/65 hover:text-rojo">
                Nada llegó
              </button>
            )}
            {decision && <ResumenDecision decision={decision} onEditar={() => setEditando(l.id)} />}
          </span>
        </div>
        {opciones.length === 0 ? (
          <p className="text-xs text-rojo">Este producto no tiene variantes activas en el catálogo — no se puede recibir hasta crearlas.</p>
        ) : (
          <CurvaVariantes referencia={l.referencia} variantes={opciones} valores={reparto[l.id] ?? {}} excede={excede} onFijar={(varianteId, n) => fijar(l.id, varianteId, n)} />
        )}
        {esLider && estado === "faltan" && (
          <div className={`grid transition-[grid-template-rows] duration-[320ms] ease-cayla ${mostrarEditor(l.id) ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`} inert={!mostrarEditor(l.id)}>
            <div className="min-h-0 overflow-hidden">
              <EditorDecision
            key={`${l.id}-${editando === l.id ? "edita" : "nueva"}`}
            nombre={nombre}
            faltan={l.pendiente - recibiendoLinea}
            inicial={decisiones[l.id]}
            onGuardar={(d) => guardarDecision(l.id, d)}
            onCancelar={decisiones[l.id] ? () => setEditando(null) : undefined}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  const pctContado = totales.esperadas > 0 ? Math.min(100, Math.round((totales.contadas / totales.esperadas) * 100)) : 0;
  const estadoDelEnvio = totales.lineasContadas === 0 ? "Por contar" : totales.sinContar === 0 && totales.excedidas === 0 ? "Listo para recibir" : "En proceso";
  const nSeleccionadasTexto = `${bloques.length} ${bloques.length === 1 ? "comprobante" : "comprobantes"}`;
  const tituloEnvio = proveedoresEnvio.length === 1 ? `Envío de ${proveedoresEnvio[0].nombre}` : `Envío de ${proveedoresEnvio.length} proveedores`;
  const comprasSinMarcar = comprasOrdenadas.filter((c) => !seleccionadas.includes(c.id));

  return (
    <>
      <form onSubmit={onSubmit} className={`grid gap-6 lg:grid-cols-[minmax(19rem,23rem)_1fr] lg:items-start ${hayEnvio ? "pb-32 sm:pb-28" : ""}`}>
        {/* ================= izquierda: lo que falta llegar ================= */}
        <aside className="card-cayla anim-entra overflow-hidden lg:sticky lg:top-24" style={{ "--i": 3 } as CSSProperties}>
          <div className="flex items-center justify-between gap-3 px-4 pt-4">
            <h2 className="font-display text-[21px] text-tinta">Pendientes de llegar</h2>
            {hayEnvio && (
              <button type="button" onClick={() => setListaPlegada((v) => !v)} aria-expanded={!listaPlegada} className="label-cayla text-[10.5px] text-tinta/65 hover:text-rojo lg:hidden">
                {listaPlegada ? "Cambiar" : "Ocultar"}
              </button>
            )}
          </div>
          {/* el cuerpo de la lista: en celular, con un envío armado, se pliega por altura (grid 0fr → 1fr) */}
          <div className={`grid transition-[grid-template-rows] duration-[360ms] ease-cayla lg:grid-rows-[1fr] ${hayEnvio && listaPlegada ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`} inert={hayEnvio && listaPlegada}>
          <div className="min-h-0 overflow-hidden">
          <div className="px-4 pb-3">
            <div className="relative mt-3">
              <input
                id="recibir-buscar"
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                placeholder="Documento o proveedor"
                autoComplete="off"
                aria-label="Buscar entre los comprobantes pendientes"
                className={`peer ${CASILLA_TEXTO} pr-9 [&::-webkit-search-cancel-button]:appearance-none`}
              />
              {busqueda ? (
                <button type="button" onClick={() => setBusqueda("")} aria-label="Limpiar la búsqueda" className="absolute right-2.5 top-1/2 grid -translate-y-1/2 place-items-center rounded-full p-0.5 text-tinta/55 hover:text-rojo">
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <kbd aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-[5px] border border-tinta/15 px-1.5 text-[10.5px] font-semibold text-tinta/55 transition-opacity peer-focus:opacity-0">
                  /
                </kbd>
              )}
            </div>
          </div>
          <TabsSubrayado
            etiqueta="Filtrar pendientes"
            valor={filtro}
            onCambio={(v) => setFiltro(v as FiltroLista)}
            className="border-b border-tinta/10 px-3"
            clasePestana="px-2.5 pb-2.5 pt-1 text-[13px]"
            items={[
              { clave: "todas", etiqueta: "Todas", conteo: <CifraQueCuenta valor={comprasOrdenadas.length} /> },
              { clave: "atrasadas", etiqueta: "Atrasadas", conteo: <CifraQueCuenta valor={nAtrasadas} />, tono: nAtrasadas > 0 ? "ambar" : undefined },
              { clave: "proximas", etiqueta: "Próximas", conteo: <CifraQueCuenta valor={comprasOrdenadas.length - nAtrasadas} /> },
            ]}
          />
          <p className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 px-4 py-2 text-xs text-tinta/55">
            <span>Por urgencia: lo atrasado primero</span>
            {hayEnvio ? (
              <span>
                <b className="font-semibold text-tinta">{seleccionadas.length}</b> en el envío
              </span>
            ) : (
              nAtrasadas > 0 && (
                <button type="button" onClick={marcarAtrasadas} className="label-cayla whitespace-nowrap text-[10px] text-rojo hover:underline">
                  Marcar las {nAtrasadas} atrasadas
                </button>
              )
            )}
          </p>
          {visibles.length === 0 && <p className="border-t border-tinta/10 px-4 py-5 text-sm text-tinta/65">{k ? `Nada coincide con «${busqueda.trim()}».` : "Nada en esta lista."}</p>}
          {visibles.map((c) => {
            const marcada = seleccionadas.includes(c.id);
            const llegada = chipLlegada(c, ahora);
            // ADR-0139: si el comprobante trae más para otras tiendas, el monto es el de la PARTE de esta (no el total entero).
            const esParte = c.facturadoTotal != null && c.facturadoTotal > c.facturadoCantidad;
            const enMedio = c.recibidoCantidad > 0 || esParte;
            return (
              <button
                key={c.id}
                ref={refFila(c.id)}
                type="button"
                role="checkbox"
                aria-checked={marcada}
                onClick={() => alternar(c)}
                className={`relative flex w-full items-center gap-3 border-t border-t-tinta/10 px-4 py-3 text-left transition-colors before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:origin-center before:scale-y-0 before:bg-rojo before:transition-transform before:duration-[280ms] before:ease-cayla ${marcada ? "bg-rojo/[0.05] before:scale-y-100" : "hover:bg-tinta/[0.04]"}`}
              >
                {recienMarcada?.id === c.id && <span key={recienMarcada.n} aria-hidden className="anim-destello-fila pointer-events-none absolute inset-0" />}
                <span aria-hidden className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] ${marcada ? "border-tinta bg-tinta text-crema" : "border-tinta/45 bg-papel"}`}>
                  {marcada && <Check className="check-trazo h-3 w-3" strokeWidth={3} style={{ "--d": "0ms" } as CSSProperties} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold text-tinta">
                    <Resaltado texto={c.proveedorNombre} busqueda={busqueda} />
                  </span>
                  <span className="block text-[13px] tabular-nums text-tinta/75">
                    <Resaltado texto={c.documento} busqueda={busqueda} />
                  </span>
                  <span className="block text-xs text-tinta/65">
                    {textoEsperada(c, ahora)} · {c.recibidoCantidad} de {c.facturadoCantidad} u.{c.facturadoTotal != null && c.facturadoTotal > c.facturadoCantidad ? " · tu parte" : ""}
                  </span>
                  <span aria-hidden className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-sand">
                    <span className="anim-crece-x block h-full rounded-full bg-tinta/45" style={{ width: `${c.facturadoCantidad ? Math.min(100, (c.recibidoCantidad / c.facturadoCantidad) * 100) : 0}%` }} />
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <Chip tono={llegada.tono}>{llegada.texto}</Chip>
                  {verMontos && (
                    <span className="mt-1 block text-[13px] tabular-nums text-tinta">
                      {enMedio ? soles(valorPorLlegar(c)) : soles(c.total)}
                      {enMedio && <small className="block text-[11px] text-tinta/55">por llegar</small>}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          <p className="border-t border-tinta/10 px-4 py-3 text-xs text-tinta/55">
            Un envío puede traer comprobantes de varios proveedores: marca los que vienen en él. Si quitas uno con cantidades ya anotadas, te pregunta antes de descartarlas.
          </p>
          </div>
          </div>
        </aside>

        {/* ================= derecha: el envío ================= */}
        <div ref={panel} className="@container min-w-0 space-y-4 scroll-mt-24">
          {!hayEnvio ? (
            <>
              <div className="card-cayla flex min-h-[10rem] flex-col items-center justify-center gap-2 p-8 text-center">
                {/* el camión rueda sobre un camino punteado y da la vuelta en cada extremo: adorno, se detiene con movimiento reducido */}
                <div aria-hidden className="relative mb-2 h-12 w-full max-w-[22rem] overflow-hidden">
                  <Truck strokeWidth={1.5} className="recibir-camion absolute bottom-[-4px] left-1/2 -ml-[15px] h-[30px] w-[30px] text-tinta/65" />
                  <span className="recibir-camino absolute inset-x-0 bottom-0 block h-[2px]" />
                </div>
                <p className="font-display text-xl text-tinta">¿Qué llegó?</p>
                <p className="max-w-md text-sm text-tinta/65">
                  Marca a la izquierda los comprobantes que vienen en el envío. Si trae mercadería de varios proveedores, márcalos todos.
                </p>
                {nAtrasadas > 0 && (
                  <button type="button" onClick={marcarAtrasadas} className="label-cayla mt-1 rounded-md border border-tinta/25 px-3.5 py-2 text-[10.5px] text-tinta transition-colors hover:border-rojo hover:text-rojo">
                    Marcar lo atrasado ({nAtrasadas})
                  </button>
                )}
              </div>
              {resumen}
            </>
          ) : (
            <>
              {/* el envío: quién, con qué guía, a dónde entra y cuánto llevas */}
              <section className="card-cayla anim-entra grid overflow-hidden @xl:grid-cols-2 @[44rem]:grid-cols-[1.25fr_1fr_1fr]" style={{ "--i": 0 } as CSSProperties}>
                <div className="flex items-center gap-4 p-5">
                  <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-sand bg-sand/50 text-tinta/65">
                    <Truck className="h-[22px] w-[22px]" strokeWidth={1.6} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-[21px] leading-tight text-tinta">{tituloEnvio}</p>
                    <p className="mt-2 flex flex-wrap items-center text-xs text-tinta/65">
                      {proveedoresEnvio.map((p) => (
                        <Ini key={p.id} nombre={p.nombre} chico apilada />
                      ))}
                      <span className="ml-2">
                        {nSeleccionadasTexto} · {totales.esperadas.toLocaleString("es-PE")} u. por llegar
                      </span>
                    </p>
                  </div>
                </div>
                <div className="space-y-3 border-t border-tinta/10 p-5 @xl:border-l @xl:border-t-0">
                  <CampoTexto
                    etiqueta="Guía del envío"
                    mono
                    value={numeroGuia}
                    onChange={(e) => setNumeroGuia(e.target.value.toUpperCase())}
                    placeholder="T001-000123"
                    autoComplete="off"
                    valido={guiaConFormato(numeroGuia)}
                    tono={guiaConFormato(numeroGuia) ? "ok" : "neutro"}
                    pie={numeroGuia.trim() && !guiaConFormato(numeroGuia) ? "Formato de guía: T001-000123" : guiaConFormato(numeroGuia) ? "Guía con formato válido." : "Una sola guía por envío. Puedes anotarla después."}
                  />
                  {ubicaciones.length > 1 ? (
                    <CampoSelectNativo etiqueta="Entra al almacén de" id="recibir-ubicacion" value={ubicacionId} onChange={(e) => cambiarUbicacion(e.target.value)}>
                      {ubicaciones.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nombre}
                        </option>
                      ))}
                    </CampoSelectNativo>
                  ) : (
                    <CampoTexto etiqueta="Entra al almacén de" value={ubicacionNombre} readOnly />
                  )}
                </div>
                <div className="flex items-center gap-4 border-t border-tinta/10 p-5 @xl:col-span-2 @[44rem]:col-span-1 @[44rem]:border-l @[44rem]:border-t-0">
                  <Anillo pct={pctContado} />
                  <div>
                    <p className="label-cayla text-[10.5px] text-tinta/55">Estado de recepción</p>
                    <p key={estadoDelEnvio} className="anim-asentar font-display text-2xl leading-tight text-tinta">{estadoDelEnvio}</p>
                    <p className="text-xs text-tinta/65">
                      {totales.contadas.toLocaleString("es-PE")} de {totales.esperadas.toLocaleString("es-PE")} unidades contadas
                    </p>
                  </div>
                </div>
              </section>

              {/* los comprobantes del envío, de cualquier proveedor */}
              <section className="card-cayla anim-entra relative p-5" style={{ "--i": 1 } as CSSProperties}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="label-cayla text-[10.5px] text-tinta/55">Comprobantes de este envío</p>
                  {comprasSinMarcar.length > 0 && (
                    <div ref={menuRef} className="relative">
                      <button
                        type="button"
                        aria-expanded={menuAgregar}
                        aria-haspopup="menu"
                        onClick={() => setMenuAgregar((v) => !v)}
                        className="inline-flex items-center gap-1.5 rounded-[10px] border border-dashed border-tinta/25 px-3 py-1.5 text-[12.5px] text-tinta/65 transition-colors hover:border-rojo hover:text-rojo"
                      >
                        + Agregar comprobante
                      </button>
                      {menuAgregar && (
                        <div role="menu" className="anim-revelar absolute right-0 top-[calc(100%+6px)] z-10 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-sand bg-papel">
                          {comprasSinMarcar.map((c) => {
                            const ll = chipLlegada(c, ahora);
                            return (
                              <button
                                key={c.id}
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  agregarDesdeSelect(c.id);
                                  setMenuAgregar(false);
                                }}
                                className="flex w-full items-center justify-between gap-3 border-t border-tinta/10 px-3.5 py-2.5 text-left transition-colors first:border-t-0 hover:bg-tinta/[0.04]"
                              >
                                <span className="min-w-0 text-sm">
                                  <b className="block truncate font-semibold text-tinta">{c.proveedorNombre}</b>
                                  <span className="block text-xs text-tinta/55">
                                    {c.documento} · {textoEsperada(c, ahora)}
                                  </span>
                                </span>
                                <Chip tono={ll.tono}>{ll.texto}</Chip>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {bloques.map(({ compra: c }) => (
                    <span key={c.id} className={`${saliendoChip === c.id ? "anim-sale" : "anim-asentar"} inline-flex items-center gap-2.5 rounded-[10px] border border-sand bg-crema px-3 py-1.5 text-[13px]`}>
                      <Ini nombre={c.proveedorNombre} chico />
                      <span className="text-tinta/65">{c.proveedorNombre}</span>
                      <b className="font-semibold tabular-nums text-tinta">{c.documento}</b>
                      {seleccionadas.length > 1 && (
                        <button type="button" onClick={() => quitarConSalida(c)} aria-label={`Quitar ${c.documento} del envío`} className="text-tinta/45 hover:text-rojo">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </section>

              {/* lo que llegó: prendas del envío, fuera de comprobante y notas */}
              <section className="card-cayla anim-entra overflow-hidden" style={{ "--i": 2 } as CSSProperties}>
                <div className="flex flex-wrap items-stretch gap-x-1 border-b border-tinta/10 px-5">
                  <TabsSubrayado
                    etiqueta="Qué se cuenta"
                    valor={pestana}
                    onCambio={(v) => setPestana(v as Pestana)}
                    className="self-stretch"
                    clasePestana="px-3 pb-3.5 pt-4 text-sm"
                    items={[
                      { clave: "prendas", etiqueta: "Prendas del envío", conteo: <CifraQueCuenta valor={totales.esperadas} /> },
                      { clave: "fuera", etiqueta: "Fuera de comprobante", conteo: <CifraQueCuenta valor={totales.fueraDeComprobante + totales.deOtraSede} /> },
                      { clave: "notas", etiqueta: "Notas", conteo: nota.trim() ? 1 : 0 },
                    ]}
                  />
                    <div className="ml-auto flex w-full items-center gap-2 py-2.5 sm:w-96">
                      <div className="relative flex-1">
                        <ScanBarcode aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-tinta/45" />
                        {/* la cinta verde cruza el campo cada vez que la pistola lee: «entró» */}
                        {destello && <span key={destello.n} aria-hidden className="anim-cinta pointer-events-none absolute inset-y-0 left-0 w-1/4 rounded-lg bg-verde/15" />}
                        <input
                          ref={escaneoRef}
                          type="text"
                          value={escaneo}
                          onChange={(e) => setEscaneo(e.target.value)}
                          onFocus={() => setVerSugerencias(true)}
                          onBlur={() => setVerSugerencias(false)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setVerSugerencias(false);
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            // Un código exacto se lee como siempre; un texto suelto («blusa negra») toma la primera sugerencia.
                            const exacto = variantes.some((v) => clave(v.sku) === kEsc || v.codigosBarras.some((c) => clave(c) === kEsc));
                            escanear(!exacto && sugerencias[0]?.sku ? sugerencias[0].sku : escaneo);
                          }}
                          placeholder="Escanea la etiqueta o busca por SKU…"
                          aria-label="Escanear una prenda: suma 1 al comprobante que la trae"
                          autoComplete="off"
                          className={`${CASILLA_TEXTO} pl-10`}
                        />
                        {verSugerencias && sugerencias.length > 0 && (
                          <div role="listbox" aria-label="Prendas que coinciden" className="anim-revelar absolute inset-x-0 top-[calc(100%+6px)] z-10 overflow-hidden rounded-xl border border-sand bg-papel">
                            {sugerencias.map((l, i) => (
                              <button
                                key={l.varianteId}
                                type="button"
                                role="option"
                                aria-selected={i === 0}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => escanear(l.sku)}
                                className={`flex w-full items-center justify-between gap-3 border-t border-tinta/10 px-3 py-2 text-left text-[13px] first:border-t-0 hover:bg-tinta/[0.04] ${i === 0 ? "bg-tinta/[0.03]" : ""}`}
                              >
                                <span className="min-w-0 truncate text-tinta">
                                  {l.referencia} {[l.talla, l.color].filter(Boolean).join(" / ")}
                                  <small className="text-tinta/55"> · {l.sku}</small>
                                </span>
                                <small className="shrink-0 text-tinta/55">{documentoDe(l)}</small>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                </div>

                {ultimaLectura && (
                  <p role="status" className={`flex items-center gap-2 border-b border-tinta/10 px-5 py-2 text-xs ${ultimaLectura.bueno ? "text-verde-profundo" : "text-ambar-profundo"}`}>
                    {ultimaLectura.bueno ? <Check aria-hidden className="check-trazo h-3.5 w-3.5 shrink-0" style={{ "--d": "0ms" } as CSSProperties} /> : <Info aria-hidden className="h-3.5 w-3.5 shrink-0" />}
                    <span>
                      {ultimaLectura.bueno ? "Última lectura: " : ""}
                      {ultimaLectura.texto}
                    </span>
                    {ultimaLectura.deshacer && (
                      <button type="button" onClick={deshacerLectura} className="label-cayla text-[10px] text-rojo hover:underline">
                        Deshacer
                      </button>
                    )}
                    {ultimaLectura.agregar && (
                      <button type="button" onClick={agregarYReleer} className="label-cayla text-[10px] text-rojo hover:underline">
                        Agregar {ultimaLectura.agregar.documento} al envío
                      </button>
                    )}
                  </p>
                )}

                {/* ---------------- prendas del envío: un bloque por comprobante ---------------- */}
                {pestana === "prendas" && (
                  <div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-tinta/10 px-5 py-2.5">
                      <span className="whitespace-nowrap text-xs text-tinta/65">
                        {totales.lineasContadas} de {totales.lineasTotal} {totales.lineasTotal === 1 ? "línea contada" : "líneas contadas"}
                      </span>
                      <div className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-sand" role="progressbar" aria-valuenow={totales.lineasContadas} aria-valuemin={0} aria-valuemax={totales.lineasTotal} aria-label="Líneas contadas">
                        <div className={`h-full rounded-full transition-[width] ${totales.lineasContadas === totales.lineasTotal ? "bg-verde" : "bg-ambar"}`} style={{ width: `${totales.lineasTotal ? (totales.lineasContadas / totales.lineasTotal) * 100 : 0}%` }} />
                      </div>
                      {totales.lineasTotal - totales.lineasContadas > 0 && <span className="text-xs text-tinta/55">{totales.lineasTotal - totales.lineasContadas} sin contar: siguen pendientes</span>}
                    </div>

                    <div className={`hidden gap-x-3 border-b border-tinta/10 px-5 py-2 @[46rem]:grid ${PLANTILLA_LINEA}`}>
                      {["Prenda", "SKU", "Pendiente", "Llegó", "Dif.", "Estado"].map((t, i) => (
                        <span key={t} className={`label-cayla text-[11px] text-tinta/55 ${i === 1 ? "hidden @[60rem]:block" : ""} ${i === 2 || i === 3 || i === 4 ? "text-center" : ""}`}>
                          {t}
                        </span>
                      ))}
                    </div>

                    {bloques.map(({ compra: c, lineas: propias }) => {
                      const abierto = abiertos[c.id] ?? false;
                      const llegada = chipLlegada(c, ahora);
                      const pendienteTotal = propias.reduce((a, l) => a + l.pendiente, 0);
                      const contadasC = propias.filter((l) => llegoLinea(l, reparto) !== null).length;
                      const unidadesC = propias.reduce((a, l) => a + cantidadLinea(l), 0);
                      const cortasC = propias.filter((l) => estadoLinea(llegoLinea(l, reparto), l.pendiente) === "faltan");
                      // Primero las líneas con variante (tabla), después las agrupadas (curva de tallas).
                      const ordenadas = [...propias.filter((l) => l.varianteId), ...propias.filter((l) => !l.varianteId)];
                      return (
                        <div key={c.id} className="border-t border-tinta/10 first:border-t-0">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-sand/30 px-5 py-3">
                            <button type="button" onClick={() => setAbiertos((a) => ({ ...a, [c.id]: !abierto }))} aria-expanded={abierto} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                              <ChevronRight aria-hidden className={`h-[18px] w-[18px] shrink-0 text-tinta/55 transition-transform duration-300 ease-cayla ${abierto ? "rotate-90" : ""}`} />
                              <Ini nombre={c.proveedorNombre} />
                              <span className="min-w-0">
                                <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-tinta">
                                  {c.proveedorNombre}
                                  <Chip tono={llegada.tono}>{llegada.texto}</Chip>
                                </span>
                                <span className="block text-xs text-tinta/65">
                                  {ETIQUETA_TIPO_DOCUMENTO[c.tipo]} {c.documento} · emitida {diaMes(c.fechaEmision)} · {textoEsperada(c, ahora).toLowerCase()}
                                </span>
                              </span>
                            </button>
                            <div className="flex w-full flex-wrap items-center gap-x-5 gap-y-1 pl-[3.25rem] @xl:w-auto @xl:pl-0">
                              <span className="w-40">
                                <span className="flex justify-between text-xs tabular-nums text-tinta/65">
                                  <span>
                                    {unidadesC} de {pendienteTotal} u.
                                  </span>
                                  <span>
                                    {contadasC} de {propias.length} {propias.length === 1 ? "línea" : "líneas"}
                                  </span>
                                </span>
                                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-sand">
                                  <span className={`block h-full rounded-full ${unidadesC >= pendienteTotal ? "bg-verde" : "bg-ambar"}`} style={{ width: `${pendienteTotal ? Math.min(100, (unidadesC / pendienteTotal) * 100) : 0}%` }} />
                                </span>
                              </span>
                              {abierto ? (
                                <>
                                  <button type="button" onClick={() => marcarTodas(c.id, "todo")} className="label-cayla text-[10px] text-tinta hover:text-rojo">
                                    Todo llegó
                                  </button>
                                  <button type="button" onClick={() => marcarTodas(c.id, "nada")} className="label-cayla text-[10px] text-tinta hover:text-rojo">
                                    Nada llegó
                                  </button>
                                  {contadasC > 0 && (
                                    <button type="button" onClick={() => marcarTodas(c.id, "vaciar")} className="label-cayla text-[10px] text-tinta/65 hover:text-rojo">
                                      Vaciar
                                    </button>
                                  )}
                                </>
                              ) : (
                                <button type="button" onClick={() => setAbiertos((a) => ({ ...a, [c.id]: true }))} className="label-cayla rounded-md border border-tinta/25 px-3 py-2 text-[10px] text-tinta transition-colors hover:border-rojo hover:text-rojo">
                                  Contar
                                </button>
                              )}
                            </div>
                          </div>
                          {/* el bloque se pliega y se despliega por altura (grid 0fr → 1fr), sin medir; cerrado no se enfoca */}
                          <div className={`grid transition-[grid-template-rows] duration-[360ms] ease-cayla ${abierto ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`} inert={!abierto}>
                            <div className="min-h-0 overflow-hidden">
                            <div className="divide-y divide-tinta/10">
                              {esLider && cortasC.length >= 2 && (
                                <div className="px-5 py-2.5">
                                  <DecidirTodas cuantas={cortasC.length} onDecidir={(d) => decidirTodas(c.id, d)} />
                                </div>
                              )}
                              {ordenadas.map((l) => renderLinea(l))}
                              {ordenadas.length === 0 && <p className="px-5 py-4 text-sm text-tinta/65">Este comprobante ya no tiene nada pendiente.</p>}
                              {!esLider && cortasC.length > 0 && (
                                <p className="bg-ambar/[0.05] px-5 py-2.5 text-xs text-ambar-profundo">
                                  Lo que faltó queda pendiente en el comprobante. Un líder decide después si se espera o se cierra.
                                </p>
                              )}
                            </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* al final, lo que el proveedor va a quedar debiendo — un aviso, no un formulario (solo líder) */}
                    {reclamos.length > 0 && (
                      <div className="space-y-2.5 p-5">
                        {reclamos.map((r) => (
                          <div key={r.compraId} className="anim-entra flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-sand px-4 py-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-tinta">
                                Nota de crédito por reclamar · <span className="tabular-nums">{soles(r.monto)}</span>
                              </p>
                              <p className="text-xs leading-relaxed text-tinta/65">
                                {r.documento} · {r.proveedorNombre} ·{" "}
                                {r.cerrandoAhora > 0
                                  ? `al confirmar, ${r.cerrandoAhora === 1 ? "la unidad que cierras queda anotada" : `las ${r.cerrandoAhora} unidades que cierras quedan anotadas`} como nota pendiente. El documento del proveedor no se registra acá.`
                                  : "ya tiene un faltante cerrado esperando el documento del proveedor."}
                              </p>
                            </div>
                            <Link href="/compras/notas-credito" className="shrink-0 rounded-full transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo">
                              <Chip tono="ambar">Se reclama en Notas de crédito ↗</Chip>
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ---------------- fuera de comprobante: con su origen ---------------- */}
                {pestana === "fuera" && (
                  <div className="space-y-6 p-5">
                    <div className="space-y-3">
                      <div>
                        <p className="font-display text-lg text-tinta">¿Llegó algo de un proveedor que no está en ningún comprobante?</p>
                        <p className="mt-1 text-xs text-tinta/65">
                          Una prenda de más, o un comprobante que llega incompleto. Se recibe igual, en este mismo envío, y queda anotado de qué proveedor viene. No cuenta contra ninguna deuda. Un regalo entra al stock sin costo y sin tocar el costo promedio.
                        </p>
                      </div>
                      {extras.map((ex, i) => {
                        const variantesDelProducto = ex.productoId ? (variantesPorProducto.get(ex.productoId) ?? []) : [];
                        return (
                          <div key={i} className={`${saliendoExtra === i ? "anim-sale" : "anim-entra"} flex flex-wrap items-end gap-2 border-b border-tinta/10 pb-3 last:border-0`}>
                            <ComboBuscable
                              etiquetaAccesible="Producto fuera de comprobante"
                              id={`recibir-extra-${i}-producto`}
                              valor={ex.productoId}
                              onValor={(id) => elegirProductoExtra(i, id)}
                              opciones={opcionesProducto}
                              marcador="Busca la prenda…"
                              className="min-w-[12rem] flex-1"
                            />
                            <SelectNativo aria-label="Talla y color" value={ex.varianteId} onChange={(e) => actualizarExtra(i, { varianteId: e.target.value })} disabled={!ex.productoId} className="w-32 shrink-0">
                              <option value="">{ex.productoId ? "Elige…" : "—"}</option>
                              {variantesDelProducto.map((v) => (
                                <option key={v.varianteId} value={v.varianteId}>
                                  {[v.talla, v.color].filter(Boolean).join(" / ") || v.sku}
                                </option>
                              ))}
                            </SelectNativo>
                            <input
                              type="number"
                              min={1}
                              aria-label="Cantidad"
                              value={ex.cantidad}
                              onChange={(e) => actualizarExtra(i, { cantidad: Math.max(1, Number(e.target.value) || 1) })}
                              onFocus={(e) => e.target.select()}
                              className="w-16 shrink-0 border-b border-tinta/20 bg-transparent px-1 py-2 text-center text-sm tabular-nums text-tinta outline-none focus:border-b-2 focus:border-rojo"
                            />
                            <SelectNativo aria-label="Proveedor que la mandó" value={ex.proveedorId} onChange={(e) => actualizarExtra(i, { proveedorId: e.target.value })} className="w-48 shrink-0">
                              <option value="">Proveedor…</option>
                              {proveedores.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.nombre}
                                </option>
                              ))}
                            </SelectNativo>
                            <label className="flex shrink-0 cursor-pointer items-center gap-2 pb-2 text-sm text-tinta/75">
                              <input type="checkbox" checked={ex.esRegalo} onChange={(e) => actualizarExtra(i, { esRegalo: e.target.checked, costoUnitario: e.target.checked ? "" : ex.costoUnitario })} className="peer sr-only" />
                              <span aria-hidden className="relative h-[18px] w-8 rounded-full bg-tinta/25 transition-colors duration-200 after:absolute after:left-0.5 after:top-0.5 after:h-3.5 after:w-3.5 after:rounded-full after:bg-papel after:transition-transform after:duration-[260ms] after:ease-cayla peer-checked:bg-tinta peer-checked:after:translate-x-3.5 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-rojo" />
                              Es un regalo
                            </label>
                            <input
                              type="number"
                              min={0}
                              step="0.10"
                              placeholder={ex.esRegalo ? "Sin costo" : "Costo (opc.)"}
                              aria-label="Costo unitario"
                              disabled={ex.esRegalo}
                              value={ex.esRegalo ? "" : ex.costoUnitario}
                              onChange={(e) => {
                                const v = e.target.value;
                                actualizarExtra(i, { costoUnitario: v === "" ? "" : String(Math.max(0, Number(v) || 0)) });
                              }}
                              className="w-24 shrink-0 border-b border-tinta/20 bg-transparent px-1 py-2 text-right text-sm tabular-nums text-tinta outline-none placeholder:text-tinta/40 focus:border-b-2 focus:border-rojo disabled:opacity-40"
                            />
                            <button type="button" onClick={() => quitarExtra(i)} className="label-cayla shrink-0 pb-2 text-[10px] text-tinta/55 hover:text-rojo">
                              Quitar
                            </button>
                            {ex.varianteId && !extraCompleto(ex) && <p className="w-full text-xs text-ambar-profundo">Elige de qué proveedor viene esta prenda.</p>}
                          </div>
                        );
                      })}
                      <button type="button" onClick={agregarExtra} className="label-cayla text-[11px] text-tinta/65 hover:text-rojo">
                        + Agregar prenda fuera de comprobante
                      </button>
                    </div>

                    <div className="space-y-3 border-t border-tinta/10 pt-5">
                      <div>
                        <p className="font-display text-lg text-tinta">¿Vino algo de otra sede de CAYLA? (envío interno)</p>
                        <p className="mt-1 text-xs text-tinta/65">
                          No se ingresa como prenda suelta: se cuenta y se confirma el traslado que ya salió de la otra sede, para que su stock y el de acá cuadren. Si el Taller o una tienda te mandó prendas y no aparecen aquí, primero tiene que registrarlas como traslado.
                        </p>
                      </div>
                      {trasladosDeAca.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-tinta/20 px-4 py-3 text-sm text-tinta/65">No hay traslados en camino hacia {ubicacionNombre || "esta ubicación"}.</p>
                      ) : (
                        trasladosDeAca.map((t) => {
                          const marcado = trasladosElegidos.includes(t.id);
                          const conteo = conteoTraslados[t.id] ?? {};
                          return (
                            <div key={t.id} className={`overflow-hidden rounded-xl border ${marcado ? "border-tinta/40" : "border-tinta/15"}`}>
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={marcado}
                                onClick={() => alternarTraslado(t.id)}
                                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${marcado ? "bg-tinta/[0.04]" : "hover:bg-tinta/[0.03]"}`}
                              >
                                <span aria-hidden className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] ${marcado ? "border-tinta bg-tinta text-crema" : "border-tinta/45 bg-papel"}`}>
                                  {marcado && <Check className="check-trazo h-3 w-3" strokeWidth={3} style={{ "--d": "0ms" } as CSSProperties} />}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-semibold text-tinta">
                                    Traslado {t.numero} · desde {t.origenNombre}
                                  </span>
                                  <span className="block text-xs text-tinta/65">
                                    {t.lineas.reduce((a, l) => a + l.cantidadEnviada, 0)} unidades enviadas en {t.lineas.length} {t.lineas.length === 1 ? "línea" : "líneas"}
                                    {t.fechaEstimadaLlegada ? ` · llegada estimada ${diaMes(t.fechaEstimadaLlegada.slice(0, 10))}` : ""}
                                  </span>
                                </span>
                                <span className="label-cayla text-[10px] text-tinta/55">{marcado ? "Vino en este envío" : "Marcar si vino"}</span>
                              </button>
                              {marcado && (
                                <div className="anim-revelar divide-y divide-tinta/10 border-t border-tinta/10">
                                  {t.lineas.map((l) => {
                                    const contada = conteo[l.varianteId];
                                    const v = variantePorId.get(l.varianteId);
                                    const estado = estadoLinea(contada ?? null, l.cantidadEnviada);
                                    const detalle = [l.talla, l.color].filter(Boolean).join(" / ") || l.sku;
                                    return (
                                      <div key={l.varianteId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                                        <span className="min-w-0 flex-1 text-sm text-tinta">
                                          {l.referencia}
                                          <span className="block text-xs text-tinta/55">
                                            {detalle} · {v?.sku ?? l.sku}
                                          </span>
                                        </span>
                                        <span className="w-20 text-center text-sm tabular-nums text-tinta/65">Envió {l.cantidadEnviada}</span>
                                        <input
                                          type="number"
                                          min={0}
                                          aria-label={`Llegó de ${l.referencia} ${detalle} (traslado ${t.numero})`}
                                          value={contada ?? ""}
                                          placeholder="—"
                                          onChange={(e) => fijarTraslado(t.id, l.varianteId, e.target.value === "" ? null : Number(e.target.value))}
                                          onFocus={(e) => e.target.select()}
                                          className={`${NUMERO} ${estado === "completa" ? "border-verde bg-verde/[0.09] text-verde-profundo" : contada === undefined ? "border-tinta/20 text-tinta/45" : "border-ambar bg-ambar/10 text-ambar-profundo"}`}
                                        />
                                        <span className="w-28">
                                          <Chip tono={estado === "completa" ? "verde" : estado === "sin_contar" ? "neutro" : "ambar"}>
                                            {estado === "sin_contar" ? "Sin contar" : estado === "completa" ? "Completa" : estado === "faltan" ? `Faltan ${l.cantidadEnviada - (contada ?? 0)}` : `Sobran ${(contada ?? 0) - l.cantidadEnviada}`}
                                          </Chip>
                                        </span>
                                      </div>
                                    );
                                  })}
                                  {!trasladoContadoEntero(t.lineas, conteo) && <p className="bg-ambar/[0.05] px-4 py-2 text-xs text-ambar-profundo">Cuenta cada prenda, aunque alguna sea 0: la base no confirma un traslado con líneas sin decir.</p>}
                                  {trasladoContadoEntero(t.lineas, conteo) && t.lineas.some((l) => (conteo[l.varianteId] ?? 0) !== l.cantidadEnviada) && (
                                    <p className="bg-ambar/[0.05] px-4 py-2 text-xs text-ambar-profundo">Lo contado no coincide con lo enviado: el traslado queda para que un líder lo revise y no suma stock hasta entonces.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* ---------------- notas del envío ---------------- */}
                {pestana === "notas" && (
                  <div className="anim-asentar space-y-2 p-5">
                    <label htmlFor="recibir-nota" className="label-cayla text-[11px] text-tinta/65">
                      Nota del envío (opcional)
                    </label>
                    <textarea
                      id="recibir-nota"
                      value={nota}
                      onChange={(e) => setNota(e.target.value)}
                      rows={3}
                      placeholder="Llegó una caja abierta, el transportista dejó dos bultos menos…"
                      className="w-full rounded-lg border border-tinta/15 bg-transparent px-3 py-2 text-sm text-tinta outline-none transition-colors placeholder:text-tinta/45 focus:border-rojo"
                    />
                    {/* frases de todos los días: un toque las agrega a la nota (se puede editar después) */}
                    <div className="flex flex-wrap gap-1.5">
                      {FRASES_NOTA.map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setNota((n) => (n.trim() ? `${n.trim()}. ${f}` : f))}
                          className="rounded-full border border-tinta/15 px-3 py-1 text-[12.5px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    <p className="flex justify-between gap-3 pt-1 text-xs text-tinta/55">
                      <span>Queda en cada lote del envío, para quien lo revise después.</span>
                      <span className="tabular-nums">
                        {nota.length} {nota.length === 1 ? "carácter" : "caracteres"}
                      </span>
                    </p>
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        {/* ================= barra fija: los totales del envío + confirmar ================= */}
        {hayEnvio && (
          <BarraFija
            className="anim-barra"
            medidor={
              // contado (verde) · faltante (ámbar) · lo que falta contar (arena): cuánto falta, de un vistazo
              <div aria-hidden className="flex h-[3px] bg-sand">
                <span className="bg-verde transition-[flex-basis] duration-500 ease-cayla" style={{ flexBasis: `${Math.min(100, (totales.contadas / Math.max(1, totales.esperadas)) * 100)}%` }} />
                <span className="bg-ambar transition-[flex-basis] duration-500 ease-cayla" style={{ flexBasis: `${Math.min(100 - Math.min(100, (totales.contadas / Math.max(1, totales.esperadas)) * 100), (totales.faltantes / Math.max(1, totales.esperadas)) * 100)}%` }} />
              </div>
            }
            aviso={(
              <>
                {/* un solo aviso a la vez, el más urgente; entra suave cuando cambia */}
                {totales.excedidas > 0 ? (
                  <span key="exc" className="anim-revelar flex items-center gap-2 text-xs text-rojo">
                    <Info aria-hidden className="h-3.5 w-3.5 shrink-0" />
                    {totales.excedidas === 1 ? "1 línea supera" : `${totales.excedidas} líneas superan`} lo pendiente: revisa el conteo.
                  </span>
                ) : porDecidir.length > 0 ? (
                  <span key="dec" className="anim-revelar flex flex-wrap items-center gap-x-2 text-xs text-ambar-profundo">
                    <Info aria-hidden className="h-3.5 w-3.5 shrink-0" />
                    {porDecidir.length === 1 ? "1 fila llegó con faltante y falta decidir qué pasó" : `${porDecidir.length} filas llegaron con faltante y falta decidir qué pasó`}.
                    <button type="button" onClick={esperarTodas} className="label-cayla text-[10px] text-rojo hover:underline">
                      Los espero todas
                    </button>
                  </span>
                ) : trasladosSinContar.length > 0 ? (
                  <span key="tras" className="anim-revelar flex flex-wrap items-center gap-x-2 text-xs text-ambar-profundo">
                    <Info aria-hidden className="h-3.5 w-3.5 shrink-0" />
                    Falta contar las prendas de {trasladosSinContar.length === 1 ? "un traslado" : `${trasladosSinContar.length} traslados`} (en «Fuera de comprobante»).
                    <button type="button" onClick={() => setPestana("fuera")} className="label-cayla text-[10px] text-rojo hover:underline">
                      Ir a contarlas
                    </button>
                  </span>
                ) : sinComprobanteContado ? (
                  <span key="sin" className="anim-revelar flex items-center gap-2 text-xs text-ambar-profundo">
                    <Info aria-hidden className="h-3.5 w-3.5 shrink-0" />
                    Lo de fuera de comprobante o de otra sede necesita al menos una línea de comprobante contada.
                  </span>
                ) : extras.some((e) => (e.productoId || e.varianteId) && !extraCompleto(e)) ? (
                  <span key="ext" className="anim-revelar flex flex-wrap items-center gap-x-2 text-xs text-ambar-profundo">
                    <Info aria-hidden className="h-3.5 w-3.5 shrink-0" />
                    Elige de qué proveedor viene cada prenda fuera de comprobante.
                    <button type="button" onClick={() => setPestana("fuera")} className="label-cayla text-[10px] text-rojo hover:underline">
                      Revisar
                    </button>
                  </span>
                ) : cierres.length > 0 ? (
                  <span key="cie" className="anim-revelar block text-xs text-tinta/55">
                    Se {cierres.length === 1 ? "cierra 1 faltante" : `cierran ${cierres.length} faltantes`} al confirmar ({cierres.reduce((a, c) => a + c.faltan, 0)} u.). Lo demás sigue pendiente.
                  </span>
                ) : null}
              </>
            )}
            resumen={
              <div className="space-y-1">
                <div className="grid auto-cols-fr grid-flow-col items-end gap-x-1 sm:flex sm:flex-wrap sm:gap-x-6 sm:gap-y-1">
                  <span className="hidden text-xs text-tinta/65 min-[1460px]:block">
                    <span className="font-display text-base text-tinta">Totales del envío</span>
                    <span className="block">
                      entran al almacén de <b className="font-semibold text-tinta">{ubicacionNombre}</b>
                    </span>
                  </span>
                  {[
                    { n: totales.esperadas, etiqueta: "Esperadas", tono: "text-tinta" },
                    { n: totales.contadas, etiqueta: "Contadas", tono: "text-verde-profundo" },
                    { n: totales.sinContar, etiqueta: "Sin contar", tono: "text-tinta/45" },
                    { n: totales.faltantes, etiqueta: "Faltantes", tono: totales.faltantes > 0 ? "text-ambar-profundo" : "text-tinta/45" },
                    { n: totales.fueraDeComprobante, etiqueta: "Fuera de comprobante", tono: totales.fueraDeComprobante > 0 ? "text-tinta" : "text-tinta/45" },
                    ...(trasladosMarcados.length > 0 ? [{ n: totales.deOtraSede, etiqueta: "De otra sede", tono: "text-tinta" }] : []),
                  ].map((m) => (
                    <span key={m.etiqueta} className="block">
                      <span className={`font-display text-xl leading-none tabular-nums transition-colors duration-300 sm:text-2xl ${m.tono}`}>
                        <CifraQueCuenta valor={m.n} />
                      </span>
                      <span className="label-cayla mt-0.5 block text-[8.5px] leading-tight text-tinta/55 sm:text-[9.5px]">{m.etiqueta}</span>
                    </span>
                  ))}
                </div>
              </div>
            }
            acciones={
              <Boton type="submit" peso="primario" className="w-full sm:w-auto" cargando={loading} disabled={!puedeConfirmar}>
                {etiquetaConfirmar({ unidades: unidadesRecibiendo, cierres: cierres.length, ubicacion: ubicacionNombre })}
              </Boton>
            }
          />
        )}
      </form>

      {pedidoListo && (
        <ResumenPrevioEnvio
          filas={resumenPorComprobante(bloques, reparto).map((f) => ({
            ...f,
            decisiones: esLider
              ? [...new Set(f.lineasCortas.map((id) => (decisiones[id] ? etiquetaDecision(decisiones[id]!).replace("Lo espero: sigue pendiente", "los espero").replace("Se cierra: ", "se cierra: ") : "sin decidir")))]
              : ["sigue pendiente"],
          }))}
          fuera={totales.fueraDeComprobante}
          fueraDetalle={extras
            .filter(extraCompleto)
            .map((e) => `${variantePorId.get(e.varianteId)?.referencia ?? "Prenda"} ×${e.cantidad}${e.esRegalo ? " (regalo)" : ""}`)
            .join(" · ")}
          deOtraSede={totales.deOtraSede}
          trasladosDetalle={trasladosMarcados.map((t) => `Traslado ${t.numero} · ${t.origenNombre}`).join(" · ")}
          cierresMonto={esLider && cierres.length > 0 ? faltantes.filter((f) => cierres.some((c) => c.lineaId === f.lineaId)).reduce((a, f) => a + f.faltan * f.costoUnitario, 0) : null}
          ubicacionNombre={ubicacionNombre}
          numeroGuia={numeroGuia}
          unidades={unidadesRecibiendo}
          cargando={loading}
          responsable={responsable}
          onConfirmar={registrar}
          onVolver={() => setPedidoListo(null)}
        />
      )}

      {quitarPendiente && (
        <Modal titulo="¿Quitar este comprobante del envío?" subtitulo={`${quitarPendiente.proveedorNombre} · ${quitarPendiente.documento}`} onClose={() => setQuitarPendiente(null)}>
          {(cerrar) => (
            <div className="space-y-4">
              <p className="text-sm text-tinta/75">
                Tienes cantidades anotadas en <b className="font-semibold">{quitarPendiente.documento}</b>. Si lo quitas se descartan. No se registró nada todavía.
              </p>
              <div className="flex gap-3">
                <button type="button" onClick={cerrar} className="label-cayla flex-1 rounded-md border border-tinta/25 px-3 py-2.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo">
                  Seguir aquí
                </button>
                <button type="button" onClick={() => quitar(quitarPendiente.id)} className="label-cayla flex-1 rounded-md bg-tinta px-3 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo">
                  Quitar y descartar
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

// La prenda: su foto si la hay; si no, su color real (`retail.colores.hex`) con la prenda genérica, para distinguir una blusa negra de una beige sin leer. Sin hex, arena.
function Miniatura({ hex, fotoUrl = null }: { hex: string | null; fotoUrl?: string | null }) {
  // Con foto, la foto (quien cuenta compara la prenda con lo que tiene en la mano); sin ella, el color real con la prenda genérica.
  if (fotoUrl) return <Image src={fotoUrl} alt="" width={40} height={40} unoptimized className="h-10 w-10 shrink-0 rounded-[10px] border border-tinta/10 object-cover transition-transform duration-[260ms] ease-cayla group-hover:scale-105" />;
  const n = hex && /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : null;
  const claro = n === null ? true : (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.55;
  return (
    <span
      aria-hidden
      className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-tinta/10 bg-sand transition-transform duration-[260ms] ease-cayla group-hover:scale-105"
      style={n === null ? undefined : { background: hex! }}
    >
      <Shirt className={`h-5 w-5 ${claro ? "text-tinta/40" : "text-crema/75"}`} />
    </span>
  );
}

// El proveedor como dos letras («Textiles Andina SAC» → TA): con varios proveedores en un envío, se reconocen
// de un vistazo sin leer el nombre entero.
function Ini({ nombre, chico = false, apilada = false }: { nombre: string; chico?: boolean; apilada?: boolean }) {
  // `apilada`: los círculos se montan un poco unos sobre otros, con un borde del color de la tarjeta (varios proveedores en un envío).
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full bg-sand font-bold tracking-wide text-tinta/75 ${chico ? "h-[22px] w-[22px] text-[9px]" : "h-[30px] w-[30px] text-[10.5px]"} ${apilada ? "anim-asentar -ml-1.5 border-2 border-papel first:ml-0" : ""}`}>
      {inicialesProveedor(nombre)}
    </span>
  );
}

// Cuánto llevas contado del envío, de un vistazo. Ámbar mientras falta, verde al 100 %.
function Anillo({ pct }: { pct: number }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  return (
    <svg width="70" height="70" viewBox="0 0 70 70" className="shrink-0" role="img" aria-label={`${pct} % contado`}>
      <circle cx="35" cy="35" r={r} fill="none" strokeWidth="6" className="stroke-sand" />
      <circle cx="35" cy="35" r={r} fill="none" strokeWidth="6" strokeLinecap="round" className={`transition-[stroke-dashoffset,stroke] duration-[900ms] ease-cayla ${pct >= 100 ? "stroke-verde" : "stroke-ambar"}`} strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, pct / 100))} transform="rotate(-90 35 35)" />
      <text x="35" y="41" textAnchor="middle" className="fill-tinta font-display" fontSize="19">
        {pct}%
      </text>
    </svg>
  );
}

// El estado de la fila y, si llegó corta y ya se decidió qué pasó, esa decisión a la vista. Quien no es líder
// no decide: la fila solo dice «Sigue pendiente».
function EstadoDeLinea({ estado, faltan, decision, onEditar, esLider }: { estado: EstadoLinea; faltan: number; decision?: Decision; onEditar: () => void; esLider: boolean }) {
  return (
    <span className="anim-asentar flex flex-col items-start gap-1">
      <Chip tono={CHIP_ESTADO[estado]}>
        {estado === "completa" && <Check aria-hidden className="check-trazo -ml-0.5 mr-1 inline h-3 w-3" strokeWidth={2.4} style={{ "--d": "0ms" } as CSSProperties} />}
        {ETIQUETA_ESTADO[estado](faltan)}
      </Chip>
      {decision && <ResumenDecision decision={decision} onEditar={onEditar} />}
      {!esLider && estado === "faltan" && <span className="text-[11px] leading-tight text-tinta/65">Sigue pendiente</span>}
    </span>
  );
}

/* --------------------------------------------------------------------
   CurvaVariantes · repartir una línea agrupada por talla y color

   El comprobante dice "Blusa Emma x 24" y la caja trae 4 S, 8 M, 12 L en dos
   colores. La curva de tallas es cómo el taller y las tiendas ya piensan la
   mercadería: una fila por color, una columna por talla, el total de la fila
   al costado. Si las variantes no tienen ni talla ni color (producto único),
   cae a la lista simple.
   -------------------------------------------------------------------- */
const SIN = "—";
const CELDA =
  "h-9 rounded-md border bg-transparent px-1 text-center text-sm tabular-nums outline-none transition-colors focus:border-rojo focus:ring-1 focus:ring-rojo/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function CurvaVariantes({
  referencia,
  variantes,
  valores,
  excede,
  onFijar,
}: {
  referencia: string;
  variantes: Variante[];
  valores: Record<string, number>;
  excede: boolean;
  onFijar: (varianteId: string, n: number | null) => void;
}) {
  const tallas = [...new Set(variantes.map((v) => v.talla ?? SIN))].sort(compararTallas);
  const colores = [...new Set(variantes.map((v) => v.color ?? SIN))].sort((a, b) => a.localeCompare(b, "es"));
  const conEjes = variantes.some((v) => v.talla || v.color);
  const porCelda = new Map(variantes.map((v) => [`${v.color ?? SIN}|${v.talla ?? SIN}`, v]));

  const celda = (v: Variante, etiqueta: string, ancho = "w-14 sm:w-16") => {
    const n = valores[v.varianteId];
    return (
      <input
        type="number"
        min={0}
        inputMode="numeric"
        aria-label={`${referencia} ${etiqueta}`}
        value={n ?? ""}
        placeholder="—"
        onChange={(e) => onFijar(v.varianteId, e.target.value === "" ? null : Number(e.target.value))}
        onFocus={(e) => e.target.select()}
        className={`${CELDA} ${ancho} ${
          n === undefined ? "border-tinta/15 text-tinta/45" : n > 0 ? (excede ? "border-rojo bg-rojo/[0.06] text-rojo" : "border-tinta/60 bg-tinta/[0.05] text-tinta") : "border-ambar/60 bg-ambar/[0.06] text-ambar-profundo"
        }`}
      />
    );
  };

  if (!conEjes) {
    return (
      <div className="flex flex-wrap gap-2">
        {variantes.map((v) => (
          <label key={v.varianteId} className="flex items-center gap-2 rounded-md border border-tinta/15 px-2.5 py-1.5">
            <span className="text-xs text-tinta/75">{v.sku}</span>
            {celda(v, v.sku, "w-14")}
          </label>
        ))}
      </div>
    );
  }

  // Solo un eje (todo "Única", o sin color): una fila basta, sin rótulo de color que no aporta.
  const unaFila = colores.length === 1 && colores[0] === SIN;

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-x-1.5 border-spacing-y-1 sm:border-spacing-x-2">
        <thead>
          <tr>
            {!unaFila && <th className="w-12 text-left sm:w-24" />}
            {tallas.map((t) => (
              <th key={t} className="label-cayla pb-0.5 text-center text-[11px] text-tinta/55">
                {t === SIN ? "Talla única" : t}
              </th>
            ))}
            {!unaFila && <th className="label-cayla pb-0.5 pl-2 text-right text-[11px] text-tinta/55">Total</th>}
          </tr>
        </thead>
        <tbody>
          {colores.map((color) => {
            const fila = tallas.map((t) => porCelda.get(`${color}|${t}`));
            const total = fila.reduce((a, v) => a + (v ? (valores[v.varianteId] ?? 0) : 0), 0);
            return (
              <tr key={color}>
                {!unaFila && <th className="max-w-[4.5rem] truncate pr-1 text-left text-sm font-normal text-tinta/75 sm:max-w-none sm:pr-2">{color === SIN ? "Sin color" : color}</th>}
                {fila.map((v, i) => (
                  <td key={tallas[i]} className="text-center">
                    {v ? celda(v, [tallas[i], color].filter((x) => x !== SIN).join(" ")) : <span className="block w-14 text-center text-xs text-tinta/30 sm:w-16">·</span>}
                  </td>
                ))}
                {!unaFila && <td className={`pl-2 text-right text-sm tabular-nums ${total > 0 ? "text-tinta" : "text-tinta/45"}`}>{total}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
