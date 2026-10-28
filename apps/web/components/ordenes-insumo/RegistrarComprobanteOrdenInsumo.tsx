"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ReceiptText, X } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { Boton, BotonEnlace, CampoSelect, CampoTexto, Interruptor } from "@/components/ui/campos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { avisar } from "@/components/ui/Avisos";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { LineasPago, lineaPagoVacia, type LineaPago } from "@/components/LineasPago";
import { PROPUESTA_DEL_TALLER, useCuentasParaElegir } from "@/components/finanzas/CampoCuenta";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { MarcaCampo } from "@/components/alta-producto/guia";
import { ConMarca } from "@/components/ficha-producto/TiraFicha";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { cuentaEfectiva } from "@/lib/cuenta-sellada-reglas";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import type { EstadoCampo } from "@/lib/guia-campos";
import { fechaCorta, soles } from "@/lib/compras-reglas";
import { sugerirCantidadInsumo } from "@/lib/sugerencias-orden-insumo";
import { opcionesDeInsumo } from "@/lib/orden-insumo-alta";
import {
  AVISO_DE_CORTE_COMPROBANTE,
  TIPOS_COMPROBANTE,
  discriminaIgv,
  esEnvioConOtrosDatos,
  pagoParaBase,
  palabrasDelTipo,
  pidePapel,
  problemaDeEmision,
  sugerirSerie,
  tituloDeRegistro,
  vencimientoSugerido,
  type CondicionComprobante,
  type TipoComprobante,
} from "@/lib/comprobante-orden-reglas";
import {
  TOPES_PAPEL_INSUMO,
  argsRegistrarPapelInsumo,
  calcularRenglonInsumo,
  camposDelPapelInsumo,
  deMasPorLineaInsumo,
  detalleDeRegistroInsumo,
  pedidasDeLaOrden,
  papelDeOrdenInsumo,
  pedidasSinRenglonInsumo,
  pendienteMilesimas,
  precargarPapelInsumo,
  primerProblemaPapelInsumo,
  renglonDePedida,
  resumenDeAvisosInsumo,
  resumenDelPapelInsumo,
  totalesPapelInsumo,
  unidadDeRenglon,
  type BorradorPapelInsumo,
  type ContextoPapelInsumo,
  type DeMasDeInsumo,
  type LineaPapelInsumo,
  type PedidaInsumo,
} from "@/lib/comprobante-orden-insumo-reglas";
import {
  RUTA_ORDENES_INSUMO,
  cantidadConUnidad,
  hrefOrdenInsumoGuardada,
  nombreUnidad,
  numeroOrdenInsumo,
  type DetalleOrdenInsumo,
  type InsumoOpcion,
} from "@/lib/ordenes-insumo-reglas";
import { registrarComprobanteOrdenInsumo } from "@/lib/ordenes-insumo-acciones";

// Registrar el comprobante de una orden de insumos del Taller (ADR-0362, fase 7 parte 2 · actividad 1). La gemela de «Registrar
// comprobante» de una orden de tienda (`RegistrarComprobanteOrden`), con lo del Taller: cada renglón es un INSUMO con su unidad («12.5
// metros»), la cantidad con hasta tres decimales y el costo con hasta cuatro. Se llena mirando el PAPEL que dio el proveedor: arriba, qué
// papel es (tipo, serie, número, emisión, vencimiento, IGV); en medio, lo que dice, renglón por renglón; abajo, los totales y quién lo
// registra. Las reglas viven en `registrar_comprobante_orden_insumo` (la base las vuelve a exigir todas); aquí se espeja lo que esa función
// rechazaría (`lib/comprobante-orden-insumo-reglas.ts`) para decirlo antes de pulsar.
//
// Cómo se paga (actividad 2, «como en tienda»): AL CRÉDITO queda por pagar en el Taller y lo paga el líder después; AL CONTADO se registra
// con su pago por el total, desde una cuenta de la empresa o desde el fondo por rendir de quien paga («Mi fondo», primero en «Sale de» si
// tiene uno). La base valida la cuenta de cada medio y que el fondo sea de quien paga.
//
// Nada viene puesto (Felipe 2026-10-14, /formidable, como la compra de una orden de Compras desde el 13/10): el tipo de papel, cómo se paga
// y el medio del pago al contado arrancan VACÍOS y se eligen siempre. Con «Factura» y «Crédito» puestos de fábrica, bastaba escribir serie y
// número para registrar una factura al crédito con IGV que nadie eligió (deuda y crédito fiscal). Sin tipo, el total va sin IGV. Antes del
// botón, una línea dice qué se va a registrar (`resumenDelPapelInsumo`).
//
// Lo que ya viene puesto: cada línea de la orden con lo que todavía no llegó en papel y su costo neto por unidad (precio menos su
// descuento). Lo que el papel trae de más se acepta y queda avisado; un insumo que no estaba en la orden se agrega del catálogo
// (decisión 43).
//
// Quién firma (decisión 39): con la cuenta de una PERSONA firma ella (`orden_insumo_comprobante`); desde una TERMINAL, el combo
// «Responsable». Un doble clic no registra dos veces: el token del envío se genera una vez y la base devuelve el mismo papel si el envío se
// repite igual (también tras un corte de señal).

