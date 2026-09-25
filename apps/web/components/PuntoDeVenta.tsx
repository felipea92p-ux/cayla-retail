"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { MetodoPago } from "@cayla-retail/shared";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { barrerColaSunat, enviarVentaASunat } from "@/lib/envio-sunat";
import { avisar } from "@/components/ui/Avisos";
import { filtrarPrendasV2, resolverCodigoV2, type PrendaBuscableV2 } from "@/lib/buscar-prenda-v2";
import { teclaSueltaVaAlEscaner } from "@/lib/escaner-tecla-suelta";
import { agruparCatalogo } from "@/lib/catalogo-grupos";
import { ETIQUETA_TIPO, tipoDocumentoDeCliente, type EstadoComprobante, type TipoComprobante } from "@/lib/comprobantes-reglas";
import {
  aplicarDescuento,
  atendioCorto,
  conCampanas,
  conCodigoDelCatalogo,
  descuentoResultante,
  descuentoUnitarioPorPorcentaje,
  esperaAlCargar,
  metodoDeAtajo,
  motivoBloqueoCobro,
  pagosParaRpc,
  pagosTrasEditarMonto,
  quitarPagoTraspasando,
  RAZON_CAMPANA,
  restanteDePagos,
  SIN_DETALLE_DESCUENTO,
  vueltoDe,
  conDescuentoDeCampana,
  type CampanaLinea,
  type DetalleDescuento,
  type MomentoTicket,
  type PagoAplicado,
} from "@/lib/vender-reglas";
import { borrar, claveLocal, guardar, leer } from "@/lib/almacen-local";
import { carritoPasaElUmbral, conStockComprometidoDescontado, firmaDeVentaEncolada, stockComprometido, type ParamsRegistrarVenta, type VentaEncolada } from "@/lib/ventas-offline";
import { firmar } from "@/lib/responsable-reglas";
import { gsap, Flip, useGSAP } from "@/lib/motion-gsap";
import { Modal } from "@/components/ui/Modal";
import { AbrirCajaFormV2 } from "@/components/AbrirCajaFormV2";
import { CerrarCajaModalV2 } from "@/components/CerrarCajaModalV2";
import { PuntoDeVentaCatalogo } from "@/components/PuntoDeVentaCatalogo";
import { ElegirTallaModal } from "@/components/ElegirTallaModal";
import { PuntoDeVentaTicket } from "@/components/PuntoDeVentaTicket";
import { PuntoDeVentaColaOffline } from "@/components/PuntoDeVentaColaOffline";
import { ID_CARGO_ESPECIAL } from "@/lib/cargo-especial";
import { codigoPrenda } from "@/lib/prenda-reglas";
import { armarRecibo, textoNumeroRecibo, type ReciboVenta } from "@/lib/recibo-reglas";
import { VentaRegistradaModal } from "@/components/VentaRegistradaModal";
import { useResponsable } from "@/lib/useResponsable";
import type { DatosPrendaSinRegistrar, ListasPrendaLibre } from "@/lib/prenda-sin-registrar-reglas";
import { PrendaSinRegistrarModal } from "@/components/PrendaSinRegistrarModal";
import { EscanerCamara } from "@/components/EscanerCamara";
import { MQ_TELEFONO, type ResultadoEscaneo } from "@/lib/escaner-reglas";
import { useConsultaMedia } from "@/lib/useConsultaMedia";
import { VersionVentasDeHoy } from "@/components/VentasDeHoy";
import {
  avisoCortas,
  avisoQuedaronEnAlmacen,
  avisoSinPiso,
  avisoTope,
  conAlmacenAjustado,
  conPisoAlDia,
  conStockAjustado,
  descontarVendido,
  motivoNoCobrable,
} from "@/lib/vender-stock-local";
import { leerStockDeSede, useStockEnVivo, type StockReleido } from "@/lib/useStockEnVivo";

/**
 * Variante centinela de la «Prenda sin registrar» (ADR-0179; antes «Monto manual»): una
 * prenda que llegó a piso sin pasar por almacén. `registrar_venta` exige un variante_id por
 * línea; para esta no mueve stock y deja la prenda en la cola «Por regularizar» con lo que
 * anotó caja. Nunca aparece en catálogo ni en búsqueda: se filtra por este id en
 * `variantesVisibles`, más abajo. El id vive en `lib/cargo-especial.ts` porque Inventario,
 * Inicio y Movimientos también lo excluyen; acá se re-exporta para PuntoDeVentaTicket.
 */
export { ID_CARGO_ESPECIAL };

export type VarianteBusqueda = PrendaBuscableV2 & {
  /** Código de etiqueta (`variantes.codigo`) — lo que se le MUESTRA a la colaboradora con
   *  `codigoPrenda`. El escáner no lo necesita aparte: el disparador que lo acuña también
   *  lo registra en `codigos_barras`. */
  codigo: string | null;
  categoria: string | null;
  precio: number;
  /** La campaña de mayor % que rige HOY para esta prenda (`campanas_vigentes()`), o null.
   *  La base la elige y la vuelve a verificar al cobrar; acá solo se muestra y se aplica. */
  campana?: CampanaLinea | null;
  /** Foto de esta variante por su color (20260917190000) — null si ese color no
   *  tiene foto todavía; la tarjeta cae a las iniciales de la prenda. */
  fotoUrl: string | null;
  stockAqui: number;
  /** Lo que hay en el ALMACÉN de esta misma sede, sin lo apartado (`almacenDeLaSede`). No se cobra desde la caja
   *  —la venta descuenta el piso—, pero con el piso en 0 la caja dice «está en el almacén» en vez de «agotada» (D-40).
   *  `null` sin almacén (Taller); ausente para quien arme variantes sin este dato: se comporta como antes. */
  almacenAqui?: number | null;
  /** Dónde más hay, de más a menos (`lib/stock-por-sede.ts`). Solo sedes con stock > 0 y
   *  sin la actual; una colaboradora con sede fija lo recibe vacío porque RLS no le deja
   *  ver otras sedes. Opcional para no romper a quien arme variantes sin esta consulta. */
  stockOtrasSedes?: { sede: string; cantidad: number }[];
};

export type ItemCarrito = {
  /** Identifica la FILA del carrito. Igual al varianteId salvo para una «Prenda sin
   *  registrar»: ahí cada agregado es una prenda distinta (con su precio), y agrupar por
   *  varianteId como hace `agregar()` para una prenda normal fusionaría dos en una sola,
   *  perdiendo la segunda en silencio. */
  claveLinea: string;
  varianteId: string;
  referencia: string;
  sku: string;
  /** Código de etiqueta al momento de escanear; se muestra con `codigoPrenda`. Un ticket
   *  en espera guardado antes del 2026-09-16 no lo trae — `retomar()` lo completa. */
  codigo: string | null;
  cantidad: number;
  precioUnitario: number;
  descuentoUnitario: number;
  stockAqui: number;
  /** Por qué se descontó esta línea (R-45): uno de `RAZONES_DESCUENTO`, o "" sin
   *  descuento. `registrar_venta` lo exige apenas `descuentoUnitario > 0`. */
  razonDescuento: string;
  /** El texto de "Otro" — solo cuando `razonDescuento === "otro"`. */
  razonDescuentoOtro: string;
  /** El argumento escrito que pide la banda 20-35 % de un Líder (R-45); "" fuera de
   *  esa banda o en el camino de una Colaboradora (su tope es el código, no esto). */
  argumentoDescuento: string;
  /** La campaña que rige hoy para esta prenda, o null/ausente. Un ticket en espera
   *  guardado antes de las campañas no lo trae — `retomar()` lo completa. */
  campana?: CampanaLinea | null;
  /** Solo en una «Prenda sin registrar» (ADR-0179): lo que anotó caja para que almacén la reconozca. */
  prendaLibre?: Omit<DatosPrendaSinRegistrar, "precio">;
};

/** Lo que la colaboradora está decidiendo en el apartado «Descuento»: el % tal cual lo
 *  escribe (solo %, Felipe 2026-09-25), a qué líneas alcanza (`null` es todo el ticket;
 *  `[]` es que todavía no eligió ninguna), el motivo (R-45) y el argumento que pide todo
 *  descuento pasado el 15 %. */
export type DescuentoForm = {
  pct: string;
  elegidas: string[] | null;
  razon: string;
  razonOtro: string;
  argumento: string;
};

/** Un ticket dejado en espera (la clienta fue a probarse otra talla): lo que hace falta
 *  para retomarlo tal cual — líneas (con su descuento adentro), nota y código. El
 *  formulario de % no: es un borrador, no parte del ticket. Vive en localStorage por
 *  sede (`lib/almacen-local.ts`), sin reservar stock. */
export type TicketEnEspera = {
  id: string;
  creadoEn: string;
  carrito: ItemCarrito[];
  nota: string;
  codigoDescuento: string;
  /** Quién atendía (fila «Atendió», ADR-0163). Ya no se guarda ni se restaura: el responsable se elige en cada
   *  cobro (ADR-0161, A6). Queda en el tipo solo porque tickets viejos en localStorage pueden traerlo. */
  vendedoraId?: string | null;
};

/** Más de esto no es «en espera», es un mostrador desbordado: el sexto avisa. */
const TOPE_ESPERA = 5;
/** Un medio con el que pagó la clienta (ver `lib/vender-reglas.ts`); compartido con el
 *  ticket desde acá, como los otros tipos (ADR-0043). */
export type { PagoAplicado } from "@/lib/vender-reglas";

export type VentaOk = {
  total: number;
  prendas: number;
  /** El comprobante armado para mostrarlo e imprimirlo (`lib/recibo-reglas.ts`). `null` si la
   *  venta se guardó sin red (no hay serie ni número hasta que suba) o si no se pudo leer. */
  recibo: ReciboVenta | null;
  estado: EstadoComprobante | null;
  /** Se cobró sin red y quedó guardada en este equipo — todavía no es una venta real en
   *  el servidor (ver `lib/ventas-offline.ts`). Sin comprobante posible hasta que suba. */
  offline: boolean;
};

const MAX_RESULTADOS = 6;

