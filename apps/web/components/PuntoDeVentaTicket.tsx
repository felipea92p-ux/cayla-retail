"use client";

import { duenosParaElegir, type UnidadesDeDueno } from "@/lib/dueno-reglas";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { BadgePercent, Banknote, Check, CirclePause, CreditCard, Landmark, Percent, Play, QrCode, ShoppingBag, StickyNote, Star, Ticket, Trash2, Wallet, X } from "lucide-react";
import type { MetodoPagoVenta } from "@cayla-retail/shared";
import type { TipoComprobante } from "@/lib/comprobantes-reglas";
import { desgloseIgv, pasoDelCobro, totalDeLineas, type MomentoTicket } from "@/lib/vender-reglas";
import { cuentaDelDescuento } from "@/lib/descuento-cuenta-reglas";
import { PanelDescuento } from "@/components/punto-de-venta/PanelDescuento";
import { soltarPaginaEstable } from "@/components/ui/PaginaEstable";
import { ComboResponsable } from "@/components/ComboResponsable";
import type { ControlResponsable } from "@/lib/useResponsable";
import { nombreDeEspera } from "@/lib/vender-hoy-reglas";
import { money, type DescuentoForm, type ItemCarrito, type PagoAplicado, type TicketEnEspera } from "@/components/PuntoDeVenta";
import { LineaDelTicket } from "@/components/punto-de-venta/LineaDelTicket";
import type { DetalleVariante } from "@/lib/ticket-linea-reglas";
import { TEXTO_PIE_CUPON } from "@/lib/club-puntos-reglas";
import { Volver } from "@/components/ui/Volver";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";

/** 18% — IGV de Perú. Solo para el desglose que se ve en pantalla: el que de
 *  verdad cuenta lo calcula `registrar_venta` en el servidor. */
const TASA_IGV = 0.18;

/** La nota del ticket: el tope es el `check` de `ventas.nota`; el contador se muestra
 *  recién cerca del tope, para no contar letras a quien escribe cuatro palabras. */
const NOTA_MAX = 200;
const NOTA_AVISO = 160;

/** Debe coincidir con `.anim-revelar-salida` en globals.css (mismo criterio que
 *  `MS_SALIDA` en ui/Modal.tsx: el timer de React y la animación CSS son una sola
 *  duración contada dos veces, y tienen que decir lo mismo). */
const MS_TRANSICION_MOMENTO = 160;

/** El botón principal es el mismo en los tres momentos; cambian su texto y lo que hace.
 *  Apagado no reacciona al hover: queda justo bajo el cursor al entrar a «cobrar», y un
 *  rojo a medias ahí se leía como "casi se puede". */
const BOTON_PRINCIPAL =
  "mov-boton flex h-14 w-full items-center justify-between rounded-md bg-tinta px-5 text-crema hover:bg-rojo-profundo disabled:opacity-50 disabled:hover:bg-tinta";

/** Hay un solo ticket por pantalla, así que un id fijo alcanza para que el botón
 *  apagado apunte a su motivo (`aria-describedby`) sin hooks en este componente. */
const ID_MOTIVO = "ticket-motivo-bloqueo";

/** Íconos de cada apartado y método (pedido de Felipe, 2026-09-14): `lucide` para lo
 *  genérico y, para Yape y Plin, sus marcas dibujadas a mano en MONOCROMO — heredan
 *  `currentColor` (tinta / tinta-60 según el estado del botón), nunca el morado ni el
 *  azul de las marcas: el sistema tiene tres colores y el rojo es acento, no logo. */
const ICONO = "h-5 w-5 shrink-0";
const ICONO_CHICO = "h-3.5 w-3.5 shrink-0";

/** Yape: la burbuja rellena con «S/» adentro, como su isotipo. */
function IconoYape({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2.5a8.5 8.5 0 0 0-6.3 14.2l-.6 4.1a.6.6 0 0 0 .9.6l3.5-2.1A8.5 8.5 0 1 0 12 2.5Z" />
      <text x="12" y="14.4" textAnchor="middle" fontSize="8" fontWeight="700" fontFamily="ui-sans-serif, system-ui, sans-serif" className="fill-papel">
        S/
      </text>
    </svg>
  );
}

/** Plin: la burbuja en trazo con la palabra adentro, como su isotipo. */
function IconoPlin({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round">
      <path d="M12 3a8.8 8.8 0 0 1 0 17.6c-1.4 0-2.7-.3-3.9-.9L4 21l.8-3.6A8.8 8.8 0 0 1 12 3Z" />
      <text x="12" y="14.3" textAnchor="middle" fontSize="6.5" fontWeight="700" fontFamily="ui-sans-serif, system-ui, sans-serif" fill="currentColor" stroke="none">
        plin
      </text>
    </svg>
  );
}

/** El ícono de un medio, al tamaño que pida quien lo pinta: los cuadrados de la hoja de cobro lo quieren llenando el cuadro. */
export function iconoMetodo(m: MetodoPagoVenta, className: string): React.ReactNode {
  switch (m) {
    case "efectivo":
      return <Banknote className={className} aria-hidden />;
    case "tarjeta":
      return <CreditCard className={className} aria-hidden />;
    case "qr":
      return <QrCode className={className} aria-hidden />;
    case "yape":
      return <IconoYape className={className} />;
    case "plin":
      return <IconoPlin className={className} />;
    case "transferencia":
      return <Landmark className={className} aria-hidden />;
  }
}

