"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/compras-reglas";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoMonto, CampoSelect, CampoTexto, Segmentado } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { camposDeIngresoDeInsumo, ingresoListo } from "@/lib/insumos-guia";
import { CANTIDAD_ILEGIBLE, UNIDADES_INSUMO, cantidadTexto, leerCantidad } from "@/lib/insumos-reglas";
import { COSTO_UNITARIO_ILEGIBLE, costoUnitarioIlegible, costoUnitarioTexto, numeroDeCostoUnitario } from "@/lib/monto-plata-reglas";
import type { InsumoVista } from "@/lib/insumos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { CompraDelInsumo, type ProveedorParaCompra } from "@/components/insumos-taller/CompraDelInsumo";
import { PROPUESTA_DEL_TALLER, useCuentasParaElegir, useIdDelTaller } from "@/components/finanzas/CampoCuenta";
import { hoyLima } from "@/lib/fechas-lima";
import { argsDeCompra, problemasDeCompra, totalesDeCompra, vencimientoPorDefecto, type TipoPapel } from "@/lib/insumo-compra-reglas";
import { medioNuevo, mediosParaRpc, type MedioForm } from "@/lib/medios-pago-reglas";

// Ingresar un lote de insumo (ADR-0133, F3): solo del líder, mete dinero (el costo del lote). Con origen «Compra» (P03, Felipe 2026-11-02) pide proveedor, papel y si ya se pagó o queda por pagar, y lo guarda por
// `recibir_insumo_comprado`: factura + lote + deuda en una transacción. «Saldo inicial» sigue por `recibir_insumo`, sin proveedor ni deuda. «Nuevo insumo» vive en `components/insumos-taller/` desde la actividad 8e. Con `<Modal>` del sistema (ADR-0136): no se define otra animación ni otro overlay.

