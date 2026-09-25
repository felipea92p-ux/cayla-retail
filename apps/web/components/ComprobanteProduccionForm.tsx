"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/compras-reglas";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoSelect, CampoTexto, Desplegable } from "@/components/ui/campos";
import { MediosDePago } from "@/components/MediosDePago";
import { Modal } from "@/components/ui/Modal";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import {
  TIPOS_COMPROBANTE,
  calcularTotales,
  primerErrorComprobante,
  redondear2,
  type CondicionComprobante,
  type LineaForm,
  type TipoComprobante,
} from "@/lib/comprobantes-produccion-reglas";
import { UNIDADES_INSUMO } from "@/lib/insumos-reglas";
import { medioNuevo, mediosParaRpc, repartoDeMedios, type MedioForm } from "@/lib/medios-pago-reglas";
import { useCuentasParaElegir } from "@/components/finanzas/CampoCuenta";
import type { InsumoParaComprobante } from "@/lib/comprobantes-produccion";
import type { ProveedorProduccion } from "@/lib/proveedores-produccion-reglas";

// Alta de un comprobante de Producción (ADR-0133, F4b; D-H): la factura del proveedor de tela, avíos o maquila. Con `<Modal>` del
// sistema (ADR-0136). Las reglas duras las hace cumplir la base (`registrar_comprobante_produccion`): contado ⇒ pago por el total
// exacto; crédito ⇒ vencimiento. Acá se muestran ANTES de guardar (vista previa de subtotal, IGV y total) con la misma cuenta.
//
// Esto NO recibe la mercadería: un comprobante dice qué se compró, no qué llegó. Recibir abre el lote (F4d).
// Al contado el pago puede repartirse entre varios medios (transferencia + efectivo): son UN pago y tienen que sumar el total. Con un solo
// medio y el monto en blanco se paga el total. Un pago parcial de un crédito se registra desde Por pagar (F4c).