export const ICONO_METODO: Record<MetodoPagoVenta, React.ReactNode> = {
  efectivo: iconoMetodo("efectivo", ICONO),
  tarjeta: iconoMetodo("tarjeta", ICONO),
  qr: iconoMetodo("qr", ICONO),
  yape: iconoMetodo("yape", ICONO),
  plin: iconoMetodo("plin", ICONO),
  transferencia: iconoMetodo("transferencia", ICONO),
};

// Los colores de cada método viven en `globals.css` (`.metodo-efectivo`, …): los mismos tokens
// que usa la dona de «Métodos de pago» de Caja, para que un método se reconozca con el mismo color
// en las dos pantallas. Lo que se pinta con ellos usa `--c` (relleno/borde), `--ct` (fondo suave) y
// `--cd` (texto legible: el dorado de efectivo no llega a AA como texto y usa una tinta oscura).


type Props = {
  bloqueado: boolean;
  // Ticket
  carrito: ItemCarrito[];
  /** Color y talla de cada variante (por `varianteId`), para la fila de cada prenda. La línea del carrito no los
   *  guarda; sin ellos la fila muestra el código de la etiqueta, como antes. */
  detalles?: ReadonlyMap<string, DetalleVariante>;
  /** Por `claveLinea`: los otros tickets abiertos que llevan esa prenda cuando no alcanza para todos (solo avisa). */
  tambienEn?: ReadonlyMap<string, readonly string[]>;
  /** ADR-0542: de quién son las unidades de cada prenda aquí (solo las que tienen de alguien que no es la casa), lo que ya eligió la cajera por prenda, y cómo elige. */
  duenosPorVariante?: Readonly<Record<string, readonly UnidadesDeDueno[]>> | null;
  duenoElegido?: Readonly<Record<string, string>>;
  onDueno?: (varianteId: string, empresaId: string) => void;
  /** Ref de la lista de líneas: el padre le captura la posición para el reflujo `Flip`. */
  listaRef: RefObject<HTMLDivElement | null>;
  onQuitar: (claveLinea: string) => void;
  onCantidad: (claveLinea: string, valor: number) => void;
  // Descuento — un solo apartado (momento «descuento»), dos entradas
  descuento: DescuentoForm;
  onDescuento: (cambio: Partial<DescuentoForm>) => void;
  /** Abre el apartado para esas líneas; `null` = todo el ticket. */
  onAbrirDescuento: (claves: string[] | null) => void;
  onAplicarDescuento: () => void;
  onQuitarDescuento: () => void;
  /** En escritorio el descuento no vive aquí: entra como hoja lateral sobre el catálogo (`HojaDeDescuento`, como el cobro) y el ticket
   *  se queda con sus prendas, quieto y atenuado. Solo el ticket de la hoja del celular dibuja el apartado dentro de sí. */
  descuentoAparte?: boolean;
  // Nota del ticket — una línea, hasta 200; vive con las líneas (momento «armar»)
  nota: string;
  onNota: (v: string) => void;
  // Tickets en espera de la sede (Park/Resume) — momento «espera»
  enEspera: TicketEnEspera[];
  onDejarEnEspera: () => void;
  onRetomar: (id: string) => void;
  onIrAEspera: () => void;
  /** El basurero de una fila de «En espera»: pide confirmación y lo saca de la espera. */
  onDescartarEspera: (id: string) => void;
  // Totales — ya calculados en el padre
  /** Lo que se cobra: con el cupón del Club, ya sin su parte. */
  total: number;
  prendas: number;
  /** El cupón del Club puesto (programa de puntos): UNA línea en el pie, sobre el total. `vale` es de cuánto es el cupón; `monto`, lo que
   *  descuenta en esta compra; `totalSinVale`, sobre qué se repartió. Las prendas no lo muestran: el reparto por línea es de la base y
   *  del comprobante. null sin cupón. */
  vale?: { vale: number; monto: number; totalSinVale: number; cupon: { codigo: string; detalle: string; ayuda: string } } | null;
  /** Quitar el cupón del Club puesto (programa de puntos): la línea del pie lo ofrece mientras se arma la venta. */
  onQuitarCupon?: () => void;
  /** Abre «Código de cupón», junto a «Aplicar descuento». */
  onAbrirCodigo?: () => void;
  /** Lo que gana la miembro identificada con esta compra: sus puntos y, si le toca, el regalo de cumpleaños. null sin miembro. */
  gana?: { nombre: string; puntos: number; regalo: number } | null;
  // Los momentos del ticket: «armar» (líneas + total), «descuento» y «cobrar» (pago + comprobante)
  momento: MomentoTicket;
  onIrACobrar: () => void;
  onVolverATicket: () => void;
  /** Derivado en el padre, una sola vez: por qué el botón principal está apagado
   *  (o null). Apaga el botón y se muestra debajo de él, tal cual. */
  motivoBloqueo: string | null;
  /** El combo «Responsable» (ADR-0161), justo encima de Cobrar. Su estado vive en el padre (`useResponsable`). */
  responsable: ControlResponsable;
  /** Los pagos puestos: el pago y el comprobante se eligen en la hoja de cobro (`HojaDeCobro`); el ticket solo los usa para
   *  saber si «Confirmar cobro» ya está listo. */
  pagos: PagoAplicado[];
  /** El redondeo del efectivo está activo (ADR-0311): lo recibido alcanza si cubre lo que se cobra en monedas, no la deuda exacta. */
  redondeoEfectivo?: boolean;
  /** El comprobante elegido (o ninguno todavía): la nota de venta no desglosa IGV en el pie. */
  tipoComprobante: Extract<TipoComprobante, "boleta" | "factura" | "nota_venta"> | null;
  /** En el celular, la hoja de cobro entera: va dentro del ticket (y de su formulario) mientras se cobra. */
  cuerpoCobro?: ReactNode;
  // Cobrar
  loading: boolean;
  onCobrar: (e: React.FormEvent) => void;
  /** Apilado (celular/tablet, bajo `lg`) el ticket queda debajo de todo el catálogo —
   *  la barra-resumen fija del padre lo usa para saltar acá con `scrollIntoView`. */
  id?: string;
  /** Arriba de las líneas mientras se arma (spike 2026-09-26): la tira de tickets en espera y la fila «Clienta». */
  arriba?: ReactNode;
  /** Lo que va bajo «Cobrar», en el pie: la frase de las prendas sin registrar de hoy (`SinRegistrarDeHoy`, A5). */
  abajo?: ReactNode;
  /** Dentro de la hoja del celular (`<Modal variante="ticket">`): llena la hoja y ofrece volver al catálogo. */
  enHoja?: boolean;
  onCerrarHoja?: () => void;
};

