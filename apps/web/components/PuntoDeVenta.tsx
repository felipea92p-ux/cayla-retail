"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { MetodoPago } from "@cayla-retail/shared";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { filtrarPrendasV2, resolverCodigoV2, type PrendaBuscableV2 } from "@/lib/buscar-prenda-v2";
import { teclaSueltaVaAlEscaner } from "@/lib/escaner-tecla-suelta";
import { agruparCatalogo } from "@/lib/catalogo-grupos";
import { ETIQUETA_TIPO, tipoDocumentoDeCliente, type TipoComprobante } from "@/lib/comprobantes-reglas";
import { aplicarDescuento, motivoBloqueoCobro, restanteDePagos, vueltoDe, type MomentoTicket, type PagoAplicado } from "@/lib/vender-reglas";
import { gsap, Flip, useGSAP } from "@/lib/motion-gsap";
import { Modal, botonPrimario } from "@/components/ui/Modal";
import { AbrirCajaFormV2 } from "@/components/AbrirCajaFormV2";
import { CerrarCajaModalV2 } from "@/components/CerrarCajaModalV2";
import { PuntoDeVentaCatalogo } from "@/components/PuntoDeVentaCatalogo";
import { PuntoDeVentaTicket } from "@/components/PuntoDeVentaTicket";

/**
 * "Cargo especial" (migración `..._cargo_especial_pos.sql`): variante centinela para
 * "Monto manual" — una prenda dañada, un cargo sin etiqueta. `registrar_venta` exige un
 * variante_id real por línea, así que esto vende contra una variante real con stock casi
 * infinito en vez de tocar la RPC. Nunca aparece en catálogo ni en búsqueda: se filtra por
 * este id en `variantesVisibles`, más abajo.
 */
export const ID_CARGO_ESPECIAL = "22222222-2222-4222-8222-222222222222";
const STOCK_CARGO_ESPECIAL = 999_999;

export type VarianteBusqueda = PrendaBuscableV2 & {
  categoria: string | null;
  precio: number;
  stockAqui: number;
  /** Dónde más hay, de más a menos (`lib/stock-por-sede.ts`). Solo sedes con stock > 0 y
   *  sin la actual; una colaboradora con sede fija lo recibe vacío porque RLS no le deja
   *  ver otras sedes. Opcional para no romper a quien arme variantes sin esta consulta. */
  stockOtrasSedes?: { sede: string; cantidad: number }[];
};

export type ItemCarrito = {
  /** Identifica la FILA del carrito. Igual al varianteId salvo para "Monto manual": ahí
   *  cada agregado es un cargo distinto (montos distintos), y agrupar por varianteId como
   *  hace `agregar()` para una prenda normal fusionaría dos cargos diferentes en uno solo,
   *  perdiendo el segundo monto en silencio. */
  claveLinea: string;
  varianteId: string;
  referencia: string;
  sku: string;
  cantidad: number;
  precioUnitario: number;
  descuentoUnitario: number;
  stockAqui: number;
};

/** Lo que la colaboradora está decidiendo en el apartado «Descuento»: el % (texto tal
 *  cual lo escribe) y a qué líneas alcanza — `null` es todo el ticket; `[]` es que
 *  todavía no eligió ninguna (no se puede aplicar). */
export type DescuentoForm = { pct: string; elegidas: string[] | null };
/** Un medio con el que pagó la clienta (ver `lib/vender-reglas.ts`); compartido con el
 *  ticket desde acá, como los otros tipos (ADR-0043). */
export type { PagoAplicado } from "@/lib/vender-reglas";

type VentaOk = {
  total: number;
  prendas: number;
  comprobante: { tipo: TipoComprobante; texto: string } | null;
};

const MAX_RESULTADOS = 6;

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
  /** Null si no hay caja abierta — el catálogo se ve igual, pero queda desactivado
   *  (ver `bloqueado` más abajo). */
  cajaId: string | null;
  /** Incluye la variante centinela de "Monto manual", que este componente filtra antes
   *  de mostrar nada. */
  variantes: VarianteBusqueda[];
  ventasHoyNode: ReactNode;
};

