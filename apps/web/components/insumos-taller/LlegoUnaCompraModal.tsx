"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { PROPUESTA_DEL_TALLER, useCuentasParaElegir, useIdDelTaller } from "@/components/finanzas/CampoCuenta";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { CompraDelInsumo, type ProveedorParaCompra } from "@/components/insumos-taller/CompraDelInsumo";
import { ConUnidad, TituloDePaso } from "@/components/insumos-taller/PiezasDeHoja";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto, Segmentado } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { soles } from "@/lib/compras-reglas";
import { traducirError } from "@/lib/error-escritura";
import { hoyLima } from "@/lib/fechas-lima";
import { argsDeCompra, lineaAlLibro, problemasDeCompra, problemasDeLineas, subtotalDelPapel, totalAPagar, vencimientoPorDefecto, type LineaDelLibro, type LineaEscrita, type TipoPapel } from "@/lib/insumo-compra-reglas";
import type { InsumoVista } from "@/lib/insumos";
import { UNIDADES_INSUMO, cantidadTexto, leerCantidad, metrosPorKilo, type MaterialVista } from "@/lib/insumos-reglas";
import { costoPor, nombreDeInsumoParaLeer } from "@/lib/insumos-vista";
import type { CampoDeGuia } from "@/lib/guia-campos";
import { medioNuevo, mediosParaRpc, type MedioForm } from "@/lib/medios-pago-reglas";
import { costoUnitarioTexto, leerCostoUnitario } from "@/lib/monto-plata-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Llegó una compra» (ADR-0614, actividad 5; ADR-0570, actividad 7): la puerta de lo que se le compró a un proveedor. Varias líneas de un mismo papel, por metro, kilo o
// rollo, y cómo se paga. Es una hoja sencilla a propósito: el Taller se rediseña después. Lo que ya estaba
// en el estante, con «Saldo inicial»; y lo que aparece en el corte, con «Encontré tela».
//
// «Producción más clara» (Felipe 2026-11-26; maqueta docs/maquetas/produccion-resumen-2026-11/): tres pasos numerados («Qué llegó», «A quién se lo compraste», «Cómo se paga»). Cada línea dice su
// subtotal a la vista; el código de lote y la nota, que casi nunca se llenan, van plegados; y el total queda grande junto a quien lo anota. No cambia qué se valida ni qué se guarda.

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
    { id: "proveedor", nombre: "A quién se lo compraste", requerido: true, hecho: !faltan.includes("proveedor"), pendiente: "Elige a quién se lo compraste." },
    { id: "documento", nombre: "El papel del proveedor", requerido: true, hecho: !faltan.includes("documento"), pendiente: "Escribe la serie y el número, o marca que todavía no lo tienes." },
    { id: "pago", nombre: "Cómo se paga", requerido: true, hecho: !faltan.includes("vencimiento") && !faltan.includes("pago"), pendiente: faltan.includes("pago") ? "Los medios de pago tienen que sumar justo el total." : "Escribe cuándo vence." },
    { id: "quien", nombre: "Quién la registra", requerido: true, hecho: responsableListo, pendiente: "Elige quién la registra." },
  ];
}

