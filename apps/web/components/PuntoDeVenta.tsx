"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Barcode,
  Check,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  Delete,
  History,
  Minus,
  PackageOpen,
  Plus,
  RefreshCw,
  Smartphone,
  Trash2,
  UserRound,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { METODOS_PAGO, type MetodoPago } from "@cayla-retail/shared";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { encolarVenta, pasaElUmbralDeSobra } from "@/lib/ventas-offline";
import { filtrarPrendas, resolverCodigo, type PrendaBuscable } from "@/lib/buscar-prenda";
import { Ayuda } from "@/components/Ayuda";
import { Modal, botonPrimario } from "@/components/ui/Modal";
import { gsap, Flip, useGSAP } from "@/lib/motion-gsap";

/**
 * "Cargo especial" (migración 0061): variante centinela para "Monto manual" — una prenda
 * dañada, un cargo sin etiqueta. `registrar_venta` exige un variante_id real por línea
 * (0054), así que esto vende contra una variante real con stock casi infinito en vez de
 * tocar la RPC. Nunca aparece en catálogo ni en búsqueda: se filtra por este id en
 * `variantesVisibles`, más abajo.
 */
const ID_CARGO_ESPECIAL = "22222222-2222-4222-8222-222222222222";
const STOCK_CARGO_ESPECIAL = 999_999;

type VarianteBusqueda = PrendaBuscable & {
  categoria: string | null;
  precio: number | null;
  stockAqui: number;
};

type ItemCarrito = {
  /** Identifica la FILA del carrito. Igual al varianteId salvo para "Monto manual": ahí
   *  cada agregado es un cargo distinto (montos distintos), y agrupar por varianteId como
   *  hace `agregar()` para una prenda normal fusionaría dos cargos diferentes en uno solo,
   *  perdiendo el segundo monto en silencio. Por eso cada cargo manual lleva una clave
   *  propia y `varianteId` se conserva aparte solo para lo que la RPC necesita. */
  claveLinea: string;
  varianteId: string;
  referencia: string;
  codigo: string | null;
  sku: string;
  cantidad: number;
  monto: number;
  stockAqui: number;
};

type VentaOk = { total: number; prendas: number; offline: boolean };

const ETIQUETA_METODO: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  pos: "POS",
  yape: "Yape",
  transferencia: "Transferencia",
};
const ICONO_METODO: Record<MetodoPago, typeof Banknote> = {
  efectivo: Banknote,
  pos: CreditCard,
  yape: Smartphone,
  transferencia: RefreshCw,
};

const MAX_RESULTADOS = 6;
const money = (n: number) => `S/${n.toFixed(2)}`;

type Props = {
  sedeCodigo: string;
  cajaId: string;
  /** Ya con el overlay de la cola offline aplicado (ver CajaPanel) — incluye la variante
   *  centinela de "Monto manual", que este componente filtra antes de mostrar nada. */
  variantes: VarianteBusqueda[];
  porCodigoBarras: Record<string, string>;
  sinConexion: boolean;
  colaCount: number;
  /** Los avisos de conexión/rechazo que ya arma CajaPanel — se renderizan tal cual,
   *  arriba del todo, para no duplicar esa lógica acá. */
  avisos: ReactNode;
  personaNombre: string;
  personaRolEtiqueta: string;
  ventasHoyNode: ReactNode;
  onVentaEncolada: () => void;
  onCerrarCaja: () => void;
};

