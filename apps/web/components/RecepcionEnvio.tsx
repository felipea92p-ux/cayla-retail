"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, ScanBarcode, X } from "lucide-react";
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
import { DecidirTodas, EditorDecision, ResumenDecision, type Decision } from "@/components/DecisionFaltanteFila";
import { NOTA_VACIA, NotaCreditoCierre, type BloqueNota } from "@/components/NotaCreditoCierre";
import { compararTallas } from "@/lib/tallas";
import { diaMes, hoyLima } from "@/lib/fechas-lima";
import {
  chipLlegada,
  cierresElegidos,
  diasDeAtraso,
  disponibilidadNota,
  estadoLinea,
  etiquetaConfirmar,
  faltanteDeLinea,
  notaDelBloque,
  ordenarPorUrgencia,
  sinDecidir,
  tasaIgv,
  textoEsperada,
  valorPorLlegar,
  type EstadoLinea,
  type NotaBorrador,
} from "@/lib/recepciones-reglas";
import { ETIQUETA_TIPO_DOCUMENTO, soles, type CompraResumen, type LineaCompra } from "@/lib/compras-reglas";
import {
  armarPedidoEnvio,
  bloquesDelEnvio,
  extraCompleto,
  inicialesProveedor,
  llegoLinea,
  proveedoresDelEnvio,
  resolverEscaneo,
  sumarUnidad,
  totalesEnvio,
  trasladoContadoEntero,
  type ConteoTraslado,
  type ExtraEnvio,
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
};
type Ubicacion = { id: string; nombre: string };
type Proveedor = { id: string; nombre: string };

type Resultado = {
  unidades: number;
  proveedores: number;
  extras: number;
  deOtraSede: number;
  traslados: { resultado: string }[];
  cierres: number;
  notas: number;
  yaRegistrado: boolean;
};

type Pestana = "prendas" | "fuera" | "notas";
type FiltroLista = "todas" | "atrasadas" | "proximas";

const NUMERO =
  "w-16 border-b bg-transparent px-1 py-1 text-center text-sm tabular-nums text-tinta outline-none [appearance:textfield] focus:border-b-2 focus:border-rojo [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

// Prenda · SKU · Pendiente · Llegó · Dif. · Estado
const PLANTILLA_LINEA = "sm:grid-cols-[1fr_8.5rem_4.5rem_5.5rem_3rem_10rem]";