const TITULO = "mb-1 text-[13px] font-semibold text-tinta";
// El título de un campo de la cabecera: una sola línea de alto fijo, así las cajas de al lado quedan alineadas en cualquier estado de la guía.
const TITULO_FIJO = "mb-1.5 flex h-6 items-center gap-x-2 overflow-hidden whitespace-nowrap text-[13px] font-semibold text-tinta";
// Un renglón del papel con lugar (sección de 52 rem o más): marca de la guía y número · insumo · cantidad con su unidad · costo · subtotal
// · quitar. Lo comparten el encabezado y cada fila.
const FILA_ANCHA = "@min-[52rem]:grid-cols-[2.5rem_minmax(0,1.6fr)_10rem_7rem_7rem_2rem]";

type Props = {
  /** Una orden «generada» de una base que ya sabe del papel: la página no monta el formulario con otra. */
  orden: DetalleOrdenInsumo;
  /** Los insumos sin archivar, para uno que no estaba en la orden. */
  insumos: InsumoOpcion[];
  /** Por qué no se pudieron leer los insumos (sin ellos solo se pone lo pedido). */
  fallaListas: string | null;
  sede: string;
  hoy: string;
};

/** Lo que se muestra cuando el envío no salió: el texto, y si ofrece «Recargar» (la base ya tenía ese envío con otros datos). */
type ErrorDeHoja = { texto: string; recargar: boolean };

