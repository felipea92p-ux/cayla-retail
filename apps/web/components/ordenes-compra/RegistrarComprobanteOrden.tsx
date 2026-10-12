"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ReceiptText, X } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { ComboBuscable, type OpcionCombo } from "@/components/ui/ComboBuscable";
import { Boton, BotonEnlace, CampoTexto, Interruptor } from "@/components/ui/campos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";
import { avisar } from "@/components/ui/Avisos";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { LineasPago, lineaPagoVacia, type LineaPago } from "@/components/LineasPago";
import { useCuentasParaElegir } from "@/components/finanzas/CampoCuenta";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { MarcaCampo } from "@/components/alta-producto/guia";
import { ConMarca } from "@/components/ficha-producto/TiraFicha";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { cuentaEfectiva } from "@/lib/cuenta-sellada-reglas";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import type { EstadoCampo } from "@/lib/guia-campos";
import { opcionesDeMarca } from "@/lib/marca-proveedor-reglas";
import { sugerirDescripcion } from "@/lib/sugerencias-alta-producto";
import { fechaCorta, soles } from "@/lib/compras-reglas";
import {
  AVISO_DE_CORTE_COMPROBANTE,
  TIPOS_COMPROBANTE,
  TOPES_COMPROBANTE,
  argsRegistrarComprobante,
  calcularRenglon,
  camposDelComprobante,
  deMasPorLinea,
  detalleDeRegistro,
  discriminaIgv,
  esEnvioConOtrosDatos,
  lineasDePedida,
  nombreDeLinea,
  pagoParaBase,
  pedidasSinRenglon,
  pendienteDe,
  precargarLineas,
  primerProblema,
  problemaDeEmision,
  resumenDeAvisos,
  sugerirSerie,
  textoDeTipo,
  totalesComprobante,
  vencimientoSugerido,
  unidadesDelPapel,
  type BorradorComprobante,
  type CondicionComprobante,
  type ContextoComprobante,
  type DatosDelComprobante,
  type DeMasDeLinea,
  type LineaComprobante,
  type TipoComprobante,
} from "@/lib/comprobante-orden-reglas";
import { TOPES } from "@/lib/orden-compra-alta";
import { hrefOrdenGuardada, numeroOrdenCompra, type DetalleOrden, type LineaDetalle } from "@/lib/ordenes-compra-reglas";
import { registrarComprobanteOrden } from "@/lib/ordenes-compra-acciones";

// Registrar el comprobante de una orden (ADR-0362, fase 2 · actividades 4 a 8). La pantalla se llena mirando el PAPEL que dio el proveedor:
// arriba, qué papel es (tipo, serie, número, emisión) y cómo se paga; en medio, lo que dice, renglón por renglón; abajo, los totales, el
// pago al contado y quién lo registra. Las reglas viven en `registrar_comprobante_orden` (la base las vuelve a exigir todas); aquí se
// espeja lo que esa función rechazaría (`lib/comprobante-orden-reglas.ts`) para decirlo antes de pulsar.
//
// Lo que ya viene puesto: cada línea de la orden con lo que todavía no llegó en papel y su costo neto por unidad (precio menos su
// descuento). Si los centavos no cuadran —3 prendas que valen S/ 29.00 no son 3 × S/ 9.67— la línea llega partida en dos renglones.
// Lo que el papel trae de más se acepta y queda avisado; algo que no estaba en la orden se agrega con su categoría y marca.
//
// Quién firma (decisión 39): con la cuenta de una PERSONA firma ella (`orden_compra_comprobante`); desde una TERMINAL, el combo
// «Responsable». Un doble clic no registra dos veces: el token del envío se genera una vez y la base devuelve el mismo comprobante si el
// envío se repite igual (también tras un corte de señal).
//
// La guía de foco (CLAUDE.md «Guía de foco»): cada bloque se enciende cuando es lo que sigue y «Falta: …» sobre el botón lleva a cada cosa.
// Sale de `camposDelComprobante`. El tipo de papel y cómo se paga arrancan con un valor puesto que importa (cambian el IGV y el pago):
// hasta que se eligen son «sugeridos» y nunca bloquean.