const CHIP_ESTADO: Record<EstadoLinea, TonoChip> = { sin_contar: "neutro", completa: "verde", faltan: "ambar", excede: "rojo" };
const ETIQUETA_ESTADO: Record<EstadoLinea, (faltan: number) => string> = {
  sin_contar: () => "Sin contar",
  completa: () => "Completa",
  faltan: (n) => `Faltan ${n}`,
  excede: () => "Excede",
};

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
  igvMes,
  porRecibirAtrasadas,
  comprasConNotaFaltante,
  saldoFavorPorProveedor,
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
  /** Crédito fiscal del mes, para mostrar el efecto de una nota de crédito al cerrar un faltante (solo líder). */
  igvMes: number | null;
  porRecibirAtrasadas: number | null;
  /** Comprobantes que ya tienen su nota por faltante (es una sola por comprobante). */
  comprasConNotaFaltante: string[];
  /** Saldo a favor de cada proveedor, para mostrar cómo queda tras una nota. */
  saldoFavorPorProveedor: Record<string, number>;
  /** Traslados en tránsito que vienen hacia cada ubicación (el «envío interno»). */
  trasladosPorUbicacion: Record<string, TrasladoEnCamino[]>;
  /** Los indicadores: se dibujan bajo «¿Qué llegó?» mientras no haya nada marcado. */
  resumen: ReactNode;
}) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  const escaneoRef = useRef<HTMLInputElement>(null);
  const ahora = useMemo(() => new Date(), []);
  const hoy = useMemo(() => hoyLima(), []);
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
  const [ultimaLectura, setUltimaLectura] = useState<{ bueno: boolean; texto: string } | null>(null);
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
  const [notas, setNotas] = useState<Record<string, NotaBorrador | undefined>>({});

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
  const proveedorPorDefecto = proveedoresEnvio[0]?.id ?? proveedores[0]?.id ?? "";

  // ---- la lista de la izquierda -------------------------------------------------------------------
  const k = clave(busqueda);
  const nAtrasadas = comprasOrdenadas.filter((c) => diasDeAtraso(c, ahora) > 0).length;
  const visibles = comprasOrdenadas.filter(
    (c) =>
      (!k || clave(`${c.documento} ${c.proveedorNombre} ${c.proveedorRuc ?? ""}`).includes(k)) &&
      (filtro === "todas" || (filtro === "atrasadas") === diasDeAtraso(c, ahora) > 0),
  );

  const cantidadLinea = (l: LineaCompra): number => llegoLinea(l, reparto) ?? 0;
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
    irAlPanel();
  }

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
    setNotas((n) => {
      const copia = { ...n };
      delete copia[compraId];
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
  function escanear(texto: string) {
    const codigo = texto.trim();
    if (!codigo) return;
    const r = resolverEscaneo(codigo, variantes, bloques, reparto);
    if (r.tipo === "sumado") {
      const linea = lineasActivas.find((l) => l.id === r.lineaId);
      if (linea) setReparto((rep) => sumarUnidad(rep, linea, r.varianteId));
      setAbiertos((a) => ({ ...a, [r.compraId]: true }));
      setPestana("prendas");
      setUltimaLectura({ bueno: true, texto: `${r.referencia} ${r.detalle} → ${r.proveedorNombre} · ${r.documento} (+1)` });
    } else if (r.tipo === "completo") {
      setUltimaLectura({ bueno: false, texto: `${r.referencia} ${r.detalle}: ya está completo en todos los comprobantes del envío.` });
    } else if (r.tipo === "fuera") {
      // Ningún comprobante del envío la trae: pasa a «fuera de comprobante», con el proveedor del envío por defecto.
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

  // ---- fuera de comprobante (ADR-0076) y con origen (ADR-0113) ------------------------------------
  const agregarExtra = () => setExtras((a) => [...a, { productoId: "", varianteId: "", cantidad: 1, costoUnitario: "", proveedorId: proveedorPorDefecto, esRegalo: false }]);
  const quitarExtra = (i: number) => setExtras((a) => a.filter((_, n) => n !== i));
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
  const mostrarEditor = (lineaId: string) => esLider && (editando === lineaId || (!decisiones[lineaId] && enfocada !== lineaId));
  // El foco «dentro de la línea»: pasar de una celda a otra de la misma línea no cuenta como salir.
  const alEnfocar = (lineaId: string) => () => setEnfocada(lineaId);
  const alDesenfocar = (lineaId: string) => (e: React.FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEnfocada((actual) => (actual === lineaId ? null : actual));
  };
  const ajustarNota = (compraId: string, cambio: Partial<NotaBorrador>) => setNotas((n) => ({ ...n, [compraId]: { ...(n[compraId] ?? NOTA_VACIA(hoy)), ...cambio } }));

  // Lo que llegó corto: solo las líneas CONTADAS con menos de lo pendiente. Un colaborador no decide qué pasa
  // con lo que faltó (queda pendiente y un líder lo cierra), así que para él no hay decisiones ni cierres.
  const lineasCortas = lineasActivas.filter((l) => estadoLinea(llegoLinea(l, reparto), l.pendiente) === "faltan");
  const faltantes = lineasCortas.map((l) => ({ lineaId: l.id, compraId: l.compraId, faltan: faltanteDeLinea(llegoLinea(l, reparto), l.pendiente), costoUnitario: l.costoUnitario }));
  const cierres = esLider ? cierresElegidos(faltantes, decisiones) : [];
  const porDecidir = esLider ? sinDecidir(faltantes, decisiones) : [];

  // La nota de crédito de cada comprobante del envío (solo líder), con lo cerrado ahora y lo que ya estaba cerrado antes.
  const bloquesNota: BloqueNota[] = esLider
    ? bloques.map(({ compra, lineas: propias }) => ({
        compra,
        cierresAhora: cierres.filter((c) => c.compraId === compra.id).map((c) => ({ faltan: c.faltan, costoUnitario: c.costoUnitario })),
        cerradoAntes: lineas.filter((l) => l.compraId === compra.id && l.cerrado > 0).map((l) => ({ faltan: l.cerrado, costoUnitario: l.costoUnitario })),
        pendiente: propias.reduce((a, l) => a + l.pendiente, 0),
        llegando: propias.reduce((a, l) => a + cantidadLinea(l), 0),
        yaTieneNotaFaltante: comprasConNotaFaltante.includes(compra.id),
        saldoFavorAntes: saldoFavorPorProveedor[compra.proveedorId] ?? 0,
      }))
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

    // Una nota de crédito por comprobante, con todo lo cerrado de él. Se valida ANTES de escribir nada.
    const notasAEmitir = bloquesNota.flatMap((b) => {
      const borrador = notas[b.compra.id] ?? NOTA_VACIA(hoy);
      const disp = disponibilidadNota({
        pendiente: b.pendiente,
        llegando: b.llegando,
        cerrandoAhora: b.cierresAhora.reduce((a, c) => a + c.faltan, 0),
        cerradoAntes: b.cerradoAntes.reduce((a, c) => a + c.faltan, 0),
        yaTieneNotaFaltante: b.yaTieneNotaFaltante,
      });
      if (disp.estado !== "disponible") return [];
      const n = notaDelBloque({ tasa: tasaIgv(b.compra), cierres: [...b.cerradoAntes, ...b.cierresAhora], esLider, borrador });
      return n.activa ? [{ compra: b.compra, n, borrador }] : [];
    });
    for (const { compra, n } of notasAEmitir) {
      if (n.problema === "serie") return void avisar.error(`Escribe la serie y el número de la nota de crédito de ${compra.documento}.`, { enfocar: `nota-serie-${compra.id}` });
      if (n.problema === "monto")
        return void avisar.error(`El monto de la nota de ${compra.documento} tiene que ser mayor a cero y no pasar de lo cerrado a su costo con IGV (${soles(n.tope)}).`, { enfocar: `nota-monto-${compra.id}` });
    }

    const pedido = armarPedidoEnvio({
      ubicacionId,
      bloques,
      reparto,
      extras,
      traslados: trasladosMarcados.map((t) => ({ transferenciaId: t.id, lineas: t.lineas, conteo: conteoTraslados[t.id] ?? {} })),
      cierres: cierres.map((c) => ({ lineaId: c.lineaId, faltan: c.faltan, motivo: c.motivo })),
      notas: notasAEmitir.map(({ compra, n, borrador }) => ({ compraId: compra.id, serie: borrador.serie, fecha: borrador.fecha, monto: n.monto })),
      numeroGuia,
      nota,
      token,
    });

    setLoading(true);
    const cerrarProceso = avisar.proceso(unidadesRecibiendo > 0 ? "Recibiendo el envío…" : "Cerrando faltantes…");
    const supabase = createClient();
    // UNA sola llamada, UNA transacción: todos los proveedores, lo fuera de comprobante, lo de otra sede, los
    // cierres y las notas se registran juntos o no se registra nada. Con el mismo token, reintentar no duplica.
    const { data, error } = await supabase.rpc("recibir_envio", pedido);
    cerrarProceso();
    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, "registrar el envío"), { detalle: "No se registró nada: tu conteo sigue aquí para corregirlo." });
      return;
    }

    const r = (data ?? {}) as { ya_registrado?: boolean; lotes?: unknown[]; extras?: number; traslados?: { resultado: string }[]; cierres?: number; notas_credito?: number };
    const resultado: Resultado = {
      unidades: unidadesRecibiendo,
      proveedores: r.lotes?.length ?? proveedoresEnvio.length,
      extras: r.extras ?? 0,
      deOtraSede: totales.deOtraSede,
      traslados: r.traslados ?? [],
      cierres: r.cierres ?? 0,
      notas: r.notas_credito ?? 0,
      yaRegistrado: r.ya_registrado === true,
    };
    avisar.exito(
      resultado.yaRegistrado ? "Este envío ya estaba registrado" : unidadesRecibiendo > 0 ? `${unidadesRecibiendo} unidades recibidas en ${ubicacionNombre || "la ubicación"}` : `${resultado.cierres} faltantes cerrados`,
      { detalle: resultado.yaRegistrado ? "No se sumó nada de nuevo." : undefined },
    );
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
    setNotas({});
    setNumeroGuia("");
    setNota("");
    setEscaneo("");
    setUltimaLectura(null);
    setPestana("prendas");
    setToken(crypto.randomUUID());
  }

  if (ok) {
    return (
      <div className="card-cayla space-y-3 p-6 text-center">
        <p className="label-cayla text-[11px] text-tinta/65">{ok.yaRegistrado ? "Envío ya registrado" : "Envío recibido"}</p>
        {ok.unidades > 0 ? (
          <>
            <p className="font-display text-3xl text-tinta">{ok.unidades.toLocaleString("es-PE")} unidades</p>
            <p className="text-sm text-tinta/70">
              Ya suman al stock de {ubicacionNombre}
              {ok.proveedores > 0 && `, de ${ok.proveedores === 1 ? "un proveedor" : `${ok.proveedores} proveedores`}`}
              {ok.extras > 0 && ` (${ok.extras} ${ok.extras === 1 ? "prenda" : "prendas"} fuera de comprobante)`}
              {ok.deOtraSede > 0 && ` y ${ok.deOtraSede} de otra sede`}.
            </p>
          </>
        ) : (
          <p className="font-display text-3xl text-tinta">Nada que sumar al stock</p>
        )}
        {ok.traslados.length > 0 && (
          <p className="text-sm text-tinta/70">
            {ok.traslados.map((t) => (t.resultado === "cerrada" ? "Un traslado confirmado completo." : "Un traslado quedó con diferencia: un líder lo revisa.")).join(" ")}
          </p>
        )}
        {ok.cierres > 0 && (
          <p className="text-sm text-tinta/70">
            {ok.cierres} {ok.cierres === 1 ? "faltante cerrado" : "faltantes cerrados"}
            {ok.notas > 0 && ` · ${ok.notas} ${ok.notas === 1 ? "nota de crédito registrada" : "notas de crédito registradas"}`}. Quedan en el historial del comprobante.
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Boton peso="discreto" onClick={nuevoEnvio}>
            Recibir otro envío
          </Boton>
          <Link href="/recibir?vista=recibidas" className="label-cayla rounded-md bg-tinta px-4 py-3 text-[11px] text-crema hover:bg-rojo">
            Ver recibidas
          </Link>
        </div>
      </div>
    );
  }

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
        <div key={l.id} id={`recibir-linea-${l.id}`} onFocus={alEnfocar(l.id)} onBlur={alDesenfocar(l.id)} className={`px-5 py-3 sm:py-2.5 ${completa ? "bg-verde/[0.045]" : estado === "faltan" ? "bg-ambar/[0.05]" : ""}`}>
          {/* escritorio: fila de tabla */}
          <div className={`hidden gap-x-4 sm:grid ${PLANTILLA_LINEA} sm:items-center`}>
            <span className="min-w-0 truncate text-sm text-tinta">
              {l.referencia}
              <span className="block truncate text-xs text-tinta/55">{[l.talla, l.color].filter(Boolean).join(" · ") || l.descripcion}</span>
            </span>
            <span className="truncate text-[12.5px] tabular-nums text-tinta/65">{l.sku ?? "—"}</span>
            <span className="text-center text-sm tabular-nums text-tinta/65">{l.pendiente}</span>
            <span className="text-center">
              <input
                type="number"
                min={0}
                max={l.pendiente}
                aria-label={`Llegó de ${l.referencia} ${[l.talla, l.color].filter(Boolean).join(" ")}`}
                value={reparto[l.id]?.[l.varianteId] ?? ""}
                placeholder="—"
                onChange={(e) => fijar(l.id, l.varianteId!, e.target.value === "" ? null : Number(e.target.value))}
                onFocus={(e) => e.target.select()}
                className={`${NUMERO} ${excede ? "border-rojo text-rojo" : completa ? "border-verde bg-verde/[0.09] text-verde-profundo" : estado === "faltan" ? "border-ambar bg-ambar/10 text-ambar-profundo" : "border-tinta/20 text-tinta/45"}`}
              />
            </span>
            <span className={`text-center text-sm tabular-nums ${dif === null || dif === 0 ? "text-tinta/45" : dif < 0 ? "font-semibold text-ambar-profundo" : "font-semibold text-rojo"}`}>
              {dif === null ? "—" : dif === 0 ? "0" : dif < 0 ? `−${-dif}` : `+${dif}`}
            </span>
            <EstadoDeLinea estado={estado} faltan={l.pendiente - recibiendoLinea} decision={decision} onEditar={() => setEditando(l.id)} esLider={esLider} />
          </div>
          {/* celular: tarjeta con − y + de a dedo */}
          <div className="sm:hidden">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-tinta">{l.referencia}</p>
                <p className="text-xs text-tinta/65">
                  {[l.talla, l.color].filter(Boolean).join(" / ") || l.sku} · pendiente {l.pendiente}
                </p>
              </div>
              <Chip tono={CHIP_ESTADO[estado]}>{ETIQUETA_ESTADO[estado](l.pendiente - recibiendoLinea)}</Chip>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-3">
              <PasoCantidad valor={reparto[l.id]?.[l.varianteId] ?? null} onCambio={(n) => fijar(l.id, l.varianteId!, n)} etiqueta={`Llegó de ${nombre}`} tono={estado} />
              {decision && <ResumenDecision decision={decision} onEditar={() => setEditando(l.id)} />}
            </div>
          </div>
          {estado === "faltan" && mostrarEditor(l.id) && (
            <EditorDecision
              key={`${l.id}-${editando === l.id ? "edita" : "nueva"}`}
              nombre={nombre}
              faltan={l.pendiente - recibiendoLinea}
              inicial={decisiones[l.id]}
              onGuardar={(d) => guardarDecision(l.id, d)}
              onCancelar={decisiones[l.id] ? () => setEditando(null) : undefined}
            />
          )}
        </div>
      );
    }

    // Línea agrupada: el comprobante dice «Blusa Lino x 24» sin talla ni color, y se reparte acá mirando lo que llegó.
    const opciones = variantesPorProducto.get(l.productoId) ?? [];
    return (
      <div key={l.id} id={`recibir-linea-${l.id}`} onFocus={alEnfocar(l.id)} onBlur={alDesenfocar(l.id)} className={`space-y-3 px-5 py-3 ${completa ? "bg-verde/[0.045]" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="min-w-0 text-sm text-tinta">
            {l.referencia} <span className="text-xs text-tinta/55">· el comprobante dice {l.pendiente} sin talla ni color — anota lo que llegó de cada una</span>
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
        {estado === "faltan" && mostrarEditor(l.id) && (
          <EditorDecision
            key={`${l.id}-${editando === l.id ? "edita" : "nueva"}`}
            nombre={nombre}
            faltan={l.pendiente - recibiendoLinea}
            inicial={decisiones[l.id]}
            onGuardar={(d) => guardarDecision(l.id, d)}
            onCancelar={decisiones[l.id] ? () => setEditando(null) : undefined}
          />
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
        <aside className="card-cayla overflow-hidden lg:sticky lg:top-24">
          <div className="px-4 pb-3 pt-4">
            <h2 className="font-display text-xl text-tinta">Pendientes de llegar</h2>
            <input
              id="recibir-buscar"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              placeholder="Documento o proveedor"
              autoComplete="off"
              aria-label="Buscar entre los comprobantes pendientes"
              className={`${CASILLA_TEXTO} mt-3`}
            />
          </div>
          <div role="tablist" aria-label="Filtrar pendientes" className="flex gap-1 border-b border-tinta/10 px-3">
            {(
              [
                { valor: "todas", etiqueta: "Todas", n: comprasOrdenadas.length },
                { valor: "atrasadas", etiqueta: "Atrasadas", n: nAtrasadas },
                { valor: "proximas", etiqueta: "Próximas", n: comprasOrdenadas.length - nAtrasadas },
              ] as { valor: FiltroLista; etiqueta: string; n: number }[]
            ).map((t) => (
              <button
                key={t.valor}
                type="button"
                role="tab"
                aria-selected={filtro === t.valor}
                onClick={() => setFiltro(t.valor)}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-2.5 pb-2.5 pt-1 text-[13px] transition-colors ${filtro === t.valor ? "border-rojo font-medium text-tinta" : "border-transparent text-tinta/65 hover:text-rojo"}`}
              >
                {t.etiqueta}
                <span className={`rounded-md border px-1.5 text-[11px] font-semibold leading-[17px] ${t.valor === "atrasadas" && t.n > 0 ? "border-ambar/30 bg-ambar/10 text-ambar-profundo" : "border-tinta/10 bg-tinta/[0.04] text-tinta/65"}`}>{t.n}</span>
              </button>
            ))}
          </div>
          <p className="flex items-center justify-between gap-2 px-4 py-2 text-xs text-tinta/55">
            <span>Por urgencia: lo atrasado primero</span>
            {hayEnvio && (
              <span>
                <b className="font-semibold text-tinta">{seleccionadas.length}</b> en el envío
              </span>
            )}
          </p>
          {visibles.length === 0 && <p className="border-t border-tinta/10 px-4 py-5 text-sm text-tinta/65">{k ? `Nada coincide con «${busqueda.trim()}».` : "Nada en esta lista."}</p>}
          {visibles.map((c) => {
            const marcada = seleccionadas.includes(c.id);
            const llegada = chipLlegada(c, ahora);
            const enMedio = c.recibidoCantidad > 0;
            return (
              <button
                key={c.id}
                type="button"
                role="checkbox"
                aria-checked={marcada}
                onClick={() => alternar(c)}
                className={`flex w-full items-center gap-3 border-l-2 border-t border-t-tinta/10 px-4 py-3 text-left transition-colors ${marcada ? "border-l-rojo bg-rojo/[0.05]" : "border-l-transparent hover:bg-tinta/[0.03]"}`}
              >
                <span aria-hidden className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] ${marcada ? "border-tinta bg-tinta text-crema" : "border-tinta/45 bg-papel"}`}>
                  {marcada && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold text-tinta">{c.proveedorNombre}</span>
                  <span className="block text-[13px] tabular-nums text-tinta/75">{c.documento}</span>
                  <span className="block text-xs text-tinta/65">
                    {textoEsperada(c, ahora)} · {c.recibidoCantidad} de {c.facturadoCantidad} u.
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <Chip tono={llegada.tono}>{llegada.texto}</Chip>
                  {esLider && (
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
        </aside>

        {/* ================= derecha: el envío ================= */}
        <div ref={panel} className="min-w-0 space-y-4 scroll-mt-24">
          {!hayEnvio ? (
            <>
              <div className="card-cayla flex min-h-[10rem] flex-col items-center justify-center gap-2 p-8 text-center">
                <p className="font-display text-xl text-tinta">¿Qué llegó?</p>
                <p className="max-w-md text-sm text-tinta/65">
                  Marca a la izquierda los comprobantes que vienen en el envío. Si trae mercadería de varios proveedores, márcalos todos.
                </p>
              </div>
              {resumen}
            </>
          ) : (
            <>
              {/* el envío: quién, con qué guía, a dónde entra y cuánto llevas */}
              <section className="card-cayla grid overflow-hidden lg:grid-cols-[1.25fr_1fr_1fr]">
                <div className="flex items-center gap-4 p-5">
                  <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-sand bg-sand/50 text-tinta/65">
                    <ScanBarcode className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-xl leading-tight text-tinta">{tituloEnvio}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-tinta/65">
                      {proveedoresEnvio.map((p) => (
                        <Ini key={p.id} nombre={p.nombre} chico />
                      ))}
                      <span className="ml-1">
                        {nSeleccionadasTexto} · {totales.esperadas.toLocaleString("es-PE")} u. por llegar
                      </span>
                    </p>
                  </div>
                </div>
                <div className="space-y-3 border-t border-tinta/10 p-5 lg:border-l lg:border-t-0">
                  <CampoTexto etiqueta="Guía del envío" mono value={numeroGuia} onChange={(e) => setNumeroGuia(e.target.value)} placeholder="T001-000123" autoComplete="off" />
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
                <div className="flex items-center gap-4 border-t border-tinta/10 p-5 lg:border-l lg:border-t-0">
                  <Anillo pct={pctContado} />
                  <div>
                    <p className="label-cayla text-[10.5px] text-tinta/55">Estado de recepción</p>
                    <p className="font-display text-2xl leading-tight text-tinta">{estadoDelEnvio}</p>
                    <p className="text-xs text-tinta/65">
                      {totales.contadas.toLocaleString("es-PE")} de {totales.esperadas.toLocaleString("es-PE")} unidades contadas
                    </p>
                  </div>
                </div>
              </section>

              {/* los comprobantes del envío, de cualquier proveedor */}
              <section className="card-cayla p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="label-cayla text-[10.5px] text-tinta/55">Comprobantes de este envío</p>
                  {comprasSinMarcar.length > 0 && (
                    <div className="w-64 max-w-full">
                      <SelectNativo aria-label="Agregar otro comprobante al envío" value="" onChange={(e) => e.target.value && agregarDesdeSelect(e.target.value)}>
                        <option value="">+ Agregar comprobante…</option>
                        {comprasSinMarcar.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.proveedorNombre} · {c.documento}
                          </option>
                        ))}
                      </SelectNativo>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {bloques.map(({ compra: c }) => (
                    <span key={c.id} className="inline-flex items-center gap-2.5 rounded-[10px] border border-sand bg-crema px-3 py-1.5 text-[13px]">
                      <Ini nombre={c.proveedorNombre} chico />
                      <span className="text-tinta/65">{c.proveedorNombre}</span>
                      <b className="font-semibold tabular-nums text-tinta">{c.documento}</b>
                      {seleccionadas.length > 1 && (
                        <button type="button" onClick={() => alternar(c)} aria-label={`Quitar ${c.documento} del envío`} className="text-tinta/45 hover:text-rojo">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </section>

              {/* lo que llegó: prendas del envío, fuera de comprobante y notas */}
              <section className="card-cayla overflow-hidden">
                <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-tinta/10 px-5">
                  <div role="tablist" aria-label="Qué se cuenta" className="flex flex-wrap gap-1">
                    {(
                      [
                        { valor: "prendas", etiqueta: "Prendas del envío", n: totales.esperadas },
                        { valor: "fuera", etiqueta: "Fuera de comprobante", n: totales.fueraDeComprobante + totales.deOtraSede },
                        { valor: "notas", etiqueta: "Notas", n: nota.trim() ? 1 : 0 },
                      ] as { valor: Pestana; etiqueta: string; n: number }[]
                    ).map((t) => (
                      <button
                        key={t.valor}
                        type="button"
                        role="tab"
                        aria-selected={pestana === t.valor}
                        onClick={() => setPestana(t.valor)}
                        className={`-mb-px flex items-center gap-2 border-b-2 px-3 pb-3.5 pt-4 text-sm transition-colors ${pestana === t.valor ? "border-rojo font-medium text-tinta" : "border-transparent text-tinta/65 hover:text-rojo"}`}
                      >
                        {t.etiqueta}
                        <span className={`rounded-md border px-1.5 text-[11px] font-semibold leading-[18px] ${pestana === t.valor ? "border-sand bg-sand text-tinta" : "border-tinta/10 bg-tinta/[0.04] text-tinta/65"}`}>{t.n}</span>
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto flex w-full items-center gap-2 py-2.5 sm:w-96">
                    <div className="relative flex-1">
                      <ScanBarcode aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-tinta/45" />
                      <input
                        ref={escaneoRef}
                        type="text"
                        value={escaneo}
                        onChange={(e) => setEscaneo(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            escanear(escaneo);
                          }
                        }}
                        placeholder="Escanea la etiqueta o busca por SKU…"
                        aria-label="Escanear una prenda: suma 1 al comprobante que la trae"
                        autoComplete="off"
                        className={`${CASILLA_TEXTO} pl-10`}
                      />
                    </div>
                  </div>
                </div>

                {ultimaLectura && (
                  <p role="status" className={`flex items-center gap-2 border-b border-tinta/10 px-5 py-2 text-xs ${ultimaLectura.bueno ? "text-verde-profundo" : "text-ambar-profundo"}`}>
                    {ultimaLectura.bueno && <Check aria-hidden className="h-3.5 w-3.5 shrink-0" />}
                    <span>
                      {ultimaLectura.bueno ? "Última lectura: " : ""}
                      {ultimaLectura.texto}
                    </span>
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

                    <div className={`hidden gap-x-4 border-b border-tinta/10 px-5 py-2 sm:grid ${PLANTILLA_LINEA}`}>
                      {["Prenda", "SKU", "Pendiente", "Llegó", "Dif.", "Estado"].map((t, i) => (
                        <span key={t} className={`label-cayla text-[11px] text-tinta/55 ${i === 2 || i === 3 || i === 4 ? "text-center" : ""}`}>
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
                              {abierto ? <ChevronDown aria-hidden className="h-[18px] w-[18px] shrink-0 text-tinta/55" /> : <ChevronRight aria-hidden className="h-[18px] w-[18px] shrink-0 text-tinta/55" />}
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
                            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
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
                          {abierto && (
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
                          )}
                        </div>
                      );
                    })}

                    {/* al final, la nota de crédito (una por comprobante, con el comprobante al 100 %) — solo líder */}
                    {esLider && (
                      <div className="space-y-4 p-5 pt-0">
                        <NotaCreditoCierre bloques={bloquesNota} notas={notas} onNota={ajustarNota} hoy={hoy} esLider={esLider} igvMes={igvMes} porRecibirAtrasadas={porRecibirAtrasadas} />
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
                          <div key={i} className="flex flex-wrap items-end gap-2 border-b border-tinta/10 pb-3 last:border-0">
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
                            <label className="flex shrink-0 items-center gap-2 pb-2 text-sm text-tinta/75">
                              <input type="checkbox" checked={ex.esRegalo} onChange={(e) => actualizarExtra(i, { esRegalo: e.target.checked, costoUnitario: e.target.checked ? "" : ex.costoUnitario })} className="h-4 w-4 accent-[#1a1a18]" />
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
                                  {marcado && <Check className="h-3 w-3" strokeWidth={3} />}
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
                                <div className="divide-y divide-tinta/10 border-t border-tinta/10">
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
                  <div className="space-y-2 p-5">
                    <label htmlFor="recibir-nota" className="label-cayla text-[11px] text-tinta/65">
                      Nota del envío (opcional)
                    </label>
                    <textarea
                      id="recibir-nota"
                      value={nota}
                      onChange={(e) => setNota(e.target.value)}
                      rows={3}
                      placeholder="Llegó una caja abierta, el transportista dejó dos bultos menos…"
                      className="w-full rounded-lg border border-tinta/15 bg-transparent px-3 py-2 text-sm text-tinta outline-none placeholder:text-tinta/45 focus:border-rojo"
                    />
                    <p className="text-xs text-tinta/55">Queda en cada lote del envío, para quien lo revise después.</p>
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        {/* ================= barra fija: los totales del envío + confirmar ================= */}
        {hayEnvio && (
          <BarraFija
            resumen={
              <div className="space-y-1">
                <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
                  <span className="hidden text-xs text-tinta/65 lg:block">
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
                      <span className={`font-display text-2xl leading-none tabular-nums ${m.tono}`}>{m.n.toLocaleString("es-PE")}</span>
                      <span className="label-cayla mt-0.5 block text-[9.5px] text-tinta/55">{m.etiqueta}</span>
                    </span>
                  ))}
                </div>
                {totales.excedidas > 0 && <span className="block text-xs text-rojo">{totales.excedidas === 1 ? "1 línea supera" : `${totales.excedidas} líneas superan`} lo pendiente</span>}
                {porDecidir.length > 0 && totales.excedidas === 0 && (
                  <span className="block text-xs text-ambar-profundo">
                    {porDecidir.length === 1 ? "1 fila llegó con faltante y falta decidir qué pasó" : `${porDecidir.length} filas llegaron con faltante y falta decidir qué pasó`}: elige y da «Guardar».
                  </span>
                )}
                {trasladosSinContar.length > 0 && <span className="block text-xs text-ambar-profundo">Falta contar las prendas de {trasladosSinContar.length === 1 ? "un traslado" : `${trasladosSinContar.length} traslados`} (en «Fuera de comprobante»).</span>}
                {sinComprobanteContado && <span className="block text-xs text-ambar-profundo">Lo de fuera de comprobante o de otra sede necesita al menos una línea de comprobante contada.</span>}
                {cierres.length > 0 && porDecidir.length === 0 && totales.excedidas === 0 && (
                  <span className="block text-xs text-tinta/55">
                    Se {cierres.length === 1 ? "cierra 1 faltante" : `cierran ${cierres.length} faltantes`} al confirmar ({cierres.reduce((a, c) => a + c.faltan, 0)} u.). Lo demás sigue pendiente.
                  </span>
                )}
              </div>
            }
            acciones={
              <Boton type="submit" peso="primario" cargando={loading} disabled={!puedeConfirmar}>
                {etiquetaConfirmar({ unidades: unidadesRecibiendo, cierres: cierres.length, ubicacion: ubicacionNombre })}
              </Boton>
            }
          />
        )}
      </form>

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

// El proveedor como dos letras («Textiles Andina SAC» → TA): con varios proveedores en un envío, se reconocen
// de un vistazo sin leer el nombre entero.
function Ini({ nombre, chico = false }: { nombre: string; chico?: boolean }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full bg-sand font-bold tracking-wide text-tinta/75 ${chico ? "h-[22px] w-[22px] text-[9px]" : "h-[30px] w-[30px] text-[10.5px]"}`}>
      {inicialesProveedor(nombre)}
    </span>
  );
}