/** El apartado «Descuento» arranca así siempre: sin valor, sin líneas elegidas (salvo
 *  que `abrirDescuento` traiga unas), sin motivo. */
const DESCUENTO_VACIO: DescuentoForm = { pct: "", elegidas: null, razon: "", razonOtro: "", argumento: "" };

/** Atajos de la cabecera a lo que la caja necesita a un toque y vive en otra pantalla. */
const ATAJOS = [
  { href: "/caja", texto: "Caja" },
  { href: "/cambios", texto: "Cambios" },
  { href: "/devoluciones", texto: "Devoluciones" },
] as const;
export const money = (n: number) => `S/${n.toFixed(2)}`;

type Props = {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  /** Un Líder descuenta sin código; una Colaboradora necesita uno (la base lo exige). */
  esLider: boolean;
  /** ¿Puede cerrar la caja? Un líder o la terminal de ventas (ADR-0160). `esLider` queda para lo que sigue siendo del líder (descuentos). */
  puedeCerrarCaja: boolean;
  /** Null si no hay caja abierta — el catálogo se ve igual, pero queda desactivado
   *  (ver `bloqueado` más abajo). */
  cajaId: string | null;
  /** Lo que dejó en el cajón el último cierre de la sede (ADR-0186), para verificar la apertura. `null` si no se sabe. */
  fondoUltimoCierre?: number | null;
  /** Incluye la variante centinela de la «Prenda sin registrar», que este componente filtra
   *  antes de mostrar nada. */
  variantes: VarianteBusqueda[];
  listasPrendaLibre: ListasPrendaLibre;
  /** Las campañas de hoy no se pudieron leer: se vende igual, pero una prenda en campaña
   *  se rechazaría al cobrar — hay que avisarlo antes, no descubrirlo con la clienta. */
  campanasNoCargaron?: boolean;
  ventasHoyNode: ReactNode;
  /** «Cobrar» desde Proformas (`/vender?proforma=<id>`, ADR-0167): el carrito arranca con sus prendas. */
  proforma?: ProformaEnCobro | null;
  /** Por qué la proforma pedida no se cargó («ya se cobró», «es de otra tienda»…), para avisarlo. */
  avisoProforma?: string | null;
};

/** La proforma que se está cobrando: lo que la franja muestra y lo que `marcar_proforma_cobrada` necesita. */
export type ProformaEnCobro = {
  id: string;
  numero: string;
  cliente: string | null;
  clienteDoc: string | null;
  lineas: ItemCarrito[];
  /** Lo que no entró al carrito (no hay en esta tienda o no alcanza), con nombre. */
  faltan: string[];
  /** Algo de lo que falta está en el almacén de esta tienda: el aviso dice que lo bajen (D-40). */
  faltanEnAlmacen?: boolean;
  /** Si venció: el texto de la confirmación consciente (`confirmacionDeConversion`); null si sigue valiendo. */
  confirmacion: { titulo: string; detalle: string; casilla: string } | null;
};