export function PuntoDeVenta({
  sedeCodigo,
  cajaId,
  variantes,
  porCodigoBarras,
  sinConexion,
  colaCount,
  avisos,
  personaNombre,
  personaRolEtiqueta,
  ventasHoyNode,
  onVentaEncolada,
  onCerrarCaja,
}: Props) {
  const router = useRouter();
  const buscador = useRef<HTMLInputElement>(null);
  const listaCarrito = useRef<HTMLDivElement>(null);
  const flipState = useRef<Flip.FlipState | null>(null);
  const token = useRef<string | null>(null);

  const [q, setQ] = useState("");
  const [activo, setActivo] = useState(0);
  const [categoria, setCategoria] = useState("Todo");
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("efectivo");
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<VentaOk | null>(null);
  const [manualAbierto, setManualAbierto] = useState(false);
  const [montoManual, setMontoManual] = useState("");
  const [mostrarVentasHoy, setMostrarVentasHoy] = useState(false);

  // La centinela nunca se ve ni se escanea — solo se agrega por el botón "Monto manual".
  const variantesVisibles = useMemo(() => variantes.filter((v) => v.varianteId !== ID_CARGO_ESPECIAL), [variantes]);

  const categorias = useMemo(() => {
    const vistas = new Set<string>();
    for (const v of variantesVisibles) if (v.categoria) vistas.add(v.categoria);
    return ["Todo", ...Array.from(vistas).sort((a, b) => a.localeCompare(b, "es"))];
  }, [variantesVisibles]);

  const catalogo = useMemo(
    () => (categoria === "Todo" ? variantesVisibles : variantesVisibles.filter((v) => v.categoria === categoria)),
    [variantesVisibles, categoria]
  );

  const term = q.trim();
  const resultados = useMemo(() => filtrarPrendas(q, variantesVisibles, MAX_RESULTADOS), [variantesVisibles, q]);

  function capturarFlip() {
    if (listaCarrito.current) flipState.current = Flip.getState(listaCarrito.current.children);
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

  function agregar(v: VarianteBusqueda) {
    if (v.stockAqui <= 0) {
      setAviso(`${v.referencia} no tiene stock en ${sedeCodigo}. Búscala en Inventario para ver dónde está.`);
      setQ("");
      setActivo(0);
      buscador.current?.focus();
      return;
    }
    const existente = carrito.find((it) => it.claveLinea === v.varianteId);
    const tope = existente !== undefined && existente.cantidad >= v.stockAqui;
    if (!tope) {
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
              codigo: v.codigo,
              sku: v.sku,
              cantidad: 1,
              monto: v.precio ?? 0,
              stockAqui: v.stockAqui,
            },
          ];
        }
        if (ya.cantidad >= v.stockAqui) return actual;
        return actual.map((it) => (it.claveLinea === v.varianteId ? { ...it, cantidad: it.cantidad + 1 } : it));
      });
    }
    setAviso(tope ? `En ${sedeCodigo} quedan ${v.stockAqui} de ${v.referencia}. No puedes vender más.` : null);
    setQ("");
    setActivo(0);
    buscador.current?.focus();
  }

  function agregarMontoManual() {
    const valor = Number(montoManual);
    if (!valor) return;
    capturarFlip();
    setCarrito((actual) => [
      ...actual,
      {
        claveLinea: `manual-${Date.now()}`,
        varianteId: ID_CARGO_ESPECIAL,
        referencia: "Cargo especial",
        codigo: null,
        sku: "CARGO-ESPECIAL-01",
        cantidad: 1,
        monto: valor,
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

  function actualizar(claveLinea: string, campo: "cantidad" | "monto", valor: number) {
    if (campo === "monto") {
      setCarrito((actual) => actual.map((it) => (it.claveLinea === claveLinea ? { ...it, monto: Math.max(0, valor || 0) } : it)));
      return;
    }
    const item = carrito.find((it) => it.claveLinea === claveLinea);
    if (!item) return;
    const cantidad = Math.max(1, Math.min(valor || 1, item.stockAqui));
    setAviso(valor > item.stockAqui ? `En ${sedeCodigo} quedan ${item.stockAqui} de ${item.referencia}.` : null);
    setCarrito((actual) => actual.map((it) => (it.claveLinea === claveLinea ? { ...it, cantidad } : it)));
  }

  function alTeclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!term) return;
      const exacta = resolverCodigo(q, variantesVisibles, porCodigoBarras);
      if (exacta) return agregar(exacta);
      if (resultados.length > 0) return agregar(resultados[Math.min(activo, resultados.length - 1)]);
      setAviso(`No encontramos «${q.trim()}» en ${sedeCodigo}. Revisa la etiqueta o búscala en Inventario.`);
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

  const total = carrito.reduce((acc, it) => acc + it.cantidad * it.monto, 0);
  const prendas = carrito.reduce((acc, it) => acc + it.cantidad, 0);

  async function cobrar(e: React.FormEvent) {
    e.preventDefault();
    if (carrito.length === 0) {
      setError("Todavía no agregaste ninguna prenda. Escanea la etiqueta o busca en el catálogo.");
      return;
    }
    setLoading(true);
    setError(null);
    token.current ??= crypto.randomUUID();

    const supabase = createClient();
    const { error } = await supabase.rpc("registrar_venta", {
      p_caja_id: cajaId,
      p_metodo_pago: metodoPago,
      p_items: carrito.map((it) => ({ variante_id: it.varianteId, cantidad: it.cantidad, monto: it.monto })),
      p_token: token.current,
    });

    setLoading(false);
    if (error) {
      if (esFalloDeRed(error)) {
        const sinSobra = carrito.filter((it) => !pasaElUmbralDeSobra(it.stockAqui, it.cantidad));
        if (sinSobra.length > 0) {
          setError(
            `Sin conexión no se puede vender ${sinSobra.map((it) => it.referencia).join(", ")}: hay que dejar al menos 1 unidad en ${sedeCodigo} hasta que vuelva la red. Espera la señal o quita esa prenda del carrito.`
          );
          return;
        }
        encolarVenta({
          token: token.current,
          cajaId,
          sedeCodigo,
          metodoPago,
          items: carrito.map((it) => ({ varianteId: it.varianteId, cantidad: it.cantidad, monto: it.monto })),
          creadoEn: new Date().toISOString(),
        });
        onVentaEncolada();
        setOk({ total, prendas, offline: true });
        setCarrito([]);
        return;
      }
      setError(traducirError(error, "registrar la venta"));
      return;
    }
    setOk({ total, prendas, offline: false });
    setCarrito([]);
    router.refresh();
  }

  const estadoConexion = sinConexion
    ? { texto: "Sin conexión", claseTono: "bg-ambar/10 text-ambar-profundo", Icono: WifiOff, girar: false }
    : colaCount > 0
      ? { texto: `Subiendo ${colaCount} pendiente${colaCount === 1 ? "" : "s"}`, claseTono: "bg-ambar/10 text-ambar-profundo", Icono: RefreshCw, girar: true }
      : { texto: "En línea", claseTono: "bg-verde/10 text-verde-profundo", Icono: Wifi, girar: false };

  return (
    <main className="flex h-[calc(100vh-0px)] min-h-screen flex-col bg-crema text-tinta">
      <header className="flex min-h-16 flex-wrap items-center gap-3 border-b border-sand bg-papel px-4 py-2 sm:px-6">
        <div className="mr-auto flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tinta text-crema">
            <span className="font-display text-xl">C</span>
          </div>
          <div>
            <p className="text-base font-bold text-tinta">CAYLA</p>
            <p className="text-[11px] text-tinta/65">ERP · Punto de venta</p>
          </div>
        </div>
        <span className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium ${estadoConexion.claseTono}`}>
          <estadoConexion.Icono className={`h-3.5 w-3.5 ${estadoConexion.girar ? "animate-spin" : ""}`} />
          {estadoConexion.texto}
        </span>
        <button
          type="button"
          onClick={onCerrarCaja}
          className="label-cayla h-9 rounded-md border border-tinta/25 px-3 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
        >
          Cerrar caja
        </button>
        <div className="hidden h-9 items-center gap-2 border-l border-sand pl-4 sm:flex">
          <UserRound className="h-4 w-4 text-tinta/60" />
          <div>
            <p className="text-xs font-semibold text-tinta">{personaNombre}</p>
            <p className="text-[10px] text-tinta/60">
              {personaRolEtiqueta} · {sedeCodigo}
            </p>
          </div>
        </div>
      </header>

      {avisos && <div className="space-y-2 px-4 pt-3 sm:px-6">{avisos}</div>}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="flex min-h-[50vh] min-w-0 flex-col border-b border-sand lg:border-r lg:border-b-0">
          <div className="px-4 pt-4 sm:px-6 sm:pt-5">
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <p className="label-cayla text-[11px] text-taupe-profundo">Venta en tienda</p>
                <h1 className="font-display text-xl text-tinta">Catálogo de prendas</h1>
              </div>
              <button
                type="button"
                onClick={() => setManualAbierto(true)}
                className="label-cayla flex h-10 items-center gap-1.5 rounded-md border border-sand bg-papel px-3 text-[11px] text-tinta transition-colors hover:bg-sand/40"
              >
                <CircleDollarSign className="h-4 w-4" />
                Monto manual
              </button>
            </div>

            <div className="relative z-20">
              <label className="flex h-12 items-center rounded-xl border border-sand bg-papel px-4 focus-within:border-rojo focus-within:ring-2 focus-within:ring-rojo/20">
                <Barcode className="mr-3 h-5 w-5 text-tinta/50" />
                <input
                  id="venta-buscar"
                  ref={buscador}
                  autoFocus
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setActivo(0);
                    setAviso(null);
                  }}
                  onKeyDown={alTeclado}
                  placeholder="Escanea la etiqueta o busca la prenda"
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={resultados.length > 0}
                  aria-controls="venta-resultados"
                  aria-activedescendant={resultados.length > 0 ? `venta-op-${activo}` : undefined}
                  aria-autocomplete="list"
                  className="min-w-0 flex-1 bg-transparent text-sm text-tinta outline-none placeholder:text-tinta/45"
                />
                {q && (
                  <button
                    type="button"
                    aria-label="Limpiar búsqueda"
                    onClick={() => setQ("")}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-tinta/50 hover:bg-sand/40"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </label>
              {q && (
                <ul
                  id="venta-resultados"
                  role="listbox"
                  aria-label="Prendas encontradas"
                  className="card-cayla absolute top-14 right-0 left-0 divide-y divide-sand overflow-hidden !p-0 shadow-lg"
                >
                  {resultados.length ? (
                    resultados.map((v, i) => (
                      <li key={v.varianteId} id={`venta-op-${i}`} role="option" aria-selected={i === activo}>
                        <button
                          type="button"
                          onMouseEnter={() => setActivo(i)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => agregar(v)}
                          className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors ${i === activo ? "bg-sand/60" : ""}`}
                        >
                          <span>
                            <span className="block font-semibold text-tinta">{v.referencia}</span>
                            <span className="text-xs text-tinta/60">
                              {[v.talla, v.color].filter(Boolean).join("/")} · {v.codigo ?? v.sku}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-sm font-semibold text-tinta">{v.precio != null ? money(v.precio) : "—"}</span>
                            <span className={`block text-xs ${v.stockAqui <= 0 ? "text-rojo-profundo" : "text-tinta/60"}`}>
                              {v.stockAqui <= 0 ? `sin stock` : `${v.stockAqui} en sede`}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))
                  ) : (
                    <p className="px-4 py-5 text-sm text-tinta/65">
                      No encontramos «{term}» en {sedeCodigo}. Revisa la etiqueta o búscala en Inventario.
                    </p>
                  )}
                </ul>
              )}
            </div>
            {aviso && <p className="mt-2 text-sm text-ambar-profundo">{aviso}</p>}

            <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-3">
              {categorias.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoria(c)}
                  className={`label-cayla h-8 shrink-0 rounded-lg border px-3 text-[11px] transition-colors ${
                    categoria === c ? "border-tinta bg-tinta text-crema" : "border-sand bg-papel text-tinta/65 hover:bg-sand/40"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 sm:px-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {catalogo.map((v) => {
                const enCarrito = carrito.find((it) => it.claveLinea === v.varianteId)?.cantidad ?? 0;
                const sinStock = v.stockAqui <= 0;
                return (
                  <button
                    key={v.varianteId}
                    type="button"
                    onClick={() => agregar(v)}
                    className="relative flex h-auto min-h-44 flex-col items-stretch justify-between rounded-xl border border-sand bg-papel p-3 text-left transition-colors hover:bg-sand/30"
                  >
                    <div className="flex h-16 items-center justify-center rounded-lg bg-sand/40 text-taupe">
                      <PackageOpen className="h-6 w-6" />
                    </div>
                    <div className="pt-3">
                      <p className="line-clamp-1 text-sm font-semibold text-tinta">{v.referencia}</p>
                      <p className="mt-0.5 text-xs text-tinta/60">{[v.talla, v.color].filter(Boolean).join("/")}</p>
                      <div className="mt-2 flex items-end justify-between">
                        <span className="text-sm font-bold text-tinta">{v.precio != null ? money(v.precio) : "—"}</span>
                        <span className={`text-[11px] ${sinStock ? "text-rojo-profundo" : "text-tinta/60"}`}>
                          {sinStock ? "Sin stock" : `${v.stockAqui} en sede`}
                        </span>
                      </div>
                    </div>
                    {enCarrito > 0 && (
                      <span className="absolute top-2 right-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-tinta px-1.5 text-xs text-crema">
                        {enCarrito}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-7 border-t border-sand pt-5">
              <button
                type="button"
                onClick={() => setMostrarVentasHoy((v) => !v)}
                className="label-cayla flex w-full items-center justify-between py-2 text-[11px] text-tinta"
              >
                <span className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Ventas de hoy
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${mostrarVentasHoy ? "rotate-180" : ""}`} />
              </button>
              <div className={mostrarVentasHoy ? "mt-2" : "hidden"}>{ventasHoyNode}</div>
            </div>
          </div>
        </section>

        <aside className="flex min-h-[45vh] flex-col bg-papel lg:h-[calc(100vh-65px)]">
          <div className="flex items-center justify-between border-b border-sand px-5 py-4">
            <div>
              <p className="text-xs text-tinta/60">Ticket actual</p>
              <h2 className="font-display text-base text-tinta">Sede {sedeCodigo}</h2>
            </div>
          </div>

          <form onSubmit={cobrar} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-40 flex-1 overflow-y-auto">
              {!carrito.length ? (
                <div className="flex h-full min-h-48 flex-col items-center justify-center px-8 text-center">
                  <PackageOpen className="mb-3 h-7 w-7 text-taupe" />
                  <p className="font-medium text-tinta">El ticket está vacío</p>
                  <p className="mt-1 max-w-64 text-sm text-tinta/60">Escanea una etiqueta o elige una prenda del catálogo.</p>
                </div>
              ) : (
                <div ref={listaCarrito} className="divide-y divide-sand">
                  {carrito.map((it) => (
                    <article key={it.claveLinea} className="px-5 py-4">
                      <div className="flex justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-tinta">{it.referencia}</h3>
                          <p className="font-mono text-xs text-tinta/60">{it.codigo ?? it.sku}</p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Quitar ${it.referencia}`}
                          onClick={() => quitar(it.claveLinea)}
                          className="h-8 w-8 shrink-0 rounded-md text-tinta/50 hover:bg-sand/40 hover:text-rojo-profundo"
                        >
                          <Trash2 className="mx-auto h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-3 flex items-end justify-between gap-3">
                        <label className="text-[10px] text-tinta/50 uppercase">
                          Cantidad
                          <div className="mt-1 flex h-9 items-center rounded-lg border border-sand bg-crema">
                            <button
                              type="button"
                              aria-label="Reducir cantidad"
                              onClick={() => actualizar(it.claveLinea, "cantidad", it.cantidad - 1)}
                              className="h-8 w-8 rounded-md hover:bg-sand/40"
                            >
                              <Minus className="mx-auto h-3.5 w-3.5" />
                            </button>
                            <input
                              aria-label={`Cantidad de ${it.referencia}`}
                              type="number"
                              min={1}
                              max={it.stockAqui}
                              value={it.cantidad}
                              onChange={(e) => actualizar(it.claveLinea, "cantidad", Number(e.target.value))}
                              className="w-8 bg-transparent text-center text-sm font-semibold text-tinta outline-none"
                            />
                            <button
                              type="button"
                              aria-label="Aumentar cantidad"
                              onClick={() => actualizar(it.claveLinea, "cantidad", it.cantidad + 1)}
                              disabled={it.cantidad >= it.stockAqui}
                              className="h-8 w-8 rounded-md hover:bg-sand/40 disabled:opacity-40"
                            >
                              <Plus className="mx-auto h-3.5 w-3.5" />
                            </button>
                          </div>
                        </label>
                        <label className="text-[10px] text-tinta/50 uppercase">
                          Precio unitario
                          <div className="mt-1 flex h-9 items-center rounded-lg border border-sand bg-crema px-2">
                            <span className="mr-1 text-xs text-tinta/60">S/</span>
                            <input
                              aria-label={`Precio de ${it.referencia}`}
                              type="number"
                              min={0}
                              step="0.10"
                              value={it.monto}
                              onChange={(e) => actualizar(it.claveLinea, "monto", Number(e.target.value))}
                              className="w-16 bg-transparent text-right text-sm font-semibold text-tinta outline-none"
                            />
                          </div>
                        </label>
                        <div className="pb-2 text-right">
                          <p className="text-[10px] text-tinta/50 uppercase">Importe</p>
                          <p className="text-sm font-bold text-tinta">{money(it.cantidad * it.monto)}</p>
                        </div>
                      </div>
                      <p className="mt-2 text-[11px] text-tinta/50">
                        {it.varianteId === ID_CARGO_ESPECIAL ? "Cargo sin control de stock." : `Máximo disponible en sede: ${it.stockAqui}`}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-sand bg-papel px-5 pt-4 pb-5">
              <div className="mb-4 flex items-end justify-between">
                <div>
                  <p className="text-xs text-tinta/60">
                    {prendas} {prendas === 1 ? "prenda" : "prendas"}
                  </p>
                  <p className="text-xs text-tinta/60">Incluye IGV</p>
                </div>
                <div className="text-right">
                  <p className="label-cayla text-[11px] text-tinta/60">Total</p>
                  <p className="font-display text-5xl leading-none text-tinta">{money(total)}</p>
                </div>
              </div>

              <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-sand/50 p-1">
                {METODOS_PAGO.map((m) => {
                  const Icono = ICONO_METODO[m];
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMetodoPago(m)}
                      className={`flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px] transition-colors ${
                        metodoPago === m ? "bg-papel text-tinta shadow-sm" : "text-tinta/60 hover:bg-papel/60"
                      }`}
                    >
                      <Icono className="h-4 w-4" />
                      {ETIQUETA_METODO[m]}
                    </button>
                  );
                })}
              </div>
              <span className="mb-2 flex items-center gap-1 text-[11px] text-tinta/50">
                Cómo pagó la clienta
                <Ayuda titulo="Método de pago">
                  Cómo pagó la clienta. Acá se registra, no se cobra: Yape y POS se cobran en su propio aparato y esto
                  es la anotación de que entró por ahí. Sirve para el cuadre del cierre, donde solo se cuenta el
                  efectivo.
                </Ayuda>
              </span>

              {error && <p className="mb-2 text-sm text-rojo">{error}</p>}

              <button
                type="submit"
                disabled={loading || carrito.length === 0}
                className="flex h-14 w-full items-center justify-between rounded-md bg-tinta px-5 text-crema transition-colors hover:bg-rojo disabled:opacity-50"
              >
                <span className="label-cayla text-[11px]">{loading ? "Procesando…" : "Cobrar"}</span>
                <strong className="font-display text-lg">{money(total)}</strong>
              </button>
            </div>
          </form>
        </aside>
      </div>

      {manualAbierto && (
        <Modal titulo="Monto manual" subtitulo="Para una prenda sin etiqueta, producto dañado o cargo especial." onClose={() => setManualAbierto(false)}>
          <div className="space-y-3">
            <div className="card-cayla px-4 py-3 text-right">
              <span className="font-display text-4xl text-tinta">S/{montoManual || "0.00"}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "borrar"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMontoManual((v) => (t === "borrar" ? v.slice(0, -1) : v + t))}
                  className="h-14 rounded-lg border border-sand bg-papel text-lg text-tinta transition-colors hover:bg-sand/40"
                >
                  {t === "borrar" ? <Delete className="mx-auto h-5 w-5" /> : t}
                </button>
              ))}
            </div>
            <button type="button" onClick={agregarMontoManual} disabled={!Number(montoManual)} className={`${botonPrimario} w-full`}>
              Agregar al ticket
            </button>
          </div>
        </Modal>
      )}

      {ok && (
        <Modal titulo="Venta registrada" subtitulo={`Sede ${sedeCodigo}`} onClose={() => setOk(null)}>
          <div className="space-y-5">
            <div className="card-cayla p-5 text-center">
              <p className={`label-cayla text-[11px] ${ok.offline ? "text-ambar-profundo" : "text-verde-profundo"}`}>
                {ok.offline ? "Guardada — sube sola" : "Listo"}
              </p>
              <p className="font-display mt-2 text-3xl text-tinta">
                <Check className="mr-1 inline h-6 w-6" />
                {money(ok.total)}
              </p>
              <p className="mt-1 text-sm text-tinta/70">
                {ok.prendas} {ok.prendas === 1 ? "prenda" : "prendas"} · {ETIQUETA_METODO[metodoPago]}
              </p>
            </div>
            {ok.offline ? (
              <p className="text-center text-xs leading-relaxed text-ambar-profundo">
                Sin conexión: se guardó en este equipo y ya descuenta el stock que ves acá. Sube sola cuando vuelva la
                señal — no hace falta que hagas nada. No se puede emitir comprobante para esta venta hasta que suba.
              </p>
            ) : (
              <p className="text-center text-xs text-tinta/65">
                Ya está descontada del stock de {sedeCodigo} y aparece abajo, en «Ventas de hoy».
              </p>
            )}
            <button type="button" autoFocus onClick={() => setOk(null)} className={`${botonPrimario} w-full`}>
              Nueva venta
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
