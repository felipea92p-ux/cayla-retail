"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Minus, Plus, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { filtrarPrendasV2, resolverCodigoV2, type PrendaBuscableV2 } from "@/lib/buscar-prenda-v2";
import { lineasDeLaProforma, numeroDeProforma, TOPE_DESCUENTO_PROFORMA, totalesDeLineas, type Proforma } from "@/lib/proformas-reglas";
import { RAZONES_DESCUENTO } from "@/lib/vender-reglas";
import { venceDentroDe } from "@/lib/facturacion-proformas-reglas";
import { soles } from "@/lib/compras-reglas";
import { traducirError } from "@/lib/error-escritura";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { Modal } from "@/components/ui/Modal";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoSelect, CampoTexto, Desplegable, Segmentado } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

/** Una prenda del catálogo que se puede poner en una proforma (la arma la página Proformas desde `getCatalogo`). */
export type PrendaParaProforma = PrendaBuscableV2 & { codigo: string | null; precio: number; fotoUrl: string | null; colorHex: string | null };

type Fila = { prenda: PrendaParaProforma; cantidad: number; pct: number; motivo: string; detalle: string };

const PCT_MAX = Math.round(TOPE_DESCUENTO_PROFORMA * 100);
const descuentoDe = (f: Fila) => Math.round(f.prenda.precio * f.pct) / 100;
const CONTROL = "rounded-md border border-tinta/15 bg-white/60 px-1.5 py-1 text-xs outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo/60";