const TITULO = "mb-1 text-[13px] font-semibold text-tinta";
// El título de un campo de la cabecera: una sola línea de alto fijo, así las cajas de al lado quedan alineadas en cualquier estado de la guía.
const TITULO_FIJO = "mb-1.5 flex h-6 items-center gap-x-2 overflow-hidden whitespace-nowrap text-[13px] font-semibold text-tinta";
// Un renglón del papel con lugar (sección de 56 rem o más): marca de la guía y número · prenda · cantidad · costo · precio de venta ·
// subtotal · quitar. Lo comparten el encabezado y cada fila.
const FILA_ANCHA = "@min-[56rem]:grid-cols-[2.5rem_minmax(0,1.8fr)_5rem_6.5rem_6.5rem_7rem_2rem]";

type Props = {
  /** Una orden «generada» y con «Llega a»: la página no monta el formulario con otra. */
  orden: DetalleOrden;
  datos: DatosDelComprobante;
  sede: string;
  hoy: string;
};

/** Lo que se muestra cuando el envío no salió: el texto, y si ofrece «Recargar» (la base ya tenía ese envío con otros datos). */
type ErrorDeHoja = { texto: string; recargar: boolean };

export function RegistrarComprobanteOrden({ orden, datos, sede, hoy }: Props) {
  const router = useRouter();
  const destino = orden.destino;
  const [lineas, setLineas] = useState<LineaComprobante[]>(() => {
    let n = 0;
    return precargarLineas(orden, () => `r${++n}`);
  });
  const contador = useRef(lineas.length);
  const [tipo, setTipo] = useState<TipoComprobante>("factura");
  const [tipoElegido, setTipoElegido] = useState(false);
  const [condicion, setCondicion] = useState<CondicionComprobante>("credito");
  const [condicionElegida, setCondicionElegida] = useState(false);
  const [serie, setSerie] = useState("");
  const [numero, setNumero] = useState("");
  const [emision, setEmision] = useState(hoy);
  // El vencimiento se SUGIERE con el plazo del proveedor mientras la persona no lo escriba; si cambia la emisión y no se tocó, se recalcula.
  const [vencimientoEditado, setVencimientoEditado] = useState<string | null>(null);
  const [sumaIgv, setSumaIgv] = useState(true);
  const [totalDelPapel, setTotalDelPapel] = useState("");
  const [pagos, setPagos] = useState<LineaPago[]>(() => [lineaPagoVacia()]);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  // Ya quedó registrado y la pantalla se está yendo a la lista: el botón no se vuelve a ofrecer en ese ratito (un segundo clic aquí
  // mostraría un segundo aviso, aunque la base devolvería el mismo comprobante).
  const [registrado, setRegistrado] = useState(false);
  const [error, setError] = useState<ErrorDeHoja | null>(null);
  const avisoError = useRef<HTMLDivElement>(null);
  // El token del envío se genera una vez y se reusa en cada reintento: la base devuelve el mismo comprobante si el envío es el mismo.
  const [token] = useState(() => crypto.randomUUID());
  // El candado contra dos clics en el mismo instante (ver `registrar`).
  const enVuelo = useRef(false);

  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();
  const cuentas = useCuentasParaElegir("pago", destino?.id ?? null, condicion === "contado");

  const plazoDias = datos.proveedor?.plazoCreditoDias ?? null;
  const sugerido = vencimientoSugerido(emision, plazoDias);
  const vencimiento = vencimientoEditado ?? sugerido;
  const borrador: BorradorComprobante = { tipo, serie, numero, emision, condicion, vencimiento, sumaIgv, totalDelPapel, lineas, pagos, nota };

  const ctx: ContextoComprobante = useMemo(
    () => ({
      hoy,
      categoriasActivas: new Set(datos.categorias.map((c) => c.id)),
      marcasActivas: new Set(datos.marcas.map((m) => m.id)),
      lineasDeLaOrden: new Set(orden.lineas.flatMap((l) => (l.id ? [l.id] : []))),
    }),
    [hoy, datos.categorias, datos.marcas, orden.lineas],
  );
  const totales = totalesComprobante(lineas, { tipo, sumaIgv, totalDelPapel });
  const totalSoles = totales.totalCentimos / 100;
  const campos = camposDelComprobante(borrador, ctx, { tipo: tipoElegido, condicion: condicionElegida }, { pide: !esPersona, listo: responsable.listo, motivo: responsable.motivo });
  const guia = useGuiaCampos(campos, { enModal: false });

  // Lo que llegó completo no se marca con ✓ (regla 4 de la guía): quien entra a copiar un papel no necesita leer diez tildes. Si algo se
  // deja pendiente al llenarlo (se borra un renglón, se escribe una fecha mala), vuelve a llevar su marca.
  const [completosAlAbrir] = useState(() => new Set(campos.filter((c) => c.hecho).map((c) => c.id)));
  const estadoVisible = (id: string): EstadoCampo | null => {
    const estado = guia.estado(id);
    return estado === "hecho" && completosAlAbrir.has(id) ? null : estado;
  };
  const etiqueta = (id: string, texto: ReactNode) => <ConMarca estado={estadoVisible(id)}>{texto}</ConMarca>;

  // Al contado con un solo medio, el monto ES el total y acompaña a las líneas mientras se tipean. Con dos o más medios, la persona reparte a
  // mano. Ajustado en el render (estado derivado), no en un efecto.
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

  // ---- opciones de los combos (solo para «Algo que no estaba en la orden») ----
  const opcionesCategoria: OpcionCombo<string>[] = useMemo(() => datos.categorias.map((c) => ({ valor: c.id, texto: c.nombre })), [datos.categorias]);
  const opcionesMarca: OpcionCombo<string>[] = useMemo(
    () => opcionesDeMarca(datos.marcas, [{ id: orden.proveedor.id, nombre: orden.proveedor.nombre }], datos.vinculos, orden.proveedor.id),
    [datos.marcas, datos.vinculos, orden.proveedor.id, orden.proveedor.nombre],
  );
  const categoriaPor = useMemo(() => new Map(datos.categorias.map((c) => [c.id, c])), [datos.categorias]);
  const marcaUnica = (() => {
    const suyas = datos.vinculos.filter((v) => v.proveedorId === orden.proveedor.id);
    return suyas.length === 1 ? suyas[0]!.marcaId : "";
  })();

  const pedidaPor = useMemo(() => new Map(orden.lineas.flatMap((l) => (l.id ? [[l.id, l] as const] : []))), [orden.lineas]);
  const deMasPor = useMemo(() => new Map(deMasPorLinea(lineas, orden).map((d) => [d.ordenItemId, d])), [lineas, orden]);
  const sinRenglon = pedidasSinRenglon(orden, lineas);

  function nuevaClave(): string {
    contador.current += 1;
    return `r${contador.current}`;
  }
  function cambiarLinea(clave: string, cambios: Partial<LineaComprobante>) {
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  }
  function quitarLinea(clave: string) {
    setLineas((ls) => ls.filter((l) => l.clave !== clave));
  }
  // Una línea de la orden que no estaba en el papel (se quitó, o ya había llegado toda) vuelve a ponerse con su costo neto.
  function ponerPedida(l: LineaDetalle) {
    const nuevas = lineasDePedida(l, nuevaClave);
    setLineas((ls) => [...ls, ...nuevas]);
    const primera = nuevas[0];
    if (primera) requestAnimationFrame(() => guia.ir(`linea-${primera.clave}`));
  }
  function agregarFuera() {
    const clave = nuevaClave();
    setLineas((ls) => [...ls, { clave, ordenItemId: null, categoriaId: "", marcaId: marcaUnica, descripcion: "", cantidad: "", costo: "", precioVenta: "" }]);
    // El renglón nuevo es lo que sigue: se lleva a la vista y a su categoría.
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
    // candado es el de la casa (Nueva orden, Ajustar inventario): una ref que se pone en el mismo tick y se suelta al terminar.
    if (guardando || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    // La red de seguridad: lo mismo que la guía, dicho de una vez (la base vuelve a exigir todo).
    const problema = primerProblema(borrador, ctx);
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
      const firma = esPersona ? firmaOmitida("orden_compra_comprobante") : responsable.firma();
      const { resultado, error: falla } = await registrarComprobanteOrden(argsRegistrarComprobante(borrador, { ordenId: orden.id, token, pago }), firma);
      if (!esPersona) responsable.despues(falla);
      if (falla) {
        setGuardando(false);
        // Se cortó la señal: el comprobante pudo llegar a la base y perderse solo la respuesta. Reintentar sin cambiar nada es seguro (el mismo
        // token con los mismos datos devuelve el mismo comprobante); decir «no se guardó nada» invitaba a corregir algo creyendo que no existía.
        if (esFalloDeRed(falla)) setError({ texto: AVISO_DE_CORTE_COMPROBANTE, recargar: false });
        else setError({ texto: traducirError(falla, "registrar el comprobante"), recargar: esEnvioConOtrosDatos(falla.message) });
        return;
      }
      setRegistrado(true);
      setGuardando(false);
      const nombreOrden = numeroOrdenCompra(orden.numero);
      if (resultado) {
        avisar.exito(`${resultado.documento} registrado`, {
          detalle: detalleDeRegistro(nombreOrden, resultado),
          // «Vuelve a la orden»: la lista la deja marcada y desde aquí se abre encima de ella (abrirla desde esta pantalla la dejaría
          // debajo de la ventana, con el formulario detrás).
          accion: { texto: "Ver la orden", onClick: () => router.push(`/compras/ordenes/ver/${orden.id}`) },
          duracion: 9000,
        });
        const sobrante = resumenDeAvisos(resultado.avisos);
        if (sobrante) avisar.aviso(sobrante.titulo, { detalle: sobrante.detalle, duracion: 12000 });
      } else {
        // La base contestó sin error pero con algo que no se entiende: el comprobante pudo quedar registrado.
        avisar.aviso("El comprobante se envió, pero no pudimos leer la respuesta", { detalle: `Abre ${nombreOrden} y revisa que aparezca su comprobante.`, duracion: 12000 });
      }
      await irA(hrefOrdenGuardada(destino?.id ?? null, orden.id));
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
  }

  const problemaEmision = emision ? problemaDeEmision(emision, hoy) : null;
  const cuantas = unidadesDelPapel(lineas);
  const conIgv = discriminaIgv(tipo) && sumaIgv;
  const nombreTipo = textoDeTipo(tipo);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={sede}
        titulo={`Comprobante de ${numeroOrdenCompra(orden.numero)}`}
        subtitulo={`${orden.proveedor.nombre}${destino ? ` · llega a ${destino.nombre}` : " · por repartir"}${orden.deudaDe ? ` · la deuda queda en ${orden.deudaDe.nombre}` : ""}. Copia el papel tal como llegó: lo que falta de la orden ya viene puesto.`}
        volver={<Volver href="/compras/ordenes" a="Órdenes de compra" />}
      >
        <div data-guia="comprobante.cifras" className="anim-sube text-right" style={{ ["--i" as string]: 1 }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-taupe-profundo">Total del papel</p>
          <p className="font-display mt-1 text-2xl tabular-nums text-tinta" aria-live="polite">
            {soles(totalSoles)}
          </p>
        </div>
      </EncabezadoPagina>

      {orden.papel === "completa" && (
        <Aviso tono="atencion" guia="comprobante.aviso" titulo="Esta orden ya tiene todo su papel registrado">
          Si registras otro comprobante, lo que pase de lo pedido se acepta y queda avisado como «de más».
        </Aviso>
      )}
      {orden.papel === "en_parte" && (
        <Aviso tono="info" guia="comprobante.aviso" titulo="Esta orden ya tiene papel registrado">
          Abajo viene solo lo que todavía no llegó en papel.
        </Aviso>
      )}
      {datos.fallaListas && (
        <Aviso tono="atencion" titulo="No se pudo leer todo lo que hace falta">
          {datos.fallaListas}
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
        <section data-guia="comprobante.papel" className="@container card-cayla p-4 sm:p-5" aria-label="El papel">
          <div className="grid gap-x-5 gap-y-4 @min-[28rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
            <CampoGuiado id="tipo" guia={guia} className="@min-[28rem]:col-span-2">
              <p className={TITULO_FIJO}>{etiqueta("tipo", "Qué papel te dieron")}</p>
              <SegmentoDeslizante
                etiqueta="Tipo de papel"
                valor={tipo}
                onCambio={(t) => {
                  setTipo(t as TipoComprobante);
                  setTipoElegido(true);
                }}
                opciones={TIPOS_COMPROBANTE.map((t) => ({ clave: t.valor, etiqueta: t.texto }))}
              />
            </CampoGuiado>
            <CampoGuiado id="serie" guia={guia}>
              <p className={TITULO_FIJO}>{etiqueta("serie", "Serie")}</p>
              <CampoTexto
                id="oc-serie"
                caja
                mono
                etiqueta="Serie"
                placeholder={sugerirSerie(tipo)}
                maxLength={TOPES_COMPROBANTE.serie}
                value={serie}
                onChange={(e) => setSerie(e.target.value.toUpperCase())}
              />
            </CampoGuiado>
            <CampoGuiado id="numero" guia={guia}>
              <p className={TITULO_FIJO}>{etiqueta("numero", "Número")}</p>
              <CampoTexto
                id="oc-numero"
                caja
                mono
                etiqueta="Número"
                placeholder="000123"
                maxLength={TOPES_COMPROBANTE.numero}
                inputMode="numeric"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
              />
            </CampoGuiado>
            <CampoGuiado id="emision" guia={guia}>
              <p className={TITULO_FIJO}>{etiqueta("emision", "Fecha de emisión")}</p>
              <CampoFecha
                id="oc-emision"
                caja
                etiqueta="Fecha de emisión"
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
                  setCondicionElegida(true);
                  // Al pasar a contado, el único medio arranca con el total.
                  const unico = pagos.length === 1 ? pagos[0] : undefined;
                  if (cond === "contado" && unico) setPagos([{ ...unico, monto: totalSoles > 0 ? totalSoles.toFixed(2) : "" }]);
                }}
                opciones={[
                  { clave: "credito", etiqueta: "Crédito", guia: "comprobante.credito" },
                  { clave: "contado", etiqueta: "Contado", guia: "comprobante.contado" },
                ]}
              />
              <p className="mt-1.5 text-xs text-taupe">{condicion === "contado" ? "Se registra con su pago por el total." : "Queda en Por pagar hasta saldarse."}</p>
            </CampoGuiado>
            <CampoGuiado id="vencimiento" guia={guia}>
              {/* Al contado no hay vencimiento: el título queda sin marca (no es un campo de la guía). */}
              <p className={TITULO_FIJO}>{condicion === "credito" ? etiqueta("vencimiento", "Vence el") : "Vence el"}</p>
              <fieldset disabled={condicion !== "credito"} className={`m-0 min-w-0 border-0 p-0 transition-opacity duration-300 ${condicion === "credito" ? "" : "opacity-45"}`}>
                <CampoFecha
                  id="oc-vencimiento"
                  caja
                  etiqueta="Vence el"
                  valor={condicion === "credito" ? vencimiento : ""}
                  onValor={setVencimientoEditado}
                  required={condicion === "credito"}
                  disabled={condicion !== "credito"}
                />
              </fieldset>
              <p className="mt-1.5 text-xs text-taupe">
                {condicion !== "credito" ? (
                  "Al contado no hay vencimiento."
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
                pie={
                  discriminaIgv(tipo)
                    ? "Los costos de abajo son sin IGV: se suma el 18 % al total."
                    : `Una ${nombreTipo.toLowerCase()} no lleva IGV aparte: el costo del papel es el costo.`
                }
              />
            </div>
          </div>
        </section>

        <section data-guia="comprobante.renglones" className="@container card-cayla space-y-3 p-4 sm:p-5" aria-label="Lo que dice el papel">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl text-tinta">Lo que dice el papel</h2>
            <p className="text-sm tabular-nums text-taupe">
              {lineas.length} {lineas.length === 1 ? "renglón" : "renglones"} · {cuantas.toLocaleString("es-PE")} {cuantas === 1 ? "unidad" : "unidades"}
            </p>
          </div>

          {lineas.length === 0 && (
            <CampoGuiado id="lineas" guia={guia}>
              <Vacio tamano="chico" icono={<ReceiptText />}>
                {sinRenglon.length > 0 ? "Pon lo que trae el papel: elige de la orden aquí abajo, o agrega algo que no estaba." : "Agrega lo que trae el papel para poder registrarlo."}
              </Vacio>
            </CampoGuiado>
          )}

          {lineas.length > 0 && (
            <div aria-hidden className={`hidden items-end gap-x-2.5 px-3 text-[13px] font-semibold text-tinta @min-[56rem]:grid ${FILA_ANCHA}`}>
              <span />
              <span>Prenda</span>
              <span>Cantidad</span>
              <span>
                Costo u.
                {discriminaIgv(tipo) && <span className="block text-[12px] font-normal text-taupe">sin IGV</span>}
              </span>
              <span>
                Precio venta
                <span className="block text-[12px] font-normal text-taupe">si la sabes</span>
              </span>
              <span className="text-right">Subtotal</span>
              <span />
            </div>
          )}

          {lineas.map((l, i) => {
            const pedida = l.ordenItemId ? (pedidaPor.get(l.ordenItemId) ?? null) : null;
            const hermanasAntes = lineas.slice(0, i).filter((x) => x.ordenItemId !== null && x.ordenItemId === l.ordenItemId).length;
            return (
              <RenglonDelPapel
                key={l.clave}
                linea={l}
                numero={i + 1}
                pedida={pedida}
                sigueLaDeArriba={hermanasAntes > 0}
                deMas={l.ordenItemId && hermanasAntes === 0 ? (deMasPor.get(l.ordenItemId) ?? null) : null}
                conIgv={discriminaIgv(tipo)}
                guia={guia}
                etiqueta={etiqueta}
                estado={estadoVisible}
                opcionesCategoria={opcionesCategoria}
                opcionesMarca={opcionesMarca}
                placeholderDescripcion={sugerirDescripcion(categoriaPor.get(l.categoriaId) ?? null).texto}
                onCambio={(cambios) => cambiarLinea(l.clave, cambios)}
                onQuitar={() => quitarLinea(l.clave)}
              />
            );
          })}

          {sinRenglon.length > 0 && (
            <div data-guia="comprobante.sin-poner" className="space-y-2 border-t border-sand pt-3">
              <p className={TITULO}>De la orden, sin poner en este papel</p>
              <ul className="space-y-1.5">
                {sinRenglon.map((l) => (
                  <li key={l.id ?? l.posicion} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-sm">
                    <span className="min-w-0 text-tinta">
                      {nombreDeLinea(l)}{" "}
                      <span className="text-taupe">
                        · pediste {l.cantidad.toLocaleString("es-PE")}
                        {l.facturado ? `, ya en papel ${l.facturado.toLocaleString("es-PE")}` : ""}
                        {pendienteDe(l) === 0 ? " (llegó completa)" : ""}
                      </span>
                    </span>
                    <Boton type="button" className="px-3 py-1.5 text-[11px]" onClick={() => ponerPedida(l)}>
                      Poner en el papel
                    </Boton>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand pt-4">
            <Boton type="button" onClick={agregarFuera} disabled={lineas.length >= TOPES_COMPROBANTE.lineas || datos.categorias.length === 0} data-guia="comprobante.fuera">
              + Algo que no estaba en la orden
            </Boton>
          </div>

          <div data-guia="comprobante.totales" className="ml-auto w-full max-w-sm space-y-1.5 text-sm">
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
                  id="oc-total-papel"
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
          <section data-guia="comprobante.pago" className="card-cayla space-y-3 p-4 sm:p-5 anim-revelar" aria-label="Pago al contado">
            <CampoGuiado id="pago" guia={guia} titulo="Pago al contado" ayuda={`Total ${soles(totalSoles)}`}>
              <LineasPago
                id="comprobante-pagos"
                lineas={pagos}
                onLineas={setPagos}
                objetivo={totalSoles}
                exacto
                saldoFavor={datos.proveedor?.saldoFavor ?? 0}
                datosProveedor={datos.proveedor?.datosPago ?? null}
                enlaceFicha={`/compras/proveedores/${orden.proveedor.id}`}
                cuentas={{ lista: cuentas.cuentas, listo: cuentas.listo }}
              />
            </CampoGuiado>
          </section>
        )}

        <section data-guia="comprobante.registrar" className="space-y-3" aria-label="Registrar">
          <CampoGuiado id="nota" guia={guia} className="max-w-2xl">
            <p className={TITULO_FIJO}>
              {etiqueta("nota", "Nota")}
              <span className="text-[12px] font-normal text-taupe">opcional</span>
            </p>
            <CampoTexto id="oc-nota-comprobante" caja etiqueta="Nota" maxLength={TOPES_COMPROBANTE.nota} value={nota} onChange={(e) => setNota(e.target.value)} />
          </CampoGuiado>
          {!esPersona && (
            <CampoGuiado id="responsable" guia={guia} titulo="Quién registra el comprobante" className="max-w-sm">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}
          <PieGuia guia={guia} listo="Todo listo para registrar." />
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
          <div className="flex flex-wrap justify-end gap-2.5">
            <BotonEnlace href="/compras/ordenes">Cancelar</BotonEnlace>
            <Boton type="submit" peso="primario" cargando={guardando} disabled={registrado} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {registrado ? "Registrado" : guardando ? "Registrando…" : "Registrar comprobante"}
            </Boton>
          </div>
        </section>
      </form>

      {avisoSalida.aviso}
    </div>
  );
}

/**
 * Un renglón del papel. Dos caras, según el ancho de la SECCIÓN (`@container`), no de la ventana: con 56 rem o más es UNA FILA (los
 * títulos van una sola vez, arriba); más angosta, una tarjeta que se apila. Un renglón de la orden muestra su prenda (categoría, marca y
 * descripción son las de la orden y no se tocan) con cuánto llegó ya en papel; «algo que no estaba en la orden» trae sus propios combos.
 */
function RenglonDelPapel({
  linea: l,
  numero,
  pedida,
  sigueLaDeArriba,
  deMas,
  conIgv,
  guia,
  etiqueta,
  estado,
  opcionesCategoria,
  opcionesMarca,
  placeholderDescripcion,
  onCambio,
  onQuitar,
}: {
  linea: LineaComprobante;
  numero: number;
  /** La línea de la orden a la que responde; null si es algo que no estaba en la orden. */
  pedida: LineaDetalle | null;
  /** Es el segundo (o tercero) renglón de una misma línea de la orden: la cuenta se partió para que los centavos cuadren. */
  sigueLaDeArriba: boolean;
  deMas: DeMasDeLinea | null;
  /** El tipo de papel discrimina IGV: el costo se dice «sin IGV». */
  conIgv: boolean;
  guia: ReturnType<typeof useGuiaCampos>;
  etiqueta: (id: string, texto: ReactNode) => ReactNode;
  estado: (id: string) => EstadoCampo | null;
  opcionesCategoria: OpcionCombo<string>[];
  opcionesMarca: OpcionCombo<string>[];
  placeholderDescripcion: string;
  onCambio: (cambios: Partial<LineaComprobante>) => void;
  onQuitar: () => void;
}) {
  const id = `linea-${l.clave}`;
  const c = calcularRenglon(l);
  const quitar = (clase: string) => (
    <button type="button" onClick={onQuitar} className={`btn-cayla btn-sutil h-8 w-8 shrink-0 p-0 ${clase}`} aria-label={`Quitar el renglón ${numero}`} title="Quitar este renglón">
      <X aria-hidden className="h-4 w-4" />
    </button>
  );
  const prenda = pedida ? (
    <div className="min-w-0">
      <p className="text-tinta">{[pedida.categoria, pedida.marca].join(" · ")}</p>
      {(l.descripcion || pedida.descripcion) && <p className="text-xs text-taupe">{l.descripcion || pedida.descripcion}</p>}
      <p className="mt-0.5 text-xs text-taupe">
        {sigueLaDeArriba
          ? "Sigue la línea de arriba: se partió para que los centavos cuadren con lo pedido."
          : `Pediste ${pedida.cantidad.toLocaleString("es-PE")}${pedida.facturado ? ` · ya en papel ${pedida.facturado.toLocaleString("es-PE")}` : ""}`}
      </p>
      {deMas && (
        <p className="mt-0.5 text-xs text-ambar">
          Pasa lo pedido por {deMas.deMas.toLocaleString("es-PE")} {deMas.deMas === 1 ? "unidad" : "unidades"}. Se acepta y queda avisado.
        </p>
      )}
    </div>
  ) : (
    <div className="min-w-0 space-y-2">
      <Chip tono="pizarra">No estaba en la orden</Chip>
      <div className="grid gap-2 @min-[28rem]:grid-cols-2">
        <ComboBuscable caja etiquetaAccesible={`Categoría del renglón ${numero}`} marcador="Categoría…" valor={l.categoriaId} onValor={(categoriaId) => onCambio({ categoriaId })} opciones={opcionesCategoria} />
        <ComboBuscable caja etiquetaAccesible={`Marca del renglón ${numero}`} marcador="Marca…" valor={l.marcaId} onValor={(marcaId) => onCambio({ marcaId })} opciones={opcionesMarca} />
      </div>
      <CampoTexto
        caja
        sinPie
        etiqueta={`Descripción del renglón ${numero}`}
        maxLength={TOPES.descripcion}
        placeholder={placeholderDescripcion}
        value={l.descripcion}
        onChange={(e) => onCambio({ descripcion: e.target.value })}
      />
    </div>
  );

  return (
    <CampoGuiado id={id} guia={guia} retiene="fila" className="rounded-xl border border-sand bg-papel p-3 @min-[56rem]:rounded-lg @min-[56rem]:py-2">
      <div data-guia="comprobante.renglon" className={`grid grid-cols-2 items-start gap-x-2.5 gap-y-2 @min-[56rem]:items-center ${FILA_ANCHA}`}>
        <div className="col-span-2 flex items-center justify-between gap-2 @min-[56rem]:col-span-1 @min-[56rem]:justify-start">
          <p className="text-[13px] font-semibold text-tinta @min-[56rem]:hidden">{etiqueta(id, `Renglón ${numero}`)}</p>
          <span className="hidden items-center gap-1 text-[12px] tabular-nums text-taupe @min-[56rem]:inline-flex" title={`Renglón ${numero}`}>
            {/* Sin marca (llegó completo), un hueco del mismo ancho: el número no se corre. */}
            {estado(id) ? <MarcaCampo estado={estado(id)!} /> : <span aria-hidden className="inline-block h-[18px] w-[18px]" />}
            {numero}
          </span>
          {quitar("@min-[56rem]:hidden")}
        </div>
        <div className="col-span-2 @min-[56rem]:col-span-1">{prenda}</div>
        <div>
          <p className={`${TITULO} @min-[56rem]:hidden`}>Cantidad</p>
          <CampoTexto caja sinPie etiqueta={`Cantidad del renglón ${numero}`} inputMode="numeric" placeholder="0" value={l.cantidad} onChange={(e) => onCambio({ cantidad: e.target.value })} />
        </div>
        <div>
          <p className={`${TITULO} @min-[56rem]:hidden`}>Costo por unidad{conIgv ? " (sin IGV)" : ""}</p>
          <CampoTexto caja sinPie etiqueta={`Costo por unidad del renglón ${numero}, en soles`} inputMode="decimal" placeholder="0.00" value={l.costo} onChange={(e) => onCambio({ costo: e.target.value })} />
        </div>
        <div>
          <p className={`${TITULO} @min-[56rem]:hidden`}>
            Precio de venta <span className="text-[12px] font-normal text-taupe">si lo sabes</span>
          </p>
          <CampoTexto caja sinPie etiqueta={`Precio de venta sugerido del renglón ${numero}, en soles`} inputMode="decimal" placeholder="0.00" value={l.precioVenta} onChange={(e) => onCambio({ precioVenta: e.target.value })} />
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-sand pt-2 @min-[56rem]:block @min-[56rem]:border-0 @min-[56rem]:pt-0 @min-[56rem]:text-right">
          <p className={`${TITULO} @min-[56rem]:hidden`}>Subtotal</p>
          <p className="font-display text-lg tabular-nums text-tinta">{c.subtotalCentimos == null ? "—" : soles(c.subtotalCentimos / 100)}</p>
        </div>
        <div className="hidden justify-end @min-[56rem]:flex">{quitar("")}</div>
      </div>
    </CampoGuiado>
  );
}