export function PuntoDeVenta({ ubicacionId, ubicacionEtiqueta, esLider, puedeCerrarCaja, cajaId, fondoUltimoCierre = null, variantes, listasPrendaLibre, campanasNoCargaron = false, ventasHoyNode, proforma = null, avisoProforma = null }: Props) {
  const bloqueado = cajaId === null;
  const router = useRouter();
  const buscador = useRef<HTMLInputElement>(null);
  const token = useRef<string>(crypto.randomUUID());
  /** Mutex de la subida de la cola offline: mientras haya una pasada en curso, un
   *  segundo disparo (mount/online/latido solapados, o React Strict Mode invocando el
   *  efecto dos veces en desarrollo) espera esa MISMA pasada en vez de lanzar otra — dos
   *  llamadas paralelas a `registrar_venta` con el mismo token chocan en la numeración
   *  del comprobante (429/409) en vez de deduplicarse limpio, medido en este mismo
   *  módulo el 2026-09-16. */
  const subidaEnCursoRef = useRef<Promise<void> | null>(null);

  const [q, setQ] = useState("");
  const [activo, setActivo] = useState(0);
  const [categoria, setCategoria] = useState("Todo");
  /** Filtro «Solo con stock» de la grilla. Prendido cada vez que se entra a Vender (Felipe,
   *  2026-09-18): quien vende busca lo que puede cobrar, y una tarjeta atenuada que no se
   *  puede vender confundía. Apagarlo las muestra atenuadas — así se sabe que existen y que
   *  no hay en la tienda; la fila del filtro dice cuántas esconde. Solo afecta a `catalogo`;
   *  el escáner sigue reconociéndolas. No se recuerda entre visitas a propósito. */
  const [soloConStock, setSoloConStock] = useState(true);
  // Tarjeta de la grilla cuyo modal de talla está abierto (su `clave`). Se guarda la clave y
  // no el grupo: el grupo se vuelve a buscar en `grupos` en cada render, así nunca muestra
  // un stock viejo.
  const [tarjetaElegida, setTarjetaElegida] = useState<string | null>(null);
  const [carrito, setCarrito] = useState<ItemCarrito[]>(() => proforma?.lineas ?? []);
  // La proforma en cobro (ADR-0167): se suelta al cobrar o con «Soltar». Una vencida pide confirmar el precio.
  const [proformaActiva, setProformaActiva] = useState<ProformaEnCobro | null>(proforma);
  const [confirmoVencida, setConfirmoVencida] = useState(false);
  // El ticket tiene dos momentos: «armar» (solo líneas y total) y «cobrar» (pago y
  // comprobante). Vive acá y no en el ticket porque `cobrar()` lo devuelve a «armar».
  const [momento, setMomento] = useState<MomentoTicket>("armar");
  // Apilado (celular/tablet), la barra «Ver ticket» solo sirve mientras el ticket NO está a
  // la vista (Felipe, 2026-09-25): encima del ticket tapaba su pie y repetía el total que
  // ya se lee ahí. Se mide con un IntersectionObserver; se ignoran los 80 px de abajo, que
  // tapa la propia barra — asomar ahí no es «estar viendo el ticket».
  const [ticketALaVista, setTicketALaVista] = useState(false);
  useEffect(() => {
    const ticket = document.getElementById("ticket-pos");
    if (!ticket || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(([e]) => setTicketALaVista(e.isIntersecting), { rootMargin: "0px 0px -80px 0px" });
    observador.observe(ticket);
    return () => observador.disconnect();
  }, []);
  // Pago mixto (decidido con Felipe el 2026-09-14): una fila por medio, sin preselección
  // — un «efectivo» que nadie eligió es un dato fantasma en el cuadre de caja. `cobrar()`
  // no sale hasta que las filas cubran el total al centavo: lo frena `motivoBloqueo`.
  const [pagos, setPagos] = useState<PagoAplicado[]>([]);
  const [descuento, setDescuento] = useState<DescuentoForm>(DESCUENTO_VACIO);
  // Código que autoriza el descuento de una Colaboradora; viaja tal cual y la RPC lo valida.
  const [codigoDescuento, setCodigoDescuento] = useState("");
  // Nota del ticket («lo recoge el sábado»): parte del ticket, no del cobro — el ticket
  // en espera (paso siguiente) la guarda y la recupera con las líneas. No va al comprobante.
  const [nota, setNota] = useState("");
  // El RESPONSABLE de la venta (ADR-0161; reemplaza la fila «Atendió» del ADR-0163): solo quienes están presentes
  // ahora en la tienda, vacío en cada venta, y sin nadie presente no se cobra. Viaja como `p_asesora_id` y como
  // encabezado `x-responsable` (`firmar`), y es el nombre que sale en el papel del ticket. En el Punto de venta NO se
  // propone a quien inició sesión (Felipe, 2026-09-22): quien atiende a la clienta se elige siempre a mano.
  const responsable = useResponsable({ ubicacionId, etiqueta: ubicacionEtiqueta }, { modo: "atencion" });
  // Tickets en espera de ESTA sede. Arranca vacío a propósito y se carga después de
  // montar (efecto más abajo): el servidor no tiene localStorage, y leerlo durante el
  // render dejaría el HTML del servidor distinto del primero del navegador (hidratación).
  const [enEspera, setEnEspera] = useState<TicketEnEspera[]>([]);
  const claveEspera = claveLocal(ubicacionId, "en-espera");
  // Cola de ventas offline (BACKLOG "resiliencia sin internet", ADR-0036 adaptado): a
  // diferencia de `enEspera`, sobrevive el cierre de caja a propósito — una venta ya
  // cobrada en el mostrador no puede perderse solo porque alguien cerró caja antes de
  // que subiera (ADR-0036, addendum "por sede").
  const [cola, setCola] = useState<VentaEncolada[]>([]);
  const claveCola = claveLocal(ubicacionId, "cola");
  // Una proforma a nombre de una empresa (RUC) se cobra con factura; lo demás, boleta.
  const [tipoComprobante, setTipoComprobante] = useState<Extract<TipoComprobante, "boleta" | "factura" | "nota_venta">>(proforma?.clienteDoc?.length === 11 ? "factura" : "boleta");
  const [clienteNumDoc, setClienteNumDoc] = useState(proforma?.clienteDoc ?? "");
  const [clienteNombre, setClienteNombre] = useState(proforma?.cliente ?? "");
  const [aviso, setAviso] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<VentaOk | null>(null);
  const [manualAbierto, setManualAbierto] = useState(false);
  // Teléfono (2026-09-25): no hay lector, así que el campo de escaneo se vuelve un botón que abre la cámara
  // (`EscanerCamara`). La lupa de al lado cambia a buscar por nombre, y la cámara vuelve a estar a un toque.
  const esTelefono = useConsultaMedia(MQ_TELEFONO);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [buscarPorTexto, setBuscarPorTexto] = useState(false);
  const [mostrarVentasHoy, setMostrarVentasHoy] = useState(false);
  const [modalCaja, setModalCaja] = useState<"abrir" | "cerrar" | null>(null);

  // El overlay de la cola offline: lo que ya se vendió sin conexión pero no subió
  // todavía se descuenta EN PANTALLA de `stockAqui`, o una segunda venta sin red vería
  // unidades que ya no existen (ADR-0036). Se aplica ACÁ, antes de derivar catálogo,
  // búsqueda y grilla, así toda la pantalla ve el mismo stock — no solo `cobrar()`.
  //
  // Debajo del overlay, el stock que esta pantalla corrigió tras vender (ADR-0192): antes cada venta recargaba la
  // pantalla entera (`router.refresh()`, ~10 lecturas y ~1 MB); ahora se descuenta lo vendido y se releen SOLO esas
  // prendas (`trasVender`). Si el servidor manda un catálogo nuevo (abrir/cerrar caja, cambiar de sede), manda él.
  const [ajustesStock, setAjustesStock] = useState<Map<string, number>>(() => new Map());
  // El almacén de esta sede, releído de la base con las MISMAS lecturas (sondeo y relectura tras vender). Aparte de
  // `ajustesStock` a propósito: una venta descuenta el piso y nunca el almacén, así que `descontarVendido` no lo toca.
  // Sin releerlo, la caja diría «está en el almacén» de algo que ya se trasladó, o «agotada» de lo que acaba de llegar.
  const [ajustesAlmacen, setAjustesAlmacen] = useState<Map<string, number | null>>(() => new Map());
  const [variantesPrevias, setVariantesPrevias] = useState(variantes);
  if (variantes !== variantesPrevias) {
    setVariantesPrevias(variantes);
    setAjustesStock(new Map());
    setAjustesAlmacen(new Map());
  }
  // Sube tras cada venta: «Ventas de hoy» se relee sola (`VentasDeHoyLista`).
  const [versionVentas, setVersionVentas] = useState(0);
  const variantesAjustadas = useMemo(
    () => conStockAjustado(conAlmacenAjustado(variantes, ajustesAlmacen), ajustesStock),
    [variantes, ajustesAlmacen, ajustesStock],
  );
  const variantesConOverlay = useMemo(() => conStockComprometidoDescontado(variantesAjustadas, cola), [variantesAjustadas, cola]);
  const variantesVisibles = useMemo(() => variantesConOverlay.filter((v) => v.varianteId !== ID_CARGO_ESPECIAL), [variantesConOverlay]);
  // El ticket topa con el piso de AHORA (`conPisoAlDia`): cada línea guarda el piso de cuando se agregó, y sin esto
  // seguía topada ahí aunque ya hubieran bajado más del almacén — el + apagado y el aviso pidiendo bajar lo que ya se
  // bajó. Lo usan el ticket (el +, el máximo) y `cambiarCantidad`; el mismo piso con el que `agregar()` decide el tope.
  const carritoConPiso = useMemo(() => conPisoAlDia(carrito, variantesVisibles), [carrito, variantesVisibles]);

  const categorias = useMemo(() => {
    const vistas = new Set<string>();
    for (const v of variantesVisibles) if (v.categoria) vistas.add(v.categoria);
    return ["Todo", ...Array.from(vistas).sort((a, b) => a.localeCompare(b, "es"))];
  }, [variantesVisibles]);

  // La grilla es el plan B (cuando la etiqueta no lee): filtra por categoría y agrupa
  // una tarjeta por prenda + color con sus tallas adentro (`lib/catalogo-grupos.ts`).
  // «Solo con stock» esconde la tarjeta entera cuando ninguna talla tiene stock — una
  // talla agotada dentro de una prenda con stock sigue a la vista, tachada. `resultados`
  // (el escáner) NO se filtra: una prenda sin stock escaneada debe decir «sin stock en
  // esta sede», no «no encontramos».
  const catalogo = useMemo(
    () => (categoria === "Todo" ? variantesVisibles : variantesVisibles.filter((v) => v.categoria === categoria)),
    [variantesVisibles, categoria]
  );
  const { grupos, ocultasSinStock, ocultasEnAlmacen } = useMemo(() => {
    const todos = agruparCatalogo(catalogo);
    const visibles = soloConStock ? todos.filter((g) => g.stockTotal > 0) : todos;
    // De las escondidas, las que tienen prendas en el almacén de esta sede no están agotadas (D-40): el contador lo dice.
    const enAlmacen = soloConStock ? todos.filter((g) => g.stockTotal <= 0 && g.almacenTotal > 0).length : 0;
    return { grupos: visibles, ocultasSinStock: todos.length - visibles.length, ocultasEnAlmacen: enAlmacen };
  }, [catalogo, soloConStock]);
  const grupoElegido = tarjetaElegida ? grupos.find((g) => g.clave === tarjetaElegida) : undefined;
  // Tarjeta que se tiñe de rojo un momento cuando se pide más de lo que hay. `pulso` sube en
  // cada intento para que el resaltado vuelva a sonar aunque sea la misma tarjeta. Si la
  // prenda no está en la grilla (otra categoría), el aviso de arriba igual sale.
  const [topeTarjeta, setTopeTarjeta] = useState<{ clave: string; pulso: number } | null>(null);
  function resaltarTope(varianteId: string) {
    const g = grupos.find((x) => x.tallas.some((t) => t.variante.varianteId === varianteId));
    if (g) setTopeTarjeta((t) => ({ clave: g.clave, pulso: (t?.pulso ?? 0) + 1 }));
  }

  const term = q.trim();
  const resultados = useMemo(() => filtrarPrendasV2(q, variantesVisibles, MAX_RESULTADOS), [variantesVisibles, q]);

  // Los modales de caja se montan con la misma condición que los pinta el JSX de abajo —
  // no basta `modalCaja !== null`: «Abrir caja» se desmonta porque `bloqueado` pasa a
  // false (la caja ya abrió), no por su onClose, y `modalCaja` se queda en "abrir".
  const modalAbrirVisible = modalCaja === "abrir" && bloqueado;
  const modalCerrarVisible = modalCaja === "cerrar" && cajaId !== null;
  // Los dos efectos de foco de abajo se apagan con un modal abierto: el modal es dueño
  // del foco mientras vive, y al cerrarse lo devuelve él mismo (`alCerrarEnfocar`).
  const hayModal = manualAbierto || camaraAbierta || modalAbrirVisible || modalCerrarVisible || ok !== null;

  // El escáner es la ruta principal de la caja, así que el foco vuelve a él solo.
  // `autoFocus` del campo solo actúa al montar — y si la pantalla cargó con la caja
  // cerrada, el campo se montó `disabled`. Al abrir caja, `router.refresh()` trae el
  // `cajaId`, el campo se habilita y esto lo enfoca.
  useEffect(() => {
    if (!bloqueado && !hayModal) buscador.current?.focus();
  }, [bloqueado, hayModal]);

  // Las campañas de hoy no cargaron: se avisa AL ABRIR, no al rechazar un cobro con la
  // clienta delante (Werner: la dependencia ya está caída, dilo antes).
  useEffect(() => {
    if (campanasNoCargaron) {
      avisar.aviso("No se pudieron cargar las campañas de hoy. Recarga Vender antes de cobrar: una prenda en campaña se rechazaría.");
    }
  }, [campanasNoCargaron]);

  // Bloque E: la pistola escribe donde esté el foco. Si quedó en un botón (un chip,
  // «Quitar», «Cobrar»), el código se perdería y el Enter final activaría ese botón.
  // Cualquier carácter suelto que llegue con el foco fuera de un campo de texto va al
  // escáner — nunca con un modal abierto ni con la caja cerrada (el campo está
  // deshabilitado). La regla de qué tecla cuenta está en `lib/`, con prueba.
  useEffect(() => {
    if (bloqueado || hayModal) return;
    function alTeclaSuelta(e: KeyboardEvent) {
      if (teclaSueltaVaAlEscaner(e, document.activeElement)) buscador.current?.focus();
    }
    window.addEventListener("keydown", alTeclaSuelta);
    return () => window.removeEventListener("keydown", alTeclaSuelta);
  }, [bloqueado, hayModal]);

  useEffect(() => {
    // Hidratar desde localStorage al montar es el patrón correcto en Next (no existe en
    // el servidor y leerlo durante el render desincroniza la hidratación); la regla lo
    // marca igual. Misma decisión que el BACKLOG registró el 2026-09-10 para la cola.
    // Mira la caja: si se cerró desde /caja y hoy se abre Vender con la caja aún cerrada,
    // el efecto de abajo borra la llave pero este ya había cargado los tickets de ayer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnEspera(esperaAlCargar(bloqueado, leer<TicketEnEspera[]>(claveEspera, [])));
  }, [bloqueado, claveEspera]);

  useEffect(() => {
    // Misma razón que arriba: no existe `localStorage` en el servidor. A diferencia de
    // `enEspera`, la cola NO se filtra por `bloqueado` — sobrevive el cierre de caja
    // a propósito (ver el estado `cola`, arriba).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCola(leer<VentaEncolada[]>(claveCola, []));
  }, [claveCola]);

  // La subida de la cola corre en un efecto que no se vuelve a crear en cada render: lee la versión al día por ref.
  const trasVenderRef = useRef(trasVender);
  useEffect(() => {
    trasVenderRef.current = trasVender;
  });

  // Trío de sincronización de la cola offline (ADR-0036 + addendum "por sede"): corre
  // siempre que la pantalla esté montada, tenga o no la sede una caja abierta ahora
  // mismo — al montar, al volver la red (evento `online`) y con un latido de 30 s por si
  // el navegador nunca dispara ese evento. No depende del estado `cola` que pinta la
  // pantalla: lee y escribe `localStorage` directo en cada intento, y reconcilia por
  // `token` contra una lectura FRESCA al final — así una venta que `cobrar()` encola a
  // mitad de una subida no se pierde si el intento anterior termina y sobreescribe con
  // una foto vieja. Una venta ya rechazada (`rechazo !== null`) no se reintenta sola
  // (addendum "Descartar": repetiría el mismo rechazo cada 30 s sin decir nada útil).
  useEffect(() => {
    let cancelado = false;
    const supabase = createClient();

    async function pasada() {
      const inicio = leer<VentaEncolada[]>(claveCola, []);
      const aReintentar = inicio.filter((v) => v.rechazo === null);
      if (aReintentar.length === 0) return;

      const resueltos = new Map<string, VentaEncolada | null>();
      const subidas: { varianteId: string; cantidad: number }[] = [];
      for (const venta of aReintentar) {
        // Sube con el responsable que se eligió al cobrar y la HORA DE LA VENTA (`x-momento`), no la de ahora (ADR-0162),
        // y después la manda sola a SUNAT (D-60), igual que un cobro en línea.
        const { data: ventaSubida, error } = await firmar(supabase.rpc("registrar_venta", venta.params), firmaDeVentaEncolada(venta));
        if (!error) {
          resueltos.set(venta.token, null);
          subidas.push(...venta.items);
          if (ventaSubida) enviarVentaASunat(ventaSubida);
        }
        else if (!esFalloDeRed(error)) resueltos.set(venta.token, { ...venta, rechazo: traducirError(error, "subir la venta guardada sin conexión") });
        // sigue siendo fallo de red: no se toca, se reintenta en el próximo latido
      }
      if (cancelado || resueltos.size === 0) return;

      const actual = leer<VentaEncolada[]>(claveCola, []);
      const final = actual.flatMap((v) => {
        if (!resueltos.has(v.token)) return [v];
        const actualizada = resueltos.get(v.token) ?? null;
        return actualizada ? [actualizada] : [];
      });
      guardar(claveCola, final);
      if (!cancelado) {
        // La venta sale de la cola (el overlay deja de descontarla) y entra al stock de la pantalla: mismo
        // camino que un cobro en línea, sin recargar la caja entera (ADR-0192).
        setCola(final);
        if (subidas.length > 0) trasVenderRef.current(subidas);
      }
    }

    // Mutex: si ya hay una pasada en curso, este disparo espera esa MISMA promesa en vez
    // de lanzar una paralela (ver el comentario de `subidaEnCursoRef`, arriba).
    function intentarSubir(): Promise<void> {
      if (!subidaEnCursoRef.current) {
        subidaEnCursoRef.current = pasada().finally(() => {
          subidaEnCursoRef.current = null;
        });
      }
      return subidaEnCursoRef.current;
    }

    intentarSubir();
    window.addEventListener("online", intentarSubir);
    const latido = setInterval(intentarSubir, 30_000);
    return () => {
      cancelado = true;
      window.removeEventListener("online", intentarSubir);
      clearInterval(latido);
    };
  }, [claveCola]);

  /** Relee de la base lo cobrable AQUÍ de unas prendas (lectura directa de `stock`, la misma de
   *  `getDisponibleEnSede` pero solo de esas filas; un GET no enciende el loader) y lo deja en pantalla.
   *  Sin `ids`, relee TODA la sede — la usa el sondeo de stock en vivo, de abajo. Devuelve lo releído (piso Y
   *  almacén: quien arma un aviso en el mismo instante no puede esperar a que el estado se pinte), o null si no se
   *  pudo: la pantalla se queda con lo que ya mostraba. */
  async function releerStock(ids?: string[]): Promise<StockReleido | null> {
    const conocidos = variantes.filter((v) => v.varianteId !== ID_CARGO_ESPECIAL).map((v) => v.varianteId);
    const releido = await leerStockDeSede(ubicacionId, conocidos, ids);
    if (!releido) return null;
    setAjustesStock((prev) => new Map([...prev, ...releido.cobrable]));
    setAjustesAlmacen((prev) => new Map([...prev, ...releido.almacen]));
    return releido;
  }

  /**
   * Stock en vivo (2026-09-25, reporte de Felipe): escaneando con la cámara del teléfono leyó una prenda
   * «agotada»; la repusieron en otra máquina con la cámara todavía abierta y no se sumó hasta reiniciar el
   * navegador — nada releía `stock` mientras la pantalla seguía montada. Afecta igual al lector físico: no es
   * un problema de la cámara, es que esta pantalla nunca se actualizaba sola. Mismo hook que Apartados y
   * Cambios (`lib/useStockEnVivo.ts`) — no sondea con la caja cerrada (bloqueado: no hay nada que cobrar igual).
   */
  useStockEnVivo(
    ubicacionId,
    useMemo(() => variantes.filter((v) => v.varianteId !== ID_CARGO_ESPECIAL).map((v) => v.varianteId), [variantes]),
    !bloqueado,
    (releido, almacen) => {
      setAjustesStock((prev) => new Map([...prev, ...releido]));
      setAjustesAlmacen((prev) => new Map([...prev, ...almacen]));
    },
  );

  /** Tras una venta que la base aceptó (en línea o al subir la cola): descuenta lo vendido al instante, relee esas
   *  prendas y la lista de ventas de hoy. Reemplaza al `router.refresh()` de antes (ADR-0192). */
  function trasVender(vendidas: { varianteId: string; cantidad: number }[]) {
    const stockServidor = new Map(variantes.map((v) => [v.varianteId, v.stockAqui]));
    setAjustesStock((prev) => descontarVendido(prev, stockServidor, vendidas));
    setVersionVentas((n) => n + 1);
    void releerStock(vendidas.map((v) => v.varianteId));
  }

  function descartarRechazada(token: string) {
    const restante = cola.filter((v) => v.token !== token);
    setCola(restante);
    if (!guardar(claveCola, restante)) avisar.aviso("No se pudo actualizar la lista guardada en este navegador.");
  }

  // Al cerrar caja se vacía la espera de la sede (decisión de Felipe): un ticket de ayer
  // no sobrevive a la caja de hoy. `CerrarCajaModalV2` refresca y `cajaId` llega null. El
  // estado se ajusta durante el render (patrón «previo + comparación» que documenta React)
  // y el efecto solo toca el sistema externo: borra la llave.
  const [bloqueadoPrevio, setBloqueadoPrevio] = useState(bloqueado);
  if (bloqueado !== bloqueadoPrevio) {
    setBloqueadoPrevio(bloqueado);
    if (bloqueado) setEnEspera([]);
  }
  useEffect(() => {
    if (bloqueado) borrar(claveEspera);
  }, [bloqueado, claveEspera]);

  // Reflujo suave de las líneas del ticket al agregar/quitar una prenda (Flip, ADR-0038
  // — vuelve de V1 por ADR-0045): se captura la posición ANTES de que cambie la lista y
  // GSAP anima desde ahí hacia la nueva, en vez de que las filas salten. Solo se captura
  // cuando la lista cambia de largo — subir la cantidad no reordena nada. El ref vive acá
  // y el ticket solo lo recibe: sigue sin hooks (ADR-0043).
  const listaTicket = useRef<HTMLDivElement>(null);
  const flipState = useRef<Flip.FlipState | null>(null);
  function capturarFlip() {
    if (listaTicket.current) flipState.current = Flip.getState(listaTicket.current.children);
  }
  useGSAP(() => {
    if (!flipState.current) return;
    Flip.from(flipState.current, {
      duration: 0.32,
      ease: "caylaEase",
      // Solo la fila que SALE se saca del flujo (`position: absolute`) para poder
      // deslizarse encima de las demás sin arrastrarlas. Con `absolute: true` (como
      // estaba) TODAS las filas —también las que se quedan y la que entra— salían del
      // flujo mientras duraba la animación: el contenedor de la lista perdía su alto
      // real y, si el ticket ya llenaba el scroll, la fila nueva se dibujaba superpuesta
      // a las demás hasta que Flip terminaba y las devolvía a su lugar (bug reportado
      // 2026-09-17: "parpadeo" al agregar una prenda que excede el largo del ticket).
      absoluteOnLeave: true,
      onEnter: (elementos) => gsap.fromTo(elementos, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.32, ease: "caylaEase" }),
      onLeave: (elementos) => gsap.to(elementos, { opacity: 0, duration: 0.18 }),
    });
    flipState.current = null;
  }, [carrito.length]);

  const clienteTipoDoc = tipoDocumentoDeCliente(tipoComprobante, clienteNumDoc);
  const facturaSinRuc = tipoComprobante === "factura" && !clienteNumDoc;

  /** Suma una unidad al ticket y dice qué pasó (la cámara lo muestra en su hoja; el lector no lo necesita). */
  /** `silencioso`: la cámara (`EscanerCamara`) ya dice qué pasó en su tarjeta y su bandeja; el aviso de arriba a la derecha
   *  repetiría lo mismo tapándole la ✕. */
  function agregar(v: VarianteBusqueda, { silencioso = false }: { silencioso?: boolean } = {}): "agregada" | "agotada" | "en_almacen" | "tope" | null {
    if (bloqueado) return null;
    // Los avisos de stock salen como notificación (`avisar`, arriba a la derecha): la línea
    // inline de debajo del escáner pasaba desapercibida. No toman el foco ni bloquean nada.
    const nombreVariante = [v.referencia, v.talla].filter(Boolean).join(" · ");
    const datosAviso = { nombre: nombreVariante, sede: ubicacionEtiqueta, stockAqui: v.stockAqui, almacenAqui: v.almacenAqui };
    // Con el piso en 0 no entra al ticket (la venta descuenta el piso), pero no es lo mismo «agotada» que «está en el
    // almacén de esta tienda»: el aviso dice cuál y qué hacer (D-40, `lib/vender-stock-local.ts`).
    const motivo = motivoNoCobrable(v);
    if (motivo !== "cobrable") {
      if (!silencioso) {
        const { titulo, detalle } = avisoSinPiso(datosAviso);
        avisar.aviso(titulo, { detalle });
      }
      setAviso(null);
      setQ("");
      setActivo(0);
      buscador.current?.focus();
      return motivo;
    }
    const existente = carrito.find((it) => it.claveLinea === v.varianteId);
    const tope = existente !== undefined && existente.cantidad >= v.stockAqui;
    if (!tope) {
      // Solo si va a entrar una fila nueva — subir la cantidad de una que ya estaba no
      // reordena nada.
      if (!existente) capturarFlip();
      setCarrito((actual) => {
        const ya = actual.find((it) => it.claveLinea === v.varianteId);
        if (!ya) {
          // Una prenda con campaña vigente entra con su descuento ya aplicado.
          return [
            ...actual,
            conDescuentoDeCampana({
              claveLinea: v.varianteId,
              varianteId: v.varianteId,
              referencia: v.referencia,
              sku: v.sku,
              codigo: v.codigo,
              cantidad: 1,
              precioUnitario: v.precio,
              descuentoUnitario: 0,
              stockAqui: v.stockAqui,
              razonDescuento: "",
              razonDescuentoOtro: "",
              argumentoDescuento: "",
              campana: v.campana ?? null,
            }),
          ];
        }
        if (ya.cantidad >= v.stockAqui) return actual;
        return actual.map((it) => (it.claveLinea === v.varianteId ? { ...it, cantidad: it.cantidad + 1 } : it));
      });
    }
    if (tope) {
      resaltarTope(v.varianteId);
      if (!silencioso) {
        const { titulo, detalle } = avisoTope(datosAviso);
        avisar.aviso(titulo, { detalle });
      }
    }
    setAviso(null);
    setQ("");
    setActivo(0);
    buscador.current?.focus();
    return tope ? "tope" : "agregada";
  }

  /** Lo que la cámara no pudo meter al ticket porque, según el sistema, está en el almacén (por prenda, sin repetir).
   *  La cámara no pinta el aviso largo —le taparía la ✕—: al cerrarla sale UNO solo con qué quedó fuera y qué hacer
   *  (`cerrarCamara`). Una lectura posterior de la misma prenda que sí entra (la bajaron mientras tanto) la saca. */
  const quedaronEnAlmacen = useRef<Map<string, string>>(new Map());

  /** Una lectura de la cámara: el mismo camino que el Enter del lector (`alTeclado`), sin la lista de resultados —
   *  un QR es un código exacto o no es nada. */
  function alEscanear(codigo: string): ResultadoEscaneo {
    const v = resolverCodigoV2(codigo, variantesVisibles);
    if (!v) return { estado: "no-encontrada", codigo };
    const nombre = [v.referencia, v.talla].filter(Boolean).join(" · ");
    const prenda = { referencia: v.referencia, detalle: [v.color, v.talla].filter(Boolean).join(" · "), precio: v.precio, fotoUrl: v.fotoUrl };
    const estado = agregar(v, { silencioso: true }) ?? "agotada";
    if (estado === "en_almacen" || (estado === "tope" && (v.almacenAqui ?? 0) > 0)) quedaronEnAlmacen.current.set(v.varianteId, nombre);
    else if (estado === "agregada") quedaronEnAlmacen.current.delete(v.varianteId);
    return { estado, codigo, nombre, prenda, almacen: v.almacenAqui };
  }

  /** Cierra la cámara y, si algo quedó fuera por estar en el almacén, lo dice una sola vez (ya sin la hoja encima). */
  function cerrarCamara() {
    setCamaraAbierta(false);
    const aviso = avisoQuedaronEnAlmacen([...quedaronEnAlmacen.current.values()], ubicacionEtiqueta);
    quedaronEnAlmacen.current.clear();
    if (aviso) avisar.aviso(aviso.titulo, { detalle: aviso.detalle });
  }

  function agregarPrendaSinRegistrar(d: DatosPrendaSinRegistrar) {
    if (bloqueado) return;
    capturarFlip();
    setCarrito((actual) => [
      ...actual,
      {
        claveLinea: `manual-${Date.now()}`,
        varianteId: ID_CARGO_ESPECIAL,
        // La descripción de caja es el nombre de la línea en el ticket y en el comprobante.
        referencia: d.descripcion,
        sku: "SIN-REGISTRAR",
        prendaLibre: { descripcion: d.descripcion, categoriaId: d.categoriaId, tallaId: d.tallaId, colorCodigo: d.colorCodigo },
        codigo: null,
        cantidad: 1,
        precioUnitario: d.precio,
        descuentoUnitario: 0,
        // Una por línea: cada prenda sin registrar se regulariza por separado (la base exige cantidad 1).
        stockAqui: 1,
        razonDescuento: "",
        razonDescuentoOtro: "",
        argumentoDescuento: "",
        campana: null,
      },
    ]);
    setManualAbierto(false);
  }

  function quitar(claveLinea: string) {
    capturarFlip();
    setCarrito((actual) => actual.filter((it) => it.claveLinea !== claveLinea));
    setAviso(null);
  }

  // El precio lo fija el catálogo: en la caja solo se decide la cantidad (y aparte, un
  // descuento). El «Monto manual» sigue trayendo su propio precio al crear la línea.
  function cambiarCantidad(claveLinea: string, valor: number) {
    const item = carritoConPiso.find((it) => it.claveLinea === claveLinea);
    if (!item) return;
    const cantidad = Math.max(1, Math.min(valor || 1, item.stockAqui));
    if (valor > item.stockAqui) {
      resaltarTope(item.varianteId);
      // El tope es el piso de ahora (`carritoConPiso`); si en el almacén hay más, el aviso lo dice (la línea del ticket
      // no guarda el almacén: se mira en el catálogo de la caja, que está al día).
      const almacenAqui = variantesConOverlay.find((x) => x.varianteId === item.varianteId)?.almacenAqui;
      const { titulo, detalle } = avisoTope({ nombre: item.referencia, sede: ubicacionEtiqueta, stockAqui: item.stockAqui, almacenAqui, quedoEn: true });
      avisar.aviso(titulo, { detalle });
    }
    setAviso(null);
    setCarrito((actual) => actual.map((it) => (it.claveLinea === claveLinea ? { ...it, cantidad } : it)));
  }

  // Apartado «Descuento» (decidido con Felipe el 2026-09-14): un solo formulario con dos
  // entradas — la fila sobre el total (todo el ticket) y el % de cada línea. Se
  // aplica como `descuentoUnitario` por línea, que es lo que `venta_items` guarda, junto
  // con el motivo (R-45, 2026-09-15) — `registrar_venta` exige los dos juntos.
  function abrirDescuento(claves: string[] | null) {
    setDescuento({ ...DESCUENTO_VACIO, elegidas: claves });
    setMomento("descuento");
  }
  function aplicarDescuentoAlTicket() {
    const claves = descuento.elegidas ?? [];
    const detalle: DetalleDescuento = { razon: descuento.razon, razonOtro: descuento.razonOtro, argumento: descuento.argumento };
    // Un solo descuento por prenda, el mayor: si en alguna línea la campaña da igual o
    // más que lo pedido, se queda la campaña — y se dice, para que no parezca que el
    // descuento «no entró».
    const cedieron = carrito.filter((it) => {
      if (!it.campana || (claves.length > 0 && !claves.includes(it.claveLinea))) return false;
      const monto = descuentoUnitarioPorPorcentaje(it.precioUnitario, Number(descuento.pct));
      return Number(monto) > 0 && descuentoResultante(it, monto).prevaleceCampana;
    });
    if (cedieron.length > 0) {
      avisar.aviso(
        `${cedieron.map((it) => `${it.referencia} (${it.campana?.nombre})`).join(", ")} ya tiene${cedieron.length > 1 ? "n" : ""} una campaña con igual o más descuento: se mantiene la campaña.`,
      );
    }
    setCarrito((actual) => aplicarDescuento(actual, Number(descuento.pct), claves, detalle));
    setMomento("armar");
  }
  function quitarDescuentoDelTicket() {
    setCarrito((actual) => aplicarDescuento(actual, 0, descuento.elegidas ?? [], SIN_DETALLE_DESCUENTO));
    setMomento("armar");
  }

  // Ticket en espera (Park/Resume): guarda el actual y deja la caja libre. Sin reserva
  // de stock — la RPC valida al cobrar, como siempre; acá solo se avisa por nombre.
  function persistirEspera(lista: TicketEnEspera[]) {
    setEnEspera(lista);
    if (!guardar(claveEspera, lista)) avisar.aviso("No se pudo guardar la espera en este navegador: el ticket sigue acá, pero no sobrevivirá a una recarga.");
  }
  function limpiarTicket() {
    setCarrito([]);
    setNota("");
    setCodigoDescuento("");
    setPagos([]);
    setDescuento(DESCUENTO_VACIO);
    responsable.limpiar();
    setMomento("armar");
  }
  function dejarEnEspera() {
    if (carrito.length === 0) return;
    if (enEspera.length >= TOPE_ESPERA) {
      avisar.error(`Ya hay ${TOPE_ESPERA} tickets en espera en ${ubicacionEtiqueta}. Retoma o cobra uno antes de dejar otro.`);
      return;
    }
    capturarFlip();
    persistirEspera([...enEspera, { id: crypto.randomUUID(), creadoEn: new Date().toISOString(), carrito, nota, codigoDescuento }]);
    limpiarTicket();
    buscador.current?.focus();
  }
  function retomar(id: string) {
    const ticket = enEspera.find((t) => t.id === id);
    if (!ticket) return;
    // Si el ticket actual tiene líneas, se intercambian: el actual ocupa el lugar del retomado.
    const actual: TicketEnEspera | null =
      carrito.length > 0 ? { id: crypto.randomUUID(), creadoEn: new Date().toISOString(), carrito, nota, codigoDescuento } : null;
    persistirEspera(enEspera.map((t) => (t.id === id ? actual : t)).filter((t): t is TicketEnEspera => t !== null));
    // Un ticket guardado antes de que el carrito llevara `codigo` vuelve sin él: se
    // completa acá, la única puerta por la que algo del navegador vuelve al carrito.
    const lineas = conCampanas(
      conCodigoDelCatalogo(ticket.carrito, variantesVisibles),
      new Map(variantesVisibles.flatMap((v) => (v.campana ? [[v.varianteId, v.campana] as const] : []))),
    );
    capturarFlip();
    setCarrito(lineas);
    setNota(ticket.nota);
    setCodigoDescuento(ticket.codigoDescuento);
    // El responsable NO vuelve con el ticket: se elige en cada cobro (ADR-0161, A6).
    responsable.limpiar();
    setPagos([]);
    setMomento("armar");
    // Lo que la pantalla sabe del stock (refrescado tras cada venta): si algo ya no alcanza,
    // se avisa por nombre y se deja seguir — la base tiene la última palabra al cobrar. Si lo que
    // falta está en el almacén de esta sede, el aviso lo dice en vez de «ya no hay» (D-40).
    const cortas = lineas.flatMap((it) => {
      const v = variantesConOverlay.find((x) => x.varianteId === it.varianteId);
      return it.varianteId !== ID_CARGO_ESPECIAL && v !== undefined && it.cantidad > v.stockAqui
        ? [{ nombre: `${it.referencia} (${codigoPrenda(it)})`, piso: v.stockAqui, almacen: v.almacenAqui }]
        : [];
    });
    if (cortas.length > 0) {
      const { titulo, detalle } = avisoCortas(cortas, ubicacionEtiqueta);
      avisar.aviso(titulo, { detalle });
    }
  }

  function alTeclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!term) return;
      const exacta = resolverCodigoV2(q, variantesVisibles);
      if (exacta) return agregar(exacta);
      if (resultados.length > 0) return agregar(resultados[Math.min(activo, resultados.length - 1)]);
      setAviso(`No encontramos «${q.trim()}» en ${ubicacionEtiqueta}.`);
      return;
    }
    if (e.key === "ArrowDown" && resultados.length > 0) {
      e.preventDefault();
      setActivo((i) => (i + 1) % resultados.length);
      return;
    }
    if (e.key === "ArrowUp" && resultados.length > 0) {
      e.preventDefault();
      setActivo((i) => (i - 1 + resultados.length) % resultados.length);
      return;
    }
    if (e.key === "Escape" && q !== "") {
      e.preventDefault();
      setQ("");
      setActivo(0);
      setAviso(null);
    }
  }

  const total = carrito.reduce((acc, it) => acc + it.cantidad * (it.precioUnitario - it.descuentoUnitario), 0);
  const prendas = carrito.reduce((acc, it) => acc + it.cantidad, 0);

  // Un solo motivo para las tres cosas: el `disabled` del botón del ticket, la línea
  // que lo explica debajo, y el freno de `cobrar()`. Derivado acá y no en el ticket
  // porque `cobrar()` también lo necesita — ver `motivoBloqueoCobro`.
  const restante = restanteDePagos(total, pagos);
  const vuelto = pagos.reduce((acc, p) => acc + vueltoDe(p), 0);
  // Sin responsable vigente no se cobra (ni se pasa a «cobrar»): su frase explica el botón apagado.
  const motivoBloqueo = motivoBloqueoCobro({
    cajaAbierta: !bloqueado,
    prendas,
    momento,
    total,
    pagos,
    facturaSinRuc,
    motivoResponsable: responsable.motivo,
    proformaVencidaSinConfirmar: proformaActiva?.confirmacion != null && !confirmoVencida,
  });

  // Al llegar desde «Cobrar»: se dice qué no entró al carrito y por qué no se cargó una proforma. Una sola vez
  // (el ref evita el doble aviso del modo estricto de React en desarrollo).
  const avisadoProforma = useRef(false);
  useEffect(() => {
    if (avisadoProforma.current) return;
    avisadoProforma.current = true;
    if (avisoProforma) avisar.aviso(avisoProforma);
    if (proforma && proforma.faltan.length > 0) {
      // Al ticket entra solo lo del piso (la venta descuenta el piso). Si algo de lo que falta está en el almacén de esta
      // tienda, se dice qué hacer en vez de dejarlo como «no hay» (D-40).
      avisar.aviso(`No todo lo de ${proforma.numero} entró al ticket`, {
        detalle: `${proforma.faltan.join("; ")}. ${
          proforma.faltanEnAlmacen
            ? "Al ticket entra solo lo del piso: pide que bajen lo del almacén y agrégalo."
            : "En el piso de esta tienda no hay (o no alcanza)."
        }`,
      });
    }
  }, [avisoProforma, proforma]);

  function soltarProforma() {
    setProformaActiva(null);
    setConfirmoVencida(false);
    setCarrito([]);
    limpiarComprobante();
    router.replace("/vender");
  }

  // Tocar un medio agrega su fila con lo que falta cubrir; combinar es bajar un monto y
  // tocar otro medio. Una fila por medio: tocar uno que ya está no duplica.
  function agregarPago(metodo: MetodoPago) {
    if (pagos.some((p) => p.metodo === metodo)) return;
    setPagos((actual) => [...actual, { metodo, monto: Math.max(0, restante) }]);
  }
  // Con dos medios, al editar uno el otro toma lo que falta (`pagosTrasEditarMonto`).
  function cambiarMontoPago(indice: number, monto: number) {
    setPagos((actual) => pagosTrasEditarMonto(actual, indice, monto, total));
  }
  // Quitar un medio (el basurero o tocarlo otra vez arriba) pasa su monto al siguiente: si no,
  // quitar el que llevaba el total dejaba al resto en 0 y la cajera lo reescribía.
  function quitarPago(indice: number) {
    setPagos((actual) => quitarPagoTraspasando(actual, indice));
  }
  // Atajos F1–F5 (ver `metodoDeAtajo`): la cajera no suelta el lector para pagar.
  //  · En «cobrar» la tecla hace lo mismo que tocar el medio: lo agrega con lo que falta, y si ya
  //    estaba lo quita (su monto pasa al siguiente).
  //  · En «armar», con prendas en el ticket, paga TODO con ese medio y salta al cobro — la tecla
  //    es una elección explícita de la cajera, no un default (ADR-0044). Sin prendas no se toca
  //    la tecla: F5 sigue recargando la página.
  // Solo con la caja abierta y ningún modal a la vista (el de talla también), como el escáner.
  // Sin arreglo de dependencias a propósito: se vuelve a enganchar en cada render para leer los
  // pagos y el total de ESTE cuadro, sin cerrar sobre valores viejos; enganchar un `keydown` es barato.
  useEffect(() => {
    if (bloqueado || hayModal || grupoElegido) return;
    function alAtajo(e: KeyboardEvent) {
      const metodo = metodoDeAtajo(e);
      if (!metodo) return;
      if (momento === "cobrar") {
        e.preventDefault(); // F1 abriría la ayuda de Chrome; F5 recargaría y perdería el ticket
        const i = pagos.findIndex((p) => p.metodo === metodo);
        if (i === -1) agregarPago(metodo);
        else quitarPago(i);
      } else if (momento === "armar" && prendas > 0) {
        e.preventDefault();
        setPagos([{ metodo, monto: Math.max(0, total) }]);
        setMomento("cobrar");
      }
    }
    window.addEventListener("keydown", alAtajo);
    return () => window.removeEventListener("keydown", alAtajo);
  });

  // Lo que la clienta entregó en efectivo. Viaja a la RPC en su propia clave (`recibido`,
  // aparte de `monto`, que es lo que cubre) solo si alcanza — ver `pagosParaRpc` — para poder
  // reimprimir el ticket con su vuelto.
  function cambiarRecibido(monto: number | null) {
    setPagos((actual) => actual.map((p) => (p.metodo === "efectivo" ? { ...p, recibido: monto ?? undefined } : p)));
  }

  function limpiarComprobante() {
    setTipoComprobante("boleta");
    setClienteNumDoc("");
    setClienteNombre("");
  }

  async function cobrar(e: React.FormEvent) {
    e.preventDefault();
    // El mismo motivo que apaga el botón frena acá.
    if (momento !== "cobrar" || motivoBloqueo !== null) {
      if (motivoBloqueo) avisar.error(motivoBloqueo);
      return;
    }
    setLoading(true);

    const params: ParamsRegistrarVenta = {
      p_ubicacion_id: ubicacionId,
      p_items: carrito.map((it) => ({
        variante_id: it.varianteId,
        cantidad: it.cantidad,
        precio_unitario: it.precioUnitario,
        descuento_unitario: it.descuentoUnitario,
        // Sin descuento viajan como `undefined` (la clave ni aparece en el jsonb) — la
        // RPC los lee con `coalesce(..., '')` y no le importa la diferencia.
        motivo_descuento: it.razonDescuento || undefined,
        motivo_descuento_detalle: it.razonDescuentoOtro || undefined,
        argumento_descuento: it.argumentoDescuento || undefined,
        // Solo el descuento de campaña dice de qué etiqueta vino; la base lo verifica.
        descuento_etiqueta_id: it.razonDescuento === RAZON_CAMPANA ? it.campana?.etiquetaId : undefined,
        // «Prenda sin registrar» (ADR-0179): la base exige estos cuatro para dejarla por regularizar.
        descripcion_libre: it.prendaLibre?.descripcion,
        categoria_id: it.prendaLibre?.categoriaId,
        talla_id: it.prendaLibre?.tallaId,
        color_codigo: it.prendaLibre?.colorCodigo,
      })),
      // Solo montos > 0 (`venta_pagos` lo exige; una fila bajada a cero mientras se combinaba no
      // viaja). El `recibido` del efectivo va aparte de `monto`, y solo si lo cubre.
      p_pagos: pagosParaRpc(pagos),
      p_token: token.current,
      p_tipo_comprobante: tipoComprobante,
      p_cliente_tipo_doc: clienteTipoDoc,
      p_cliente_num_doc: clienteNumDoc || undefined,
      p_cliente_nombre: clienteNombre || undefined,
      p_codigo_descuento: codigoDescuento.trim() || undefined,
      p_nota: nota.trim() || undefined,
      // El responsable elegido en el combo (ADR-0161): la venta queda a su nombre (ADR-0163, `asesora_id`).
      p_asesora_id: responsable.elegidoId ?? undefined,
    };

    const supabase = createClient();
    const { data: ventaId, error } = await firmar(supabase.rpc("registrar_venta", params), responsable.firma());

    if (error) {
      // Sin red: no es un rechazo del servidor, es que el envío no llegó. Se intenta
      // encolar (BACKLOG "resiliencia sin internet", ADR-0036 adaptado) antes de
      // mostrarlo como un fallo cualquiera — la clienta sigue en el mostrador.
      if (esFalloDeRed(error)) {
        const stockOverlay = new Map(variantesConOverlay.map((v) => [v.varianteId, v.stockAqui]));
        const items = carrito.map((it) => ({ varianteId: it.varianteId, cantidad: it.cantidad }));
        if (!carritoPasaElUmbral(items, stockOverlay)) {
          setLoading(false);
          avisar.error(
            "Sin conexión, y esta venta dejaría alguna prenda en 0 sin que el servidor lo confirme — no se puede vender así (ADR-0013). Ajusta la cantidad o espera a que vuelva el internet."
          );
          return;
        }
        const nuevaVenta: VentaEncolada = { token: token.current, ubicacionId, creadoEn: new Date().toISOString(), items, params, rechazo: null };
        const nuevaCola = [...cola, nuevaVenta];
        if (!guardar(claveCola, nuevaCola)) {
          setLoading(false);
          avisar.error("No se pudo guardar la venta sin conexión en este navegador (¿modo privado, storage lleno?). No quedó registrada en ningún lado — anótala a mano.");
          return;
        }
        setCola(nuevaCola);
        setLoading(false);
        token.current = crypto.randomUUID();
        avisar.exito(`Venta de ${money(total)} guardada sin conexión`, {
          detalle: proformaActiva
            ? `Subirá sola cuando vuelva el internet. ${proformaActiva.numero} sigue «vigente»: márcala luego en Proformas.`
            : "Subirá sola cuando vuelva el internet.",
        });
        setProformaActiva(null);
        // El responsable ya viaja dentro de la venta encolada (`p_asesora_id`); el combo vuelve a vacío.
        responsable.despues(null);
        setOk({ total, prendas, recibo: null, estado: null, offline: true });
        setCarrito([]);
        limpiarComprobante();
        return;
      }

      setLoading(false);
      // El error de stock de la base no trae el nombre de la prenda; la pantalla sí lo
      // puede deducir comparando el ticket con lo que sabe del stock (un ticket retomado
      // pudo quedarse sin unidades mientras esperaba). Si no lo encuentra, va el genérico.
      const porStock = /stock insuficiente|stock_cantidad_no_negativa/i.test(`${error.message} ${error.details ?? ""}`);
      // Otra caja pudo vender la misma prenda (la pantalla ya no se recarga entera tras cada venta, ADR-0192): antes
      // de decir cuántas quedan se releen las prendas del ticket, y la grilla queda al día de paso. Si la relectura
      // falla, se usa lo que la pantalla ya sabía.
      const releido = porStock ? await releerStock(carrito.map((it) => it.varianteId)) : null;
      const quedan = (id: string) => {
        const base = releido?.cobrable.get(id) ?? variantesConOverlay.find((x) => x.varianteId === id)?.stockAqui;
        if (base === undefined) return undefined;
        // Lo releído viene de la base, sin la cola sin conexión: se le descuenta igual que el overlay.
        return releido?.cobrable.has(id) ? Math.max(0, base - (stockComprometido(cola).get(id) ?? 0)) : base;
      };
      // Con el almacén RELEÍDO (el estado todavía no se pinta en este mismo instante): si otra caja vendió lo del piso
      // y en el almacén hay, el aviso lo dice en vez de «ya no tiene stock» — la clienta ya está pagando (D-40).
      const almacenDe = (id: string) =>
        releido?.almacen.has(id) ? releido.almacen.get(id) : variantesConOverlay.find((x) => x.varianteId === id)?.almacenAqui;
      const cortas = porStock
        ? carrito.flatMap((it) => {
            const q = quedan(it.varianteId);
            return it.varianteId !== ID_CARGO_ESPECIAL && q !== undefined && it.cantidad > q
              ? [{ nombre: `${it.referencia} (${codigoPrenda(it)})`, piso: q, almacen: almacenDe(it.varianteId) }]
              : [];
          })
        : [];
      if (cortas.length > 0) {
        const { titulo, detalle } = avisoCortas(cortas, ubicacionEtiqueta);
        avisar.error(titulo, { detalle });
      } else {
        avisar.error(traducirError(error, "registrar la venta"));
      }
      // Si la base rechazó por el responsable (marcó salida entre que se eligió y se cobró), vacía y relee.
      responsable.despues(error);
      return;
    }

    // El comprobante ya se emitió en la MISMA transacción que la venta
    // (0011_venta_con_comprobante.sql) — esta consulta es solo para mostrar su
    // serie-número; nunca puede "fallar en emitir" por separado.
    let recibo: ReciboVenta | null = null;
    let estado: EstadoComprobante | null = null;
    if (ventaId && proformaActiva) {
      // Paso 2 del cobro de una proforma: la venta ya movió stock, caja y comprobante; esto solo la enlaza.
      // Si falla, la venta está bien y no se cobró dos veces: se avisa y se marca desde Proformas.
      const { error: errorMarcar } = await supabase.rpc("marcar_proforma_cobrada", { p_proforma_id: proformaActiva.id, p_venta_id: ventaId });
      if (errorMarcar) avisar.aviso(`La venta quedó bien, pero ${proformaActiva.numero} sigue «vigente»`, { detalle: traducirError(errorMarcar, "marcar la proforma como cobrada") });
    }
    if (ventaId) {
      // D-60: se declara sola a SUNAT, y de paso se reintenta lo que quedó en la cola de esta sede.
      enviarVentaASunat(ventaId);
      void barrerColaSunat(ubicacionId);
      const { data: comp } = await supabase.from("comprobantes").select("tipo, serie, numero, estado, created_at").eq("venta_id", ventaId).maybeSingle();
      if (comp && (comp.tipo === "boleta" || comp.tipo === "factura" || comp.tipo === "nota_venta")) {
        estado = comp.estado as EstadoComprobante;
        // Sale de lo que se acaba de cobrar (mismos ítems, descuentos y pagos que vio la
        // cajera, con el vuelto) más lo que la base asignó: serie, número y fecha.
        recibo = armarRecibo({
          comprobante: { tipo: comp.tipo, serie: comp.serie, numero: comp.numero, created_at: comp.created_at },
          sede: ubicacionEtiqueta,
          cliente: { tipoDoc: clienteTipoDoc, numDoc: clienteNumDoc || null, nombre: clienteNombre.trim() || null },
          lineas: carrito.map((it) => ({
            cantidad: it.cantidad,
            referencia: it.referencia,
            codigo: codigoPrenda(it),
            precioUnitario: it.precioUnitario,
            descuentoUnitario: it.descuentoUnitario,
          })),
          pagos,
          tasaIgv: 0.18,
          atendio: atendioCorto(responsable.lista.elegibles, responsable.elegidoId),
        });
      }
    }

    setLoading(false);
    token.current = crypto.randomUUID();
    responsable.despues(null);
    avisar.exito(`Venta de ${money(total)} registrada`, { detalle: recibo ? `${ETIQUETA_TIPO[recibo.tipo]} ${textoNumeroRecibo(recibo)}` : `${prendas} ${prendas === 1 ? "prenda" : "prendas"} · ${ubicacionEtiqueta}` });
    setOk({ total, prendas, recibo, estado, offline: false });
    const vendidas = carrito.map((it) => ({ varianteId: it.varianteId, cantidad: it.cantidad }));
    setCarrito([]);
    limpiarComprobante();
    // Cobrada la proforma, se quita `?proforma=` de la dirección (si no, recargar la volvería a pedir).
    if (proformaActiva) {
      setProformaActiva(null);
      setConfirmoVencida(false);
      router.replace("/vender");
    } else trasVender(vendidas);
  }

  // Al cerrar «Venta registrada» el ticket vuelve a «armar»: la venta siguiente
  // arranca por las prendas, no por el cobro.
  function cerrarVentaRegistrada() {
    setOk(null);
    // Cada venta vuelve a preguntar cómo pagó la clienta: heredar los medios de la
    // anterior sería el mismo dato fantasma que la preselección que se quitó.
    setPagos([]);
    setCodigoDescuento("");
    setNota("");
    responsable.limpiar();
    setMomento("armar");
  }

  return (
    // En escritorio (lg) el POS es una pantalla fija: la página no hace scroll, el
    // catálogo y el ticket scrollean cada uno por dentro. La altura es lo que queda
    // bajo la cabecera fija de AppShell: `100dvh` menos el `pt-24 + pb-12` de su
    // `<main>` (9rem). En celular/tablet (apilado) se mantiene el scroll de página:
    // dos scrolls internos uno debajo del otro serían peores que uno solo.
    <div className="flex flex-col overflow-hidden rounded-2xl border border-sand bg-crema text-tinta lg:h-[calc(100dvh-9rem)]">
      <div className="anim-revelar flex min-h-16 flex-wrap items-center gap-3 border-b border-sand bg-papel px-4 py-2 sm:px-6">
        <p className="label-cayla mr-auto text-[11px] text-taupe-profundo">Venta en tienda · {ubicacionEtiqueta}</p>
        {/* Lo que ya existe en otras pantallas y desde la caja no se alcanzaba: ingreso/
            egreso y arqueo, cambio de talla, devoluciones. Enlaces discretos, no menú;
            siguen vivos con la caja cerrada (cerrarla es justo lo que se hace en /caja)
            y sin gate de rol: AppShell ya decide quién entra a qué. */}
        {/* Enlaces y botón van juntos en un solo ítem del flex: si la fila se parte
            (menos de ~900 px con el lateral abierto), el grupo cae entero a la derecha en
            la segunda línea, no un botón suelto. Bajo `sm` (celular) los enlaces se
            ocultan: ahí el lateral ya da Caja y Devoluciones. */}
        <div className="ml-auto flex items-center gap-3">
          <nav aria-label="Otras operaciones de la tienda" className="hidden items-center gap-1 sm:flex">
            {ATAJOS.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="label-cayla rounded-md px-2 py-1.5 text-[11px] text-tinta/60 transition-[background-color,color,transform] duration-200 ease-[var(--ease-cayla)] hover:bg-sand/40 hover:text-tinta active:translate-y-px"
              >
                {a.texto}
              </Link>
            ))}
          </nav>
          {/* D-13: abrir la caja lo puede cualquiera; CERRARLA solo el líder (candado real en
              `cerrar_caja`, 20260921110000). Con la caja abierta, un colaborador común no ve el botón; la terminal de
              ventas sí (ADR-0160: `fn_puede_gestionar_caja`). */}
          {(bloqueado || puedeCerrarCaja) && (
            <button
              type="button"
              onClick={() => setModalCaja(bloqueado ? "abrir" : "cerrar")}
              className={
                bloqueado
                  ? "label-cayla h-9 rounded-md bg-tinta px-3 text-[11px] text-crema transition-colors hover:bg-rojo"
                  : "label-cayla h-9 rounded-md border border-tinta/25 px-3 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
              }
            >
              {bloqueado ? "Abrir caja" : "Cerrar caja"}
            </button>
          )}
        </div>
      </div>

      {/* Arriba de la bifurcación "caja abierta / caja cerrada" a propósito (ADR-0036,
          addendum "por sede"): una venta guardada sin conexión, o rechazada de verdad al
          subir, se tiene que ver tanto si la caja sigue abierta como si ya cerró. */}
      <PuntoDeVentaColaOffline cola={cola} onDescartar={descartarRechazada} />

      {/* Cobrando una proforma (ADR-0167): de quién es, y la confirmación si venció. */}
      {proformaActiva && (
        <div role="status" className="anim-revelar flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-sand bg-ambar/[0.07] px-4 py-2.5 text-sm sm:px-6">
          <p className="mr-auto">
            Cobrando la proforma <b className="font-semibold">{proformaActiva.numero}</b>
            {proformaActiva.cliente && <> de {proformaActiva.cliente}</>}. Puedes quitar o cambiar prendas antes de cobrar.
          </p>
          {proformaActiva.confirmacion && (
            <label className="flex cursor-pointer items-start gap-2 text-ambar-profundo">
              <input type="checkbox" checked={confirmoVencida} onChange={(e) => setConfirmoVencida(e.target.checked)} className="mt-0.5 accent-tinta" />
              <span>
                <b className="font-semibold">{proformaActiva.confirmacion.titulo}</b> {proformaActiva.confirmacion.casilla}
              </span>
            </label>
          )}
          <button
            type="button"
            onClick={soltarProforma}
            className="label-cayla rounded-md px-2 py-1 text-[11px] text-tinta/65 transition-colors hover:bg-sand/40 hover:text-tinta"
          >
            Soltar
          </button>
        </div>
      )}

      {/* Con la caja cerrada, el catálogo y el ticket se ven igual — pero apagados y
          fuera de alcance del mouse. `disabled` real en cada control de abajo, no
          solo esto: `pointer-events-none` no le dice nada al teclado ni a un lector
          de pantalla. */}
      {/* `grid-rows-[minmax(0,1fr)]`: con la fila implícita (`auto`) los dos paneles
          nunca encogen por debajo de su contenido y el scroll interno de cada uno no
          se activa — la fila crece y la raíz lo recorta en silencio. */}
      <div
        aria-disabled={bloqueado}
        className={`grid transition-opacity lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_420px] lg:grid-rows-[minmax(0,1fr)] ${bloqueado ? "pointer-events-none opacity-50" : ""}`}
      >
        <PuntoDeVentaCatalogo
          ubicacionEtiqueta={ubicacionEtiqueta}
          bloqueado={bloqueado}
          buscadorRef={buscador}
          q={q}
          term={term}
          resultados={resultados}
          activo={activo}
          aviso={aviso}
          onEscribir={(valor) => {
            setQ(valor);
            setActivo(0);
            setAviso(null);
          }}
          onLimpiarBusqueda={() => setQ("")}
          onTeclado={alTeclado}
          onActivo={setActivo}
          onAgregar={agregar}
          onPrendaSinRegistrar={() => setManualAbierto(true)}
          conCamara={esTelefono}
          modoCamara={esTelefono && !buscarPorTexto}
          onAbrirCamara={() => {
            setBuscarPorTexto(false);
            setCamaraAbierta(true);
          }}
          onBuscarPorTexto={() => setBuscarPorTexto(true)}
          categorias={categorias}
          categoria={categoria}
          // Un chip es un desvío de un toque: elegida la categoría, el foco vuelve al escáner.
          onCategoria={(c) => {
            setCategoria(c);
            buscador.current?.focus();
          }}
          soloConStock={soloConStock}
          onSoloConStock={(valor) => {
            setSoloConStock(valor);
            buscador.current?.focus();
          }}
          ocultasSinStock={ocultasSinStock}
          ocultasEnAlmacen={ocultasEnAlmacen}
          topeTarjeta={topeTarjeta}
          onElegirTalla={(clave) => {
            // Con una sola talla vendible no hay nada que elegir: se agrega directo (Felipe,
            // 2026-09-18). El modal es para elegir, y solo se abre con 2+ tallas con stock —
            // o con ninguna, donde sirve para decir dónde sí hay (el almacén de esta sede u
            // otra sede). Si esa única talla ya está
            // al tope en el ticket, `agregar()` avisa cuántas quedan.
            const vendibles = grupos.find((g) => g.clave === clave)?.tallas.filter((t) => t.stockAqui > 0) ?? [];
            if (vendibles.length === 1) agregar(vendibles[0].variante);
            else setTarjetaElegida(clave);
          }}
          grupos={grupos}
          carrito={carrito}
          mostrarVentasHoy={mostrarVentasHoy}
          onAlternarVentasHoy={() => setMostrarVentasHoy((v) => !v)}
          ventasHoyNode={<VersionVentasDeHoy.Provider value={versionVentas}>{ventasHoyNode}</VersionVentasDeHoy.Provider>}
        />

        <PuntoDeVentaTicket
          id="ticket-pos"
          bloqueado={bloqueado}
          carrito={carritoConPiso}
          listaRef={listaTicket}
          onQuitar={quitar}
          onCantidad={cambiarCantidad}
          descuento={descuento}
          onDescuento={(cambio) => setDescuento((d) => ({ ...d, ...cambio }))}
          onAbrirDescuento={abrirDescuento}
          onAplicarDescuento={aplicarDescuentoAlTicket}
          onQuitarDescuento={quitarDescuentoDelTicket}
          esLider={esLider}
          codigoDescuento={codigoDescuento}
          onCodigoDescuento={setCodigoDescuento}
          nota={nota}
          onNota={setNota}
          enEspera={enEspera}
          onDejarEnEspera={dejarEnEspera}
          onRetomar={retomar}
          onIrAEspera={() => setMomento("espera")}
          total={total}
          prendas={prendas}
          pagos={pagos}
          restante={restante}
          vuelto={vuelto}
          onAgregarPago={agregarPago}
          onMontoPago={cambiarMontoPago}
          onQuitarPago={quitarPago}
          onRecibido={cambiarRecibido}
          tipoComprobante={tipoComprobante}
          onTipoComprobante={setTipoComprobante}
          clienteNumDoc={clienteNumDoc}
          onClienteNumDoc={setClienteNumDoc}
          clienteNombre={clienteNombre}
          onClienteNombre={setClienteNombre}
          facturaSinRuc={facturaSinRuc}
          loading={loading}
          onCobrar={cobrar}
          momento={momento}
          onIrACobrar={() => setMomento("cobrar")}
          onVolverATicket={() => setMomento("armar")}
          motivoBloqueo={motivoBloqueo}
          responsable={responsable}
        />
      </div>

      {/* Apilado (bajo `lg`) el ticket queda debajo de TODO el catálogo — con el
          catálogo real (300-900 SKUs) son muchas pantallas de scroll antes de ver el
          total o llegar a «Cobrar». En escritorio no hace falta: el ticket ya está
          siempre a la vista en su columna fija. Mismo offset que la barra de
          "Recibir mercadería" (`BarraFija`): pegado al fondo — desde 2026-09-25 el celular
          no tiene barra de pestañas abajo (el menú es un cajón lateral). Se esconde mientras
          el ticket está a la vista (`ticketALaVista`). */}
      {!bloqueado && carrito.length > 0 && !ticketALaVista && (
        <button
          type="button"
          onClick={() => document.getElementById("ticket-pos")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="anim-revelar fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-sand bg-tinta px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-crema shadow-lg sm:left-lateral sm:transition-[left] sm:duration-300 lg:hidden"
        >
          <span className="label-cayla text-[11px]">
            {prendas} {prendas === 1 ? "prenda" : "prendas"} · {money(total)}
          </span>
          <span className="label-cayla flex items-center gap-1 text-[11px]">
            Ver ticket
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M12 5v14m0 0l-5-5m5 5l5-5" />
            </svg>
          </span>
        </button>
      )}

      {grupoElegido && (
        <ElegirTallaModal
          grupo={grupoElegido}
          ubicacionEtiqueta={ubicacionEtiqueta}
          carrito={carrito}
          onAgregar={agregar}
          onClose={() => setTarjetaElegida(null)}
          alCerrarEnfocar={buscador}
        />
      )}

      {camaraAbierta && (
        <EscanerCamara
          onCodigo={alEscanear}
          ticket={{ prendas, total }}
          onBuscarPorNombre={() => {
            cerrarCamara();
            setBuscarPorTexto(true);
          }}
          onClose={cerrarCamara}
        />
      )}

      {manualAbierto && (
        <PrendaSinRegistrarModal
          listas={listasPrendaLibre}
          onAgregar={agregarPrendaSinRegistrar}
          onClose={() => setManualAbierto(false)}
          alCerrarEnfocar={buscador}
        />
      )}

      {modalAbrirVisible && (
        <Modal titulo="Abrir caja" onClose={() => setModalCaja(null)} alCerrarEnfocar={buscador}>
          <AbrirCajaFormV2 ubicacionId={ubicacionId} ubicacionEtiqueta={ubicacionEtiqueta} esperado={fondoUltimoCierre} />
        </Modal>
      )}
      {modalCerrarVisible && cajaId && (
        <CerrarCajaModalV2 cajaId={cajaId} cola={cola} ubicacionId={ubicacionId} onClose={() => setModalCaja(null)} />
      )}

      {ok && <VentaRegistradaModal ok={ok} ubicacionEtiqueta={ubicacionEtiqueta} onClose={cerrarVentaRegistrada} alCerrarEnfocar={buscador} />}
    </div>
  );
}
