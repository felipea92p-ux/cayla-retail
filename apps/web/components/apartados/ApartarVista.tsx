"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, FileText, Minus, Plus, Receipt, ScanBarcode, ShieldCheck, StickyNote, Trash2, Undo2, User, Wallet } from "lucide-react";
import { METODOS_PAGO, type MetodoPago } from "@cayla-retail/shared";
import { money, type VarianteBusqueda } from "@/components/PuntoDeVenta";
import { ICONO_METODO } from "@/components/PuntoDeVentaTicket";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoMonto } from "@/components/ui/CampoMonto";
import { avisar } from "@/components/ui/Avisos";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { resolverCodigoV2 } from "@/lib/buscar-prenda-v2";
import { codigoPrenda } from "@/lib/prenda-reglas";
import { textoOtrasSedes } from "@/lib/stock-por-sede";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { descuentoDeCampana } from "@/lib/vender-reglas";
import { conStockAjustado } from "@/lib/vender-stock-local";
import { useStockEnVivo } from "@/lib/useStockEnVivo";
import { lineasApartables, type LineaApartar } from "@/lib/apartar-desde-ticket";
import {
  PLAZO_DIAS,
  TEXTO_PASO_APARTADO,
  adelantoDe,
  apartadoDeFila,
  erroresDelApartado,
  moverActivo,
  resultadosDelBuscador,
  pagosParaRpcApartado,
  pasoDelApartado,
  soloDigitos,
  sumarDiasIso,
  vueltoDelAdelanto,
  type Apartado,
  type FormularioApartado,
  type MedioDevolucion,
  type PagoAdelanto,
} from "@/lib/separaciones-reglas";
import { FotoPrenda, fechaCorta } from "@/components/apartados/piezas";
import { ApartadoRegistradoModal } from "@/components/apartados/ModalesApartado";

type Linea = { varianteId: string; cantidad: number };

/** Una prenda del buscador de Apartados: la del Punto de venta más lo que esta tienda tiene en su ALMACÉN. Solo se
 *  aparta lo del piso (ADR-0141), pero si la prenda está atrás la colaboradora tiene que saberlo para traerla. */
export type PrendaApartable = VarianteBusqueda & { almacenAqui?: number };

const OPCION = "rounded-lg transition-colors";
const OPCION_ACTIVA = "bg-papel text-tinta shadow-sm";
const OPCION_INACTIVA = "text-tinta/60 hover:bg-papel/60";
const BOTON_PRINCIPAL =
  "alza-cayla flex h-14 w-full items-center justify-between rounded-md bg-tinta px-5 text-crema hover:bg-rojo disabled:opacity-50 disabled:hover:bg-tinta";
const CAMPO = "w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo";

/** El descuento de la campaña que rige HOY, por prenda (la base lo vuelve a exigir al apartar). */
// Misma regla que la caja y que `separar_prendas`: el precio rebajado se redondea hacia abajo a .90 (ADR-0182).
const descuentoCampana = (p: VarianteBusqueda) => (p.campana ? descuentoDeCampana(p.precio, p.campana.pct) : 0);
const precioFinal = (p: VarianteBusqueda) => p.precio - descuentoCampana(p);

const FORMULARIO_VACIO = {
  nombres: "",
  apellidos: "",
  celular: "",
  dni: "",
  comprobante: "boleta" as "boleta" | "factura",
  ruc: "",
  razonSocial: "",
  pagos: [] as PagoAdelanto[],
  devolucionMedio: "yape" as MedioDevolucion,
  devolucionNumero: "",
  devolucionCci: "",
  acepta: false,
};

