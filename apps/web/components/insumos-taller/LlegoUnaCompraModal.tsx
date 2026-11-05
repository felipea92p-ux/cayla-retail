"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { PROPUESTA_DEL_TALLER, useCuentasParaElegir, useIdDelTaller } from "@/components/finanzas/CampoCuenta";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { CompraDelInsumo, type ProveedorParaCompra } from "@/components/insumos-taller/CompraDelInsumo";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoMonto, CampoTexto, Segmentado } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { soles } from "@/lib/compras-reglas";
import { traducirError } from "@/lib/error-escritura";
import { hoyLima } from "@/lib/fechas-lima";
import { argsDeCompra, lineaAlLibro, problemasDeCompra, problemasDeLineas, subtotalDelPapel, totalAPagar, vencimientoPorDefecto, type LineaDelLibro, type LineaEscrita, type TipoPapel } from "@/lib/insumo-compra-reglas";
import type { InsumoVista } from "@/lib/insumos";
import { UNIDADES_INSUMO, cantidadTexto, leerCantidad, metrosPorKilo, type MaterialVista } from "@/lib/insumos-reglas";
import type { CampoDeGuia } from "@/lib/guia-campos";
import { medioNuevo, mediosParaRpc, type MedioForm } from "@/lib/medios-pago-reglas";
import { costoUnitarioTexto, leerCostoUnitario } from "@/lib/monto-plata-reglas";
import { pedidosSinFacturaDe, type OrdenInsumoPorRecibir } from "@/lib/recepcion-orden-insumo-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Llegó una compra» (ADR-0614, actividad 5; ADR-0570, actividad 7): la puerta de lo que se le compró a un proveedor. Varias líneas de un mismo papel, por metro, kilo o
// rollo, y cómo se paga. Es una hoja sencilla a propósito: el Taller se rediseña después. Lo pedido con una orden de insumos se recibe desde Recibir; lo que ya estaba
// en el estante, con «Saldo inicial»; y lo que aparece en el corte, con «Encontré tela».

const LEER = { cantidad: leerCantidad, precio: leerCostoUnitario };

let siguienteClave = 0;
const lineaNueva = (insumoId: string, material: MaterialVista | null): LineaEscrita => ({
  clave: `l${++siguienteClave}`,
  insumoId,
  ...comoDeFabrica(material),
  cantidad: "",
  precio: "",
  codigoLote: "",
});

/** Cómo se compra según la ficha de la tela, con su rinde ya escrito. */
function comoDeFabrica(m: MaterialVista | null): Pick<LineaEscrita, "como" | "rinde"> {
  if (m?.compra === "kilo") {
    const rinde = metrosPorKilo(m.ancho, m.gramaje);
    return { como: "kilo", rinde: rinde === null ? "" : String(Math.round(rinde * 100) / 100) };
  }
  if (m?.compra === "rollo") return { como: "rollo", rinde: m.metrosPorRollo === null ? "" : String(m.metrosPorRollo) };
  return { como: "libro", rinde: "" };
}

function camposDeLaCompra(faltan: readonly string[], lineasListas: boolean, responsableListo: boolean): CampoDeGuia[] {
  return [
    { id: "lineas", nombre: "Qué llegó", requerido: true, hecho: lineasListas, pendiente: "Di qué llegó, cuánto y a qué precio." },
    { id: "proveedor", nombre: "A quién se la compraste", requerido: true, hecho: !faltan.includes("proveedor"), pendiente: "Elige a quién se la compraste." },
    { id: "documento", nombre: "El papel del proveedor", requerido: true, hecho: !faltan.includes("documento"), pendiente: "Escribe la serie y el número, o marca que todavía no lo tienes." },
    { id: "pago", nombre: "Si ya la pagaste o queda por pagar", requerido: true, hecho: !faltan.includes("vencimiento") && !faltan.includes("pago"), pendiente: faltan.includes("pago") ? "Los medios de pago tienen que sumar justo el total." : "Escribe cuándo vence." },
    { id: "quien", nombre: "Quién la registra", requerido: true, hecho: responsableListo, pendiente: "Elige quién la registra." },
  ];
}