// Cuánto llevas contado del envío, de un vistazo. Ámbar mientras falta, verde al 100 %.
function Anillo({ pct }: { pct: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0" role="img" aria-label={`${pct} % contado`}>
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-sand" />
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" strokeLinecap="round" className={pct >= 100 ? "stroke-verde" : "stroke-ambar"} strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, pct / 100))} transform="rotate(-90 32 32)" />
      <text x="32" y="38" textAnchor="middle" className="fill-tinta font-display" fontSize="17">
        {pct}%
      </text>
    </svg>
  );
}

// El estado de la fila y, si llegó corta y ya se decidió qué pasó, esa decisión a la vista. Quien no es líder
// no decide: la fila solo dice «Sigue pendiente».
function EstadoDeLinea({ estado, faltan, decision, onEditar, esLider }: { estado: EstadoLinea; faltan: number; decision?: Decision; onEditar: () => void; esLider: boolean }) {
  return (
    <span className="flex flex-col items-start gap-1">
      <Chip tono={CHIP_ESTADO[estado]}>{ETIQUETA_ESTADO[estado](faltan)}</Chip>
      {decision && <ResumenDecision decision={decision} onEditar={onEditar} />}
      {!esLider && estado === "faltan" && <span className="text-[11px] leading-tight text-tinta/65">Sigue pendiente</span>}
    </span>
  );
}