export function ApartarVista({
  ubicacionId,
  ubicacionEtiqueta,
  hoy,
  cajaAbierta,
  prendas: prendasProp,
  lineasIniciales,
  irAEntregar,
}: {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  hoy: string;
  cajaAbierta: boolean;
  prendas: PrendaApartable[];
  /** Las prendas que llegan del ticket del Punto de venta («Apartar»): arrancan en la lista, topadas por lo disponible. */
  lineasIniciales?: LineaApartar[];
  irAEntregar: () => void;
}) {
  const router = useRouter();
  // Stock en vivo (2026-09-25, mismo hueco que Vender — ADR-0018, `lib/useStockEnVivo.ts`): `prendasProp` es la
  // foto del servidor al entrar o tras un `router.refresh()`; `ajustesStock` la corrige con lo que releyó el
  // sondeo mientras la pantalla sigue abierta. Se reinicia si llega una foto nueva del servidor: esa ya es la
  // verdad y no hay que pisarla con una corrección vieja.
  const [ajustesStock, setAjustesStock] = useState<Map<string, number>>(() => new Map());
  const [prendasPropPrevia, setPrendasPropPrevia] = useState(prendasProp);
  if (prendasProp !== prendasPropPrevia) {
    setPrendasPropPrevia(prendasProp);
    setAjustesStock(new Map());
  }
  const prendas = useMemo(() => conStockAjustado(prendasProp, ajustesStock), [prendasProp, ajustesStock]);
  useStockEnVivo(
    ubicacionId,
    useMemo(() => prendasProp.map((p) => p.varianteId), [prendasProp]),
    cajaAbierta,
    (releido) => setAjustesStock((prev) => new Map([...prev, ...releido])),
  );
  const porId = useMemo(() => new Map(prendas.map((p) => [p.varianteId, p])), [prendas]);
  const [texto, setTexto] = useState("");
  // Desde el ticket del Punto de venta llegan ya elegidas; se topan por lo disponible AHORA en el piso y se dice qué
  // no entró (otra caja pudo venderla entre el ticket y esta pantalla), en vez de perderla en silencio.
  const [desdeTicket] = useState(() =>
    lineasApartables(
      lineasIniciales ?? [],
      new Map(prendasProp.map((p) => [p.varianteId, { stockAqui: p.stockAqui, nombre: [p.referencia, p.color, p.talla].filter(Boolean).join(" · ") }])),
    ),
  );
  const [mensaje, setMensaje] = useState<{ tono: "ok" | "error" | "info"; texto: string } | null>(() =>
    desdeTicket.noEntraron.length > 0
      ? { tono: "error", texto: `No quedó disponible para apartar: ${desdeTicket.noEntraron.join(", ")}.` }
      : desdeTicket.lineas.length > 0
        ? { tono: "info", texto: "Las prendas del ticket ya están en la lista. Revisa y sigue con los datos de la clienta." }
        : null,
  );
  const [activo, setActivo] = useState(0);
  const [ultima, setUltima] = useState<string | null>(null);
  const [recientes, setRecientes] = useState<string[]>([]);
  const [lineas, setLineas] = useState<Linea[]>(() => desdeTicket.lineas);
  // Leídas una vez, se quitan de la dirección: recargar después de apartar no las debe volver a cargar.
  useEffect(() => {
    if (lineasIniciales?.length) router.replace("/vender/apartados", { scroll: false });
  }, [lineasIniciales, router]);
  const [nota, setNota] = useState("");
  const [paso, setPaso] = useState<"ticket" | "formulario">("ticket");
  const [f, setF] = useState(FORMULARIO_VACIO);
  const [intento, setIntento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [registrado, setRegistrado] = useState<{ apartado: Apartado; vuelto: number } | null>(null);
  const token = useRef<string>(crypto.randomUUID());
  const escaner = useRef<HTMLInputElement>(null);
  // Apartar guarda en la tienda (cobra un adelanto y deja las prendas no disponibles): pide Responsable (ADR-0161).
  // Viene vacío en cada apartado —como todo el módulo Punto de venta, no propone a quien inició sesión—; el elegido
  // queda como asesora del apartado (`p_asesora_id`), igual que en la venta.
  const responsable = useResponsable({ ubicacionId, etiqueta: ubicacionEtiqueta }, { modo: "atencion" });

  const total = lineas.reduce((a, l) => a + precioFinal(porId.get(l.varianteId)!) * l.cantidad, 0);
  const prendasEnTicket = lineas.reduce((a, l) => a + l.cantidad, 0);
  const vence = sumarDiasIso(hoy, PLAZO_DIAS);
  // Quién atiende ya no se valida como campo del formulario: lo exige el combo «Responsable», que apaga el botón.
  const formulario: FormularioApartado = { ...f, asesoraId: responsable.elegidoId, faltaAsesora: false };
  const errores = erroresDelApartado(formulario, total);
  const pasoForm = pasoDelApartado(errores);
  const adelanto = Math.min(adelantoDe(f.pagos), total);
  const vuelto = vueltoDelAdelanto(f.pagos);
  const ver = (k: keyof typeof errores) => (intento ? errores[k] : undefined);
  const cambiar = <K extends keyof typeof FORMULARIO_VACIO>(k: K, v: (typeof FORMULARIO_VACIO)[K]) => setF((x) => ({ ...x, [k]: v }));

  function agregar(varianteId: string) {
    const p = porId.get(varianteId);
    if (!p) return;
    setUltima(varianteId);
    setTexto("");
    setActivo(0);
    escaner.current?.focus();
    setRecientes((r) => [varianteId, ...r.filter((x) => x !== varianteId)].slice(0, 4));
    const enTicket = lineas.find((l) => l.varianteId === varianteId)?.cantidad ?? 0;
    if (p.stockAqui - enTicket <= 0) {
      setMensaje({ tono: "error", texto: `${p.referencia} ${p.color ?? ""} ${p.talla ?? ""}: no queda disponible en ${ubicacionEtiqueta} (lo que hay ya está vendido o apartado para otra clienta).` });
      return;
    }
    setLineas((ls) => (enTicket ? ls.map((l) => (l.varianteId === varianteId ? { ...l, cantidad: l.cantidad + 1 } : l)) : [...ls, { varianteId, cantidad: 1 }]));
    setPaso("ticket");
    setMensaje({ tono: "ok", texto: `Agregada: ${p.referencia} ${p.color ?? ""} · ${p.talla ?? ""}` });
  }

  // La lista se arma mientras se escribe, como en el Punto de venta: lo que se puede apartar arriba, lo agotado al
  // final y sin poder elegirse (ADR-0168). El lector de código no la usa: escribe el código y manda Enter.
  const { disponibles, agotadas } = useMemo(() => resultadosDelBuscador(texto, prendas), [texto, prendas]);
  const abierta = texto.trim() !== "";

  function escribir(valor: string) {
    setTexto(valor);
    setActivo(0);
    setMensaje(null);
  }

  function teclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((a) => moverActivo(a, e.key === "ArrowDown" ? 1 : -1, disponibles.length));
    } else if (e.key === "Escape") {
      setTexto("");
    } else if (e.key === "Enter") {
      e.preventDefault();
      const t = texto.trim();
      if (!t) return;
      const exacta = resolverCodigoV2(t, prendas);
      if (exacta) return agregar(exacta.varianteId);
      const elegida = disponibles[activo];
      if (elegida) return agregar(elegida.varianteId);
      setMensaje({
        tono: "error",
        texto: agotadas.some((a) => (a.almacenAqui ?? 0) > 0)
          ? `«${t}» está en el almacén de ${ubicacionEtiqueta}, no en el piso: tráela al piso para apartarla.`
          : agotadas.length
          ? `«${t}» no tiene nada disponible en ${ubicacionEtiqueta}: lo que hay ya está vendido o apartado.`
          : `Ninguna prenda de ${ubicacionEtiqueta} coincide con «${t}». Revisa el código de la etiqueta.`,
      });
    }
  }

  const filaResultado = (v: PrendaApartable, i: number | null) => {
    const puede = i !== null;
    const otras = textoOtrasSedes(v.stockOtrasSedes ?? []);
    const atras = !puede && (v.almacenAqui ?? 0) > 0 ? v.almacenAqui : 0;
    return (
      <li key={v.varianteId} id={puede ? `apt-op-${i}` : undefined} role="option" aria-selected={puede && i === activo} aria-disabled={!puede}>
        <button
          type="button"
          disabled={!puede}
          onMouseEnter={() => puede && setActivo(i)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => agregar(v.varianteId)}
          className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors duration-200 ${puede && i === activo ? "bg-sand/60" : ""} ${puede ? "" : "cursor-not-allowed opacity-55"}`}
        >
          <FotoPrenda fotoUrl={v.fotoUrl} referencia={v.referencia} ancho={44} className="w-11" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-tinta">{v.referencia}</span>
            <span className="text-xs text-tinta/60">
              {[v.talla, v.color].filter(Boolean).join("/")} · {codigoPrenda(v)}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-sm font-semibold tabular-nums text-tinta">
              {v.campana && <span className="mr-1.5 text-xs font-normal text-tinta/45 line-through">{money(v.precio)}</span>}
              {money(precioFinal(v))}
            </span>
            <span className={`block text-xs ${puede ? "text-tinta/60" : atras ? "text-ambar-profundo" : "text-rojo-profundo"}`}>
              {puede ? `${v.stockAqui} disp.` : atras ? `${atras} en el almacén: tráela al piso` : "sin disponible aquí"}
            </span>
            {otras && <span className="block text-[11px] text-tinta/55">{otras}</span>}
          </span>
        </button>
      </li>
    );
  };

  function tocarMedio(m: MetodoPago) {
    setF((x) => {
      const i = x.pagos.findIndex((p) => p.metodo === m);
      if (i >= 0) return { ...x, pagos: x.pagos.filter((_, j) => j !== i) };
      const puesto = adelantoDe(x.pagos);
      const monto = x.pagos.length ? Math.max(0, Math.round((total - puesto) * 100) / 100) : Math.ceil(total / 2);
      return { ...x, pagos: [...x.pagos, { metodo: m, monto }] };
    });
  }

  function atajo(fraccion: number) {
    const monto = fraccion === 1 ? total : Math.ceil(total * fraccion);
    setF((x) => ({ ...x, pagos: x.pagos.length ? [{ ...x.pagos[0], monto, recibido: undefined }] : [{ metodo: "yape", monto }] }));
  }

  async function confirmar() {
    setIntento(true);
    if (Object.keys(errores).length > 0 || !cajaAbierta || !responsable.listo) return;
    setEnviando(true);
    const supabase = createClient();
    const { data: id, error } = await firmar(supabase.rpc("separar_prendas", {
      p_ubicacion_id: ubicacionId,
      p_items: lineas.map((l) => {
        const p = porId.get(l.varianteId)!;
        return { variante_id: l.varianteId, cantidad: l.cantidad, precio_unitario: p.precio, descuento_unitario: descuentoCampana(p) };
      }),
      p_pagos: pagosParaRpcApartado(f.pagos),
      p_clienta_nombres: f.nombres.trim(),
      p_clienta_apellidos: f.apellidos.trim(),
      p_clienta_celular: soloDigitos(f.celular),
      p_clienta_dni: soloDigitos(f.dni) || undefined,
      p_comprobante_tipo: f.comprobante,
      p_cliente_ruc: f.comprobante === "factura" ? soloDigitos(f.ruc) : undefined,
      p_cliente_razon_social: f.comprobante === "factura" ? f.razonSocial.trim() : undefined,
      p_devolucion_medio: f.devolucionMedio,
      p_devolucion_numero: f.devolucionMedio === "transferencia" ? undefined : soloDigitos(f.devolucionNumero) || undefined,
      p_devolucion_cci: f.devolucionMedio === "transferencia" ? soloDigitos(f.devolucionCci) : undefined,
      p_asesora_id: responsable.elegidoId ?? undefined,
      p_nota: nota.trim() || undefined,
      p_token: token.current,
    }), responsable.firma());
    // Éxito → el combo vuelve a vacío; rechazo por el responsable (marcó salida) → vacía y relee la lista.
    responsable.despues(error);
    if (error || !id) {
      setEnviando(false);
      avisar.error(traducirError(error, "registrar el apartado", { confirmarAntesDeRepetir: true }));
      return;
    }
    // Lo que se muestra en el modal es lo que quedó en la base (código, boleta, fecha), no lo que se mandó.
    const leido = await supabase.rpc("buscar_separaciones", { p_ubicacion_id: ubicacionId, p_texto: id });
    setEnviando(false);
    const fila = leido.data?.[0];
    token.current = crypto.randomUUID();
    if (fila) {
      const a = apartadoDeFila(fila as unknown as Record<string, unknown>);
      setRegistrado({ apartado: a, vuelto });
      avisar.exito(`Apartado de ${money(a.adelanto)} registrado`, { detalle: `${a.comprobanteAnticipo ?? ""} · ${a.codigo}` });
    } else {
      avisar.exito("Apartado registrado");
    }
    setLineas([]);
    setNota("");
    setF(FORMULARIO_VACIO);
    setIntento(false);
    setPaso("ticket");
    setUltima(null);
    setMensaje(null);
    router.refresh();
  }

  const p = ultima ? porId.get(ultima) : null;
  const hermanas = p ? prendas.filter((x) => x.referencia === p.referencia && x.color === p.color) : [];

  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_420px]">
      {/* Izquierda: solo lo escaneado, nunca el catálogo entero. */}
      <div className="flex min-w-0 flex-col gap-4 border-b border-sand p-5 sm:p-6 lg:border-r lg:border-b-0">
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <div className="relative z-20 w-full sm:flex-1">
            <label className="flex h-14 w-full items-center gap-3 rounded-xl border border-sand bg-papel px-4 focus-within:border-taupe">
              <ScanBarcode className="h-5 w-5 shrink-0 text-tinta/60" aria-hidden />
              <input
                ref={escaner}
                autoFocus
                value={texto}
                onChange={(e) => escribir(e.target.value)}
                onKeyDown={teclado}
                placeholder="Escanea la etiqueta o busca la prenda por nombre"
                aria-label="Escanea la etiqueta o busca la prenda por nombre"
                autoComplete="off"
                role="combobox"
                aria-expanded={abierta}
                aria-controls="apt-resultados"
                aria-activedescendant={abierta && disponibles.length ? `apt-op-${activo}` : undefined}
                aria-autocomplete="list"
                className="min-w-0 flex-1 bg-transparent text-base text-tinta outline-none placeholder:text-tinta/40"
              />
              {texto && (
                <button type="button" aria-label="Limpiar búsqueda" onClick={() => escribir("")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-base text-tinta/50 hover:bg-sand/40">
                  ×
                </button>
              )}
            </label>
            {abierta && (
              <ul id="apt-resultados" role="listbox" aria-label="Prendas encontradas" className="card-cayla anim-globo scroll-cayla absolute top-16 right-0 left-0 max-h-[430px] divide-y divide-sand overflow-y-auto !p-0 shadow-lg">
                {disponibles.length + agotadas.length === 0 ? (
                  <li className="px-4 py-5 text-sm text-tinta/65">No encontramos «{texto.trim()}» en {ubicacionEtiqueta}.</li>
                ) : (
                  <>
                    {disponibles.map((v, i) => filaResultado(v, i))}
                    {agotadas.length > 0 && (
                      <li role="presentation" className="label-cayla bg-sand/25 px-4 py-2 text-[10.5px] text-tinta/50">
                        Sin disponible en {ubicacionEtiqueta}
                      </li>
                    )}
                    {agotadas.map((v) => filaResultado(v, null))}
                  </>
                )}
              </ul>
            )}
          </div>
          <button type="button" onClick={irAEntregar} className="label-cayla h-12 rounded-xl border border-sand bg-papel px-4 text-[11px] text-tinta hover:border-taupe sm:h-14">
            Buscar apartado
          </button>
        </div>
        {mensaje && (
          <p role="status" className={`text-[13px] ${mensaje.tono === "error" ? "text-rojo-profundo" : mensaje.tono === "ok" ? "text-verde-profundo" : "text-tinta/70"}`}>
            {mensaje.texto}
          </p>
        )}

        {p ? (
          <article className="anim-revelar grid gap-5 rounded-2xl border border-sand bg-papel p-4 sm:grid-cols-[200px_minmax(0,1fr)]">
            <FotoPrenda fotoUrl={p.fotoUrl} referencia={p.referencia} ancho={200} className="w-full max-w-[200px]" />
            <div className="flex min-w-0 flex-col">
              <p className="label-cayla text-[11px] text-tinta/60">Recién escaneada</p>
              <h3 className="font-display mt-1 text-2xl text-tinta">{p.referencia}</h3>
              <p className="text-sm text-tinta/60">{p.color ?? "Sin color"}</p>
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Tallas">
                {hermanas.map((h) => (
                  <button key={h.varianteId} type="button" title={h.sku} onClick={() => agregar(h.varianteId)} className={`h-9 min-w-9 rounded-lg border px-2 text-xs font-semibold ${h.varianteId === p.varianteId ? "border-tinta bg-tinta text-papel" : h.stockAqui <= 0 ? "border-sand text-tinta/35 line-through" : "border-sand text-tinta hover:border-tinta/40"}`}>
                    {h.talla ?? "—"}
                  </button>
                ))}
              </div>
              <dl className="mt-3 divide-y divide-sand border-t border-sand text-[13px]">
                <div className="flex justify-between py-2"><dt className="text-tinta/60">Código</dt><dd className="font-mono">{p.sku}</dd></div>
                <div className="flex justify-between py-2">
                  <dt className="text-tinta/60">Precio</dt>
                  <dd className="tabular-nums font-semibold">
                    {p.campana && <span className="mr-2 text-tinta/45 line-through">{money(p.precio)}</span>}
                    {money(precioFinal(p))}
                  </dd>
                </div>
                <div className="flex justify-between py-2"><dt className="text-tinta/60">En {ubicacionEtiqueta}</dt><dd className="tabular-nums">{p.stockAqui} disponibles</dd></div>
              </dl>
              <p className="mt-auto flex items-center gap-1.5 pt-3 text-[12.5px] text-verde-profundo">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Al apartarla, ninguna caja la podrá vender.
              </p>
            </div>
          </article>
        ) : (
          <div className="flex min-h-[260px] flex-1 items-center justify-center rounded-2xl border border-dashed border-sand p-6 text-center">
            <div>
              <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-sand/60">
                <ScanBarcode className="h-7 w-7 text-tinta/70" aria-hidden />
              </div>
              <p className="font-display text-2xl text-tinta">Escanea la prenda que la clienta quiere apartar</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-tinta/60">Pasa la etiqueta por la pistola. Si no la tienes, escribe el nombre o el color: la lista muestra la foto de cada prenda.</p>
            </div>
          </div>
        )}

        {recientes.length > 0 && (
          <div>
            <p className="label-cayla mb-2 text-[11px] text-tinta/60">Escaneadas hace poco</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
              {recientes.map((id) => {
                const r = porId.get(id)!;
                return (
                  <button key={id} type="button" onClick={() => agregar(id)} className="flex items-center gap-2.5 rounded-xl border border-sand bg-papel p-2 text-left hover:border-taupe">
                    <FotoPrenda fotoUrl={r.fotoUrl} referencia={r.referencia} ancho={44} className="w-11" />
                    <span className="min-w-0 text-xs">
                      <b className="block truncate text-[13px] font-semibold">{r.referencia}</b>
                      <span className="text-tinta/60">{r.color ?? "—"} · {r.talla ?? "—"} · {r.stockAqui} disp.</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Derecha: el ticket y, al tocar «Apartar», el formulario — como el cobro del Punto de venta. */}
      <aside className="flex min-h-0 flex-col">
        {paso === "ticket" ? (
          <>
            <div className="flex min-h-[84px] items-center justify-between gap-3 border-b border-sand px-5 py-5">
              <h2 className="font-display flex items-center gap-2.5 text-2xl leading-none text-tinta">
                <Bookmark className="h-6 w-6 text-tinta/70" aria-hidden /> Por apartar
              </h2>
              {prendasEnTicket > 0 && <span className="text-xs text-tinta/60">{prendasEnTicket} {prendasEnTicket === 1 ? "prenda" : "prendas"}</span>}
            </div>
            <div className="scroll-cayla min-h-40 flex-1 overflow-y-auto">
              {lineas.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="font-display text-xl text-tinta">Nada por apartar todavía</p>
                  <p className="mt-1 text-sm text-tinta/60">Escanea la etiqueta de la prenda.</p>
                </div>
              ) : (
                <>
                  {lineas.map((l, i) => {
                    const pr = porId.get(l.varianteId)!;
                    return (
                      <div key={l.varianteId} className="anim-revelar border-b border-sand px-5 py-4">
                        <div className="flex justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[15px] font-semibold text-tinta">{pr.referencia}</p>
                            <p className="font-mono text-[11px] text-tinta/55">{pr.sku}</p>
                          </div>
                          <button type="button" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} className="label-cayla flex h-7 items-center gap-1 text-[10.5px] text-rojo-profundo">
                            <Trash2 className="h-3.5 w-3.5" aria-hidden /> Quitar
                          </button>
                        </div>
                        <div className="mt-2.5 grid grid-cols-[auto_1fr_auto] items-end gap-x-4 gap-y-1">
                          <span className="text-[10px] tracking-[0.06em] text-tinta/55 uppercase">Cantidad</span>
                          <span className="text-[10px] tracking-[0.06em] text-tinta/55 uppercase">Precio</span>
                          <span className="text-right text-[10px] tracking-[0.06em] text-tinta/55 uppercase">Importe</span>
                          <span className="inline-flex h-9 items-center rounded-lg border border-sand">
                            <button type="button" aria-label="Una menos" onClick={() => setLineas((ls) => ls.flatMap((x, j) => (j !== i ? [x] : x.cantidad > 1 ? [{ ...x, cantidad: x.cantidad - 1 }] : [])))} className="grid h-9 w-8 place-items-center text-tinta/60">
                              <Minus className="h-3.5 w-3.5" aria-hidden />
                            </button>
                            <span className="min-w-6 text-center text-sm font-semibold tabular-nums">{l.cantidad}</span>
                            <button type="button" aria-label="Una más" onClick={() => agregar(l.varianteId)} className="grid h-9 w-8 place-items-center text-tinta/60">
                              <Plus className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </span>
                          <span className="text-sm font-semibold tabular-nums">{money(precioFinal(pr))}</span>
                          <span className="text-right text-sm font-semibold tabular-nums">{money(precioFinal(pr) * l.cantidad)}</span>
                        </div>
                        <p className="mt-2 text-[11px] text-taupe-profundo">Quedan {pr.stockAqui - l.cantidad} disponibles en sede tras apartar</p>
                      </div>
                    );
                  })}
                  <label className="block px-5 py-4">
                    <span className="mb-2 flex items-center gap-1.5 text-[11.5px] text-tinta/60">
                      <StickyNote className="h-3.5 w-3.5" aria-hidden /> Nota del apartado (opcional)
                    </span>
                    <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} placeholder="Viene el sábado, quiere probársela otra vez…" className="h-11 w-full rounded-xl border border-sand bg-transparent px-3 text-sm outline-none focus:border-taupe" />
                  </label>
                </>
              )}
            </div>
            <div className="space-y-3 border-t border-sand px-5 py-5">
              <div className="flex items-end justify-between gap-3">
                <p className="text-[12.5px] text-tinta/60">
                  Precio congelado
                  <br />hasta el {fechaCorta(vence)}
                </p>
                <div className="text-right">
                  <p className="label-cayla text-[11px] text-tinta/60">Total</p>
                  <p className="font-display text-[44px] leading-none text-tinta tabular-nums">{money(total)}</p>
                </div>
              </div>
              <button type="button" disabled={lineas.length === 0} onClick={() => setPaso("formulario")} className={BOTON_PRINCIPAL}>
                <span className="label-cayla flex items-center gap-2.5 text-[11px]"><Bookmark className="h-4 w-4" aria-hidden /> Apartar</span>
                <span className="font-display text-xl tabular-nums">{money(total)}</span>
              </button>
              {lineas.length === 0 && <p className="text-center text-xs text-tinta/55">Agrega una prenda para apartar.</p>}
            </div>
          </>
        ) : (
          <>
            <div className="flex min-h-[84px] items-center justify-between gap-3 border-b border-sand px-5 py-5">
              <button type="button" onClick={() => setPaso("ticket")} className="label-cayla -ml-2 h-8 rounded-md px-2 text-[11px] text-tinta/70 hover:bg-sand/40 hover:text-tinta">
                ← Ticket
              </button>
              <div className="anim-revelar text-right">
                <h2 className="font-display flex items-center justify-end gap-2.5 text-2xl leading-none text-tinta">
                  <Bookmark className="h-6 w-6 text-tinta/70" aria-hidden /> Apartado
                </h2>
                <p className="mt-1 text-xs text-tinta/60">
                  {prendasEnTicket} {prendasEnTicket === 1 ? "prenda" : "prendas"} · recoger hasta el {fechaCorta(vence)}
                </p>
              </div>
            </div>
            <div className="scroll-cayla min-h-40 flex-1 overflow-y-auto">
              <div className="anim-revelar space-y-6 px-5 py-4">
                <div>
                  <div aria-hidden className="flex gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i < pasoForm ? "bg-tinta" : i === pasoForm ? "bg-rojo" : "bg-sand"}`} />
                    ))}
                  </div>
                  <p role="status" className="mt-2 text-[13px] text-taupe-profundo">{TEXTO_PASO_APARTADO[pasoForm]}</p>
                </div>

                <fieldset className="space-y-3.5">
                  <legend className="mb-2 flex items-center gap-1.5 text-[11px] text-tinta/50"><User className="h-3.5 w-3.5" aria-hidden /> La clienta</legend>
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <Campo etiqueta="Nombres" error={ver("nombres")}><input value={f.nombres} onChange={(e) => cambiar("nombres", e.target.value)} autoComplete="off" className={CAMPO} /></Campo>
                    <Campo etiqueta="Apellidos" error={ver("apellidos")}><input value={f.apellidos} onChange={(e) => cambiar("apellidos", e.target.value)} autoComplete="off" className={CAMPO} /></Campo>
                    <Campo etiqueta="Celular · WhatsApp" error={ver("celular")}><input value={f.celular} onChange={(e) => cambiar("celular", e.target.value)} inputMode="numeric" placeholder="9 dígitos" className={`${CAMPO} font-mono`} /></Campo>
                    <Campo etiqueta={total > 700 ? "DNI" : "DNI (recomendado)"} error={ver("dni")}><input value={f.dni} onChange={(e) => cambiar("dni", e.target.value)} inputMode="numeric" placeholder="8 dígitos" className={`${CAMPO} font-mono`} /></Campo>
                  </div>
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-sand/50 p-1">
                    {(["boleta", "factura"] as const).map((k) => (
                      <button key={k} type="button" aria-pressed={f.comprobante === k} onClick={() => cambiar("comprobante", k)} className={`${OPCION} label-cayla flex h-10 items-center justify-center gap-1.5 text-[11px] ${f.comprobante === k ? OPCION_ACTIVA : OPCION_INACTIVA}`}>
                        {k === "boleta" ? <Receipt className="h-3.5 w-3.5" aria-hidden /> : <FileText className="h-3.5 w-3.5" aria-hidden />}
                        {k}
                      </button>
                    ))}
                  </div>
                  {f.comprobante === "factura" && (
                    <div className="grid gap-3.5 sm:grid-cols-2">
                      <Campo etiqueta="RUC" error={ver("ruc")}><input value={f.ruc} onChange={(e) => cambiar("ruc", e.target.value)} inputMode="numeric" className={`${CAMPO} font-mono`} /></Campo>
                      <Campo etiqueta="Razón social" error={ver("razonSocial")}><input value={f.razonSocial} onChange={(e) => cambiar("razonSocial", e.target.value)} className={CAMPO} /></Campo>
                    </div>
                  )}
                </fieldset>

                <fieldset className="space-y-2">
                  <legend className="mb-2 flex items-center gap-1.5 text-[11px] text-tinta/50"><Wallet className="h-3.5 w-3.5" aria-hidden /> Adelanto · cómo pagó la clienta</legend>
                  <div className="grid grid-cols-5 gap-1 rounded-xl bg-sand/50 p-1">
                    {METODOS_PAGO.map((m, i) => {
                      const puesto = f.pagos.some((x) => x.metodo === m);
                      return (
                        <button key={m} type="button" aria-pressed={puesto} title={`${m} (F${i + 1})`} onClick={() => tocarMedio(m)} style={puesto ? { backgroundColor: "var(--ct)", color: "var(--cd)" } : undefined} className={`${OPCION} metodo-${m} relative flex h-14 flex-col items-center justify-center gap-1 px-1 text-[10px] leading-tight capitalize ${puesto ? "anim-pop shadow-sm" : OPCION_INACTIVA}`}>
                          <span aria-hidden className="absolute top-0.5 right-1 text-[8px] font-semibold opacity-45">F{i + 1}</span>
                          {ICONO_METODO[m]}
                          {m}
                        </button>
                      );
                    })}
                  </div>
                  {f.pagos.length > 0 && (
                    <div className="anim-revelar divide-y divide-sand rounded-lg border border-sand bg-crema">
                      {f.pagos.map((pg, i) => (
                        <div key={pg.metodo} className="flex items-center gap-2.5 px-3 py-2">
                          <span className={`metodo-${pg.metodo} flex min-w-0 flex-1 items-center gap-2 text-sm capitalize`} style={{ color: "var(--cd)" }}>
                            {ICONO_METODO[pg.metodo]} <span className="truncate">{pg.metodo}</span>
                          </span>
                          <span className="flex items-center gap-1 border-b border-tinta/20 text-sm">
                            <span className="text-tinta/50">S/</span>
                            <CampoMonto aria-label={`Monto en ${pg.metodo}`} valor={pg.monto} onCambio={(v) => setF((x) => ({ ...x, pagos: x.pagos.map((y, j) => (j === i ? { ...y, monto: v } : y)) }))} className="w-20 bg-transparent py-1 text-right tabular-nums outline-none" />
                          </span>
                          {pg.metodo === "efectivo" && (
                            <span className="flex items-center gap-1 border-b border-tinta/20 text-sm" title="Con cuánto pagó (para el vuelto)">
                              <span className="text-[11px] text-tinta/50">Recibe</span>
                              <CampoMonto aria-label="Efectivo recibido" valor={pg.recibido ?? 0} onCambio={(v) => setF((x) => ({ ...x, pagos: x.pagos.map((y, j) => (j === i ? { ...y, recibido: v || undefined } : y)) }))} className="w-16 bg-transparent py-1 text-right tabular-nums outline-none" />
                            </span>
                          )}
                          <button type="button" aria-label={`Quitar ${pg.metodo}`} onClick={() => setF((x) => ({ ...x, pagos: x.pagos.filter((_, j) => j !== i) }))} className="p-1 text-rojo-profundo">
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {([[0.3, "30%"], [0.5, "La mitad"], [1, "Todo"]] as const).map(([k, n]) => (
                      <button key={n} type="button" onClick={() => atajo(k)} className="rounded-full border border-sand px-3 py-1 text-xs tabular-nums hover:border-taupe">
                        {n} · {money(k === 1 ? total : Math.ceil(total * k))}
                      </button>
                    ))}
                  </div>
                  <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-sand">
                    <span className="block h-full rounded-full bg-tinta transition-[width] duration-500 ease-[var(--ease-cayla)]" style={{ width: `${total ? Math.min(100, (adelanto / total) * 100) : 0}%` }} />
                  </div>
                  <p className="flex justify-between text-xs text-tinta/60 tabular-nums"><span>Deja {money(adelanto)}</span><span>Saldo al recoger {money(total - adelanto)}</span></p>
                  {ver("pago") && <p className="text-xs text-rojo-profundo">{ver("pago")}</p>}
                  {vuelto > 0 && (
                    <div className="anim-revelar flex items-baseline justify-between rounded-xl border border-tinta/15 bg-papel px-4 py-2.5">
                      <span className="label-cayla text-[11px] text-tinta/70">Entregar vuelto</span>
                      <span className="font-display text-2xl tabular-nums">{money(vuelto)}</span>
                    </div>
                  )}
                </fieldset>

                <fieldset className="space-y-2.5">
                  <legend className="mb-2 flex items-center gap-1.5 text-[11px] text-tinta/50"><Undo2 className="h-3.5 w-3.5" aria-hidden /> Si no recoge, le devolvemos por</legend>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-sand/50 p-1">
                    {(["yape", "plin", "transferencia"] as const).map((k) => (
                      <button key={k} type="button" aria-pressed={f.devolucionMedio === k} onClick={() => cambiar("devolucionMedio", k)} className={`${OPCION} label-cayla h-10 text-[10.5px] ${f.devolucionMedio === k ? OPCION_ACTIVA : OPCION_INACTIVA}`}>
                        {k}
                      </button>
                    ))}
                  </div>
                  {f.devolucionMedio === "transferencia" ? (
                    <Campo etiqueta="CCI de la clienta" error={ver("devolucion")}><input value={f.devolucionCci} onChange={(e) => cambiar("devolucionCci", e.target.value)} inputMode="numeric" placeholder="20 dígitos" className={`${CAMPO} font-mono`} /></Campo>
                  ) : (
                    <Campo etiqueta={`Número de ${f.devolucionMedio === "yape" ? "Yape" : "Plin"}`} error={ver("devolucion")}><input value={f.devolucionNumero} onChange={(e) => cambiar("devolucionNumero", e.target.value)} inputMode="numeric" placeholder={f.celular || "el mismo celular"} className={`${CAMPO} font-mono`} /></Campo>
                  )}
                  <p className="text-xs text-tinta/60">Así no tiene que volver a la tienda. Efectivo, solo si viene antes de que se le transfiera.</p>
                </fieldset>

                <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-tinta/85">
                  <input type="checkbox" checked={f.acepta} onChange={(e) => cambiar("acepta", e.target.checked)} className="mt-1 accent-tinta" />
                  <span>
                    Le leí las condiciones: recoge hasta el <b>{fechaCorta(vence)}</b> con su boleta o DNI; si no, vuelve a tienda y se le devuelve el 100% por {f.devolucionMedio === "transferencia" ? "transferencia" : f.devolucionMedio === "yape" ? "Yape" : "Plin"}.
                    {ver("acepta") && <span className="block text-xs text-rojo-profundo">{ver("acepta")}</span>}
                  </span>
                </label>
              </div>
            </div>
            <div className="space-y-3 border-t border-sand px-5 py-5">
              <div className="flex items-end justify-between gap-3">
                <dl className="grid grid-cols-[auto_auto] gap-x-3 text-[12.5px] text-tinta/60 tabular-nums">
                  <dt>Total prendas</dt><dd className="text-tinta">{money(total)}</dd>
                  <dt>Saldo al recoger</dt><dd className="text-tinta">{money(total - adelanto)}</dd>
                </dl>
                <div className="text-right">
                  <p className="label-cayla text-[11px] text-tinta/60">Adelanto hoy</p>
                  <p className="font-display text-[44px] leading-none text-tinta tabular-nums">{money(adelanto)}</p>
                </div>
              </div>
              {/* El combo «Responsable» (ADR-0161), justo encima del botón que guarda, como en Cobrar. La lista se abre
                  hacia arriba: debajo solo está el botón. Sin caja abierta no se muestra: no hay nada que firmar. */}
              {cajaAbierta && <ComboResponsable control={responsable} deshabilitado={enviando} />}
              <button type="button" disabled={enviando || !cajaAbierta || !responsable.listo} title={cajaAbierta ? (responsable.motivo ?? undefined) : undefined} onClick={confirmar} className={BOTON_PRINCIPAL}>
                <span className="label-cayla flex items-center gap-2.5 text-[11px]"><Bookmark className="h-4 w-4" aria-hidden /> {enviando ? "Guardando…" : "Confirmar apartado"}</span>
                <span className="font-display text-xl tabular-nums">{money(adelanto)}</span>
              </button>
              <p className={`text-center text-xs ${intento && Object.keys(errores).length ? "text-rojo-profundo" : "text-tinta/55"}`}>
                {!cajaAbierta
                  ? "Abre la caja para poder apartar."
                  : intento && Object.keys(errores).length
                    ? Object.values(errores)[0]
                    : (responsable.motivo ?? TEXTO_PASO_APARTADO[pasoForm])}
              </p>
            </div>
          </>
        )}
      </aside>

      {registrado && (
        <ApartadoRegistradoModal
          apartado={registrado.apartado}
          vuelto={registrado.vuelto}
          sede={ubicacionEtiqueta}
          onClose={() => {
            setRegistrado(null);
            escaner.current?.focus();
          }}
        />
      )}
    </div>
  );
}

function Campo({ etiqueta, error, children }: { etiqueta: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label-cayla text-[10.5px] text-tinta/70">{etiqueta}</span>
      {children}
      {error && <span className="mt-0.5 block text-xs text-rojo-profundo">{error}</span>}
    </label>
  );
}