export function LlegoUnaCompraModal({
  insumos,
  materiales,
  insumoInicialId,
  tallerId,
  proveedores,
  onClose,
}: {
  insumos: readonly InsumoVista[];
  materiales: readonly MaterialVista[];
  insumoInicialId: string | null;
  tallerId: string;
  proveedores: readonly ProveedorParaCompra[];
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
  // Lo opcional va plegado: el código de lote de cada línea (por su clave) y la nota de la compra.
  const [conCodigo, setConCodigo] = useState<readonly string[]>([]);
  const [verNota, setVerNota] = useState(false);
  const taller = useIdDelTaller();
  // «Tu fondo» primero si quien paga tiene uno (Felipe 2026-11-26): lo que compra para el Taller con su fondo por rendir se descuenta de
  // él. La base valida que el fondo sea de quien paga (`fn_fondo_para_pagar`, en el disparador de los pagos de Producción).
  const cuentas = useCuentasParaElegir("pago", taller.id, taller.listo, { conMiFondo: true, propuestaSoloDe: PROPUESTA_DEL_TALLER });
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

  const conIgv = !sinPapel && tipoPapel === "factura";
  return (
    <Modal titulo="Llegó una compra" tamano="ancha" variante="hoja" onClose={onClose}>
      <form onSubmit={guardar} onKeyDown={enterNoGuarda} className="mt-3.5 space-y-6">
        <section data-guia="prod-ingreso.lineas" className="space-y-3">
          <TituloDePaso paso={1} cuenta={lineas.length} nombre="Qué llegó" ayuda={<>Cada tela o avío que llegó va en su línea, con su cantidad y su precio sin IGV. Si la misma tela llegó a dos precios, anótala en dos compras.</>}>
            {guia.etiqueta("lineas", "Qué llegó")}
          </TituloDePaso>
          <CampoGuiado id="lineas" guia={guia}>
            <div className="@container">
              <div className="overflow-hidden rounded-xl border border-sand">
                {lineas.map((l, k) => {
                  const insumo = insumos.find((i) => i.id === l.insumoId);
                  const esTela = insumo?.tipo === "tela";
                  const unidadLibro = insumo ? UNIDADES_INSUMO[insumo.unidad].corta : "";
                  const unidad = l.como === "kilo" ? "kg" : l.como === "rollo" ? "rollos" : unidadLibro;
                  const precioDe = l.como === "kilo" ? costoPor("kilo") : l.como === "rollo" ? costoPor("rollo") : insumo ? costoPor(insumo.unidad) : "";
                  const enLibro = lineaAlLibro(l, LEER);
                  // El subtotal se dice en cuanto hay cantidad y precio que se entienden: es lo que dice el papel de esa línea, sin IGV.
                  const hayCuenta = LEER.cantidad(l.cantidad) !== null && LEER.precio(l.precio) !== null;
                  const codigoAbierto = conCodigo.includes(l.clave) || l.codigoLote.trim() !== "";
                  const idCodigo = `compra-codigo-${l.clave}`;
                  return (
                    <div key={l.clave} className={`${FILA} grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] ${COLUMNAS} ${k > 0 ? "border-t border-sand" : ""}`}>
                      <div className="order-1 col-span-2 min-w-0 @min-[36rem]:col-span-3">
                        <ComboBuscable
                          valor={l.insumoId}
                          onValor={(v) => elegirInsumo(l.clave, v)}
                          opciones={insumos.map((i) => ({ valor: i.id, texto: nombreDeInsumoParaLeer(i), detalle: `Hay ${cantidadTexto(i.saldo, i.unidad)}` }))}
                          marcador="Busca la tela o el avío"
                          etiquetaAccesible="Qué llegó en esta línea"
                        />
                      </div>
                      <div className="order-3 min-w-0">
                        <span aria-hidden className="mb-1 block text-xs text-tenue">
                          Cantidad
                        </span>
                        <ConUnidad unidad={unidad}>
                          <CampoTexto caja sinPie etiqueta={unidad ? `Cantidad, en ${unidad}` : "Cantidad"} inputMode="decimal" className="tabular-nums" value={l.cantidad} onChange={(e) => cambiar(l.clave, { cantidad: e.target.value })} />
                        </ConUnidad>
                      </div>
                      <div className="order-4 min-w-0">
                        {/* «sin IGV» a la vista: el total de abajo suma el 18 %, y sin esta palabra no se sabe si el precio ya lo trae. */}
                        <span aria-hidden className="mb-1 block text-xs text-tenue">
                          {precioDe ? `Precio de ${precioDe}, sin IGV` : "Precio, sin IGV"}
                        </span>
                        <CampoTexto caja sinPie antes="S/" etiqueta={precioDe ? `Precio de ${precioDe}, sin IGV` : "Precio, sin IGV"} inputMode="decimal" className="tabular-nums" value={l.precio} onChange={(e) => cambiar(l.clave, { precio: e.target.value })} />
                      </div>
                      <p className="order-5 col-span-3 flex items-baseline justify-between gap-3 text-sm font-semibold tabular-nums text-tinta @min-[36rem]:col-span-2 @min-[36rem]:block @min-[36rem]:self-end @min-[36rem]:pb-2 @min-[36rem]:text-right">
                        <span className="text-xs font-normal text-tenue @min-[36rem]:block">Subtotal</span>
                        {hayCuenta ? soles(subtotalDelPapel([l], LEER)) : <span className="font-normal text-tenue">—</span>}
                      </p>
                      {lineas.length > 1 ? (
                        <button
                          type="button"
                          aria-label="Quitar esta línea"
                          title="Quitar esta línea"
                          className="icono-fila order-2 grid h-8 w-8 place-items-center justify-self-end"
                          onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                        >
                          <X className="h-4 w-4" aria-hidden />
                        </button>
                      ) : (
                        <span className="order-2" />
                      )}
                      {/* Lo que solo algunas líneas piden va debajo, a todo el ancho: cómo se compró una tela (y su rinde), y el código de lote, plegado. */}
                      <div className="order-6 col-span-full space-y-2.5 empty:hidden">
                        {esTela && (
                          <div className="grid gap-3 @min-[36rem]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                            <Segmentado
                              etiqueta="Se compró"
                              valor={l.como}
                              onValor={(v) => cambiar(l.clave, { como: v, rinde: v === "libro" ? "" : (comoDeFabrica(materialDe(l.insumoId)).como === v ? comoDeFabrica(materialDe(l.insumoId)).rinde : "") })}
                              opciones={[
                                { valor: "libro", texto: "Por metro" },
                                { valor: "kilo", texto: "Por kilo" },
                                { valor: "rollo", texto: "Por rollo" },
                              ]}
                              pie={enLibro && l.como !== "libro" ? `Entran ${cantidadTexto(enLibro.cantidad, insumo?.unidad ?? "metro")} a ${costoUnitarioTexto(enLibro.costoUnitario)} el metro.` : undefined}
                            />
                            {l.como !== "libro" && (
                              <CampoTexto
                                etiqueta={l.como === "kilo" ? "Metros por kilo" : "Metros por rollo"}
                                inputMode="decimal"
                                value={l.rinde}
                                onChange={(e) => cambiar(l.clave, { rinde: e.target.value })}
                                pie="Sale de la ficha; corrígelo si mediste otro."
                              />
                            )}
                          </div>
                        )}
                        {l.como === "libro" && (
                          <div>
                            <BotonVerMas forma="enlace" abierto={codigoAbierto} onCambiar={(abierto) => setConCodigo((cs) => (abierto ? [...cs, l.clave] : cs.filter((c) => c !== l.clave)))} texto="Código de lote" controla={idCodigo} />
                            <FilasDeMas abierto={codigoAbierto} id={idCodigo}>
                              <div className="max-w-xs px-0.5 pb-0.5 pt-2">
                                <CampoTexto caja sinPie etiqueta="Código de lote" mono value={l.codigoLote} onChange={(e) => cambiar(l.clave, { codigoLote: e.target.value })} maxLength={40} />
                              </div>
                            </FilasDeMas>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <Boton type="button" peso="fantasma" className="mt-3" onClick={() => setLineas((ls) => [...ls, lineaNueva("", null)])}>
              <span className="inline-flex items-center gap-1.5">
                <Plus className="h-4 w-4" aria-hidden />
                Agregar otra tela o avío
              </span>
            </Boton>
          </CampoGuiado>
        </section>

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
          cuentas={{ lista: cuentas.cuentas, listo: cuentas.listo, falla: cuentas.falla, reintentar: cuentas.reintentar }}
        />

        <div>
          <BotonVerMas forma="enlace" abierto={verNota || nota.trim() !== ""} onCambiar={setVerNota} texto="Agregar una nota" controla="compra-nota" />
          <FilasDeMas abierto={verNota || nota.trim() !== ""} id="compra-nota">
            <div className="px-0.5 pb-0.5 pt-2">
              <CampoTexto etiqueta="Nota" sinPie value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
            </div>
          </FilasDeMas>
        </div>

        {/* El cierre: quién lo anota y, a su lado, el total grande. */}
        <div className="grid items-end gap-x-6 gap-y-3 border-t border-sand pt-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
          </CampoGuiado>
          <p className="sm:text-right">
            <span className="block text-xs text-tenue">{conIgv ? "Total con IGV" : "Total"}</span>
            <span className="font-display block whitespace-nowrap text-3xl leading-tight tabular-nums text-tinta">{problemasLineas.length === 0 ? soles(total) : <span className="text-tenue">—</span>}</span>
          </p>
        </div>
        <PieGuia guia={guia} listo="Todo listo para registrar la compra." conFrase />
        <PieAcciones className="pie-hoja-fijo">
          <Boton type="button" peso="fantasma" onClick={onClose} disabled={cargando}>
            Cancelar
          </Boton>
          {/* No se apaga por lo que falta (ADR-0611, mejora 4): al tocarlo, cada campo pendiente dice lo suyo y el cursor va al primero. `guardar` sigue sin registrar nada mientras falte algo. */}
          <Boton type="submit" peso="primario" cargando={cargando} textoCargando="Registrando…" disabled={cargando} confirma={guia} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
            Registrar la compra
          </Boton>
        </PieAcciones>
      </form>
    </Modal>
  );
}

/** Lo que comparten el encabezado y cada línea. Sin `grid`: el encabezado lo pide solo cuando la hoja es ancha (angosta va escondido), y cada línea lo trae siempre. */
const FILA = "items-center gap-x-3 gap-y-2 px-4 py-2.5";
/** Una línea cuando la hoja es ancha: arriba qué llegó, a todo el ancho (un nombre como «Botón nácar 1.8 cm, color Blanco» se cortaba en una columna), y debajo cantidad, precio y subtotal. Angosta, el subtotal baja a su renglón. */
const COLUMNAS = "@min-[36rem]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_2rem]";