// − y + de 40 px con el número grande: recibir es de pie y con una mano, y el teclado numérico del celular es
// lo más lento. También se puede tipear. `valor` null = sin contar: el campo se ve vacío, no en 0. «−» desde
// vacío anota 0 (nada llegó); vaciar el campo a mano vuelve a «sin contar».
function PasoCantidad({ valor, onCambio, etiqueta, tono }: { valor: number | null; onCambio: (n: number | null) => void; etiqueta: string; tono: EstadoLinea }) {
  const color = tono === "completa" ? "text-verde-profundo" : tono === "faltan" ? "text-ambar-profundo" : tono === "excede" ? "text-rojo" : "text-tinta/45";
  return (
    <div role="group" aria-label={etiqueta} className="flex items-center overflow-hidden rounded-[10px] border border-tinta/25">
      <button type="button" onClick={() => onCambio(Math.max(0, (valor ?? 0) - 1))} aria-label="Una unidad menos" className="grid h-10 w-10 place-items-center text-xl text-tinta/65 active:bg-tinta/5">
        −
      </button>
      <input
        inputMode="numeric"
        value={valor ?? ""}
        placeholder="—"
        onChange={(e) => {
          const digitos = e.target.value.replace(/\D/g, "");
          onCambio(digitos === "" ? null : Number(digitos));
        }}
        onFocus={(e) => e.target.select()}
        aria-label={etiqueta}
        className={`font-display h-10 w-[46px] border-x border-tinta/15 bg-transparent text-center text-[22px] tabular-nums outline-none ${color}`}
      />
      <button type="button" onClick={() => onCambio((valor ?? 0) + 1)} aria-label="Una unidad más" className="grid h-10 w-10 place-items-center text-xl text-tinta/65 active:bg-tinta/5">
        +
      </button>
    </div>
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