// «Nueva proforma» (spec 2026-09-22): prendas del catálogo con cantidad y descuento (hasta 20 %, con motivo),
// clienta, validez y nota. La cuenta que se ve es `totalesDeLineas`, la misma que hace `crear_proforma`; la base
// la vuelve a hacer y es la que manda. Vive en la pestaña Proformas (la única que lee el catálogo). Con `inicial`
// arranca como copia de otra: «Duplicar» o, si venció, «Renovar» (precios de hoy, sin los descuentos de antes).
export function NuevaProformaModal({
  onCerrar,
  prendas,
  ubicaciones,
  ubicacionActualId,
  esLider,
  inicial = null,
}: {
  onCerrar: () => void;
  prendas: PrendaParaProforma[];
  ubicaciones: { id: string; nombre: string }[];
  ubicacionActualId: string;
  esLider: boolean;
  inicial?: Proforma | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // Crear una proforma guarda en Facturación: pide Responsable (ADR-0161, A7).
  const responsable = useResponsable();
  const [ubicacionId, setUbicacionId] = useState(inicial?.ubicacion_id ?? ubicacionActualId);
  const lineasIniciales = lineasDeLaProforma(inicial?.items) ?? [];
  const [filas, setFilas] = useState<Fila[]>(() =>
    lineasIniciales.flatMap((l) => {
      const prenda = prendas.find((p) => p.varianteId === l.variante_id);
      if (!prenda) return [];
      // El descuento se copia solo si la prenda sigue al mismo precio: sobre otro precio ya no es lo que se prometió.
      const mismoPrecio = prenda.precio === l.precio_unitario && l.descuento_unitario > 0;
      const pct = mismoPrecio ? Math.min(PCT_MAX, Math.round((l.descuento_unitario / l.precio_unitario) * 100)) : 0;
      return [{ prenda, cantidad: l.cantidad, pct, motivo: pct > 0 ? (l.motivo_descuento ?? "") : "", detalle: pct > 0 ? (l.motivo_descuento_detalle ?? "") : "" }];
    })
  );
  // Las que ya no están en el catálogo no se copian: se dice cuáles, en vez de perderlas en silencio.
  const noCopiadas = lineasIniciales.filter((l) => !prendas.some((p) => p.varianteId === l.variante_id)).map((l) => l.descripcion);
  const [q, setQ] = useState("");
  const [tipoDoc, setTipoDoc] = useState<"dni" | "ruc">(inicial?.cliente_num_doc?.length === 11 ? "ruc" : "dni");
  const [clienteNombre, setClienteNombre] = useState(inicial?.cliente_nombre ?? "");
  const [clienteDoc, setClienteDoc] = useState(inicial?.cliente_num_doc ?? "");
  const [dias, setDias] = useState("7");
  const [nota, setNota] = useState(inicial?.nota ?? "");

  const resultados = useMemo(() => (q.trim() ? filtrarPrendasV2(q, prendas, 6) : []), [q, prendas]);
  const totales = totalesDeLineas(filas.map((f) => ({ cantidad: f.cantidad, precio_unitario: f.prenda.precio, descuento_unitario: descuentoDe(f) })));
  const faltaMotivo = filas.some((f) => f.pct > 0 && (!f.motivo || (f.motivo === "otro" && !f.detalle.trim())));
  const diasValidos = Math.max(1, Math.min(60, Math.round(Number(dias)) || 7));

  function agregar(p: PrendaParaProforma) {
    setFilas((actual) =>
      actual.some((f) => f.prenda.varianteId === p.varianteId)
        ? actual.map((f) => (f.prenda.varianteId === p.varianteId ? { ...f, cantidad: f.cantidad + 1 } : f))
        : [...actual, { prenda: p, cantidad: 1, pct: 0, motivo: "", detalle: "" }]
    );
    setQ("");
  }

  function cambiar(id: string, cambio: Partial<Fila>) {
    setFilas((actual) => actual.map((f) => (f.prenda.varianteId === id ? { ...f, ...cambio } : f)));
  }

  function quitar(id: string) {
    setFilas((actual) => actual.filter((f) => f.prenda.varianteId !== id));
  }

  async function onCrear(e: React.FormEvent) {
    e.preventDefault();
    if (filas.length === 0) return void avisar.error("Agrega al menos una prenda.");
    if (faltaMotivo) return void avisar.error("Cada descuento necesita su motivo.");
    if (!responsable.listo) return;
    setLoading(true);
    const { error } = await firmar(createClient().rpc("crear_proforma", {
      p_ubicacion_id: ubicacionId,
      p_items: filas.map((f) => ({
        variante_id: f.prenda.varianteId,
        cantidad: f.cantidad,
        precio_unitario: f.prenda.precio,
        descuento_unitario: descuentoDe(f),
        motivo_descuento: f.pct > 0 ? f.motivo : null,
        motivo_descuento_detalle: f.pct > 0 && f.motivo === "otro" ? f.detalle.trim() : null,
      })),
      p_cliente_nombre: clienteNombre.trim() || undefined,
      p_cliente_num_doc: clienteDoc.trim() || undefined,
      p_vence_at: venceDentroDe(diasValidos),
      p_nota: nota.trim() || undefined,
    }), responsable.firma());
    responsable.despues(error);
    setLoading(false);
    if (error) return void avisar.error(traducirError(error, "crear la proforma"));
    avisar.exito(`Proforma de ${soles(totales.total)} creada`, {
      detalle: `${totales.prendas} ${totales.prendas === 1 ? "prenda" : "prendas"} · vale ${diasValidos} ${diasValidos === 1 ? "día" : "días"}.`,
    });
    onCerrar();
    router.refresh();
  }

  const titulo = !inicial ? "Nueva proforma" : inicial.vencida ? `Renovar ${numeroDeProforma(inicial.numero)}` : `Copia de ${numeroDeProforma(inicial.numero)}`;

  return (
    <Modal titulo={titulo} subtitulo={inicial ? "Con los precios de hoy. Revisa y guarda como una proforma nueva." : undefined} ancho="max-w-3xl" onClose={onCerrar}>
      {(cerrar) => (
        <form onSubmit={onCrear} className="mt-5 space-y-4">
          {noCopiadas.length > 0 && (
            <p role="status" className="rounded-md border border-ambar/30 bg-ambar/10 px-3 py-2 text-sm text-ambar-profundo">
              Ya no están en el catálogo y no se copiaron: {noCopiadas.join(", ")}.
            </p>
          )}

          {esLider && ubicaciones.length > 1 && (
            <CampoSelect etiqueta="Tienda" valor={ubicacionId} onValor={setUbicacionId} opciones={ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre }))} />
          )}

          {/* El buscador: referencia, SKU o código de etiqueta; Enter con un código exacto (escáner) la agrega. */}
          <div className="relative">
            <label className="vidrio-cayla flex h-10 items-center gap-2 rounded-[10px] px-3 text-sm text-tinta focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-rojo/60">
              <Search aria-hidden strokeWidth={1.75} className="h-4 w-4 shrink-0 text-tinta/60" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const elegida = resolverCodigoV2(q, prendas) ?? resultados[0];
                  if (elegida) agregar(elegida);
                }}
                placeholder="Busca la prenda o escanea su código…"
                aria-label="Buscar prenda"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-tinta/55"
              />
            </label>
            {resultados.length > 0 && (
              <ul className="card-cayla absolute inset-x-0 top-11 z-10 max-h-72 overflow-auto p-1" data-sin-cascada>
                {resultados.map((p) => (
                  <li key={p.varianteId}>
                    <button
                      type="button"
                      onClick={() => agregar(p)}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-tinta/[0.05] focus-visible:bg-tinta/[0.05]"
                    >
                      <Foto prenda={p} />
                      <span className="min-w-0 flex-1">
                        <b className="font-semibold">{p.referencia}</b> · {[p.talla, p.color].filter(Boolean).join(" · ")}
                        <span className="block text-xs text-tinta/55">{p.codigo ?? p.sku}</span>
                      </span>
                      <span className="tabular-nums">{soles(p.precio)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {filas.length === 0 ? (
            <p className="rounded-[12px] border border-dashed border-tinta/25 px-4 py-6 text-center text-sm text-tinta/60">Todavía no hay prendas. Búscalas arriba.</p>
          ) : (
            <ul className="divide-y divide-tinta/10 rounded-[12px] border border-tinta/10">
              {filas.map((f) => {
                const id = f.prenda.varianteId;
                const descuento = descuentoDe(f);
                return (
                  <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                    <Foto prenda={f.prenda} />
                    <div className="min-w-[9rem] flex-1">
                      <p className="text-sm font-semibold text-tinta">{f.prenda.referencia}</p>
                      <p className="text-xs text-tinta/60">{[f.prenda.talla, f.prenda.color, f.prenda.codigo].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button type="button" aria-label={`Una ${f.prenda.referencia} menos`} onClick={() => (f.cantidad > 1 ? cambiar(id, { cantidad: f.cantidad - 1 }) : quitar(id))} className="grid h-7 w-7 place-items-center rounded-md hover:bg-tinta/10">
                        <Minus aria-hidden className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center tabular-nums" aria-label="Cantidad">{f.cantidad}</span>
                      <button type="button" aria-label={`Una ${f.prenda.referencia} más`} onClick={() => cambiar(id, { cantidad: f.cantidad + 1 })} className="grid h-7 w-7 place-items-center rounded-md hover:bg-tinta/10">
                        <Plus aria-hidden className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <label className="flex items-center gap-1 text-xs text-tinta/70">
                      Dscto.
                      <input
                        type="number"
                        min={0}
                        max={PCT_MAX}
                        step={1}
                        inputMode="numeric"
                        value={f.pct || ""}
                        placeholder="0"
                        onChange={(e) => cambiar(id, { pct: Math.min(PCT_MAX, Math.max(0, Math.round(Number(e.target.value) || 0))) })}
                        aria-label={`Descuento en % de ${f.prenda.referencia} (hasta ${PCT_MAX} %)`}
                        className={`${CONTROL} w-12 text-right tabular-nums`}
                      />
                      %
                    </label>
                    {f.pct > 0 && (
                      <Desplegable
                        valor={f.motivo}
                        onValor={(v) => cambiar(id, { motivo: v })}
                        opciones={RAZONES_DESCUENTO.map((r) => ({ valor: r.valor, texto: r.etiqueta }))}
                        marcador="Motivo…"
                        forma="pastilla"
                        etiquetaAccesible={`Motivo del descuento de ${f.prenda.referencia}`}
                      />
                    )}
                    {f.pct > 0 && f.motivo === "otro" && (
                      <input value={f.detalle} onChange={(e) => cambiar(id, { detalle: e.target.value })} placeholder="¿Por qué?" aria-label="Detalle del motivo" className={`${CONTROL} w-32`} />
                    )}
                    <p className="ml-auto w-24 text-right tabular-nums">
                      {descuento > 0 && <span className="block text-xs text-tinta/55 line-through">{soles(f.prenda.precio * f.cantidad)}</span>}
                      <b className="font-semibold">{soles((f.prenda.precio - descuento) * f.cantidad)}</b>
                    </p>
                    <button type="button" aria-label={`Quitar ${f.prenda.referencia}`} onClick={() => quitar(id)} className="grid h-7 w-7 place-items-center rounded-md text-tinta/60 hover:bg-tinta/10 hover:text-tinta">
                      <X aria-hidden className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Segmentado
                etiqueta="Documento de la clienta"
                valor={tipoDoc}
                onValor={(t) => {
                  setTipoDoc(t);
                  setClienteDoc("");
                }}
                opciones={[
                  { valor: "dni", texto: "DNI" },
                  { valor: "ruc", texto: "RUC" },
                ] as const}
              />
              <ConsultaDocumento tipo={tipoDoc} obligatorio={false} numero={clienteDoc} onNumero={setClienteDoc} nombre={clienteNombre} onNombre={setClienteNombre} disparo="boton" />
              <CampoTexto etiqueta="Vale por (días)" type="number" min="1" max="60" inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} />
              <CampoTexto etiqueta="Nota para la clienta" pie="Sale impresa al pie. Opcional." maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Incluye caja de regalo" />
            </div>
            <dl className="space-y-1 self-end rounded-[12px] bg-tinta/[0.03] px-4 py-3 text-sm">
              <div className="flex justify-between text-tinta/70">
                <dt>
                  {totales.prendas} {totales.prendas === 1 ? "prenda" : "prendas"} · descuentos
                </dt>
                <dd className="tabular-nums">− {soles(totales.descuentos)}</dd>
              </div>
              <div className="flex justify-between text-tinta/70">
                <dt>Op. gravada</dt>
                <dd className="tabular-nums">{soles(totales.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-tinta/70">
                <dt>IGV 18 %</dt>
                <dd className="tabular-nums">{soles(totales.igv)}</dd>
              </div>
              <div className="font-display flex justify-between border-t border-tinta/15 pt-1 text-xl text-tinta">
                <dt>Total</dt>
                <dd className="tabular-nums">{soles(totales.total)}</dd>
              </div>
            </dl>
          </div>

          <ComboResponsable control={responsable} deshabilitado={loading} />

          <div className="flex gap-2 pt-1">
            <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              className="flex-1"
              cargando={loading}
              disabled={filas.length === 0 || !responsable.listo}
              title={responsable.motivo ?? undefined}
            >
              {loading ? "Guardando…" : "Crear proforma"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** La foto de la prenda para su color; sin foto, un recuadro del color (el mismo criterio que la hoja A4). */
export function Foto({ prenda }: { prenda: { fotoUrl: string | null; colorHex: string | null; referencia: string } }) {
  if (prenda.fotoUrl) {
    return (
      <span className="relative h-12 w-10 shrink-0 overflow-hidden rounded-[4px] bg-sand/40">
        <Image src={prenda.fotoUrl} alt={prenda.referencia} fill sizes="40px" className="object-cover" unoptimized />
      </span>
    );
  }
  return <span aria-hidden className="h-12 w-10 shrink-0 rounded-[4px] border border-tinta/10" style={{ background: prenda.colorHex ?? "#e9e2d6" }} />;
}