export function IngresarInsumoModal({ insumos, insumoInicialId, tallerId, proveedores = [], onClose }: { insumos: InsumoVista[]; insumoInicialId: string | null; tallerId: string; proveedores?: readonly ProveedorParaCompra[]; onClose: () => void }) {
  const router = useRouter();
  const [insumoId, setInsumoId] = useState(insumoInicialId ?? insumos[0]?.id ?? "");
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState("");
  const [codigoLote, setCodigoLote] = useState("");
  const [documento, setDocumento] = useState("");
  const [origen, setOrigen] = useState<"compra" | "saldo_inicial">("compra");
  // Doble clic (ADR-0190): un token por intento. Si el mismo intento llega dos veces (dos clics, un reintento tras
  // una red que se cae), la base devuelve lo ya guardado en vez de abrir dos lotes. Uno por cada vez que se abre la ventana.
  const token = useRef<string>(crypto.randomUUID());
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(false);
  // La compra con deuda (P03): proveedor, papel, y si ya se pagó o queda por pagar.
  const hoy = hoyLima();
  const [proveedorId, setProveedorId] = useState("");
  const [tipoPapel, setTipoPapel] = useState<TipoPapel>("factura");
  const [serie, setSerie] = useState("");
  const [numeroPapel, setNumeroPapel] = useState("");
  const [sinPapel, setSinPapel] = useState(false);
  const [pagada, setPagada] = useState(false);
  const [venceEscrito, setVenceEscrito] = useState<string | null>(null);
  const [medios, setMedios] = useState<MedioForm[]>([medioNuevo("transferencia", "")]);
  // «Sale de» en cada medio: la cuenta que el líder eligió para el Taller (igual que en «Pagar comprobante»).
  const taller = useIdDelTaller();
  const cuentas = useCuentasParaElegir("pago", taller.id, taller.listo, { propuestaSoloDe: PROPUESTA_DEL_TALLER });
  // Responsable (ADR-0161/0162): el ingreso firma con quien se elige en el combo (lista del Taller, la sede activa).
  const responsable = useResponsable();

  const insumo = insumos.find((i) => i.id === insumoId);
  // Lo escrito se lee con las reglas únicas (coma o punto decimal). Lo que no se entiende NO es cero: la hoja lo dice y no deja guardar (`ingresoListo`);
  // antes `Number("2,5")` daba NaN, luego 0, y el lote se abría a costo cero.
  const q = leerCantidad(cantidad) ?? 0;
  const costoLeido = numeroDeCostoUnitario(costo);
  const c = Number.isFinite(costoLeido) ? costoLeido : 0;
  const total = q * c;
  const cantidadIlegible = cantidad.trim() !== "" && leerCantidad(cantidad) === null;
  const costoIlegible = costoUnitarioIlegible(costo);
  const unidad = insumo?.unidad ?? "unidad";
  const listo = ingresoListo({ tieneInsumo: !!insumo, cantidad, costo });
  const esCompra = origen === "compra";
  // El vencimiento sigue al plazo del proveedor hasta que la persona lo escribe.
  const plazo = proveedores.find((p) => p.id === proveedorId)?.plazoCreditoDias ?? null;
  const vence = venceEscrito ?? vencimientoPorDefecto(hoy, plazo);
  const compra = {
    proveedorId,
    tipo: tipoPapel,
    serie,
    numero: numeroPapel,
    sinPapel,
    pagada,
    emision: hoy,
    vence,
    cantidad: q,
    costoUnitario: c,
    medios: mediosParaRpc(medios, undefined, cuentas.cuentas).map((m) => ({ ...m, metodo: m.metodo as MedioForm["metodo"] })),
  };
  const totales = totalesDeCompra(q, c, sinPapel ? "nota_venta" : tipoPapel);
  const problemasCompra = esCompra ? problemasDeCompra(compra) : [];
  const guia = useGuiaCampos(
    camposDeIngresoDeInsumo({ tieneInsumo: !!insumo, cantidad, costo, responsableListo: responsable.listo, compra: esCompra ? { faltan: problemasCompra.map((p) => p.campo) } : undefined }),
  );
  function cambiarPagada(v: boolean) {
    setPagada(v);
    // Al pasar a «ya la pagué», el primer medio ya trae el total.
    if (v) setMedios([medioNuevo("transferencia", totales.total.toFixed(2))]);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!insumo || !listo) return;
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    if (esCompra && problemasCompra.length > 0) {
      avisar.error(problemasCompra[0].texto);
      return;
    }
    setCargando(true);
    const { error } = esCompra
      ? await firmar(createClient().rpc("recibir_insumo_comprado" as never, argsDeCompra(compra, { insumoId: insumo.id, tallerId, codigoLote, nota, token: token.current }) as never), responsable.firma())
      : await firmar(createClient().rpc("recibir_insumo", {
      p_insumo_id: insumo.id,
      p_ubicacion_id: tallerId,
      p_cantidad: q,
      p_costo_total: Math.round(total * 100) / 100,
      p_codigo_lote: codigoLote.trim() || undefined,
      p_documento: documento.trim() || undefined,
      p_origen: origen,
      p_nota: nota.trim() || undefined,
      p_token: token.current,
    }), responsable.firma());
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "ingresar el insumo", { confirmarAntesDeRepetir: true }));
      return;
    }
    const proveedor = proveedores.find((p) => p.id === proveedorId)?.nombre;
    avisar.exito(`${cantidadTexto(q, unidad)} de ${insumo.nombre} entraron`, {
      detalle: esCompra
        ? `Se abrió un lote a ${costoUnitarioTexto(c)} por ${UNIDADES_INSUMO[unidad].corta}. ${pagada ? `Pagado ${soles(totales.total)}` : `Por pagar ${soles(totales.total)}`}${proveedor ? ` a ${proveedor}` : ""}${sinPapel ? " (sin el papel todavía)" : ""}.`
        : `Se abrió un lote a ${costoUnitarioTexto(c)} por ${UNIDADES_INSUMO[unidad].corta}.`,
    });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Ingresar insumo" subtitulo="Cada ingreso abre un lote con su propio costo" variante="hoja" onClose={onClose}>
      <form onSubmit={guardar} className="mt-3.5 space-y-4">
        <CampoGuiado id="insumo" guia={guia}>
          <CampoSelect
            etiqueta={guia.etiqueta("insumo", "¿Qué llegó?")}
            valor={insumoId}
            onValor={(v) => setInsumoId(v)}
            opciones={insumos.map((i) => ({ valor: i.id, texto: `${i.nombre} · hay ${cantidadTexto(i.saldo, i.unidad)}` }))}
          />
        </CampoGuiado>
        <Segmentado
          etiqueta="Origen"
          valor={origen}
          onValor={(v) => setOrigen(v)}
          opciones={[
            { valor: "compra", texto: "Compra" },
            { valor: "saldo_inicial", texto: "Saldo inicial" },
          ]}
          pie={origen === "saldo_inicial" ? "Lo que ya había en el estante antes de usar el sistema: no lleva proveedor ni deuda." : "Se le compró a un proveedor: queda su factura, con su deuda o su pago."}
        />
        {esCompra && (
          <CompraDelInsumo
            guia={guia}
            proveedores={proveedores}
            proveedorId={proveedorId}
            onProveedor={setProveedorId}
            tipo={tipoPapel}
            onTipo={setTipoPapel}
            serie={serie}
            onSerie={setSerie}
            numero={numeroPapel}
            onNumero={setNumeroPapel}
            sinPapel={sinPapel}
            onSinPapel={setSinPapel}
            pagada={pagada}
            onPagada={cambiarPagada}
            vence={vence}
            onVence={setVenceEscrito}
            emision={hoy}
            medios={medios}
            onMedios={setMedios}
            total={totales.total}
            cuentas={{ lista: cuentas.cuentas, listo: cuentas.listo }}
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <CampoGuiado id="cantidad" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("cantidad", `Cantidad (${UNIDADES_INSUMO[unidad].corta})`)}
              inputMode="decimal"
              placeholder="0"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              tono={cantidadIlegible ? "error" : undefined}
              pie={cantidadIlegible ? CANTIDAD_ILEGIBLE : undefined}
            />
          </CampoGuiado>
          <CampoGuiado id="costo" guia={guia}>
            <CampoMonto
              etiqueta={guia.etiqueta("costo", `Costo por ${UNIDADES_INSUMO[unidad].corta}`)}
              pie={costoIlegible ? COSTO_UNITARIO_ILEGIBLE : "sin IGV"}
              tono={costoIlegible ? "error" : undefined}
              inputMode="decimal"
              placeholder="0.00"
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
            />
          </CampoGuiado>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <CampoTexto etiqueta="Código de lote" mono placeholder="Opcional" value={codigoLote} onChange={(e) => setCodigoLote(e.target.value)} maxLength={40} />
          {!esCompra && <CampoTexto etiqueta="Documento" mono placeholder="F001-0000" value={documento} onChange={(e) => setDocumento(e.target.value)} maxLength={40} />}
        </div>
        <CampoTexto etiqueta="Nota" placeholder="Opcional" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />

        <div className="flex items-baseline justify-between rounded-md bg-sand/60 px-3 py-2 text-sm">
          <span className="text-tinta/70">{esCompra && !sinPapel && tipoPapel === "factura" ? "Valor del lote · con IGV 18 %" : "Valor del lote"}</span>
          <span className="font-display text-lg tabular-nums text-tinta">{listo ? soles(esCompra ? totales.total : total) : "—"}</span>
        </div>
        <div className="space-y-3">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para abrir el lote." conFrase />
        </div>
        <div className="pie-hoja-fijo">
          <div className="pie-acciones border-t border-sand pt-3">
            <Boton type="button" onClick={onClose}>
              Cancelar
            </Boton>
            <Boton textoCargando="Ingresando…" peso="primario" type="submit" cargando={cargando} disabled={!guia.puedeConfirmar} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
              {esCompra ? "Registrar la compra y abrir el lote" : "Abrir lote y sumar al saldo"}
            </Boton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