export function RegistrarComprobanteOrdenInsumo({ orden, insumos, fallaListas, sede, hoy }: Props) {
  const router = useRouter();
  const pedidas = useMemo(() => pedidasDeLaOrden(orden), [orden]);
  const [lineas, setLineas] = useState<LineaPapelInsumo[]>(() => {
    let n = 0;
    return precargarPapelInsumo(pedidas, () => `r${++n}`);
  });
  const contador = useRef(lineas.length);
  const [tipo, setTipo] = useState<TipoComprobante | "">("");
  const [condicion, setCondicion] = useState<CondicionComprobante | "">("");
  const [serie, setSerie] = useState("");
  const [numero, setNumero] = useState("");
  const [emision, setEmision] = useState(hoy);
  // El vencimiento se SUGIERE con el plazo del proveedor mientras la persona no lo escriba; si cambia la emisión y no se tocó, se recalcula.
  const [vencimientoEditado, setVencimientoEditado] = useState<string | null>(null);
  const [sumaIgv, setSumaIgv] = useState(true);
  const [totalDelPapel, setTotalDelPapel] = useState("");
  // El medio tampoco viene puesto: la persona dice con qué pagó (el «Sale de» se propone recién cuando lo elige).
  const [pagos, setPagos] = useState<LineaPago[]>(() => [{ ...lineaPagoVacia(), metodo: "" }]);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  // Ya quedó registrado y la pantalla se está yendo a la lista: el botón no se vuelve a ofrecer en ese ratito.
  const [registrado, setRegistrado] = useState(false);
  const [error, setError] = useState<ErrorDeHoja | null>(null);
  const avisoError = useRef<HTMLDivElement>(null);
  // El token del envío se genera una vez y se reusa en cada reintento: la base devuelve el mismo papel si el envío es el mismo.
  const [token] = useState(() => crypto.randomUUID());
  // El candado contra dos clics en el mismo instante (ver `registrar`).
  const enVuelo = useRef(false);

  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();
  // Las cuentas para «Sale de», pedidas con la sede a la que llega la orden (el Taller): propone la cuenta que el líder eligió para
  // sus transferencias y, primero, el fondo de quien paga si tiene uno.
  const cuentas = useCuentasParaElegir("pago", orden.destino.id, condicion === "contado", { conMiFondo: true, propuestaSoloDe: PROPUESTA_DEL_TALLER });

  const plazoDias = orden.plazoCreditoDias;
  const sugerido = vencimientoSugerido(emision, plazoDias);
  const vencimiento = vencimientoEditado ?? sugerido;
  const borrador: BorradorPapelInsumo = { tipo, serie, numero, emision, condicion, vencimiento, sumaIgv, totalDelPapel, lineas, pagos, nota };

  const ctx: ContextoPapelInsumo = useMemo(
    () => ({
      hoy,
      lineasDeLaOrden: new Map(pedidas.flatMap((p) => (p.itemId ? [[p.itemId, p.unidadMedida] as const] : []))),
      insumos: new Map(insumos.map((i) => [i.id, i.unidadMedida])),
    }),
    [hoy, pedidas, insumos],
  );
  const totales = totalesPapelInsumo(borrador);
  const totalSoles = totales.totalCentimos / 100;
  // Lo que se va a registrar, dicho antes del botón: el papel, el total y cómo se paga (con la cuenta de «Sale de» de cada medio).
  const resumen = resumenDelPapelInsumo(borrador, totales.totalCentimos, (p) => {
    const id = cuentaEfectiva(cuentas.cuentas, "pago", p.metodo, p.cuentaId);
    const c = cuentas.cuentas.find((x) => x.id === id);
    return c ? (c.tipo === "fondo" ? "tu fondo" : c.nombre) : null;
  });
  const campos = camposDelPapelInsumo(
    borrador,
    ctx,
    { tipo: tipo !== "", condicion: condicion !== "" },
    { pide: !esPersona, listo: responsable.listo, motivo: responsable.motivo },
  );
  const guia = useGuiaCampos(campos, { enModal: false });

  // Lo que llegó completo no se marca con ✓ (regla 4 de la guía): quien entra a copiar un papel no necesita leer diez tildes. Si algo se
  // deja pendiente al llenarlo (se borra un renglón, se escribe una fecha mala), vuelve a llevar su marca.
  const [completosAlAbrir] = useState(() => new Set(campos.filter((c) => c.hecho).map((c) => c.id)));
  const estadoVisible = (id: string): EstadoCampo | null => {
    const estado = guia.estado(id);
    return estado === "hecho" && completosAlAbrir.has(id) ? null : estado;
  };
  const etiqueta = (id: string, texto: ReactNode) => <ConMarca estado={estadoVisible(id)}>{texto}</ConMarca>;

  // Al contado con un solo medio, el monto ES el total y acompaña a los renglones mientras se tipean. Con dos o más medios, la persona
  // reparte a mano. Ajustado en el render (estado derivado), no en un efecto.
  const [totalPrevio, setTotalPrevio] = useState(totales.totalCentimos);
  if (totales.totalCentimos !== totalPrevio) {
    setTotalPrevio(totales.totalCentimos);
    const unico = pagos.length === 1 ? pagos[0] : undefined;
    if (condicion === "contado" && unico) setPagos([{ ...unico, monto: totalSoles > 0 ? totalSoles.toFixed(2) : "" }]);
  }

  // «¿Salir sin guardar?»: cuenta lo que la persona llenó o cambió (el papel viene precargado de la orden).
  const fotoActual = JSON.stringify({ tipo, serie, numero, emision, condicion, vencimientoEditado, sumaIgv, totalDelPapel, lineas, pagos, nota });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(
    fotoActual !== fotoAlAbrir,
    "Llenaste parte de este comprobante y todavía no se registró. Si sales ahora, se pierde lo que llenaste.",
  );

  // El error de la hoja se lleva a la vista y se anuncia (a un lector de pantalla también): estaba debajo del botón que se pulsó.
  useEffect(() => {
    if (error) avisoError.current?.focus();
  }, [error]);

  // Un insumo que no estaba en la orden: los del proveedor de la orden primero (`insumos.proveedor_id`), y se encuentra por su código.
  const opcionesInsumo = useMemo(() => opcionesDeInsumo(insumos, orden.proveedor.id), [insumos, orden.proveedor.id]);
  const insumoPor = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos]);
  const pedidaPor = useMemo(() => new Map(pedidas.flatMap((p) => (p.itemId ? [[p.itemId, p] as const] : []))), [pedidas]);
  const deMasPor = useMemo(() => new Map(deMasPorLineaInsumo(lineas, pedidas).map((d) => [d.itemId, d])), [lineas, pedidas]);
  const sinRenglon = pedidasSinRenglonInsumo(pedidas, lineas);
  // Lo que la orden ya tiene en papel (de antes): el aviso de arriba lo dice para que nadie copie dos veces lo mismo.
  const papelDeAntes = papelDeOrdenInsumo(pedidas);

  function nuevaClave(): string {
    contador.current += 1;
    return `r${contador.current}`;
  }
  function cambiarLinea(clave: string, cambios: Partial<LineaPapelInsumo>) {
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  }
  function quitarLinea(clave: string) {
    setLineas((ls) => ls.filter((l) => l.clave !== clave));
  }
  // Una línea de la orden que no estaba en el papel (se quitó, o ya había llegado toda) vuelve a ponerse con su costo neto.
  function ponerPedida(p: PedidaInsumo) {
    const nueva = renglonDePedida(p, nuevaClave());
    if (!nueva) return;
    setLineas((ls) => [...ls, nueva]);
    requestAnimationFrame(() => guia.ir(`linea-${nueva.clave}`));
  }
  function agregarFuera() {
    const clave = nuevaClave();
    setLineas((ls) => [...ls, { clave, ordenItemId: null, insumoId: "", cantidad: "", costo: "" }]);
    // El renglón nuevo es lo que sigue: se lleva a la vista y a su insumo.
    requestAnimationFrame(() => guia.ir(`linea-${clave}`));
  }

  async function irA(href: string) {
    await avisoSalida.retirarYa();
    router.push(href);
  }

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (registrado) return;
    // Dos clics en el MISMO instante: `guardando` es estado de React y se aplica después del clic, así que dejaba pasar dos llamadas. El
    // candado es el de la casa (Nueva orden de insumos, Anular orden): una ref que se pone en el mismo tick y se suelta al terminar.
    if (guardando || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    // La red de seguridad: lo mismo que la guía, dicho de una vez (la base vuelve a exigir todo).
    const problema = primerProblemaPapelInsumo(borrador, ctx);
    if (problema) {
      setError({ texto: problema, recargar: false });
      return;
    }
    // Cada medio lleva su cuenta de «Sale de»: la que se eligió mientras siga sirviendo para ese medio, o la que la base propone.
    const pago = condicion === "contado" ? pagoParaBase(pagos, (p) => cuentaEfectiva(cuentas.cuentas, "pago", p.metodo, p.cuentaId)) : null;
    if (condicion === "contado" && !pago) {
      setError({ texto: "Cada medio de pago necesita un monto mayor a cero.", recargar: false });
      return;
    }
    enVuelo.current = true;
    try {
      setError(null);
      setGuardando(true);
      const firma = esPersona ? firmaOmitida("orden_insumo_comprobante") : responsable.firma();
      const { resultado, error: falla } = await registrarComprobanteOrdenInsumo(argsRegistrarPapelInsumo(borrador, { ordenId: orden.id, token, pago }), firma);
      if (!esPersona) responsable.despues(falla);
      if (falla) {
        setGuardando(false);
        // Se cortó la señal: el papel pudo llegar a la base y perderse solo la respuesta. Reintentar sin cambiar nada es seguro (el mismo
        // token con los mismos datos devuelve el mismo papel); decir «no se guardó nada» invitaba a corregir algo creyendo que no existía.
        if (esFalloDeRed(falla)) setError({ texto: AVISO_DE_CORTE_COMPROBANTE, recargar: false });
        else setError({ texto: traducirError(falla, "registrar el comprobante"), recargar: esEnvioConOtrosDatos(falla.message) });
        return;
      }
      setRegistrado(true);
      setGuardando(false);
      const nombreOrden = numeroOrdenInsumo(orden.numero);
      if (resultado) {
        avisar.exito(tituloDeRegistro(tipo, resultado.documento), {
          detalle: detalleDeRegistroInsumo(nombreOrden, resultado),
          // «Vuelve a la orden»: la lista la deja marcada y desde aquí se abre encima de ella.
          accion: { texto: "Ver la orden", onClick: () => router.push(`${RUTA_ORDENES_INSUMO}/ver/${orden.id}`) },
          duracion: 9000,
        });
        const sobrante = resumenDeAvisosInsumo(resultado.avisos);
        if (sobrante) avisar.aviso(sobrante.titulo, { detalle: sobrante.detalle, duracion: 12000 });
      } else {
        // La base contestó sin error pero con algo que no se entiende: el papel pudo quedar registrado.
        avisar.aviso("El comprobante se envió, pero no pudimos leer la respuesta", { detalle: `Abre ${nombreOrden} y revisa que aparezca su comprobante.`, duracion: 12000 });
      }
      await irA(hrefOrdenInsumoGuardada(orden.id));
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
  }

  const problemaEmision = emision ? problemaDeEmision(emision, hoy) : null;
  const conIgv = discriminaIgv(tipo) && sumaIgv;
  const palabras = palabrasDelTipo(tipo);

  function elegirTipo(t: TipoComprobante) {
    setTipo(t);
  }

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={sede}
        titulo={`Compra de ${numeroOrdenInsumo(orden.numero)}`}
        subtitulo={`${orden.proveedor.nombre} · llega a ${orden.destino.nombre}. ${palabras.copia}: lo que falta de la orden ya viene puesto.`}
        volver={<Volver href={RUTA_ORDENES_INSUMO} a="Órdenes de insumos" />}
      >
        <div data-guia="oi-comprobante.cifras" className="anim-sube text-right" style={{ ["--i" as string]: 1 }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-taupe-profundo">{palabras.total}</p>
          <p className="font-display mt-1 text-2xl tabular-nums text-tinta" aria-live="polite">
            {soles(totalSoles)}
          </p>
        </div>
      </EncabezadoPagina>

      {papelDeAntes === "completa" && (
        <Aviso tono="atencion" guia="oi-comprobante.aviso" titulo="Esta orden ya tiene todo su papel registrado">
          Si registras otro comprobante, lo que pase de lo pedido se acepta y queda avisado como «de más».
        </Aviso>
      )}
      {papelDeAntes === "en_parte" && (
        <Aviso tono="info" guia="oi-comprobante.aviso" titulo="Esta orden ya tiene papel registrado">
          Abajo viene solo lo que todavía no llegó en papel.
        </Aviso>
      )}
      {fallaListas && (
        <Aviso tono="atencion" titulo="No se pudo leer todo lo que hace falta">
          {fallaListas}
        </Aviso>
      )}

      {/* Registrar un comprobante deja una deuda: Enter dentro de una caja no lo envía; se registra con el botón. */}
      <form
        onSubmit={registrar}
        noValidate
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
        }}
        className="space-y-6"
      >
        <section data-guia="oi-comprobante.papel" className="@container card-cayla p-4 sm:p-5" aria-label="El papel">
          <div className="grid gap-x-5 gap-y-4 @min-[28rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
            <CampoGuiado id="tipo" guia={guia} className="@min-[28rem]:col-span-2">
              <p className={TITULO_FIJO}>{etiqueta("tipo", "Qué papel te dieron")}</p>
              {/* Los cuatro tipos en un segmento piden 448 px: en la sección angosta «Sin comprobante» quedaba fuera de la vista, así que
                  ahí se elige con el desplegable. Un solo valor; el que no se ve no existe para el lector. */}
              <div className="@max-[28rem]:hidden">
                <SegmentoDeslizante
                  etiqueta="Tipo de papel"
                  valor={tipo}
                  onCambio={(t) => elegirTipo(t as TipoComprobante)}
                  opciones={TIPOS_COMPROBANTE.map((t) => ({ clave: t.valor, etiqueta: t.texto }))}
                />
              </div>
              <div className="@min-[28rem]:hidden">
                <CampoSelect
                  id="oi-tipo"
                  caja
                  etiqueta="Tipo de papel"
                  marcador="Elige el papel"
                  valor={tipo}
                  onValor={(t) => elegirTipo(t as TipoComprobante)}
                  opciones={TIPOS_COMPROBANTE.map((t) => ({ valor: t.valor, texto: t.texto }))}
                />
              </div>
            </CampoGuiado>
            {pidePapel(tipo) ? (
              <>
                <CampoGuiado id="serie" guia={guia}>
                  <p className={TITULO_FIJO}>{etiqueta("serie", "Serie")}</p>
                  <CampoTexto
                    id="oi-serie"
                    caja
                    mono
                    etiqueta="Serie"
                    placeholder={sugerirSerie(tipo)}
                    maxLength={TOPES_PAPEL_INSUMO.serie}
                    value={serie}
                    onChange={(e) => setSerie(e.target.value.toUpperCase())}
                  />
                </CampoGuiado>
                <CampoGuiado id="numero" guia={guia}>
                  <p className={TITULO_FIJO}>{etiqueta("numero", "Número")}</p>
                  <CampoTexto
                    id="oi-numero"
                    caja
                    mono
                    etiqueta="Número"
                    placeholder="000123" // sugerir-fijo: el número de un papel no depende de nada elegido antes (solo cifras)
                    maxLength={TOPES_PAPEL_INSUMO.numero}
                    inputMode="numeric"
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                  />
                </CampoGuiado>
              </>
            ) : (
              // Sin comprobante (decisión 50): no hay serie ni número que copiar; la base le pone su número interno al guardar.
              <p data-guia="oi-comprobante.sin-papel" className="nota-cayla self-end @min-[28rem]:col-span-2">
                Sin serie ni número: se guarda con un número interno (SC-…) para que el contador sepa que esta compra no tiene comprobante.
              </p>
            )}
            <CampoGuiado id="emision" guia={guia}>
              <p className={TITULO_FIJO}>{etiqueta("emision", palabras.emision)}</p>
              <CampoFecha
                id="oi-emision"
                caja
                etiqueta={palabras.emision}
                valor={emision}
                onValor={setEmision}
                required
                tono={problemaEmision ? "error" : "neutro"}
                pie={problemaEmision ?? undefined}
              />
            </CampoGuiado>
            <CampoGuiado id="condicion" guia={guia} className="@min-[28rem]:col-span-2">
              <p className={TITULO_FIJO}>{etiqueta("condicion", "Cómo se paga")}</p>
              <SegmentoDeslizante
                etiqueta="Cómo se paga"
                valor={condicion}
                onCambio={(c) => {
                  const cond = c as CondicionComprobante;
                  setCondicion(cond);
                  // Al pasar a contado, el único medio arranca con el total.
                  const unico = pagos.length === 1 ? pagos[0] : undefined;
                  if (cond === "contado" && unico) setPagos([{ ...unico, monto: totalSoles > 0 ? totalSoles.toFixed(2) : "" }]);
                }}
                opciones={[
                  { clave: "credito", etiqueta: "Crédito" },
                  { clave: "contado", etiqueta: "Contado" },
                ]}
              />
              <p className="mt-1.5 text-xs text-taupe">
                {condicion === "contado"
                  ? "Se registra con su pago por el total: desde una cuenta de la empresa o desde tu fondo."
                  : condicion === "credito"
                    ? "Queda por pagar en el Taller hasta su vencimiento; lo paga tu líder."
                    : "Al contado se registra con su pago; al crédito queda por pagar en el Taller y lo paga tu líder."}
              </p>
            </CampoGuiado>
            <CampoGuiado id="vencimiento" guia={guia}>
              {/* Al contado no hay vencimiento: el título queda sin marca (no es un campo de la guía). */}
              <p className={TITULO_FIJO}>{condicion === "credito" ? etiqueta("vencimiento", "Vence el") : "Vence el"}</p>
              <fieldset disabled={condicion !== "credito"} className={`m-0 min-w-0 border-0 p-0 transition-opacity duration-300 ${condicion === "credito" ? "" : "opacity-45"}`}>
                <CampoFecha
                  id="oi-vencimiento"
                  caja
                  etiqueta="Vence el"
                  valor={condicion === "credito" ? vencimiento : ""}
                  onValor={setVencimientoEditado}
                  required={condicion === "credito"}
                  disabled={condicion !== "credito"}
                />
              </fieldset>
              <p className="mt-1.5 text-xs text-taupe">
                {condicion === "contado" ? (
                  "Al contado no hay vencimiento."
                ) : condicion === "" ? (
                  "Solo si es al crédito."
                ) : vencimientoEditado === null ? (
                  `Sugerido: emisión + ${plazoDias ?? 30} días${plazoDias != null ? `, el plazo de ${orden.proveedor.nombre}` : ""}.`
                ) : (
                  <>
                    Lo cambiaste.{" "}
                    <button type="button" onClick={() => setVencimientoEditado(null)} className="btn-cayla btn-enlace">
                      Volver al sugerido ({fechaCorta(sugerido).slice(0, 5)})
                    </button>
                  </>
                )}
              </p>
            </CampoGuiado>
            <div className="@min-[28rem]:col-span-2">
              <Interruptor
                activo={conIgv}
                onActivo={setSumaIgv}
                disabled={!discriminaIgv(tipo)}
                etiqueta="Sumar IGV (18 %)"
                pie={palabras.sinIgv ?? "Los costos de abajo son sin IGV: se suma el 18 % al total."}
              />
            </div>
          </div>
        </section>

        <section data-guia="oi-comprobante.renglones" className="@container card-cayla space-y-3 p-4 sm:p-5" aria-label={palabras.seccion}>
          <TituloSeccion
            dato={
              <span className="tabular-nums">
                {lineas.length} {lineas.length === 1 ? "renglón" : "renglones"}
              </span>
            }
          >
            {palabras.seccion}
          </TituloSeccion>

          {lineas.length === 0 && (
            <CampoGuiado id="lineas" guia={guia}>
              <Vacio tamano="chico" icono={<ReceiptText />}>
                {sinRenglon.length > 0 ? palabras.vacioConOrden : palabras.vacio}
              </Vacio>
            </CampoGuiado>
          )}

          {lineas.length > 0 && (
            <div aria-hidden className={`hidden items-end gap-x-2.5 px-3 text-[13px] font-semibold text-tinta @min-[52rem]:grid ${FILA_ANCHA}`}>
              <span />
              <span>Insumo</span>
              <span>Cantidad</span>
              <span>
                Costo u.
                {discriminaIgv(tipo) && <span className="block text-[12px] font-normal text-taupe">sin IGV</span>}
              </span>
              <span className="text-right">Subtotal</span>
              <span />
            </div>
          )}

          {lineas.map((l, i) => {
            const pedida = l.ordenItemId ? (pedidaPor.get(l.ordenItemId) ?? null) : null;
            return (
              <RenglonDelPapel
                key={l.clave}
                linea={l}
                numero={i + 1}
                pedida={pedida}
                deMas={l.ordenItemId ? (deMasPor.get(l.ordenItemId) ?? null) : null}
                unidad={unidadDeRenglon(l, ctx)}
                nombreFuera={l.insumoId ? (insumoPor.get(l.insumoId)?.nombre ?? null) : null}
                conIgv={discriminaIgv(tipo)}
                guia={guia}
                etiqueta={etiqueta}
                estado={estadoVisible}
                opcionesInsumo={opcionesInsumo}
                onCambio={(cambios) => cambiarLinea(l.clave, cambios)}
                onQuitar={() => quitarLinea(l.clave)}
              />
            );
          })}

          {sinRenglon.length > 0 && (
            <div data-guia="oi-comprobante.sin-poner" className="space-y-2 border-t border-sand pt-3">
              <p className={TITULO}>{palabras.sinPoner}</p>
              <ul className="space-y-1.5">
                {sinRenglon.map((p) => (
                  <li key={p.itemId ?? p.posicion} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-sm">
                    <span className="min-w-0 text-tinta">
                      {p.insumo}{" "}
                      <span className="text-taupe">
                        · pediste {cantidadConUnidad(p.cantidad, p.unidadMedida)}
                        {p.facturado > 0 ? `, ya en papel ${cantidadConUnidad(p.facturado, p.unidadMedida)}` : ""}
                        {pendienteMilesimas(p) === 0 ? " (llegó completa)" : ""}
                      </span>
                    </span>
                    <Boton type="button" className="px-3 py-1.5 text-[11px]" onClick={() => ponerPedida(p)}>
                      {palabras.poner}
                    </Boton>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand pt-4">
            <Boton type="button" onClick={agregarFuera} disabled={lineas.length >= TOPES_PAPEL_INSUMO.lineas || insumos.length === 0} data-guia="oi-comprobante.fuera">
              + Un insumo que no estaba en la orden
            </Boton>
          </div>

          <div data-guia="oi-comprobante.totales" className="ml-auto w-full max-w-sm space-y-1.5 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-taupe">Subtotal</span>
              <span className="tabular-nums text-tinta">{soles(totales.subtotalCentimos / 100)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-taupe">{conIgv ? "IGV 18 %" : "IGV"}</span>
              <span className="tabular-nums text-tinta">{conIgv ? soles(totales.igvCentimos / 100) : "No lleva"}</span>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-sand pt-2">
              <span className="font-semibold text-tinta">Total</span>
              <span className="font-display text-xl tabular-nums text-tinta">{soles(totalSoles)}</span>
            </div>
            {conIgv && (
              <CampoGuiado id="total-papel" guia={guia} className="pt-2">
                <p className={TITULO}>
                  {etiqueta("total-papel", "Si el papel dice otro total")}
                  <span className="ml-2 text-[12px] font-normal text-taupe">opcional</span>
                </p>
                <CampoTexto
                  id="oi-total-papel"
                  caja
                  sinPie
                  etiqueta="Total que dice el papel, en soles"
                  inputMode="decimal"
                  placeholder={totalSoles.toFixed(2)}
                  value={totalDelPapel}
                  onChange={(e) => setTotalDelPapel(e.target.value)}
                />
                <p className="mt-1.5 text-xs text-taupe">Solo si difiere por centavos: ese total manda y el IGV se ajusta.</p>
              </CampoGuiado>
            )}
          </div>
        </section>

        {condicion === "contado" && (
          <section data-guia="oi-comprobante.pago" className="card-cayla space-y-3 p-4 sm:p-5 anim-revelar" aria-label="Pago al contado">
            <CampoGuiado id="pago" guia={guia} titulo="Pago al contado" ayuda={`Total ${soles(totalSoles)}`}>
              <LineasPago
                id="oi-comprobante-pagos"
                lineas={pagos}
                onLineas={setPagos}
                objetivo={totalSoles}
                totalComprobante={totalSoles}
                exacto
                cuentas={{ lista: cuentas.cuentas, listo: cuentas.listo }}
              />
            </CampoGuiado>
          </section>
        )}

        <section data-guia="oi-comprobante.registrar" className="space-y-3" aria-label="Registrar">
          <CampoGuiado id="nota" guia={guia} className="max-w-2xl">
            <p className={TITULO_FIJO}>
              {etiqueta("nota", "Nota")}
              <span className="text-[12px] font-normal text-taupe">opcional</span>
            </p>
            <CampoTexto id="oi-nota-comprobante" caja etiqueta="Nota" maxLength={TOPES_PAPEL_INSUMO.nota} value={nota} onChange={(e) => setNota(e.target.value)} />
          </CampoGuiado>
          {!esPersona && (
            <CampoGuiado id="responsable" guia={guia} titulo="Quién registra el comprobante" className="max-w-sm">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}
          <PieGuia guia={guia} listo={resumen ?? "Todo listo para registrar."} />
          {error && (
            <Aviso
              ref={avisoError}
              enfocable
              tono="error"
              titulo="No se pudo registrar el comprobante"
              accion={error.recargar ? <Boton type="button" onClick={() => window.location.reload()}>Recargar</Boton> : undefined}
            >
              {error.texto}
            </Aviso>
          )}
          <div className="pie-acciones">
            <BotonEnlace href={RUTA_ORDENES_INSUMO}>Cancelar</BotonEnlace>
            <Boton type="submit" peso="primario" cargando={guardando} textoCargando="Registrando…" disabled={registrado} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {registrado ? "Registrado" : palabras.boton}
            </Boton>
          </div>
        </section>
      </form>

      {avisoSalida.aviso}
    </div>
  );
}

/**
 * Un renglón del papel. Dos caras, según el ancho de la SECCIÓN (`@container`), no de la ventana: con 52 rem o más es UNA FILA (los
 * títulos van una sola vez, arriba); más angosta, una tarjeta que se apila. Un renglón de la orden muestra su insumo (el de la orden, que no
 * se toca) con cuánto se pidió y cuánto llegó ya en papel; un insumo que no estaba en la orden trae su combo.
 */
function RenglonDelPapel({
  linea: l,
  numero,
  pedida,
  deMas,
  unidad,
  nombreFuera,
  conIgv,
  guia,
  etiqueta,
  estado,
  opcionesInsumo,
  onCambio,
  onQuitar,
}: {
  linea: LineaPapelInsumo;
  numero: number;
  /** La línea de la orden a la que responde; null si es un insumo que no estaba en la orden. */
  pedida: PedidaInsumo | null;
  deMas: DeMasDeInsumo | null;
  /** La unidad en que se escribe la cantidad (la de la línea, o la del insumo elegido); null sin insumo. */
  unidad: string | null;
  /** El nombre del insumo elegido fuera de la orden (para decir en qué se escribe). */
  nombreFuera: string | null;
  /** El tipo de papel discrimina IGV: el costo se dice «sin IGV». */
  conIgv: boolean;
  guia: ReturnType<typeof useGuiaCampos>;
  etiqueta: (id: string, texto: ReactNode) => ReactNode;
  estado: (id: string) => EstadoCampo | null;
  opcionesInsumo: ReturnType<typeof opcionesDeInsumo>;
  onCambio: (cambios: Partial<LineaPapelInsumo>) => void;
  onQuitar: () => void;
}) {
  const id = `linea-${l.clave}`;
  const c = calcularRenglonInsumo(l);
  // «metros» al lado de la caja; «metro» si la cantidad es justo 1. Sin insumo, nada: todavía no se sabe en qué se escribe.
  const cantidadLeida = c.cantidadMilesimas != null ? c.cantidadMilesimas / 1000 : null;
  const unidadALaVista = unidad ? nombreUnidad(unidad, cantidadLeida) : null;
  const porUnidad = unidad ? nombreUnidad(unidad, 1) : "unidad";
  const quitar = (clase: string) => (
    <button type="button" onClick={onQuitar} className={`btn-cayla btn-sutil h-8 w-8 shrink-0 p-0 ${clase}`} aria-label={`Quitar el renglón ${numero}`} title="Quitar este renglón">
      <X aria-hidden className="h-4 w-4" />
    </button>
  );
  const insumo = pedida ? (
    <div className="min-w-0">
      <p className="text-tinta">{pedida.insumo}</p>
      {(pedida.codigo || pedida.descripcion) && <p className="text-xs text-taupe">{[pedida.codigo, pedida.descripcion].filter(Boolean).join(" · ")}</p>}
      <p className="mt-0.5 text-xs text-taupe">
        Pediste {cantidadConUnidad(pedida.cantidad, pedida.unidadMedida)}
        {pedida.facturado > 0 ? ` · ya en papel ${cantidadConUnidad(pedida.facturado, pedida.unidadMedida)}` : ""}
      </p>
      {deMas && (
        <p className="mt-0.5 text-xs text-ambar">
          Pasa lo pedido por {cantidadConUnidad(deMas.deMas, deMas.unidad)}. Se acepta y queda avisado.
        </p>
      )}
    </div>
  ) : (
    <div className="min-w-0 space-y-2">
      <Chip tono="pizarra">No estaba en la orden</Chip>
      <ComboBuscable
        caja
        etiquetaAccesible={`Insumo del renglón ${numero}`}
        marcador="Nombre o código…"
        valor={l.insumoId}
        onValor={(insumoId) => onCambio({ insumoId })}
        opciones={opcionesInsumo}
      />
      {nombreFuera && unidad && <p className="text-xs text-taupe">Se escribe en {nombreUnidad(unidad)}.</p>}
    </div>
  );

  return (
    <CampoGuiado id={id} guia={guia} retiene="fila" className="rounded-xl border border-sand bg-papel p-3 @min-[52rem]:rounded-lg @min-[52rem]:py-2">
      <div data-guia="oi-comprobante.renglon" className={`grid grid-cols-2 items-start gap-x-2.5 gap-y-2 @min-[52rem]:items-center ${FILA_ANCHA}`}>
        <div className="col-span-2 flex items-center justify-between gap-2 @min-[52rem]:col-span-1 @min-[52rem]:justify-start">
          <p className="text-[13px] font-semibold text-tinta @min-[52rem]:hidden">{etiqueta(id, `Renglón ${numero}`)}</p>
          <span className="hidden items-center gap-1 text-[12px] tabular-nums text-taupe @min-[52rem]:inline-flex" title={`Renglón ${numero}`}>
            {/* Sin marca (llegó completo), un hueco del mismo ancho: el número no se corre. */}
            {estado(id) ? <MarcaCampo estado={estado(id)!} /> : <span aria-hidden className="inline-block h-[18px] w-[18px]" />}
            {numero}
          </span>
          {quitar("@min-[52rem]:hidden")}
        </div>
        <div className="col-span-2 @min-[52rem]:col-span-1">{insumo}</div>
        {/* En la tarjeta, «Costo por metro (sin IGV)» ocupa dos renglones y «Cantidad» uno: las dos celdas se estiran al alto de la fila y su
            título empuja la caja al fondo, así las dos cajas quedan a la misma altura. En la fila ancha los títulos no se ven. */}
        <div className="flex min-w-0 flex-col self-stretch @min-[52rem]:block @min-[52rem]:self-auto">
          <p className={`${TITULO} flex-1 @min-[52rem]:hidden`}>Cantidad</p>
          <div className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <CampoTexto
                caja
                sinPie
                etiqueta={`Cantidad del renglón ${numero}${unidad ? `, en ${nombreUnidad(unidad)}` : ""}`}
                inputMode="decimal"
                placeholder={sugerirCantidadInsumo(unidad).texto}
                value={l.cantidad}
                onChange={(e) => onCambio({ cantidad: e.target.value })}
              />
            </div>
            {unidadALaVista && (
              <span aria-hidden className="shrink-0 text-[13px] text-taupe-profundo">
                {unidadALaVista}
              </span>
            )}
          </div>
        </div>
        <div className="flex min-w-0 flex-col self-stretch @min-[52rem]:block @min-[52rem]:self-auto">
          <p className={`${TITULO} flex-1 @min-[52rem]:hidden`}>
            Costo por {porUnidad}
            {conIgv ? " (sin IGV)" : ""}
          </p>
          <CampoTexto
            caja
            sinPie
            etiqueta={`Costo por ${porUnidad} del renglón ${numero}, en soles`}
            inputMode="decimal"
            placeholder="0.00" // sugerir-fijo: un costo en soles no depende de nada elegido antes
            value={l.costo}
            onChange={(e) => onCambio({ costo: e.target.value })}
          />
        </div>
        <div className="col-span-2 flex items-baseline justify-between gap-3 border-t border-sand pt-2 @min-[52rem]:col-span-1 @min-[52rem]:block @min-[52rem]:border-0 @min-[52rem]:pt-0 @min-[52rem]:text-right">
          <p className={`${TITULO} @min-[52rem]:hidden`}>Subtotal</p>
          <p className="font-display text-lg tabular-nums text-tinta">{c.subtotalCentimos == null ? "—" : soles(c.subtotalCentimos / 100)}</p>
        </div>
        <div className="hidden justify-end @min-[52rem]:flex">{quitar("")}</div>
      </div>
    </CampoGuiado>
  );
}