export function LlegoUnaCompraModal({
  insumos,
  materiales,
  insumoInicialId,
  tallerId,
  proveedores,
  pedidos,
  onClose,
}: {
  insumos: readonly InsumoVista[];
  materiales: readonly MaterialVista[];
  insumoInicialId: string | null;
  tallerId: string;
  proveedores: readonly ProveedorParaCompra[];
  pedidos: readonly OrdenInsumoPorRecibir[];
  onClose: () => void;
}) {
  const router = useRouter();
  const token = useRef<string>(crypto.randomUUID());
  const hoy = hoyLima();
  const materialDe = (insumoId: string) => {
    const materialId = insumos.find((i) => i.id === insumoId)?.materialId;
    return materiales.find((m) => m.id === materialId) ?? null;
  };
  const [lineas, setLineas] = useState<LineaEscrita[]>(() => [lineaNueva(insumoInicialId ?? "", insumoInicialId ? materialDe(insumoInicialId) : null)]);
  const [proveedorId, setProveedorId] = useState("");
  const [tipoPapel, setTipoPapel] = useState<TipoPapel>("factura");
  const [serie, setSerie] = useState("");
  const [numero, setNumero] = useState("");
  const [sinPapel, setSinPapel] = useState(false);
  const [pagada, setPagada] = useState(false);
  const [venceEscrito, setVenceEscrito] = useState<string | null>(null);
  const [medios, setMedios] = useState<MedioForm[]>([medioNuevo("transferencia", "")]);
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(false);
  const taller = useIdDelTaller();
  const cuentas = useCuentasParaElegir("pago", taller.id, taller.listo, { propuestaSoloDe: PROPUESTA_DEL_TALLER });
  const responsable = useResponsable();

  const plazo = proveedores.find((p) => p.id === proveedorId)?.plazoCreditoDias ?? null;
  const vence = venceEscrito ?? vencimientoPorDefecto(hoy, plazo);
  const delLibro = lineas.map((l) => lineaAlLibro(l, LEER)).filter((l): l is LineaDelLibro => l !== null);
  const problemasLineas = problemasDeLineas(lineas, LEER);
  const compra = {
    proveedorId,
    tipo: tipoPapel,
    serie,
    numero,
    sinPapel,
    pagada,
    emision: hoy,
    vence,
    lineas: delLibro,
    subtotalDelPapel: subtotalDelPapel(lineas, LEER),
    medios: mediosParaRpc(medios, undefined, cuentas.cuentas).map((m) => ({ ...m, metodo: m.metodo as MedioForm["metodo"] })),
  };
  const total = totalAPagar(compra);
  const problemas = problemasDeCompra(compra);
  const faltan = useMemo(() => problemas.map((p) => p.campo as string), [problemas]);
  const guia = useGuiaCampos(camposDeLaCompra(faltan, problemasLineas.length === 0, responsable.listo));
  const listo = problemasLineas.length === 0 && problemas.length === 0 && responsable.listo;

  const proveedorNombre = proveedores.find((p) => p.id === proveedorId)?.nombre ?? null;
  const pedidosAbiertos = pedidosSinFacturaDe(pedidos, proveedorNombre);

  const cambiar = (clave: string, cambio: Partial<LineaEscrita>) => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));
  function elegirInsumo(clave: string, insumoId: string) {
    cambiar(clave, { insumoId, ...comoDeFabrica(materialDe(insumoId)) });
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!listo || cargando) return;
    setCargando(true);
    const { error } = await firmar(createClient().rpc("registrar_compra_de_insumos" as never, argsDeCompra(compra, { tallerId, nota, token: token.current }) as never), responsable.firma());
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "registrar la compra", { confirmarAntesDeRepetir: true }));
      return;
    }
    avisar.exito(`Compra registrada: ${delLibro.length === 1 ? "se abrió 1 lote" : `se abrieron ${delLibro.length} lotes`}`, {
      detalle: `${pagada ? "Pagado" : "Por pagar"} ${soles(total)} a ${proveedorNombre ?? "el proveedor"}.`,
    });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Llegó una compra" subtitulo="Cada línea abre un lote con su propio costo" tamano="ancha" variante="hoja" onClose={onClose}>
      <form onSubmit={guardar} onKeyDown={enterNoGuarda} className="mt-3.5 space-y-4">
        <CampoGuiado id="lineas" guia={guia}>
          <div className="space-y-3">
            <p className="campo-etiqueta">{guia.etiqueta("lineas", "¿Qué llegó?")}</p>
            {lineas.map((l) => {
              const insumo = insumos.find((i) => i.id === l.insumoId);
              const esTela = insumo?.tipo === "tela";
              const unidadLibro = insumo ? UNIDADES_INSUMO[insumo.unidad].corta : "unidad";
              const unidad = l.como === "kilo" ? "kg" : l.como === "rollo" ? "rollo" : unidadLibro;
              const enLibro = lineaAlLibro(l, LEER);
              return (
                <div key={l.clave} className="space-y-2.5 rounded-2xl border border-sand p-3.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <ComboBuscable
                        valor={l.insumoId}
                        onValor={(v) => elegirInsumo(l.clave, v)}
                        opciones={insumos.map((i) => ({ valor: i.id, texto: `${i.nombre} · hay ${cantidadTexto(i.saldo, i.unidad)}` }))}
                        marcador="Busca la tela o el avío…"
                        etiquetaAccesible="Qué llegó en esta línea"
                      />
                    </div>
                    {lineas.length > 1 && (
                      <button type="button" aria-label="Quitar esta línea" className="btn-cayla btn-sutil btn-chico" onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}>
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </div>
                  {esTela && (
                    <Segmentado
                      etiqueta="Se compró por"
                      valor={l.como}
                      onValor={(v) => cambiar(l.clave, { como: v, rinde: v === "libro" ? "" : (comoDeFabrica(materialDe(l.insumoId)).como === v ? comoDeFabrica(materialDe(l.insumoId)).rinde : "") })}
                      opciones={[
                        { valor: "libro", texto: "Metro" },
                        { valor: "kilo", texto: "Kilo" },
                        { valor: "rollo", texto: "Rollo" },
                      ]}
                    />
                  )}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <CampoTexto etiqueta={`Cantidad (${unidad})`} inputMode="decimal" value={l.cantidad} onChange={(e) => cambiar(l.clave, { cantidad: e.target.value })} />
                    <CampoMonto etiqueta={`Precio por ${unidad}`} pie="sin IGV" inputMode="decimal" value={l.precio} onChange={(e) => cambiar(l.clave, { precio: e.target.value })} />
                    {l.como !== "libro" ? (
                      <CampoTexto
                        etiqueta={l.como === "kilo" ? "Metros por kilo" : "Metros por rollo"}
                        inputMode="decimal"
                        value={l.rinde}
                        onChange={(e) => cambiar(l.clave, { rinde: e.target.value })}
                        pie="Sale de la ficha; corrígelo si mediste otro."
                      />
                    ) : (
                      <CampoTexto etiqueta="Código de lote" mono placeholder="Opcional" value={l.codigoLote} onChange={(e) => cambiar(l.clave, { codigoLote: e.target.value })} maxLength={40} />
                    )}
                  </div>
                  {enLibro && l.como !== "libro" && (
                    <p className="text-sm text-tinta/65">
                      Entran {cantidadTexto(enLibro.cantidad, insumo?.unidad ?? "metro")} a {costoUnitarioTexto(enLibro.costoUnitario)} el metro.
                    </p>
                  )}
                </div>
              );
            })}
            <Boton type="button" peso="fantasma" onClick={() => setLineas((ls) => [...ls, lineaNueva("", null)])}>
              <span className="inline-flex items-center gap-1.5">
                <Plus className="h-4 w-4" aria-hidden />
                Agregar otra línea
              </span>
            </Boton>
          </div>
        </CampoGuiado>

        {pedidosAbiertos.length > 0 && (
          <Aviso tono="atencion" chico titulo={`${proveedorNombre} tiene ${pedidosAbiertos.length === 1 ? "un pedido abierto" : `${pedidosAbiertos.length} pedidos abiertos`}`}>
            {pedidosAbiertos.map((p) => `${p.documento}: ${p.detalle}`).join(" · ")}. Si esto es de ese pedido, regístralo desde <EnlaceVer href="/produccion/recibir">Recibir</EnlaceVer> para no contarlo dos veces.
          </Aviso>
        )}

        <CompraDelInsumo
          guia={guia}
          proveedores={proveedores}
          proveedorId={proveedorId}
          onProveedor={setProveedorId}
          tipo={tipoPapel}
          onTipo={setTipoPapel}
          serie={serie}
          onSerie={setSerie}
          numero={numero}
          onNumero={setNumero}
          sinPapel={sinPapel}
          onSinPapel={setSinPapel}
          pagada={pagada}
          onPagada={(v) => {
            setPagada(v);
            if (v) setMedios([medioNuevo("transferencia", total.toFixed(2))]);
          }}
          vence={vence}
          onVence={setVenceEscrito}
          emision={hoy}
          medios={medios}
          onMedios={setMedios}
          total={total}
          cuentas={{ lista: cuentas.cuentas, listo: cuentas.listo }}
        />

        <CampoTexto etiqueta="Nota" placeholder="Opcional" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />

        <div className="flex items-baseline justify-between rounded-md bg-sand/60 px-3 py-2 text-sm">
          <span className="text-tinta/70">{!sinPapel && tipoPapel === "factura" ? "Total · con IGV 18 %" : "Total"}</span>
          <span className="font-display text-lg tabular-nums text-tinta">{problemasLineas.length === 0 ? soles(total) : "—"}</span>
        </div>
        <CampoGuiado id="quien" guia={guia}>
          <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
        </CampoGuiado>
        <PieGuia guia={guia} listo="Todo listo para registrar la compra." conFrase />
        <PieAcciones className="pie-hoja-fijo">
          <Boton type="button" peso="fantasma" onClick={onClose} disabled={cargando}>
            Cancelar
          </Boton>
          <Boton type="submit" peso="primario" cargando={cargando} textoCargando="Registrando…" disabled={!listo}>
            Registrar la compra
          </Boton>
        </PieAcciones>
      </form>
    </Modal>
  );
}