/**
 * Panel derecho de Vender, en momentos (decidido con Felipe el 2026-09-14, ADR-0044):
 * «armar» muestra solo las líneas del ticket y el total; «descuento» es el apartado
 * para decidir un % (a todo el ticket o solo a las prendas elegidas) y vuelve a
 * «armar»; «cobrar» —recién al tocar Cobrar— muestra cuánto y cómo pagó la clienta y,
 * debajo, el comprobante con el documento adentro. Escanear en cualquier momento sigue
 * agregando al ticket: el conteo de la cabecera y el total se actualizan en vivo.
 *
 * Sin estado propio ni hooks — todo llega por props desde `PuntoDeVenta`, que sigue
 * siendo el único dueño del carrito y de `cobrar()`. Es la costura para trabajar el
 * ticket sin tocar el catálogo (y viceversa).
 */
export function PuntoDeVentaTicket({
  id,
  bloqueado,
  carrito,
  detalles,
  tambienEn,
  duenosPorVariante,
  duenoElegido,
  onDueno,
  listaRef,
  onQuitar,
  onCantidad,
  descuento,
  onDescuento,
  onAbrirDescuento,
  onAplicarDescuento,
  onQuitarDescuento,
  descuentoAparte = false,
  nota,
  onNota,
  enEspera,
  onDejarEnEspera,
  onRetomar,
  onIrAEspera,
  onDescartarEspera,
  total,
  prendas,
  vale = null,
  onQuitarCupon,
  onAbrirCodigo,
  gana = null,
  momento: momentoDelPadre,
  onIrACobrar,
  onVolverATicket,
  motivoBloqueo,
  responsable,
  pagos,
  redondeoEfectivo = false,
  tipoComprobante,
  cuerpoCobro,
  loading,
  onCobrar,
  arriba,
  abajo,
  enHoja = false,
  onCerrarHoja,
}: Props) {
  // Única excepción a "sin estado, sin hooks" del componente (ver el comentario de la
  // función, abajo): es un búfer de ANIMACIÓN, no de negocio. `momento` sigue siendo la
  // fuente de verdad — vive en el padre y `cobrar()` allá revalida contra el valor real,
  // nunca contra este. Lo único que hace este búfer es no soltar el contenido saliente
  // de golpe: se sigue pintando con `.anim-revelar-salida` los `MS_TRANSICION_MOMENTO` que
  // tarda en desvanecerse, y recién ahí se pinta el momento nuevo. Mismo patrón de dos
  // tiempos que `cerrando` en ui/Modal.tsx, con el mismo motivo.
  // Con la hoja lateral del descuento abierta, el ticket sigue en «armar» (con sus prendas) pero quieto: no hay transición de contenido.
  const quieto = momentoDelPadre === "descuento" && descuentoAparte;
  const momento: MomentoTicket = quieto ? "armar" : momentoDelPadre;
  const [momentoMostrado, setMomentoMostrado] = useState(momento);
  const [saliendo, setSaliendo] = useState(false);
  // Ajustar estado durante el render (el patrón que React documenta para esto exacto:
  // "arrancar algo la primera vez que cambia una prop"), no dentro del efecto — ahí
  // `setSaliendo(true)` dispararía un re-render en cascada que el propio linter del
  // repo marca. El efecto de abajo solo se ocupa de lo que sí le corresponde: el
  // temporizador, un sistema externo a React.
  if (momento !== momentoMostrado && !saliendo) {
    setSaliendo(true);
  }
  useEffect(() => {
    if (!saliendo) return;
    const temporizador = setTimeout(() => {
      setMomentoMostrado(momento);
      setSaliendo(false);
    }, MS_TRANSICION_MOMENTO);
    return () => clearTimeout(temporizador);
  }, [saliendo, momento]);

  // Apilado (celular/tablet), cambiar de momento cambia el alto del ticket de golpe: con 4
  // prendas «armar» mide ~560 px más que «Cobro», la página se acorta y la vista quedaba
  // en el pie, con la cabecera arriba fuera de la pantalla y aire vacío abajo (Felipe,
  // 2026-09-25). Es un cambio de vista, no un bloque que se encogió: se suelta la
  // reserva de <PaginaEstable> y la vista sube al inicio del ticket, antes de pintar.
  // En escritorio el ticket es una columna fija con su propio scroll: no se toca.
  const asideRef = useRef<HTMLElement>(null);
  const momentoPrevio = useRef(momentoMostrado);
  useLayoutEffect(() => {
    if (momentoPrevio.current === momentoMostrado) return;
    momentoPrevio.current = momentoMostrado;
    if (!window.matchMedia("(max-width: 1023.98px)").matches) return;
    soltarPaginaEstable();
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    asideRef.current?.scrollIntoView({ block: "start", behavior: reducido ? "auto" : "smooth" });
  }, [momentoMostrado]);

  const cobrando = momentoMostrado === "cobrar";
  const descontando = momentoMostrado === "descuento";
  const enLaEspera = momentoMostrado === "espera";
  // El chip «En espera · N» de la cabecera: solo cuando hay algo esperando. Es la puerta a la vista «En espera», donde se ven
  // todos los tickets guardados y se retoma el que toca (Felipe 2026-10-26: vuelve en lugar de las pestañas).
  const conChipEspera = enEspera.length > 0;
  // Resumen de cada ticket en espera, derivado de sus líneas (sin estado, sin hooks).
  const resumenEspera = (t: TicketEnEspera) => ({
    hora: new Date(t.creadoEn).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" }),
    prendas: t.carrito.reduce((acc, it) => acc + it.cantidad, 0),
    total: totalDeLineas(t.carrito),
  });
  const etiquetaPrendas = `${prendas} ${prendas === 1 ? "prenda" : "prendas"}`;
  const desglose = desgloseIgv(total, TASA_IGV);
  const apagado = bloqueado || motivoBloqueo !== null;
  // El paso que la pantalla resalta (solo guía) y si «Confirmar cobro» ya se puede: se enciende.
  const paso = pasoDelCobro(pagos, total, redondeoEfectivo);
  const listoParaConfirmar = cobrando && paso === "comprobante" && !apagado;

  // Lo que ya se descontó (suma de todas las líneas), para la fila sobre el total.
  const totalDescuento = carrito.reduce((acc, it) => acc + it.cantidad * it.descuentoUnitario, 0);

  // ---- Apartado de descuento: todo derivado de props, sin estado propio — la cuenta es UNA sola y la comparte la hoja lateral
  // de escritorio (`HojaDeDescuento`, ADR-0584 / 2026-11-02) con este ticket (la hoja del celular): `lib/descuento-cuenta-reglas.ts`.
  const cuenta = cuentaDelDescuento(descuento, carrito, vale);
  const { porMonto, pct, monto, valorValido, todoElTicket, elegidasCuenta, hayDescuentoEnAlcance, motivoDescuento, pasoDescuento } = cuenta;
  const luzListo = descontando && pasoDescuento === "listo";

  return (
    // En escritorio el aside llena toda la fila del POS (la raíz fija la altura al
    // viewport): cabecera y pie quedan fijos y solo el medio scrollea.
    // En su columna (escritorio) el ticket es la placa Serena, pegada arriba (`pv-ticket`, vidrio/vender.css); en la hoja del celular
    // (`data-en-hoja`) la cara la pone la hoja.
    <aside data-guia="vender.ticket" data-en-hoja={enHoja || undefined} inert={quieto || undefined} className="pv-ticket flex min-h-[45vh] min-w-0 flex-col bg-papel lg:min-h-0">
      {/* Un solo título grande por momento: la sede ya está en la barra de arriba
          («Venta en tienda · sede»), repetirla acá no decía nada. Fuera de «armar», la
          cabecera ofrece la vuelta al ticket y el conteo vivo. */}
      <div className="@container flex min-h-[4.5rem] items-center justify-between gap-2 border-b border-sand px-5 py-3 pv-ticket-hilo">
        {momentoMostrado === "armar" ? (
          <>
            <TituloSeccion>
              <span className="inline-flex items-center gap-2.5">
                <ShoppingBag className="h-5 w-5 text-tinta/70" aria-hidden />
                {/* Con «Dejar en espera» y el chip «En espera · N» al lado, en un ticket de 320 px el título se partía en dos
                    líneas: ahí dice solo «Ticket». */}
                <span className="whitespace-nowrap">
                  Ticket<span className={conChipEspera ? "@max-[19rem]:hidden" : undefined}> actual</span>
                </span>
              </span>
            </TituloSeccion>
            {/* Park, a la altura del título (Felipe 2026-10-22): sacarlo del pie le devuelve una fila a la lista. Guarda el
                ticket (pidiendo un nombre, opcional) y libera la caja para el siguiente cliente. Con el chip «En espera · N» al
                lado, o en un ticket angosto, queda solo el ícono (con su nombre para el lector y al pasar el mouse): los dos con
                texto no caben en 420 px. */}
            {carrito.length > 0 && (
              <button
                type="button"
                onClick={onDejarEnEspera}
                disabled={bloqueado}
                aria-label="Dejar en espera"
                title="Dejar en espera"
                className={`btn-cayla btn-secundario anim-revelar ml-auto flex h-8 shrink-0 items-center gap-1.5 text-[12.5px] ${
                  conChipEspera ? "w-8 justify-center px-0" : "px-2.5 @max-[20rem]:w-8 @max-[20rem]:justify-center @max-[20rem]:px-0"
                }`}
              >
                <CirclePause className={ICONO_CHICO} aria-hidden />
                {!conChipEspera && <span className="hidden @min-[20rem]:inline">Dejar en espera</span>}
              </button>
            )}
            {/* Solo cuando hay algo esperando: el chip cambia el ticket por la lista completa de los que esperan. */}
            {conChipEspera && (
              <button
                type="button"
                onClick={onIrAEspera}
                disabled={bloqueado}
                className="btn-cayla btn-secundario anim-revelar flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[12.5px]"
              >
                <CirclePause className={ICONO_CHICO} aria-hidden />
                En espera · {enEspera.length}
              </button>
            )}
            {/* En la hoja del celular, la salida al catálogo (además del velo): la clienta pide otra prenda. */}
            {enHoja && onCerrarHoja && (
              <button
                type="button"
                onClick={onCerrarHoja}
                aria-label="Volver al catálogo"
                className="order-last ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-md text-tinta/60 transition-colors hover:bg-sand/40 hover:text-tinta"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            )}
          </>
        ) : (
          <>
            <Volver onClick={onVolverATicket} deshabilitado={bloqueado} a="Volver al ticket" />
            <div key={momentoMostrado} className={saliendo ? "anim-revelar-salida text-right" : "anim-revelar text-right"}>
              <TituloSeccion className="justify-end">
                <span className="inline-flex items-center gap-2.5">
                  {cobrando ? (
                    <Wallet className="h-5 w-5 text-tinta/70" aria-hidden />
                  ) : enLaEspera ? (
                    <CirclePause className="h-5 w-5 text-tinta/70" aria-hidden />
                  ) : (
                    <BadgePercent className="h-5 w-5 text-tinta/70" aria-hidden />
                  )}
                  {cobrando ? "Cobro" : enLaEspera ? "En espera" : "Descuento"}
                </span>
              </TituloSeccion>
              <p className="mt-1 text-sm text-tinta/60">
                {cobrando
                  ? etiquetaPrendas
                  : enLaEspera
                    ? `${enEspera.length} ${enEspera.length === 1 ? "ticket" : "tickets"}`
                    : todoElTicket
                      ? "Todo el ticket"
                      : `${elegidasCuenta} de ${carrito.length} prendas`}
              </p>
            </div>
          </>
        )}
      </div>

      <form
        id={id}
        onSubmit={onCobrar}
        // La pistola es un teclado: si el foco quedó en un campo de este formulario
        // (Recibido, el % de descuento, una cantidad de línea) y alguien escanea por
        // costumbre, los dígitos caen ahí y el Enter final del código dispara el submit
        // nativo del <input> — cobra o corrompe el monto sin que nadie tocara «Cobrar».
        // `cobrar()` ya revalida `motivoBloqueoCobro`, así que una venta a medias no pasa,
        // pero una ya completa sí se confirmaría de golpe. Enter solo cobra desde el botón.
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        {/* `data-sin-reserva`: la lista del ticket se acorta al quitar una prenda y el scroll debe bajar con ella; con la
            reserva de <PaginaEstable> quedaba un hueco en blanco bajo la última prenda (2026-11-02). */}
        <div data-sin-reserva className="scroll-cayla min-h-40 flex-1 overflow-y-auto">
          {enLaEspera ? (
            <div className={saliendo ? "anim-revelar-salida space-y-3 px-5 py-4" : "anim-revelar space-y-3 px-5 py-4"}>
              {/* Si el actual tiene líneas, retomar lo intercambia: se dice antes de tocar. */}
              {carrito.length > 0 && (
                <p className="rounded-lg border border-sand bg-crema px-3 py-2 text-sm text-tinta/70">
                  Tu ticket actual tiene {etiquetaPrendas}: al retomar uno, el actual pasa a espera.
                </p>
              )}
              {enEspera.length === 0 ? (
                <Vacio tamano="chico" className="py-6" icono={<CirclePause />}>No hay tickets en espera.</Vacio>
              ) : (
                <div className="divide-y divide-sand rounded-lg border border-sand bg-crema">
                  {enEspera.map((t, i) => {
                    const r = resumenEspera(t);
                    return (
                      <div key={t.id} className="flex items-center gap-3 px-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-tinta">{nombreDeEspera(t.nombre, i)}</p>
                          <p className="text-sm text-tinta">
                            <span className="font-mono text-xs text-tinta/60">{r.hora}</span>
                            <span className="mx-1.5 text-tinta/30">·</span>
                            {r.prendas} {r.prendas === 1 ? "prenda" : "prendas"}
                            <span className="mx-1.5 text-tinta/30">·</span>
                            <span className="font-semibold">{money(r.total)}</span>
                          </p>
                          {t.nota && (
                            <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-tinta/60">
                              <StickyNote className="h-3 w-3 shrink-0" aria-hidden />
                              {t.nota}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => onRetomar(t.id)}
                          disabled={bloqueado}
                          className="btn-cayla btn-primario flex h-9 shrink-0 items-center gap-1.5 px-2.5 text-[12.5px]"
                        >
                          <Play className={ICONO_CHICO} aria-hidden />
                          Retomar
                        </button>
                        {/* El mismo basurero rojo que quita una prenda del ticket: aquí tira el ticket entero que ya no se va a
                            cobrar (Felipe 2026-10-26). Pide confirmación antes, porque no se deshace. */}
                        <button
                          type="button"
                          onClick={() => onDescartarEspera(t.id)}
                          disabled={bloqueado}
                          aria-label={`Descartar el ticket de ${nombreDeEspera(t.nombre, i)}`}
                          title="Descartar este ticket"
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-rojo-profundo transition-colors hover:bg-rojo/10 hover:text-rojo"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : descontando ? (
            // En el celular el descuento vive aquí, dentro de la hoja del ticket. En escritorio sale del ticket y entra como hoja
            // lateral sobre el catálogo (`HojaDeDescuento`, como el cobro): aquí siguen las prendas, quietas (`descuentoAparte`).
            <div className={saliendo ? "anim-revelar-salida px-5 py-4" : "anim-revelar px-5 py-4"}>
              <PanelDescuento descuento={descuento} onDescuento={onDescuento} carrito={carrito} cuenta={cuenta} bloqueado={bloqueado} conQuedaria />
            </div>
          ) : cobrando && cuerpoCobro ? (
            // En el celular la hoja de cobro vive aquí, dentro de la hoja del ticket (y del formulario que cobra). En
            // escritorio entra sobre el catálogo (`HojaDeCobro` desde `PuntoDeVenta`) y aquí siguen las prendas, quietas.
            <div className={saliendo ? "anim-revelar-salida px-4 py-4" : "anim-revelar px-4 py-4"}>{cuerpoCobro}</div>
          ) : !carrito.length ? (
            <>
              {arriba}
              <div className="anim-sube flex min-h-48 flex-col items-center justify-center px-8 text-center">
                <p className="font-medium text-tinta">El ticket está vacío</p>
                <p className="mt-1 max-w-64 text-sm text-tinta/60">Escanea una etiqueta o elige una prenda del catálogo.</p>
              </div>
            </>
          ) : (
            <>
              {!cobrando && arriba}
              {/* La entrada y el reflujo de cada línea los anima el padre con `Flip`
                  (responde al escaneo que la creó); acá solo va el ref de la lista — las
                  líneas tienen que seguir siendo sus hijas directas. */}
              <div ref={listaRef} className="divide-y divide-sand">
                {/* Una prenda = una fila compacta (spike del club, 2026-09-30): `LineaDelTicket`. El descuento de
                    una prenda se abre tocando su importe; el del ticket, con «Aplicar descuento» del pie. */}
                {carrito.map((it) => (
                  <LineaDelTicket
                    key={it.claveLinea}
                    linea={it}
                    detalle={detalles?.get(it.varianteId)}
                    tambienEn={tambienEn?.get(it.claveLinea)}
                    duenos={duenosParaElegir(duenosPorVariante?.[it.varianteId])}
                    duenoElegido={duenoElegido?.[it.varianteId]}
                    onDueno={onDueno}
                    bloqueado={bloqueado || cobrando}
                    onQuitar={onQuitar}
                    onCantidad={onCantidad}
                    onDescuento={(clave) => onAbrirDescuento([clave])}
                  />
                ))}
              </div>

              {/* La nota vive con las líneas, no con el cobro: nace mientras se arma la
                  venta y el ticket en espera la guarda junto con ellas. Una línea, hasta
                  200; el contador aparece recién al pasar de 160. No va al comprobante. */}
              {!cobrando && (
              <div className="border-t border-sand px-5 py-4">
                <label className="block">
                  <span className="flex items-center gap-1.5 text-sm text-tinta/50">
                    <StickyNote className={ICONO_CHICO} aria-hidden />
                    Nota para esta venta (opcional)
                  </span>
                  <input
                    type="text"
                    maxLength={NOTA_MAX}
                    value={nota}
                    onChange={(e) => onNota(e.target.value)}
                    placeholder="Lo recoge el sábado, va con arreglo de bastilla…"
                    autoComplete="off"
                    disabled={bloqueado}
                    className="caja-campo-input mt-1.5 w-full text-sm"
                  />
                </label>
                {/* Mismo truco de `grid-template-rows` que el motivo bajo el botón: el
                    contador queda siempre montado y es la altura de su fila la que
                    anima — antes aparecía de golpe justo al pasar de 160. */}
                <div
                  className={`grid overflow-hidden transition-[grid-template-rows] ${
                    nota.length > NOTA_AVISO ? "mt-1 grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <p
                    className={`min-h-0 overflow-hidden text-right text-sm tabular-nums ${nota.length >= NOTA_MAX ? "text-rojo-profundo" : "text-tinta/50"}`}
                  >
                    {nota.length}/{NOTA_MAX}
                  </p>
                </div>
              </div>
              )}
            </>
          )}
        </div>

        <div data-guia="vender.ticket-pie" className="@container border-t border-sand bg-papel px-5 pt-4 pb-5 pv-ticket-hilo pv-ticket-pie">
          {/* El cupón del Club (programa de puntos): UNA línea de toda la compra, en cualquier momento del ticket mientras esté puesto,
              porque el Total de abajo ya lo descuenta; el reparto por prenda queda en la base y el comprobante. Se puede quitar mientras
              se arma la venta. `key` en el monto: se asienta cuando cambia, como el Total. */}
          {vale && vale.monto > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-2 text-sm">
              <span title={vale.cupon.ayuda} className="flex min-w-0 items-center gap-1.5 text-taupe-profundo">
                <Ticket className={ICONO_CHICO} aria-hidden />
                <span className="min-w-0">
                  {TEXTO_PIE_CUPON} <span className="font-mono tracking-wide">{vale.cupon.codigo}</span>
                  <span className="block text-sm text-tinta/60">{vale.cupon.detalle}</span>
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span key={vale.monto} className="anim-asentar font-semibold text-taupe-profundo">
                  −{money(vale.monto)}
                </span>
                {onQuitarCupon && momentoMostrado === "armar" && (
                  <button type="button" onClick={onQuitarCupon} disabled={bloqueado} className="btn-cayla btn-enlace text-[11.5px]">
                    Quitar
                  </button>
                )}
              </span>
            </div>
          )}
          {/* Lo que gana la miembro con esta compra (programa de puntos): se dice antes de cobrar, para que la cajera se lo cuente. */}
          {gana && gana.puntos + gana.regalo > 0 && (
            <p className="mb-3 flex items-start gap-1.5 text-sm text-taupe-profundo" data-guia="vender.gana-puntos">
              <Star className={`${ICONO_CHICO} mt-px`} aria-hidden />
              <span key={gana.puntos + gana.regalo}>
                {gana.nombre} gana <b className="font-semibold">{gana.puntos.toLocaleString("es-PE")} puntos</b> con esta compra
                {gana.regalo > 0 && <> + {gana.regalo} de regalo de cumpleaños</>}
              </span>
            </p>
          )}

          {/* Fila «Descuento», solo mientras se arma la venta: el descuento cambia cuánto
              se cobra, así que se decide antes de cobrar (decisión 3-A). Una sola línea con «Código de cupón»: «Dejar en
              espera» subió a la cabecera (Felipe 2026-10-22) para darle ese alto a la lista. */}
          {momentoMostrado === "armar" && (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm">
              {totalDescuento > 0 ? (
                <>
                  <span className="text-tinta/60">Descuento</span>
                  <span className="flex items-center gap-2">
                    <span key={totalDescuento} className="anim-asentar font-semibold text-rojo-profundo">−{money(totalDescuento)}</span>
                    <button
                      type="button"
                      onClick={() => onAbrirDescuento(null)}
                      disabled={bloqueado}
                      className="label-cayla h-7 rounded-md px-2 text-[11px] text-tinta/70 transition-colors hover:bg-sand/40 hover:text-tinta"
                    >
                      Cambiar
                    </button>
                  </span>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => onAbrirDescuento(null)}
                  disabled={bloqueado || carrito.length === 0}
                  aria-label="Aplicar descuento"
                  className="label-cayla -ml-2 h-7 rounded-md px-2 text-[11px] text-tinta/70 transition-colors hover:bg-sand/40 hover:text-tinta disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <span className="flex items-center gap-1.5">
                    <Percent className={ICONO_CHICO} aria-hidden />
                    {/* En un ticket angosto (menos de 336 px de contenido) la fila dice «Descuento · Cupón»: con las dos frases enteras se
                        partía en dos líneas y le quitaba ese alto a la lista. */}
                    <span>
                      <span className="@max-[21rem]:hidden">Aplicar </span>descuento
                    </span>
                  </span>
                </button>
              )}
              {onAbrirCodigo && (
                <button
                  type="button"
                  onClick={onAbrirCodigo}
                  disabled={bloqueado || carrito.length === 0 || vale != null}
                  data-guia="vender.codigo-cupon-boton"
                  aria-label="Código de cupón"
                  className="label-cayla -ml-2 h-7 rounded-md px-2 text-[11px] text-tinta/70 transition-colors hover:bg-sand/40 hover:text-tinta disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <span className="flex items-center gap-1.5">
                    <Ticket className={ICONO_CHICO} aria-hidden />
                    <span>
                      <span className="@max-[21rem]:hidden">Código de </span>cupón
                    </span>
                  </span>
                </button>
              )}
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-end justify-between gap-y-1">
            {/* Subtotal e IGV en la columna que ya existía, en el mismo tamaño de letra: el
                bloque pasa de 2 a 3 líneas (~48 px) y sigue más bajo que el Total (~64 px),
                así que el pie no crece. El precio ya trae el IGV: subtotal + IGV = total.
                `flex-wrap` + `ml-auto` en el Total (abajo): en el ancho normal se ve igual que
                antes (el margen automático llega al mismo lugar que dejaba `justify-between`);
                solo en un aside muy angosto el Total —que no puede encogerse, es un número sin
                espacios— baja a su propia línea en vez de recortarse contra el borde derecho. */}
            <div className="text-sm text-tinta/60">
              <p>{etiquetaPrendas}</p>
              {/* La nota de venta no desglosa IGV (ADR-0164): el pie muestra solo el total. */}
              {tipoComprobante !== "nota_venta" && (
                <dl className="grid grid-cols-[auto_auto] justify-start gap-x-3 tabular-nums">
                  <dt>Subtotal</dt>
                  <dd className="text-right">{money(desglose.subtotal)}</dd>
                  <dt>IGV ({(TASA_IGV * 100).toFixed(0)}%)</dt>
                  <dd className="text-right">{money(desglose.igv)}</dd>
                </dl>
              )}
            </div>
            <div className="ml-auto text-right">
              <p className="label-cayla text-[11px] text-tinta/60">Total</p>
              {/* `key={total}`: al cambiar el monto el número se vuelve a montar y se
                  asienta (responde a la prenda que entró, no se anima solo). */}
              <p key={total} className="anim-asentar font-display text-5xl leading-none text-tinta">
                {money(total)}
              </p>
            </div>
          </div>


          {/* El combo «Responsable» (ADR-0161; spike, pantalla 2): justo encima de Cobrar, vacío en cada venta. Al armar
              y al cobrar — la elección puede hacerse en cualquiera de los dos —; sus botones son `type="button"` y no
              envían el formulario. La lista se abre hacia arriba: debajo solo está el botón. */}
          {(momentoMostrado === "armar" || cobrando) && !bloqueado && (
            <div data-guia="vender.responsable">
              <ComboResponsable control={responsable} deshabilitado={loading} compacto className="mb-3" />
            </div>
          )}

          {/* El botón apagado dice por qué: el mismo motivo que lo apaga, debajo de él.
              Truco de `grid-template-rows` (0fr↔1fr): el párrafo queda siempre montado y
              es la ALTURA de su fila la que anima a cero — el botón de encima ya no salta
              cuando el motivo aparece o desaparece. */}
          {!enLaEspera && (
            <div
              className={`grid overflow-hidden transition-[grid-template-rows] ${
                (descontando ? motivoDescuento : motivoBloqueo) !== null ? "mb-2 grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <p id={ID_MOTIVO} className="min-h-0 overflow-hidden text-center text-sm text-tinta/60">
                {descontando ? motivoDescuento : motivoBloqueo}
              </p>
            </div>
          )}

          {enLaEspera ? null : descontando ? (
            <>
              <button
                type="button"
                onClick={onAplicarDescuento}
                disabled={bloqueado || motivoDescuento !== null}
                aria-describedby={motivoDescuento !== null ? ID_MOTIVO : undefined}
                className={`${BOTON_PRINCIPAL} ${luzListo ? "cobrar-listo" : ""}`}
              >
                <span className="label-cayla flex items-center gap-2 text-[11px]">
                  <BadgePercent className={ICONO} aria-hidden />
                  Aplicar descuento
                </span>
                <strong className="font-display text-lg">{valorValido ? (porMonto ? `−${money(monto)}` : `−${pct}%`) : "—"}</strong>
              </button>
              {hayDescuentoEnAlcance && (
                <button
                  type="button"
                  onClick={onQuitarDescuento}
                  disabled={bloqueado}
                  className="label-cayla mt-2 h-9 w-full rounded-md text-[11px] text-rojo-profundo transition-colors hover:bg-sand/40"
                >
                  Quitar descuento
                </button>
              )}
            </>
          ) : cobrando ? (
            <button
              type="submit"
              // En el celular la hoja de cobro va compacta y su «Confirmar cobro» es este: la misma ancla que el de la hoja (ADR-0536).
              data-guia="vender.cobro-confirmar"
              disabled={apagado || loading}
              aria-describedby={motivoBloqueo !== null ? ID_MOTIVO : undefined}
              className={`${BOTON_PRINCIPAL} ${listoParaConfirmar ? "cobrar-listo" : ""}`}
            >
              <span className="label-cayla flex items-center gap-2 text-[11px]">
                <Check className={ICONO} aria-hidden />
                {loading ? "Procesando…" : "Confirmar cobro"}
              </span>
              <strong className="font-display text-lg">{money(total)}</strong>
            </button>
          ) : (
            <button
              type="button"
              onClick={onIrACobrar}
              data-guia="vender.cobrar"
              disabled={apagado}
              aria-describedby={motivoBloqueo !== null ? ID_MOTIVO : undefined}
              className={BOTON_PRINCIPAL}
            >
              <span className="label-cayla flex items-center gap-2 text-[11px]">
                <Wallet className={ICONO} aria-hidden />
                Cobrar
              </span>
              <strong className="font-display text-lg">{money(total)}</strong>
            </button>
          )}
          {!cobrando && abajo}
        </div>
      </form>
    </aside>
  );
}