export function PuntoDeVenta({ ubicacionId, ubicacionEtiqueta, esLider, cajaId, variantes, ventasHoyNode }: Props) {
  const bloqueado = cajaId === null;
  const router = useRouter();
  const buscador = useRef<HTMLInputElement>(null);
  const token = useRef<string>(crypto.randomUUID());

  const [q, setQ] = useState("");
  const [activo, setActivo] = useState(0);
  const [categoria, setCategoria] = useState("Todo");
  /** Filtro «Solo con stock» de la grilla. Apagado por defecto: las prendas sin stock se
   *  ven atenuadas, no desaparecen — así la encargada de sede sabe que existen y que no
   *  hay en su tienda. Solo afecta a `catalogo`; el escáner sigue reconociéndolas. */
  const [soloConStock, setSoloConStock] = useState(false);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  // El ticket tiene dos momentos: «armar» (solo líneas y total) y «cobrar» (pago y
  // comprobante). Vive acá y no en el ticket porque `cobrar()` lo devuelve a «armar».
  const [momento, setMomento] = useState<MomentoTicket>("armar");
  // Pago mixto (decidido con Felipe el 2026-09-14): una fila por medio, sin preselección
  // — un «efectivo» que nadie eligió es un dato fantasma en el cuadre de caja. `cobrar()`
  // no sale hasta que las filas cubran el total al centavo: lo frena `motivoBloqueo`.
  const [pagos, setPagos] = useState<PagoAplicado[]>([]);
  const [descuento, setDescuento] = useState<DescuentoForm>({ pct: "", elegidas: null });
  // Código que autoriza el descuento de una Colaboradora; viaja tal cual y la RPC lo valida.
  const [codigoDescuento, setCodigoDescuento] = useState("");
  const [tipoComprobante, setTipoComprobante] = useState<Extract<TipoComprobante, "boleta" | "factura">>("boleta");
  const [clienteNumDoc, setClienteNumDoc] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<VentaOk | null>(null);
  const [manualAbierto, setManualAbierto] = useState(false);
  const [montoManual, setMontoManual] = useState("");
  const [mostrarVentasHoy, setMostrarVentasHoy] = useState(false);
  const [modalCaja, setModalCaja] = useState<"abrir" | "cerrar" | null>(null);

  const variantesVisibles = useMemo(() => variantes.filter((v) => v.varianteId !== ID_CARGO_ESPECIAL), [variantes]);

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
  const grupos = useMemo(() => {
    const todos = agruparCatalogo(catalogo);
    return soloConStock ? todos.filter((g) => g.stockTotal > 0) : todos;
  }, [catalogo, soloConStock]);

  const term = q.trim();
  const resultados = useMemo(() => filtrarPrendasV2(q, variantesVisibles, MAX_RESULTADOS), [variantesVisibles, q]);

  // Los modales de caja se montan con la misma condición que los pinta el JSX de abajo —
  // no basta `modalCaja !== null`: «Abrir caja» se desmonta porque `bloqueado` pasa a
  // false (la caja ya abrió), no por su onClose, y `modalCaja` se queda en "abrir".
  const modalAbrirVisible = modalCaja === "abrir" && bloqueado;
  const modalCerrarVisible = modalCaja === "cerrar" && cajaId !== null;
  // Los dos efectos de foco de abajo se apagan con un modal abierto: el modal es dueño
  // del foco mientras vive, y al cerrarse lo devuelve él mismo (`alCerrarEnfocar`).
  const hayModal = manualAbierto || modalAbrirVisible || modalCerrarVisible || ok !== null;

  // El escáner es la ruta principal de la caja, así que el foco vuelve a él solo.
  // `autoFocus` del campo solo actúa al montar — y si la pantalla cargó con la caja
  // cerrada, el campo se montó `disabled`. Al abrir caja, `router.refresh()` trae el
  // `cajaId`, el campo se habilita y esto lo enfoca.
  useEffect(() => {
    if (!bloqueado && !hayModal) buscador.current?.focus();
  }, [bloqueado, hayModal]);

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
      absolute: true,
      onEnter: (elementos) => gsap.fromTo(elementos, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.32, ease: "caylaEase" }),
      onLeave: (elementos) => gsap.to(elementos, { opacity: 0, duration: 0.18 }),
    });
    flipState.current = null;
  }, [carrito.length]);

  const clienteTipoDoc = tipoDocumentoDeCliente(tipoComprobante, clienteNumDoc);
  const facturaSinRuc = tipoComprobante === "factura" && !clienteNumDoc;

  function agregar(v: VarianteBusqueda) {
    if (bloqueado) return;
    if (v.stockAqui <= 0) {
      setAviso(`${v.referencia} no tiene stock en ${ubicacionEtiqueta}.`);
      setQ("");
      setActivo(0);
      buscador.current?.focus();
      return;
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
          return [
            ...actual,
            {
              claveLinea: v.varianteId,
              varianteId: v.varianteId,
              referencia: v.referencia,
              sku: v.sku,
              cantidad: 1,
              precioUnitario: v.precio,
              descuentoUnitario: 0,
              stockAqui: v.stockAqui,
            },
          ];
        }
        if (ya.cantidad >= v.stockAqui) return actual;
        return actual.map((it) => (it.claveLinea === v.varianteId ? { ...it, cantidad: it.cantidad + 1 } : it));
      });
    }
    setAviso(tope ? `En ${ubicacionEtiqueta} quedan ${v.stockAqui} de ${v.referencia}. No puedes vender más.` : null);
    setQ("");
    setActivo(0);
    buscador.current?.focus();
  }

  function agregarMontoManual() {
    if (bloqueado) return;
    const valor = Number(montoManual);
    if (!valor) return;
    capturarFlip();
    setCarrito((actual) => [
      ...actual,
      {
        claveLinea: `manual-${Date.now()}`,
        varianteId: ID_CARGO_ESPECIAL,
        referencia: "Cargo especial",
        sku: "CARGO-ESPECIAL-01",
        cantidad: 1,
        precioUnitario: valor,
        descuentoUnitario: 0,
        stockAqui: STOCK_CARGO_ESPECIAL,
      },
    ]);
    setMontoManual("");
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
    const item = carrito.find((it) => it.claveLinea === claveLinea);
    if (!item) return;
    const cantidad = Math.max(1, Math.min(valor || 1, item.stockAqui));
    setAviso(valor > item.stockAqui ? `En ${ubicacionEtiqueta} quedan ${item.stockAqui} de ${item.referencia}.` : null);
    setCarrito((actual) => actual.map((it) => (it.claveLinea === claveLinea ? { ...it, cantidad } : it)));
  }

  // Apartado «Descuento» (decidido con Felipe el 2026-09-14): un solo formulario con dos
  // entradas — la fila sobre el total (todo el ticket) y el «%» de cada línea (esa sola).
  // Se aplica como `descuentoUnitario` por línea, que es lo que `registrar_venta` guarda.
  function abrirDescuento(claves: string[] | null) {
    setDescuento({ pct: "", elegidas: claves });
    setMomento("descuento");
  }
  function aplicarDescuentoAlTicket() {
    setCarrito((actual) => aplicarDescuento(actual, Number(descuento.pct), descuento.elegidas ?? []));
    setMomento("armar");
  }
  function quitarDescuentoDelTicket() {
    setCarrito((actual) => aplicarDescuento(actual, 0, descuento.elegidas ?? []));
    setMomento("armar");
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
  const motivoBloqueo = motivoBloqueoCobro({ cajaAbierta: !bloqueado, prendas, momento, total, pagos, facturaSinRuc });

  // Tocar un medio agrega su fila con lo que falta cubrir; combinar es bajar un monto y
  // tocar otro medio. Una fila por medio: tocar uno que ya está no duplica.
  function agregarPago(metodo: MetodoPago) {
    if (pagos.some((p) => p.metodo === metodo)) return;
    setPagos((actual) => [...actual, { metodo, monto: Math.max(0, restante) }]);
  }
  function cambiarMontoPago(indice: number, monto: number) {
    const limpio = Math.max(0, Math.round((monto || 0) * 100) / 100);
    setPagos((actual) => actual.map((p, i) => (i === indice ? { ...p, monto: limpio } : p)));
  }
  function quitarPago(indice: number) {
    setPagos((actual) => actual.filter((_, i) => i !== indice));
  }
  // Lo que la clienta entregó en efectivo — solo para mostrar el vuelto; NUNCA viaja a
  // la RPC (si viajara lo entregado en vez de lo que cubre, rechazaría por no cuadrar).
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

    const supabase = createClient();
    const { data: ventaId, error } = await supabase.rpc("registrar_venta", {
      p_ubicacion_id: ubicacionId,
      p_items: carrito.map((it) => ({
        variante_id: it.varianteId,
        cantidad: it.cantidad,
        precio_unitario: it.precioUnitario,
        descuento_unitario: it.descuentoUnitario,
      })),
      // Solo `{ metodo, monto }`: el `recibido` es de pantalla. Y solo montos > 0 —
      // `venta_pagos` lo exige; una fila bajada a cero mientras se combinaba no viaja.
      p_pagos: pagos.filter((p) => p.monto > 0).map(({ metodo, monto }) => ({ metodo, monto })),
      p_token: token.current,
      p_tipo_comprobante: tipoComprobante,
      p_cliente_tipo_doc: clienteTipoDoc,
      p_cliente_num_doc: clienteNumDoc || undefined,
      p_cliente_nombre: clienteNombre || undefined,
      p_codigo_descuento: codigoDescuento.trim() || undefined,
    });

    if (error) {
      setLoading(false);
      avisar.error(traducirError(error, "registrar la venta"));
      return;
    }

    // El comprobante ya se emitió en la MISMA transacción que la venta
    // (0011_venta_con_comprobante.sql) — esta consulta es solo para mostrar su
    // serie-número; nunca puede "fallar en emitir" por separado.
    let comprobante: VentaOk["comprobante"] = null;
    if (ventaId) {
      const { data: comp } = await supabase.from("comprobantes").select("tipo, serie, numero").eq("venta_id", ventaId).maybeSingle();
      if (comp) comprobante = { tipo: comp.tipo as TipoComprobante, texto: `${comp.serie}-${String(comp.numero).padStart(6, "0")}` };
    }

    setLoading(false);
    token.current = crypto.randomUUID();
    avisar.exito(`Venta de ${money(total)} registrada`, { detalle: comprobante ? `${ETIQUETA_TIPO[comprobante.tipo]} ${comprobante.texto}` : `${prendas} ${prendas === 1 ? "prenda" : "prendas"} · ${ubicacionEtiqueta}` });
    setOk({ total, prendas, comprobante });
    setCarrito([]);
    limpiarComprobante();
    router.refresh();
  }

  // Al cerrar «Venta registrada» el ticket vuelve a «armar»: la venta siguiente
  // arranca por las prendas, no por el cobro.
  function cerrarVentaRegistrada() {
    setOk(null);
    // Cada venta vuelve a preguntar cómo pagó la clienta: heredar los medios de la
    // anterior sería el mismo dato fantasma que la preselección que se quitó.
    setPagos([]);
    setCodigoDescuento("");
    setMomento("armar");
  }

  return (
    // En escritorio (lg) el POS es una pantalla fija: la página no hace scroll, el
    // catálogo y el ticket scrollean cada uno por dentro. La altura es lo que queda
    // bajo la cabecera fija de AppShell: `100dvh` menos el `pt-24 + pb-12` de su
    // `<main>` (9rem). En celular/tablet (apilado) se mantiene el scroll de página:
    // dos scrolls internos uno debajo del otro serían peores que uno solo.
    <div className="flex flex-col overflow-hidden rounded-2xl border border-sand bg-crema text-tinta lg:h-[calc(100dvh-9rem)]">
      <div className="flex min-h-16 flex-wrap items-center gap-3 border-b border-sand bg-papel px-4 py-2 sm:px-6">
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
                className="label-cayla rounded-md px-2 py-1.5 text-[11px] text-tinta/60 transition-colors hover:bg-sand/40 hover:text-tinta"
              >
                {a.texto}
              </Link>
            ))}
          </nav>
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
        </div>
      </div>

      {/* Con la caja cerrada, el catálogo y el ticket se ven igual — pero apagados y
          fuera de alcance del mouse. `disabled` real en cada control de abajo, no
          solo esto: `pointer-events-none` no le dice nada al teclado ni a un lector
          de pantalla. */}
      {/* `grid-rows-[minmax(0,1fr)]`: con la fila implícita (`auto`) los dos paneles
          nunca encogen por debajo de su contenido y el scroll interno de cada uno no
          se activa — la fila crece y la raíz lo recorta en silencio. */}
      <div
        aria-disabled={bloqueado}
        className={`grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_420px] lg:grid-rows-[minmax(0,1fr)] ${bloqueado ? "pointer-events-none opacity-50" : ""}`}
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
          onMontoManual={() => setManualAbierto(true)}
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
          grupos={grupos}
          carrito={carrito}
          mostrarVentasHoy={mostrarVentasHoy}
          onAlternarVentasHoy={() => setMostrarVentasHoy((v) => !v)}
          ventasHoyNode={ventasHoyNode}
        />

        <PuntoDeVentaTicket
          bloqueado={bloqueado}
          carrito={carrito}
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
        />
      </div>

      {manualAbierto && (
        <Modal
          titulo="Monto manual"
          subtitulo="Para una prenda sin etiqueta, producto dañado o cargo especial."
          onClose={() => setManualAbierto(false)}
          alCerrarEnfocar={buscador}
        >
          <div className="space-y-3">
            <div className="card-cayla px-4 py-3 text-right">
              <span className="font-display text-4xl text-tinta">S/{montoManual || "0.00"}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "←"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMontoManual((v) => (t === "←" ? v.slice(0, -1) : v + t))}
                  className="h-14 rounded-lg border border-sand bg-papel text-lg text-tinta transition-colors hover:bg-sand/40"
                >
                  {t}
                </button>
              ))}
            </div>
            <button type="button" onClick={agregarMontoManual} disabled={!Number(montoManual)} className={`${botonPrimario} w-full`}>
              Agregar al ticket
            </button>
          </div>
        </Modal>
      )}

      {modalAbrirVisible && (
        <Modal titulo="Abrir caja" onClose={() => setModalCaja(null)} alCerrarEnfocar={buscador}>
          <AbrirCajaFormV2 ubicacionId={ubicacionId} ubicacionEtiqueta={ubicacionEtiqueta} />
        </Modal>
      )}
      {modalCerrarVisible && cajaId && (
        <CerrarCajaModalV2 cajaId={cajaId} onClose={() => setModalCaja(null)} />
      )}

      {ok && (
        <Modal titulo="Venta registrada" subtitulo={ubicacionEtiqueta} onClose={cerrarVentaRegistrada} alCerrarEnfocar={buscador}>
          <div className="space-y-5">
            <div className="card-cayla p-5 text-center">
              <p className="label-cayla text-[11px] text-verde-profundo">Listo</p>
              <p className="font-display mt-2 text-3xl text-tinta">{money(ok.total)}</p>
              <p className="mt-1 text-sm text-tinta/70">
                {ok.prendas} {ok.prendas === 1 ? "prenda" : "prendas"}
              </p>
            </div>
            <p className="text-center text-xs text-tinta/65">
              Ya está descontada del stock de {ubicacionEtiqueta} y aparece abajo, en «Ventas de hoy».
            </p>
            {ok.comprobante && (
              <p className="card-cayla text-center text-sm text-tinta">
                {ETIQUETA_TIPO[ok.comprobante.tipo]} <span className="font-mono">{ok.comprobante.texto}</span> emitida
              </p>
            )}
            <button type="button" autoFocus onClick={cerrarVentaRegistrada} className={`${botonPrimario} w-full`}>
              Nueva venta
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