const LINEA_VACIA: LineaForm = { insumoId: null, descripcion: "", cantidad: "", costo: "" };
const CONCEPTO_LIBRE = "__libre__";

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function ComprobanteProduccionForm({
  proveedores,
  insumos,
  hoy,
  proveedorInicialId,
  onClose,
}: {
  proveedores: ProveedorProduccion[];
  insumos: InsumoParaComprobante[];
  hoy: string;
  proveedorInicialId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  // Un token por apertura del formulario: si la respuesta se corta y se reintenta, la base devuelve el mismo comprobante.
  const [token] = useState(() => crypto.randomUUID());
  const [proveedorId, setProveedorId] = useState(proveedorInicialId ?? "");
  const [tipo, setTipo] = useState<TipoComprobante>("factura");
  const [serie, setSerie] = useState("");
  const [numero, setNumero] = useState("");
  const [fechaEmision, setFechaEmision] = useState(hoy);
  const [condicion, setCondicion] = useState<CondicionComprobante>("credito");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [vencimientoTocado, setVencimientoTocado] = useState(false);
  const [lineas, setLineas] = useState<LineaForm[]>([{ ...LINEA_VACIA }]);
  const [totalPapel, setTotalPapel] = useState("");
  const [medios, setMedios] = useState<MedioForm[]>([medioNuevo()]);
  // ADR-0195 F3b: «Sale de» en cada medio del pago al contado (el Taller no cobra: se propone la primera cuenta que sirve).
  const cuentas = useCuentasParaElegir("pago", null);
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(false);
  // Responsable (ADR-0161/0162): el comprobante firma con quien se elige en el combo (lista de la sede activa).
  const responsable = useResponsable();

  const proveedor = proveedores.find((p) => p.id === proveedorId) ?? null;
  const totales = calcularTotales(lineas, tipo);
  const form = { proveedorId, tipo, serie, numero, fechaEmision, condicion, fechaVencimiento, lineas, totalPapel };
  const totalFinal = totalPapel.trim() !== "" && Number(totalPapel.replace(",", ".")) >= 0 ? redondear2(Number(totalPapel.replace(",", "."))) : totales.total;
  // Un solo medio con el monto en blanco = paga el total (lo más común, sin escribir nada).
  const mediosEfectivos = medios.length === 1 && medios[0].monto.trim() === "" ? [{ ...medios[0], monto: totalFinal.toFixed(2) }] : medios;
  const reparto = repartoDeMedios(mediosEfectivos, totalFinal, true);
  const errorPago = condicion === "contado" && totalFinal > 0 ? reparto.error ?? (reparto.cuadra ? null : "Al contado, los medios de pago tienen que sumar el total.") : null;
  const error = primerErrorComprobante(form, hoy) ?? errorPago;

  // El vencimiento se sugiere con el plazo del proveedor, mientras no se haya tocado a mano.
  function sugerirVencimiento(prov: ProveedorProduccion | null, emision: string) {
    if (vencimientoTocado) return;
    setFechaVencimiento(prov?.plazoCreditoDias ? sumarDias(emision, prov.plazoCreditoDias) : "");
  }
  function elegirProveedor(id: string) {
    setProveedorId(id);
    const p = proveedores.find((x) => x.id === id) ?? null;
    // Si el proveedor no da crédito, lo normal es contado; si da, crédito. Se puede cambiar.
    if (p) setCondicion(p.plazoCreditoDias ? "credito" : "contado");
    if (p?.formaPagoPreferida && medios.length === 1) setMedios([{ ...medios[0], metodo: (["transferencia", "yape", "plin", "efectivo", "deposito", "otro"] as const).find((m) => m === p.formaPagoPreferida) ?? medios[0].metodo }]);
    sugerirVencimiento(p, fechaEmision);
  }

  function cambiarLinea(i: number, cambio: Partial<LineaForm>) {
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...cambio } : l)));
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (error) return avisar.error(error);
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setCargando(true);
    const llenas = lineas.filter((l) => l.insumoId || l.descripcion.trim() || l.cantidad.trim() || l.costo.trim());
    const { error: err } = await firmar(createClient().rpc("registrar_comprobante_produccion", {
      p_proveedor_id: proveedorId,
      p_serie: serie.trim(),
      p_numero: numero.trim(),
      p_condicion: condicion,
      p_tipo: tipo,
      p_fecha_emision: fechaEmision,
      p_fecha_vencimiento: condicion === "credito" ? fechaVencimiento : undefined,
      p_items: llenas.map((l) => ({
        insumo_id: l.insumoId ?? undefined,
        descripcion: l.insumoId ? undefined : l.descripcion.trim(),
        cantidad: Number(l.cantidad.replace(",", ".")),
        costo_unitario: Number(l.costo.replace(",", ".")),
      })),
      p_total: totalPapel.trim() !== "" ? Number(totalPapel.replace(",", ".")) : undefined,
      p_pago: condicion === "contado" ? mediosParaRpc(mediosEfectivos, hoy, cuentas.cuentas) : undefined,
      p_nota: nota.trim() || undefined,
      p_token: token,
    }), responsable.firma());
    responsable.despues(err);
    setCargando(false);
    if (err) {
      avisar.error(traducirError(err, "registrar el comprobante"));
      return;
    }
    avisar.exito(`${serie.trim().toUpperCase()}-${numero.trim()} registrado`, {
      detalle: condicion === "contado" ? `Pagado al contado: ${soles(totalFinal)}.` : `Por pagar ${soles(totalFinal)} a ${proveedor?.nombre ?? "el proveedor"}.`,
    });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Nueva factura de insumos" subtitulo="La factura de quien le vende al Taller" onClose={onClose} ancho="max-w-2xl">
      <form onSubmit={guardar} className="space-y-5">
        <CampoSelect
          etiqueta="Proveedor"
          valor={proveedorId}
          onValor={(v) => elegirProveedor(v)}
          opciones={proveedores.map((p) => ({ valor: p.id, texto: p.nombre }))}
          marcador="Elige un proveedor…"
        />
        {proveedores.length === 0 && <p className="-mt-3 text-xs text-tinta/65">Todavía no hay proveedores de Producción. Agrégalos en Proveedores.</p>}

        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Documento</p>
          <div className="mt-1.5 grid gap-3 sm:grid-cols-[auto_6rem_1fr_9.5rem]">
            <SegmentoDeslizante
              etiqueta="Tipo de comprobante"
              valor={tipo}
              onCambio={(c) => setTipo(c as TipoComprobante)}
              opciones={TIPOS_COMPROBANTE.map((t) => ({ clave: t.valor, etiqueta: t.corta }))}
            />
            <CampoTexto etiqueta={<span className="sr-only">Serie</span>} mono placeholder="F001" value={serie} onChange={(e) => setSerie(e.target.value)} maxLength={8} />
            <CampoTexto etiqueta={<span className="sr-only">Número</span>} mono placeholder="00012345" value={numero} onChange={(e) => setNumero(e.target.value)} />
            <CampoTexto
              etiqueta={<span className="sr-only">Fecha de emisión</span>}
              type="date"
              value={fechaEmision}
              max={hoy}
              onChange={(e) => {
                setFechaEmision(e.target.value);
                sugerirVencimiento(proveedor, e.target.value);
              }}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="label-cayla text-[11px] text-tinta/65">¿Cómo se paga?</p>
            <SegmentoDeslizante
              className="mt-1.5"
              etiqueta="Condición de pago"
              valor={condicion}
              onCambio={(c) => setCondicion(c as CondicionComprobante)}
              opciones={[
                { clave: "credito", etiqueta: "Crédito" },
                { clave: "contado", etiqueta: "Contado" },
              ]}
            />
          </div>
          {condicion === "credito" ? (
            <CampoTexto
              etiqueta="Vence el"
              type="date"
              value={fechaVencimiento}
              min={fechaEmision}
              onChange={(e) => {
                setFechaVencimiento(e.target.value);
                setVencimientoTocado(true);
              }}
              pie={proveedor?.plazoCreditoDias ? `${proveedor.nombre} da ${proveedor.plazoCreditoDias} días` : undefined}
            />
          ) : (
            <p className="self-end pb-2 text-xs text-tinta/65">Se paga hoy: elige abajo con qué medio o medios.</p>
          )}
        </div>

        <fieldset>
          <legend className="label-cayla text-[11px] text-tinta/65">Qué se compró · costo unitario sin IGV</legend>
          <ul className="mt-2 space-y-2">
            {lineas.map((l, i) => {
              const insumo = insumos.find((x) => x.id === l.insumoId);
              const subtotalLinea = Number(l.cantidad.replace(",", ".")) > 0 && l.costo.trim() !== "" ? redondear2(Number(l.cantidad.replace(",", ".")) * Number(l.costo.replace(",", "."))) : null;
              return (
                <li key={i} className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_auto] items-start gap-2 max-sm:grid-cols-[minmax(0,1fr)_5rem_5rem_auto]">
                  <div className="space-y-1.5">
                    <Desplegable
                      valor={l.insumoId ?? (l.descripcion || l.insumoId === null ? CONCEPTO_LIBRE : "")}
                      onValor={(v) => cambiarLinea(i, v === CONCEPTO_LIBRE ? { insumoId: null } : { insumoId: v, descripcion: "" })}
                      opciones={[
                        { valor: CONCEPTO_LIBRE, texto: "Otro concepto (flete, maquila…)" },
                        ...insumos.map((x) => ({ valor: x.id, texto: `${x.nombre} · ${UNIDADES_INSUMO[x.unidad].corta}` })),
                      ]}
                      etiquetaAccesible={`Línea ${i + 1}: insumo`}
                      forma="caja"
                    />
                    {!l.insumoId && (
                      <input
                        aria-label={`Línea ${i + 1}: concepto`}
                        placeholder="Qué se compró"
                        value={l.descripcion}
                        onChange={(e) => cambiarLinea(i, { descripcion: e.target.value })}
                        className="h-9 w-full rounded-md border border-tinta/25 bg-papel px-2 text-sm text-tinta outline-none focus:border-rojo"
                      />
                    )}
                    {subtotalLinea !== null && <p className="text-xs tabular-nums text-tinta/65">Línea: {soles(subtotalLinea)}</p>}
                  </div>
                  <input
                    aria-label={`Línea ${i + 1}: cantidad${insumo ? ` en ${UNIDADES_INSUMO[insumo.unidad].corta}` : ""}`}
                    inputMode="decimal"
                    placeholder={insumo ? UNIDADES_INSUMO[insumo.unidad].corta : "Cant."}
                    value={l.cantidad}
                    onChange={(e) => cambiarLinea(i, { cantidad: e.target.value })}
                    className="h-9 rounded-md border border-tinta/25 bg-papel px-2 text-right text-sm tabular-nums text-tinta outline-none focus:border-rojo"
                  />
                  <input
                    aria-label={`Línea ${i + 1}: costo unitario sin IGV`}
                    inputMode="decimal"
                    placeholder="S/ c/u"
                    value={l.costo}
                    onChange={(e) => cambiarLinea(i, { costo: e.target.value })}
                    className="h-9 rounded-md border border-tinta/25 bg-papel px-2 text-right text-sm tabular-nums text-tinta outline-none focus:border-rojo"
                  />
                  <button
                    type="button"
                    aria-label={`Quitar la línea ${i + 1}`}
                    disabled={lineas.length === 1}
                    onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}
                    className="grid h-9 w-9 place-items-center rounded-md text-tinta/55 outline-none hover:text-rojo focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo/60 disabled:opacity-30 disabled:hover:text-tinta/55"
                  >
                    <X size={16} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => setLineas((ls) => [...ls, { ...LINEA_VACIA }])}
            className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-tinta/75 underline-offset-2 outline-none hover:text-rojo hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo/60"
          >
            <Plus size={14} aria-hidden /> Agregar línea
          </button>
        </fieldset>

        <dl className="divide-y divide-tinta/10 overflow-hidden rounded-xl border border-sand bg-crema text-[13px]">
          <div className="flex justify-between gap-3 px-3 py-2">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{soles(totales.subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-3 px-3 py-2">
            <dt>{tipo === "factura" ? "IGV 18 %" : "IGV"}</dt>
            <dd className="tabular-nums">{tipo === "factura" ? soles(totales.igv) : "no aplica"}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
            <dt className="font-semibold">Total</dt>
            <dd className="font-display text-lg tabular-nums">{soles(totalFinal)}</dd>
          </div>
        </dl>

        {condicion === "contado" && <MediosDePago medios={medios} onCambio={setMedios} esperado={totalFinal} exacto etiquetaEsperado="Total a pagar" cuentas={{ lista: cuentas.cuentas, listo: cuentas.listo }} />}

        <div className="grid gap-3 sm:grid-cols-2">
          <CampoTexto
            etiqueta="Total impreso en el papel"
            inputMode="decimal"
            placeholder={`Opcional · ${totales.total.toFixed(2)}`}
            value={totalPapel}
            onChange={(e) => setTotalPapel(e.target.value)}
            pie="Si el proveedor redondeó distinto, se respeta su total"
          />
          <CampoTexto etiqueta="Nota" placeholder="Opcional" value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <p className="min-h-4 text-xs text-tinta/65" role="status">
            {error && (proveedorId || serie || numero || totales.lineasCompletas > 0) ? error : ""}
          </p>
          <ComboResponsable control={responsable} deshabilitado={cargando} />
          <Boton peso="primario" type="submit" cargando={cargando} disabled={!!error || !responsable.listo} title={responsable.motivo ?? undefined} className="w-full">
            {cargando ? "Guardando…" : condicion === "contado" ? `Registrar y pagar ${soles(totalFinal)}` : "Registrar como por pagar"}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
