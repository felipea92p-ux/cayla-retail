"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, Check, Package } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { Confirmacion, DatosDelProveedor, MediosDePago, PILDORA, Tilde, type DatosPagoProveedor, type ResultadoPago } from "@/components/PagoPiezas";
import { Boton, CampoSelectNativo, CampoTexto } from "@/components/ui/campos";
import { lineaPagoVacia, lineasPagoParaRpc, sumaLineasPago, type LineaPago } from "@/components/LineasPago";
import { useCuentasParaElegir } from "@/components/finanzas/CampoCuenta";
import { ETIQUETA_METODO, METODO_SALDO_A_FAVOR, soles, type CompraResumen } from "@/lib/compras-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { etiquetaVence, tramoDe } from "@/lib/por-pagar-reglas";
import type { AccionesDeCompra } from "@/lib/modulos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// Acciones sobre una factura ya registrada (ADR-0035): registrar un pago
// contra el saldo, o anularla. La página (server) dibuja el detalle; este
// componente solo pone los botones (el pie del detalle: enlace «Anular» a la izquierda,
// «Ir a recibir» y «Registrar pago» —el principal, negro— a la derecha). Las reglas —el pago no supera el saldo,
// no se anula con pagos o mercadería recibida— las aplica la base; acá solo
// se evita mostrar un botón que va a fallar.
//
// "Registrar pago" abre el modal de pago ACÁ, encima del detalle (como en el prototipo aprobado): al confirmar,
// la hoja de pago se cierra y el detalle que quedó detrás se actualiza en su sitio (`router.refresh()`): la
// línea de tiempo avanza, las barras continúan desde donde estaban y el pago nuevo entra al historial. Antes
// esto llevaba a Por pagar con `?pagar=<id>` y el detalle se perdía; ese camino (`PagoDesdeUrl`) sigue existiendo
// para quien llega a Por pagar con el enlace. `datosPago` (cuenta, CCI, Yape/Plin, titular, saldo a favor) lo
// carga `cargarDetalleCompra`; sin él el modal funciona igual, solo sin la tarjeta «Paga por».
//
// ADR-0161 P1 (20260923140000): cada botón es de UN módulo — «Anular», de Facturas de compra; «Registrar pago», de Por pagar
// (`permite`, calculado en el servidor desde los módulos de la cuenta). Quien no lo tiene no ve el botón; la base igual lo
// rechazaría (`fn_puede_registrar_facturas_compra`, `fn_puede_pagar_compras`).
export function CompraAcciones({
  compra,
  tieneRecepciones,
  datosPago,
  permite,
  misTiendas,
}: {
  compra: CompraResumen;
  tieneRecepciones: boolean;
  datosPago?: DatosPagoProveedor;
  permite: AccionesDeCompra;
  /** ADR-0184 (F4-F5): solo para un comprador de tienda — sus tiendas, para elegir con cuál paga (`p_ubicacion_id`).
   *  `undefined` = líder, sin atarse a ninguna (como siempre). Con una sola, se usa sin preguntar. */
  misTiendas?: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [anulando, setAnulando] = useState(false);
  const [pagando, setPagando] = useState(false);
  const vigente = compra.estado === "vigente";
  const puedeRecibir = vigente && compra.estadoRecepcion !== "recibida";
  const puedePagar = vigente && compra.saldo > 0 && permite.pagar;
  // ADR-0195 F2: la factura de un gasto o de un activo se anula desde Finanzas ▸ Gastos (con lo que detalla); la base tampoco la deja sola.
  const puedeAnular = vigente && compra.pagado === 0 && !tieneRecepciones && permite.facturas && (compra.naturaleza ?? "mercaderia") === "mercaderia";

  // Un comprobante anulado ya no tiene acciones. El modal de pago se sigue dibujando aunque el pago recién saldó el
  // comprobante: si no, el refresco lo desmontaría en plena confirmación y se cortaría su animación de cierre.
  if (!vigente && !pagando) return null;

  // Pie del detalle (prototipo aprobado): a la izquierda las acciones discretas como enlaces de texto (anular);
  // a la derecha «Ir a recibir» (secundario, solo si falta mercadería) y «Registrar pago» como botón PRINCIPAL negro
  // (solo si hay saldo). Con el comprobante ya saldado, en su lugar un botón verde deshabilitado «Pagado».
  return (
    <>
      <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-3">
        {puedeAnular && (
          <button
            type="button"
            onClick={() => setAnulando(true)}
            className="text-xs text-tinta/60 underline-offset-2 transition-colors hover:text-rojo hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60"
          >
            Anular comprobante
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          {/* Atajo al pie: para una factura recién abierta (todo por recibir) es la acción más probable y antes
              solo vivía como enlace dentro de la sección «Recepciones», fuera de la vista. */}
          {puedeRecibir && (
            <Boton peso="fantasma" onClick={() => router.push(`/compras/recibir?compra=${compra.id}`)}>
              <span className="inline-flex items-center gap-2">
                <Package aria-hidden className="cd-ic-abajo h-4 w-4" />
                Ir a recibir
              </span>
            </Boton>
          )}
          {puedePagar ? (
            <Boton peso="primario" onClick={() => setPagando(true)}>
              <span className="inline-flex items-center gap-2">
                <Banknote aria-hidden className="h-4 w-4" />
                Registrar pago
              </span>
            </Boton>
          ) : (
            vigente && compra.saldo <= 0 && (
              <button type="button" disabled className="label-cayla inline-flex cursor-default items-center gap-2 rounded-md bg-verde px-4 py-3 text-[11px] text-crema transition-colors duration-500">
                <Check aria-hidden className="h-4 w-4" />
                Pagado
              </button>
            )
          )}
        </div>
      </div>
      {anulando && <AnularCompraModal compra={compra} onClose={() => setAnulando(false)} />}
      {pagando && <RegistrarPagoModal compra={compra} saldoFavor={datosPago?.saldoFavor ?? 0} datos={datosPago} misTiendas={misTiendas} onClose={() => setPagando(false)} />}
    </>
  );
}

// Abre el modal de pago al llegar a Por pagar con `?pagar=<id>` (ver arriba).
// La página ya verificó que la factura existe, está vigente y tiene saldo.
// Al cerrar se quita solo `pagar` de la URL (con `replace`, para que "atrás"
// no vuelva a abrirlo) y se conservan los filtros que hubiera.
export function PagoDesdeUrl({
  compra,
  saldoFavor = 0,
  datos,
  misTiendas,
}: {
  compra: CompraResumen;
  saldoFavor?: number;
  datos?: DatosPagoProveedor;
  misTiendas?: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  function cerrar() {
    const p = new URLSearchParams(params.toString());
    p.delete("pagar");
    router.replace(p.size ? `${pathname}?${p}` : pathname);
  }
  return <RegistrarPagoModal compra={compra} saldoFavor={saldoFavor} datos={datos} misTiendas={misTiendas} onClose={cerrar} />;
}

// Desde "Por pagar" se paga sin entrar al detalle: el botón de la fila abre
// EL MISMO modal (un pago sigue siendo contra una sola factura — solo se
// ahorra el clic de ir a verla). `compacto` es la versión que cabe en una
// celda de tabla: peso "fantasma" (borde y texto a tinta plena), no
// "discreto" — es la única acción de esa pantalla y no puede ser lo que
// menos se ve.
//
// `datos` (banco, cuenta, Yape del proveedor) y `onPagado` (Por pagar, 2026-09-19): con `datos` el modal muestra dónde se le
// paga, con copiar; con `onPagado` la pantalla que lo abrió hace reaccionar su lista (sello → pliegue → dato fresco) en vez
// de que el modal pida el refresh por su cuenta. Sin ellos —el detalle— todo sigue como antes.
export function BotonPagar({
  compra,
  compacto = false,
  saldoFavor = 0,
  datos,
  onPagado,
  etiqueta,
  conIcono = false,
  misTiendas,
}: {
  compra: CompraResumen;
  compacto?: boolean;
  saldoFavor?: number;
  datos?: DatosPagoProveedor;
  onPagado?: (r: ResultadoPago) => void;
  /** El texto del botón (por defecto «Registrar pago · saldo S/ …»). El cajón de Por pagar usa uno corto: «Pagar S/ …». */
  etiqueta?: string;
  /** Un billete a la izquierda del texto (el botón del cajón, como en el spike). */
  conIcono?: boolean;
  misTiendas?: { id: string; nombre: string }[];
}) {
  const [abierto, setAbierto] = useState(false);
  if (compra.estado !== "vigente" || compra.saldo <= 0) return null;
  return (
    <>
      <Boton
        type="button"
        peso={compacto ? "discreto" : "primario"}
        className={compacto ? "px-2.5 py-1.5 text-[11px]" : ""}
        onClick={() => setAbierto(true)}
      >
        {compacto ? (
          "Pagar"
        ) : conIcono ? (
          <span className="flex items-center gap-2">
            <Banknote aria-hidden className="h-3.5 w-3.5" /> {etiqueta ?? `Registrar pago · saldo ${soles(compra.saldo)}`}
          </span>
        ) : (
          (etiqueta ?? `Registrar pago · saldo ${soles(compra.saldo)}`)
        )}
      </Boton>
      {abierto && <RegistrarPagoModal compra={compra} saldoFavor={saldoFavor} datos={datos} misTiendas={misTiendas} onPagado={onPagado} onClose={() => setAbierto(false)} />}
    </>
  );
}

// Pago de UN comprobante (ADR-0035), con la misma cara y los mismos movimientos que «Pagar juntos» (spike 2026-09-19, ADR-0131).
// Diferencia con el spike, a propósito: el spike solo permite UN medio de pago; aquí un pago puede repartirse en VARIOS medios
// (`MediosDePago`: «＋ Dividir en otro medio»; RPC `registrar_pagos_compra`, todo o nada), como siempre lo ha permitido el ERP.
// Con un solo medio se ve exactamente como el spike; «Se paga» y «Total» son campos (editan el monto de ese medio) y con varios
// pasan a ser la suma de los medios. Al abrir, la cascada se llena y «Pagarás» cuenta desde 0; al registrar, el modal se vuelve
// una confirmación y solo al cerrarla se avisa a quien lo abrió.
const BTN_CANCELAR = "label-cayla rounded-md border border-tinta/25 px-4 py-2.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo";

export function RegistrarPagoModal({
  compra,
  saldoFavor = 0,
  datos,
  misTiendas,
  onClose,
  onPagado,
}: {
  compra: CompraResumen;
  saldoFavor?: number;
  datos?: DatosPagoProveedor;
  /** ADR-0184 (F4-F5): solo para un comprador de tienda. `undefined` o vacío = líder, el pago no se ata a ninguna
   *  tienda (como siempre). Con una sola, se usa directo; con varias, se elige con cuál se paga — la base exige que
   *  esa tienda tenga parte en ESTA factura y no deje su saldo en negativo; si no la tiene, el error lo dice. */
  misTiendas?: { id: string; nombre: string }[];
  onClose: () => void;
  /** Se llama al CERRAR la confirmación de un pago registrado. Sin esto el modal pide el refresh por su cuenta (el detalle). */
  onPagado?: (r: ResultadoPago) => void;
}) {
  const router = useRouter();
  // Un pago puede repartirse en varios medios (20260914200000_compras_multipago): la RPC escribe todas las líneas o ninguna.
  const [lineas, setLineas] = useState<LineaPago[]>(() => [{ ...lineaPagoVacia(compra.saldo.toFixed(2)), metodo: datos?.formaPagoPreferida && datos.formaPagoPreferida in ETIQUETA_METODO ? datos.formaPagoPreferida : "transferencia" }]);
  const [fecha, setFecha] = useState(hoyLima());
  const [ubicacionPago, setUbicacionPago] = useState(misTiendas?.[0]?.id ?? "");
  // ADR-0195 F3b: «Sale de». La propuesta sale de la tienda con que se paga; el líder, de la primera tienda del comprobante.
  const cuentas = useCuentasParaElegir("pago", ubicacionPago || compra.ubicacionesDestino[0] || null);
  const [loading, setLoading] = useState(false);
  // Quién registra el pago (ADR-0161/0162): `registrar_pagos_compra` firma con esa persona.
  const responsable = useResponsable();
  // Identifica ESTE intento de pago (ADR-0135): si la conexión se corta después de que la base guardó y la persona
  // vuelve a intentar, la base reconoce el token y no duplica el pago. Se conserva mientras el intento falle.
  const token = useRef(crypto.randomUUID());
  // Pago registrado: la confirmación reemplaza al formulario. El resultado va en una ref porque el cierre lo dispara `Modal`
  // (con su animación de salida) y ahí hay que saber si se cerró un pago o se canceló.
  const [hecho, setHecho] = useState<ResultadoPago | null>(null);
  const resultado = useRef<ResultadoPago | null>(null);
  const ahora = useMemo(() => new Date(), []);
  // La cascada arranca vacía y se llena al abrir (como en el spike): un fotograma después de montar.
  const [armada, setArmada] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setArmada(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const un = lineas.length === 1;
  const suma = sumaLineasPago(lineas);
  const excede = suma > compra.saldo + 0.005;
  const favorUsado = sumaLineasPago(lineas.filter((l) => l.metodo === METODO_SALDO_A_FAVOR));
  const favorExcedido = favorUsado > saldoFavor + 0.005;
  const resta = Math.round((compra.saldo - suma) * 100) / 100;
  const llena = !excede && suma > 0 && Math.abs(resta) < 0.005;
  const tramo = tramoDe(compra, ahora);
  const colorVence = tramo === "vencidas" ? "text-rojo" : tramo === "semana" ? "text-ambar-profundo" : "text-tinta/75";
  const enBanco = un && (lineas[0].metodo === "transferencia" || lineas[0].metodo === "deposito");
  const editarMonto = (t: string) => setLineas((ls) => [{ ...ls[0], monto: t }]);
  const CAMPO_MONTO = `w-full rounded-lg border bg-papel px-2.5 py-1.5 text-right text-sm tabular-nums outline-none transition-colors duration-200 focus:border-rojo ${excede ? "border-rojo text-rojo" : "border-tinta/25 text-tinta"}`;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const pagos = lineasPagoParaRpc(lineas, cuentas.cuentas);
    const sinMonto = Math.max(0, lineas.findIndex((l) => !(Number(l.monto) > 0)));
    if (!pagos) return void avisar.error("Cada medio de pago necesita su monto.", { enfocar: `pago-monto-${sinMonto}` });
    if (fecha > hoyLima()) return void avisar.error("La fecha del pago no puede ser futura: es cuándo se pagó, no cuándo se pagará.");
    if (compra.fechaEmision && fecha < compra.fechaEmision) return void avisar.error("La fecha del pago no puede ser anterior a la emisión del comprobante.");
    if (excede) return void avisar.error(`El pago supera el saldo pendiente (${soles(compra.saldo)}).`, { enfocar: "pago-monto-0" });
    if (favorExcedido) return void avisar.error(`Usas ${soles(favorUsado)} de saldo a favor y solo tienes ${soles(saldoFavor)}.`, { enfocar: "pago-monto-0" });
    if (misTiendas && misTiendas.length > 0 && !ubicacionPago) return void avisar.error("Elige con qué tienda pagas.");
    if (!responsable.listo) return void (responsable.motivo && avisar.error(responsable.motivo));
    setLoading(true);
    const supabase = createClient();
    const { error } = await firmar(supabase.rpc("registrar_pagos_compra", {
      p_compra_id: compra.id,
      p_pagos: pagos,
      p_fecha: fecha,
      p_token: token.current,
      // ADR-0184 (F4): sin tiendas propias (líder) el pago no se ata a ninguna, como siempre.
      ...(ubicacionPago ? { p_ubicacion_id: ubicacionPago } : {}),
    }), responsable.firma());
    setLoading(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "registrar el pago", { confirmarAntesDeRepetir: true }));
      return;
    }
    avisar.exito(`Pago de ${soles(suma)} registrado · ${compra.documento}`, {
      detalle: `${resta > 0 ? `Quedan ${soles(resta)} por pagar.` : "Comprobante saldado."}${favorUsado > 0 ? ` Se descontaron ${soles(favorUsado)} de tu saldo a favor.` : ""}`,
    });
    const r: ResultadoPago = { pagadas: llena ? [compra.id] : [], parciales: llena ? [] : [compra.id], total: suma };
    resultado.current = r;
    setHecho(r);
  }

  // Cerrar: si hubo un pago, quien lo abrió reacciona (o, sin `onPagado`, se pide el dato fresco aquí, como siempre).
  function terminar() {
    const r = resultado.current;
    if (!r) return onClose();
    if (onPagado) {
      onClose();
      onPagado(r);
    } else {
      router.refresh();
      onClose();
    }
  }

  return (
    <Modal
      variante="papel"
      titulo={
        hecho ? (
          <span className="sr-only">Pago registrado</span>
        ) : (
          <>
            <span className="label-cayla mb-0.5 block font-sans text-[11px] text-tinta/65">Pagar a proveedor</span>
            <span className="block text-[28px] leading-tight">{compra.proveedorNombre}</span>
          </>
        )
      }
      subtitulo={hecho ? undefined : `1 comprobante · ${compra.documento}`}
      ancho="max-w-2xl"
      onClose={terminar}
    >
      {(cerrar) =>
        hecho ? (
          <Confirmacion
            hecho={hecho}
            proveedorNombre={compra.proveedorNombre}
            credito={favorUsado}
            filas={[{ documento: compra.documento, saldoFinal: Math.max(0, resta) }]}
            cerrar={cerrar}
          />
        ) : (
          <form onSubmit={onSubmit} className="space-y-5">
            <DatosDelProveedor datos={datos} />

            <section>
              <p className="label-cayla mb-2 text-[11px] text-tinta/65">Cómo se aplica el pago</p>
              <div className="card-cayla divide-y divide-tinta/10 overflow-hidden">
                <div className="hidden gap-x-4 px-5 py-2 sm:grid sm:grid-cols-[1fr_9.5rem_7.5rem_8.5rem]">
                  {["Comprobante", "Vence", "Saldo", "Se paga"].map((t, i) => (
                    <span key={t} className={`label-cayla text-[11px] text-tinta/55 ${i >= 2 ? "text-right" : ""}`}>
                      {t}
                    </span>
                  ))}
                </div>
                <div className="grid items-center gap-x-4 gap-y-1 px-5 py-3 sm:grid-cols-[1fr_9.5rem_7.5rem_8.5rem]">
                  <span className="text-sm tabular-nums text-tinta">{compra.documento}</span>
                  <span className={`text-sm ${colorVence}`}>{compra.fechaVencimiento ? etiquetaVence(compra.fechaVencimiento, ahora) : "Sin fecha"}</span>
                  <span className="text-sm tabular-nums text-tinta/75 sm:text-right">
                    <span className="text-xs text-tinta/55 sm:hidden">Saldo </span>
                    {compra.saldo.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  {un ? (
                    <input
                      id="pago-monto-0"
                      inputMode="decimal"
                      value={lineas[0].monto}
                      onChange={(e) => editarMonto(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      autoFocus
                      aria-label={`Monto a pagar de ${compra.documento}`}
                      aria-invalid={excede || undefined}
                      className={CAMPO_MONTO}
                    />
                  ) : (
                    <span className={`text-sm tabular-nums sm:text-right ${excede ? "text-rojo" : "text-tinta"}`}>
                      <CifraQueCuenta valor={suma} formato="monto" />
                    </span>
                  )}
                  {/* La cascada: cuánto del saldo cubre este pago. Se llena al abrir. Verde = queda en cero; rojo = se pasa del saldo. */}
                  <div aria-hidden className="mt-1.5 h-1 overflow-hidden rounded-full bg-sand sm:col-span-3">
                    <div
                      className={`h-full origin-left rounded-full transition-[transform,background-color] duration-500 ease-cayla ${excede ? "bg-rojo" : llena ? "bg-verde" : "bg-tinta"}`}
                      style={{ transform: `scaleX(${armada && compra.saldo > 0 ? Math.min(1, suma / compra.saldo) : 0})` }}
                    />
                  </div>
                  <span className={`mt-1 flex min-h-[18px] items-center gap-1.5 text-xs sm:col-start-4 sm:justify-end ${excede ? "text-rojo" : llena ? "text-verde-profundo" : "text-tinta/55"}`} aria-live="polite">
                    {excede ? (
                      "Supera el saldo"
                    ) : llena ? (
                      <>
                        <Tilde /> queda en cero
                      </>
                    ) : suma > 0 ? (
                      `quedan ${soles(resta)}`
                    ) : (
                      "no se paga ahora"
                    )}
                  </span>
                </div>
                <div className="grid items-center gap-x-4 bg-tinta/[0.04] px-5 py-3 sm:grid-cols-[1fr_auto]">
                  <span className="label-cayla text-[11px] text-tinta">Total del pago</span>
                  {un ? (
                    <label className="flex items-baseline justify-end gap-1">
                      <span className="font-display text-[22px] text-tinta">S/</span>
                      <input
                        inputMode="decimal"
                        value={lineas[0].monto}
                        onChange={(e) => editarMonto(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        aria-label="Total del pago"
                        className="font-display w-36 border-b border-tinta/25 bg-transparent text-right text-[22px] tabular-nums text-tinta outline-none transition-colors duration-200 focus:border-b-2 focus:border-rojo"
                      />
                    </label>
                  ) : (
                    <span className="font-display text-right text-[22px] tabular-nums text-tinta">
                      <CifraQueCuenta valor={suma} formato="soles" />
                    </span>
                  )}
                </div>
              </div>
              {un && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="label-cayla text-[10.5px] text-tinta/65">Atajos</span>
                  <button type="button" onClick={() => editarMonto(compra.saldo.toFixed(2))} className={PILDORA}>
                    Todo · {soles(compra.saldo)}
                  </button>
                </div>
              )}
            </section>

            {/* ADR-0184 (F4-F5): con una sola tienda propia se paga con ella sin preguntar; con varias, se elige —
                la base exige que esa tienda tenga parte en ESTA factura y valida que no supere su saldo. */}
            {misTiendas && misTiendas.length > 1 && (
              <CampoSelectNativo etiqueta="Pagas desde" value={ubicacionPago} onChange={(e) => setUbicacionPago(e.target.value)}>
                {misTiendas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </CampoSelectNativo>
            )}

            <MediosDePago lineas={lineas} onLineas={setLineas} objetivo={compra.saldo} saldoFavor={saldoFavor} fecha={fecha} onFecha={setFecha} datos={datos} cuentas={{ lista: cuentas.cuentas, listo: cuentas.listo }} />

            <div className="border-t border-tinta/10 pt-4">
              <p className="text-sm text-tinta">
                Pagarás <span className="font-display text-xl tabular-nums"><CifraQueCuenta valor={suma} formato="soles" alMontar /></span>
                {favorUsado > 0 && <span className="text-tinta/65"> (usando {soles(favorUsado)} de tu saldo a favor)</span>} ·{" "}
                {llena ? (
                  <>
                    quedarán en cero <b className="font-semibold">1 comprobante</b>
                  </>
                ) : (
                  <>
                    quedarán <b className="font-semibold">{soles(Math.max(0, resta))}</b> por pagar
                  </>
                )}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-tinta/65">
                {!un ? (
                  <>
                    Se registra como <b className="font-semibold">un solo pago repartido en {lineas.length} medios</b>: en cada medio queda su línea (la del banco, la de caja…) y el comprobante conserva su propio historial de pagos.
                  </>
                ) : enBanco ? (
                  <>
                    Se registra como <b className="font-semibold">un solo pago</b>: en el estado de cuenta del banco verás una línea de {soles(suma)}. El comprobante conserva su propio historial de pagos.
                  </>
                ) : (
                  <>
                    Se registra como <b className="font-semibold">un solo pago</b>. El comprobante conserva su propio historial de pagos.
                  </>
                )}
              </p>
            </div>

            <ComboResponsable control={responsable} deshabilitado={loading} />

            {/* Pie a todo el ancho del panel (sale del relleno con márgenes negativos), como en el spike. */}
            <div className="-mx-6 -mb-6 flex flex-wrap items-center gap-3 border-t border-tinta/10 px-6 py-4">
              <p className="min-w-0 flex-1 basis-48 text-xs text-tinta/55">Todo o nada: si el comprobante ya no admite el monto, no se registra.</p>
              <button type="button" onClick={cerrar} className={BTN_CANCELAR} disabled={loading}>
                Cancelar
              </button>
              <Boton type="submit" peso="primario" cargando={loading} disabled={loading || excede || favorExcedido || suma <= 0}>
                {loading ? "Registrando…" : `Registrar pago de ${soles(suma)}`}
              </Boton>
            </div>
          </form>
        )
      }
    </Modal>
  );
}

function AnularCompraModal({ compra, onClose }: { compra: CompraResumen; onClose: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  // ADR-0161 act. d (20260923240000): la base anota quién anuló (`compras.anulada_por`) con el responsable del combo.
  const responsable = useResponsable();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!motivo.trim()) return void avisar.error("Escribe por qué se anula.", { enfocar: "anular-motivo" });
    if (!responsable.listo) return void (responsable.motivo && avisar.error(responsable.motivo));
    setLoading(true);
    const supabase = createClient();
    const { error } = await firmar(
      supabase.rpc("anular_compra", { p_compra_id: compra.id, p_motivo: motivo.trim() }),
      responsable.firma(),
    );
    setLoading(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "anular el comprobante"));
      return;
    }
    avisar.exito(`Comprobante ${compra.documento} anulado`, { detalle: "Deja de contar en Por pagar y en Recibir." });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Anular comprobante" subtitulo={`${compra.documento} · ${compra.proveedorNombre}`} onClose={onClose}>
      {(cerrar) => (
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm text-tinta/75">
            El comprobante queda como anulado y deja de contar en Por pagar y en Recibir. No se borra: el registro se conserva con el motivo.
          </p>
          <CampoTexto etiqueta="Motivo" id="anular-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Se registró por error, el proveedor la reemplazó…" autoFocus />
          <ComboResponsable control={responsable} deshabilitado={loading} />
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={cerrar} className={botonCancelar} disabled={loading}>
              Volver
            </button>
            <button type="submit" className={botonPrimario} disabled={loading || !responsable.listo} title={responsable.motivo ?? undefined}>
              {loading ? "Anulando…" : "Anular"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
