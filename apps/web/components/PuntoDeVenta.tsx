"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { METODOS_PAGO, type MetodoPago } from "@cayla-retail/shared";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { filtrarPrendasV2, resolverCodigoV2, type PrendaBuscableV2 } from "@/lib/buscar-prenda-v2";
import { ETIQUETA_TIPO, tipoDocumentoDeCliente, type TipoComprobante } from "@/lib/comprobantes-reglas";
import { Ayuda } from "@/components/Ayuda";
import { Modal, botonPrimario } from "@/components/ui/Modal";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { AbrirCajaFormV2 } from "@/components/AbrirCajaFormV2";
import { CerrarCajaModalV2 } from "@/components/CerrarCajaModalV2";

/**
 * "Cargo especial" (migración `..._cargo_especial_pos.sql`): variante centinela para
 * "Monto manual" — una prenda dañada, un cargo sin etiqueta. `registrar_venta` exige un
 * variante_id real por línea, así que esto vende contra una variante real con stock casi
 * infinito en vez de tocar la RPC. Nunca aparece en catálogo ni en búsqueda: se filtra por
 * este id en `variantesVisibles`, más abajo.
 */
const ID_CARGO_ESPECIAL = "22222222-2222-4222-8222-222222222222";
const STOCK_CARGO_ESPECIAL = 999_999;

/** 18% — IGV de Perú. Solo para el desglose que se ve en pantalla: el que de
 *  verdad cuenta lo calcula `registrar_venta` en el servidor. */
const TASA_IGV = 0.18;

type VarianteBusqueda = PrendaBuscableV2 & {
  categoria: string | null;
  precio: number;
  stockAqui: number;
};

type ItemCarrito = {
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

type VentaOk = {
  total: number;
  prendas: number;
  comprobante: { tipo: TipoComprobante; texto: string } | null;
};

const MAX_RESULTADOS = 6;
const money = (n: number) => `S/${n.toFixed(2)}`;

type Props = {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  /** Null si no hay caja abierta — el catálogo se ve igual, pero queda desactivado
   *  (ver `bloqueado` más abajo). */
  cajaId: string | null;
  /** Incluye la variante centinela de "Monto manual", que este componente filtra antes
   *  de mostrar nada. */
  variantes: VarianteBusqueda[];
  ventasHoyNode: ReactNode;
};

export function PuntoDeVenta({ ubicacionId, ubicacionEtiqueta, cajaId, variantes, ventasHoyNode }: Props) {
  const bloqueado = cajaId === null;
  const router = useRouter();
  const buscador = useRef<HTMLInputElement>(null);
  const token = useRef<string>(crypto.randomUUID());

  const [q, setQ] = useState("");
  const [activo, setActivo] = useState(0);
  const [categoria, setCategoria] = useState("Todo");
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("efectivo");
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

  const catalogo = useMemo(
    () => (categoria === "Todo" ? variantesVisibles : variantesVisibles.filter((v) => v.categoria === categoria)),
    [variantesVisibles, categoria]
  );

  const term = q.trim();
  const resultados = useMemo(() => filtrarPrendasV2(q, variantesVisibles, MAX_RESULTADOS), [variantesVisibles, q]);

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
    setCarrito((actual) => actual.filter((it) => it.claveLinea !== claveLinea));
    setAviso(null);
  }

  function actualizar(claveLinea: string, campo: "cantidad" | "precioUnitario", valor: number) {
    if (campo === "precioUnitario") {
      setCarrito((actual) => actual.map((it) => (it.claveLinea === claveLinea ? { ...it, precioUnitario: Math.max(0, valor || 0) } : it)));
      return;
    }
    const item = carrito.find((it) => it.claveLinea === claveLinea);
    if (!item) return;
    const cantidad = Math.max(1, Math.min(valor || 1, item.stockAqui));
    setAviso(valor > item.stockAqui ? `En ${ubicacionEtiqueta} quedan ${item.stockAqui} de ${item.referencia}.` : null);
    setCarrito((actual) => actual.map((it) => (it.claveLinea === claveLinea ? { ...it, cantidad } : it)));
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

  function limpiarComprobante() {
    setTipoComprobante("boleta");
    setClienteNumDoc("");
    setClienteNombre("");
  }

  async function cobrar(e: React.FormEvent) {
    e.preventDefault();
    if (cajaId === null) return;
    if (carrito.length === 0) {
      avisar.error("Todavía no agregaste ninguna prenda. Escanea la etiqueta o busca en el catálogo.", { enfocar: "venta-buscar" });
      return;
    }
    if (facturaSinRuc) {
      avisar.error("La factura necesita un RUC válido. Cambia a boleta o corrige el número.", { enfocar: "documento-numero" });
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
      p_pagos: [{ metodo: metodoPago, monto: total }],
      p_token: token.current,
      p_tipo_comprobante: tipoComprobante,
      p_cliente_tipo_doc: clienteTipoDoc,
      p_cliente_num_doc: clienteNumDoc || undefined,
      p_cliente_nombre: clienteNombre || undefined,
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

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-sand bg-crema text-tinta">
      <div className="flex min-h-16 flex-wrap items-center gap-3 border-b border-sand bg-papel px-4 py-2 sm:px-6">
        <p className="label-cayla mr-auto text-[11px] text-taupe-profundo">Venta en tienda · {ubicacionEtiqueta}</p>
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

      {/* Con la caja cerrada, el catálogo y el ticket se ven igual — pero apagados y
          fuera de alcance del mouse. `disabled` real en cada control de abajo, no
          solo esto: `pointer-events-none` no le dice nada al teclado ni a un lector
          de pantalla. */}
      <div
        aria-disabled={bloqueado}
        className={`grid lg:grid-cols-[minmax(0,1fr)_420px] ${bloqueado ? "pointer-events-none opacity-50" : ""}`}
      >
        <section className="flex min-w-0 flex-col border-b border-sand lg:border-r lg:border-b-0">
          <div className="px-4 pt-2 sm:px-6 sm:pt-3">
            <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              <span aria-hidden />
              <h1 className="font-display text-center text-3xl text-tinta sm:text-4xl">Catálogo De Prendas</h1>
              <button
                type="button"
                onClick={() => setManualAbierto(true)}
                disabled={bloqueado}
                className="label-cayla flex h-10 items-center justify-self-end gap-1.5 rounded-md border border-sand bg-papel px-3 text-[11px] text-tinta transition-colors hover:bg-sand/40"
              >
                Monto manual
              </button>
            </div>

            <div className="relative z-20">
              <label className="flex h-12 items-center rounded-xl border border-sand bg-papel px-4 focus-within:border-rojo focus-within:ring-2 focus-within:ring-rojo/20">
                <input
                  id="venta-buscar"
                  ref={buscador}
                  autoFocus
                  disabled={bloqueado}
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
                    className="flex h-8 w-8 items-center justify-center rounded-md text-base text-tinta/50 hover:bg-sand/40"
                  >
                    ×
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
                              {[v.talla, v.color].filter(Boolean).join("/")} · {v.sku}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-sm font-semibold text-tinta">{money(v.precio)}</span>
                            <span className={`block text-xs ${v.stockAqui <= 0 ? "text-rojo-profundo" : "text-tinta/60"}`}>
                              {v.stockAqui <= 0 ? `sin stock` : `${v.stockAqui} en sede`}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))
                  ) : (
                    <p className="px-4 py-5 text-sm text-tinta/65">
                      No encontramos «{term}» en {ubicacionEtiqueta}.
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
                  disabled={bloqueado}
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
                    disabled={bloqueado}
                    className="relative flex h-auto min-h-40 flex-col items-stretch justify-between rounded-xl border border-sand bg-papel p-3 text-left transition-colors hover:bg-sand/30"
                  >
                    <div>
                      <p className="line-clamp-1 text-sm font-semibold text-tinta">{v.referencia}</p>
                      <p className="mt-0.5 text-xs text-tinta/60">{[v.talla, v.color].filter(Boolean).join("/")}</p>
                      <div className="mt-2 flex items-end justify-between">
                        <span className="text-sm font-bold text-tinta">{money(v.precio)}</span>
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
                <span>Ventas de hoy</span>
                <span className={`inline-block transition-transform ${mostrarVentasHoy ? "rotate-180" : ""}`}>⌄</span>
              </button>
              <div className={mostrarVentasHoy ? "mt-2" : "hidden"}>{ventasHoyNode}</div>
            </div>
          </div>
        </section>

        <aside className="flex min-h-[45vh] flex-col bg-papel lg:max-h-[42rem]">
          <div className="flex items-center justify-between border-b border-sand px-5 py-4">
            <div>
              <p className="text-xs text-tinta/60">Ticket actual</p>
              <h2 className="font-display text-base text-tinta">{ubicacionEtiqueta}</h2>
            </div>
          </div>

          <form onSubmit={cobrar} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-40 flex-1 overflow-y-auto">
              {!carrito.length ? (
                <div className="flex h-full min-h-48 flex-col items-center justify-center px-8 text-center">
                  <p className="font-medium text-tinta">El ticket está vacío</p>
                  <p className="mt-1 max-w-64 text-sm text-tinta/60">Escanea una etiqueta o elige una prenda del catálogo.</p>
                </div>
              ) : (
                <div className="divide-y divide-sand">
                  {carrito.map((it) => (
                    <article key={it.claveLinea} className="px-5 py-4">
                      <div className="flex justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-tinta">{it.referencia}</h3>
                          <p className="font-mono text-xs text-tinta/60">{it.sku}</p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Quitar ${it.referencia}`}
                          onClick={() => quitar(it.claveLinea)}
                          className="label-cayla h-8 shrink-0 rounded-md px-2 text-[11px] text-rojo-profundo hover:bg-sand/40"
                        >
                          Quitar
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
                              className="h-8 w-8 rounded-md text-base hover:bg-sand/40"
                            >
                              −
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
                              className="h-8 w-8 rounded-md text-base hover:bg-sand/40 disabled:opacity-40"
                            >
                              +
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
                              value={it.precioUnitario}
                              onChange={(e) => actualizar(it.claveLinea, "precioUnitario", Number(e.target.value))}
                              className="w-16 bg-transparent text-right text-sm font-semibold text-tinta outline-none"
                            />
                          </div>
                        </label>
                        <div className="pb-2 text-right">
                          <p className="text-[10px] text-tinta/50 uppercase">Importe</p>
                          <p className="text-sm font-bold text-tinta">{money(it.cantidad * (it.precioUnitario - it.descuentoUnitario))}</p>
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
                  <p className="text-xs text-tinta/60">Incluye IGV ({(TASA_IGV * 100).toFixed(0)}%)</p>
                </div>
                <div className="text-right">
                  <p className="label-cayla text-[11px] text-tinta/60">Total</p>
                  <p className="font-display text-5xl leading-none text-tinta">{money(total)}</p>
                </div>
              </div>

              <div className="mb-3 grid grid-cols-5 gap-1 rounded-xl bg-sand/50 p-1">
                {METODOS_PAGO.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMetodoPago(m)}
                    disabled={bloqueado}
                    className={`flex h-12 items-center justify-center rounded-lg px-1 text-center text-[10px] leading-tight capitalize transition-colors ${
                      metodoPago === m ? "bg-papel text-tinta shadow-sm" : "text-tinta/60 hover:bg-papel/60"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <span className="mb-4 flex items-center gap-1 text-[11px] text-tinta/50">
                Cómo pagó la clienta
                <Ayuda titulo="Método de pago">
                  Cómo pagó la clienta. Acá se registra, no se cobra: Yape, Plin y tarjeta se cobran en su propio
                  aparato y esto es la anotación de que entró por ahí. Sirve para el cuadre del cierre, donde solo se
                  cuenta el efectivo.
                </Ayuda>
              </span>

              <div className="mb-4 space-y-2 border-t border-sand pt-3">
                <span className="flex items-center gap-1 text-[11px] text-tinta/50">
                  Comprobante
                  <Ayuda titulo="Boleta o factura">
                    Se emite junto con la venta, con serie y número oficial. Boleta admite DNI opcional o ningún
                    documento; factura exige el RUC de la empresa. Si la clienta no pide nada, deja «Boleta» con el
                    documento en blanco.
                  </Ayuda>
                </span>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-sand/50 p-1">
                  {(["boleta", "factura"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTipoComprobante(t)}
                      disabled={bloqueado}
                      className={`label-cayla h-8 rounded-md text-[11px] transition-colors ${
                        tipoComprobante === t ? "bg-papel text-tinta shadow-sm" : "text-tinta/60 hover:bg-papel/60"
                      }`}
                    >
                      {ETIQUETA_TIPO[t]}
                    </button>
                  ))}
                </div>
                <fieldset disabled={bloqueado}>
                  <ConsultaDocumento
                    tipo={tipoComprobante === "factura" ? "ruc" : "dni"}
                    obligatorio={tipoComprobante === "factura"}
                    numero={clienteNumDoc}
                    onNumero={setClienteNumDoc}
                    nombre={clienteNombre}
                    onNombre={setClienteNombre}
                  />
                </fieldset>
              </div>


              <button
                type="submit"
                disabled={bloqueado || loading || carrito.length === 0 || facturaSinRuc}
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

      {modalCaja === "abrir" && bloqueado && (
        <Modal titulo="Abrir caja" onClose={() => setModalCaja(null)}>
          <AbrirCajaFormV2 ubicacionId={ubicacionId} ubicacionEtiqueta={ubicacionEtiqueta} />
        </Modal>
      )}
      {modalCaja === "cerrar" && cajaId && (
        <CerrarCajaModalV2 cajaId={cajaId} onClose={() => setModalCaja(null)} />
      )}

      {ok && (
        <Modal titulo="Venta registrada" subtitulo={ubicacionEtiqueta} onClose={() => setOk(null)}>
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
            <button type="button" autoFocus onClick={() => setOk(null)} className={`${botonPrimario} w-full`}>
              Nueva venta
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
