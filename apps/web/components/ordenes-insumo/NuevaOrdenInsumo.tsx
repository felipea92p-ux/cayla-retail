"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { Boton, BotonEnlace, Campo, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Aviso } from "@/components/ui/Aviso";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { avisar } from "@/components/ui/Avisos";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { MarcaCampo } from "@/components/alta-producto/guia";
import { ConMarca } from "@/components/ficha-producto/TiraFicha";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, esVersionCambiada, traducirError } from "@/lib/error-escritura";
import type { EstadoCampo } from "@/lib/guia-campos";
import { soles } from "@/lib/compras-reglas";
import { aTexto, problemaDeEntrega } from "@/lib/orden-compra-alta";
import { avisoDeCorte } from "@/lib/ordenes-compra-reglas";
import { sugerirCantidadInsumo, sugerirDescripcionInsumo } from "@/lib/sugerencias-orden-insumo";
import {
  HINT_INSUMO_YA_GUARDADA,
  RUTA_ORDENES_INSUMO,
  TOPES_INSUMO,
  calcularLineaInsumo,
  hrefOrdenInsumoGuardada,
  nombreUnidad,
  numeroOrdenInsumo,
  textoCantidades,
  totalCentimosInsumo,
  type DatosOrdenInsumo,
  type ModoDescuento,
} from "@/lib/ordenes-insumo-reglas";
import {
  argsCrearOrdenInsumo,
  argsEditarOrdenInsumo,
  avisoDeUnidadCambiada,
  camposDeLaOrdenInsumo,
  cantidadesDelBorrador,
  dudaDeLineaInsumo,
  lineaInsumoVacia,
  lugarDelError,
  opcionesDeInsumo,
  type ContextoOrdenInsumo,
  type LineaInsumoBorrador,
  type LugarDelError,
  type OrdenInsumoBorrador,
} from "@/lib/orden-insumo-alta";
import { crearOrdenInsumo, editarOrdenInsumo } from "@/lib/ordenes-insumo-acciones";

// Nueva orden de insumos del Taller (ADR-0362, fase 7 · actividad 2): la gemela de «Nueva orden de compra» (fase 1, aprobada por Felipe),
// con la línea del Taller. Arriba, a quién se le pide, a qué taller llega, cuándo y una nota; abajo, lo que se pide, una línea por
// insumo —el insumo del catálogo, una descripción opcional, la cantidad EN SU UNIDAD con hasta tres decimales («12.5 metros»), el precio
// por esa unidad con hasta cuatro («S/ 0.0350» un botón) y el descuento en % o en soles—, con el subtotal de cada una y el total al pie.
// Se usa también en el celular, en Gamarra: cada línea es una tarjeta que se apila y el botón de guardar queda a la vista.
//
// La cuenta es la de la base, exacta (`ordenes-insumo-reglas.ts`): importe = round(cantidad × precio, 2), el % sobre ese importe y el
// subtotal = importe − descuento. Quién firma (decisión 39, extendida al Taller): con la cuenta de una PERSONA no hay combo —firma ella
// (`orden_insumo_crear`)—; desde una TERMINAL, el combo «Responsable». El número se ve bloqueado (vista previa). Un doble clic no crea
// dos órdenes: el id se genera una vez y la base devuelve la misma si llega repetido; y el candado `enVuelo` frena el segundo clic en el
// mismo instante.
//
// La guía de foco (CLAUDE.md «Guía de foco»): cada bloque se enciende cuando es lo que sigue y «Falta: …» sobre el botón lleva a cada cosa.
// Sale de `camposDeLaOrdenInsumo`, que son las reglas de `fn_orden_insumo_validar` (la entrega estimada es sugerida: nunca bloquea).
// Lo que la base rechace igual (alguien desactivó al proveedor un momento antes) se dice donde corresponde: bajo su campo, bajo su línea o
// en el aviso de la hoja, sobre los botones (ADR-0358).
//
// EDITAR: la misma pantalla con la orden como está (`editar`): el título, el botón («Guardar cambios») y lo que se guarda
// (`editar_orden_insumo`, con la versión que se vio al abrir). Lo que ya venía completo no se llena de ✓. Si una línea trae un insumo cuya
// unidad cambió desde que se hizo la orden, su cantidad viene vacía y su aviso lo dice [provisional, revisar con Felipe].

const TITULO = "mb-1 text-[13px] font-semibold text-tinta";
// El título de un campo de la cabecera: una sola línea de alto fijo, así las cajas de al lado quedan alineadas en cualquier estado de la
// guía (✓, «Sigue aquí», falta, opcional).
const TITULO_FIJO = "mb-1.5 flex h-6 items-center gap-x-2 overflow-hidden whitespace-nowrap text-[13px] font-semibold text-tinta";
// La fila de una línea cuando hay lugar (sección de 60 rem o más: una pantalla de 1440 con el menú abierto): marca de la guía y número ·
// insumo · descripción · cantidad con su unidad («12.5 metros») · precio por unidad · descuento (caja + «% / S/») · subtotal · quitar. La
// comparten el encabezado y cada fila. Más angosta que la de la orden de compra (56 rem): la cantidad lleva su unidad al lado.
const FILA_ANCHA = "@min-[60rem]:grid-cols-[2.5rem_minmax(0,1.5fr)_minmax(0,1fr)_9.5rem_6rem_minmax(8.5rem,10rem)_6.5rem_2rem]";

/** Editar una orden «generada» en vez de crear una. */
export type EdicionOrdenInsumo = {
  id: string;
  numero: number;
  /** La versión que se vio al abrir: la base rechaza el guardado si otra persona guardó después. */
  version: number;
  inicial: OrdenInsumoBorrador;
  /** La entrega estimada guardada: dejarla como está vale aunque ya haya pasado. */
  entregaOriginal: string;
};

type Props = {
  datos: DatosOrdenInsumo;
  sede: string;
  hoy: string;
  /** El taller con el que arranca «Llega a»: el único, o el taller donde se trabaja; «» si hay que elegir. */
  destinoInicial: string;
  editar?: EdicionOrdenInsumo;
};

/** Un rechazo de la base, dicho en su lugar (ver `lugarDelError`). */
type ErrorEnPantalla = { lugar: LugarDelError; titulo?: string; texto: string; tono: "error" | "atencion"; accion?: { texto: string; onClick: () => void } };

export function NuevaOrdenInsumo({ datos, sede, hoy, destinoInicial, editar }: Props) {
  const router = useRouter();
  const [orden, setOrden] = useState<OrdenInsumoBorrador>(
    () => editar?.inicial ?? { proveedorId: "", destinoId: destinoInicial, entrega: "", nota: "", lineas: [lineaInsumoVacia("l1")] },
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<ErrorEnPantalla | null>(null);
  // Con varios talleres, «Llega a» viene puesto con el taller donde se trabaja: hasta que la persona lo elige, la guía lo trata como
  // sugerido (ADR-0284 act. h). Al editar, el que la orden ya tenía cuenta como elegido.
  const [destinoElegido, setDestinoElegido] = useState(Boolean(editar));
  const contador = useRef(editar ? editar.inicial.lineas.length : 1);
  // El id de la orden se genera al primer «Guardar» y se reusa en cada reintento: la base devuelve la misma orden si llega dos veces.
  const idOrden = useRef<string | null>(null);
  // El candado contra dos clics en el mismo instante (`guardando` es estado de React y se aplica después del clic).
  const enVuelo = useRef(false);

  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();

  const unidadDe = useMemo(() => new Map(datos.insumos.map((i) => [i.id, i.unidadMedida])), [datos.insumos]);
  const insumoPor = useMemo(() => new Map(datos.insumos.map((i) => [i.id, i])), [datos.insumos]);
  const ctx: ContextoOrdenInsumo = useMemo(
    () => ({
      hoy,
      proveedores: new Set(datos.proveedores.map((p) => p.id)),
      talleres: new Set(datos.talleres.map((t) => t.id)),
      insumos: unidadDe,
      entregaOriginal: editar?.entregaOriginal,
      destinoElegido,
    }),
    [datos, hoy, unidadDe, editar?.entregaOriginal, destinoElegido],
  );
  const campos = camposDeLaOrdenInsumo(orden, ctx, { pide: !esPersona, listo: responsable.listo, motivo: responsable.motivo });
  const guia = useGuiaCampos(campos, { enModal: false });

  // Al editar, lo que llegó completo no se marca con ✓ (regla 4 de la guía); si se deja pendiente al editar, vuelve a llevar su marca.
  const [completosAlAbrir] = useState(() => new Set(editar ? campos.filter((c) => c.hecho).map((c) => c.id) : []));
  const estadoVisible = (id: string): EstadoCampo | null => {
    const estado = guia.estado(id);
    return estado === "hecho" && completosAlAbrir.has(id) ? null : estado;
  };
  const etiqueta = (id: string, texto: ReactNode) => <ConMarca estado={estadoVisible(id)}>{texto}</ConMarca>;

  // «¿Salir sin guardar?»: solo cuenta lo que la persona llenó o cambió.
  const [fotoAlAbrir] = useState(() => JSON.stringify(orden));
  const avisoSalida = useSalidaSinGuardar(
    JSON.stringify(orden) !== fotoAlAbrir,
    editar
      ? "Cambiaste esta orden y todavía no se guardó. Si sales ahora, se pierden los cambios."
      : "Llenaste parte de esta orden y todavía no se guardó. Si sales ahora, se pierde lo que llenaste.",
  );

  // ---- opciones ----
  const opcionesProveedor = useMemo(
    () =>
      datos.proveedores.map((p) => ({
        valor: p.id,
        texto: p.nombre,
        detalle: p.ruc ? `RUC ${p.ruc}` : undefined,
        claves: p.ruc ? [p.ruc] : [],
      })),
    [datos.proveedores],
  );
  // Con el proveedor elegido, los insumos que se le compran de costumbre van primero (la orden acepta cualquiera).
  const opcionesInsumo = useMemo(() => opcionesDeInsumo(datos.insumos, orden.proveedorId), [datos.insumos, orden.proveedorId]);
  const opcionesTaller = useMemo(() => datos.talleres.map((t) => ({ valor: t.id, texto: t.nombre })), [datos.talleres]);
  const unTaller = datos.talleres.length === 1 ? datos.talleres[0]! : null;

  /** Todo cambio pasa por aquí: un rechazo anterior de la base ya no describe lo que se ve, y se va. */
  function cambiar(f: (o: OrdenInsumoBorrador) => OrdenInsumoBorrador) {
    setError(null);
    setOrden(f);
  }
  function cambiarLinea(clave: string, cambios: Partial<LineaInsumoBorrador>) {
    cambiar((o) => ({ ...o, lineas: o.lineas.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)) }));
  }
  function elegirInsumo(clave: string, insumoId: string) {
    // Otro insumo: el aviso de «la unidad cambió» era del de antes.
    cambiar((o) => ({ ...o, lineas: o.lineas.map((l) => (l.clave === clave ? { ...l, insumoId, unidadCambio: undefined } : l)) }));
  }
  function agregarLinea() {
    contador.current += 1;
    const clave = `l${contador.current}`;
    cambiar((o) => ({ ...o, lineas: [...o.lineas, lineaInsumoVacia(clave)] }));
    // La línea nueva es lo que sigue: se lleva a la vista y a su insumo.
    requestAnimationFrame(() => guia.ir(`linea-${clave}`));
  }
  function quitarLinea(clave: string) {
    cambiar((o) => ({ ...o, lineas: o.lineas.filter((l) => l.clave !== clave) }));
  }

  const total = totalCentimosInsumo(orden.lineas) / 100;
  const cantidades = cantidadesDelBorrador(orden.lineas, unidadDe);
  const errorEn = (donde: LugarDelError["donde"]) => (error?.lugar.donde === donde ? error : null);
  // La fecha escrita que la base rechazaría (pasada o a más de un año), o lo que la base dijo de ella.
  const problemaEntrega = errorEn("entrega")?.texto ?? problemaDeEntrega(orden.entrega, hoy, editar?.entregaOriginal);
  const errorDeLinea = (numero: number) => (error?.lugar.donde === "linea" && error.lugar.linea === numero ? error : null);

  /** Un rechazo de la base, en su lugar y en palabras de tienda (el mensaje de la base ya lo es: `traducirError` lo deja pasar). */
  function mostrarRechazo(e: Parameters<typeof traducirError>[0], contexto: string, accion?: ErrorEnPantalla["accion"]) {
    setError({ lugar: lugarDelError(e), texto: traducirError(e, contexto), tono: "error", accion });
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (guardando || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    enVuelo.current = true;
    try {
      if (editar) return await guardarCambios(editar);
      const id = (idOrden.current ??= crypto.randomUUID());
      setGuardando(true);
      setError(null);
      const firma = esPersona ? firmaOmitida("orden_insumo_crear") : responsable.firma();
      const { numero, error: fallo } = await crearOrdenInsumo(argsCrearOrdenInsumo(id, orden), firma);
      setGuardando(false);
      if (!esPersona) responsable.despues(fallo);
      if (fallo || numero == null) {
        // Se cortó la señal: el pedido pudo llegar y perderse solo la respuesta. Reintentar sin cambiar nada es seguro (el mismo id no
        // crea otra orden); decir «no se guardó nada» invitaría a corregir algo creyendo que no existía (Formidable, fase 1).
        if (fallo && esFalloDeRed(fallo)) {
          setError({ lugar: { donde: "hoja" }, titulo: "Se cortó la conexión", texto: avisoDeCorte("crear"), tono: "atencion" });
          return;
        }
        // Sí se había guardado, con lo de antes, y la persona corrigió algo entre un intento y otro: se corrige en la orden misma.
        if (fallo?.hint === HINT_INSUMO_YA_GUARDADA) {
          mostrarRechazo(fallo, "guardar la orden de insumos", { texto: "Corregirla", onClick: () => void irA(`${RUTA_ORDENES_INSUMO}/editar/${id}`) });
          return;
        }
        mostrarRechazo(fallo, "guardar la orden de insumos");
        return;
      }
      avisar.exito(`${numeroOrdenInsumo(numero)} guardada`, {
        detalle:
          datos.siguiente != null && numero !== datos.siguiente
            ? `Otra orden tomó la ${numeroOrdenInsumo(datos.siguiente)} un momento antes: esta quedó como ${numeroOrdenInsumo(numero)}.`
            : detalleGuardada(),
      });
      await irA(hrefOrdenInsumoGuardada(id));
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
  }

  // «Hilos del Sur EIRL · S/ 1,260.00 · 12.5 metros · 4 conos»: lo guardado, dicho como se ve en la lista.
  function detalleGuardada(): string {
    const proveedor = datos.proveedores.find((p) => p.id === orden.proveedorId)?.nombre ?? "";
    return [proveedor, soles(total), textoCantidades(cantidades)].filter(Boolean).join(" · ");
  }

  // La guardia de «¿Salir sin guardar?» se retira ANTES de navegar (ver useSalidaSinGuardar).
  async function irA(href: string) {
    await avisoSalida.retirarYa();
    router.push(href);
  }

  async function guardarCambios(ed: EdicionOrdenInsumo) {
    setGuardando(true);
    setError(null);
    const firma = esPersona ? firmaOmitida("orden_insumo_editar") : responsable.firma();
    const { version, error: fallo } = await editarOrdenInsumo(argsEditarOrdenInsumo(ed.id, ed.version, orden), firma);
    setGuardando(false);
    if (!esPersona) responsable.despues(fallo);
    if (fallo || version == null) {
      if (fallo && esFalloDeRed(fallo)) {
        setError({ lugar: { donde: "hoja" }, titulo: "Se cortó la conexión", texto: avisoDeCorte("editar"), tono: "atencion" });
        return;
      }
      // La orden cambió desde que se abrió (otra persona, la misma en otro intento, o se anuló: la base dice cuál): lo escrito sigue a la
      // vista y se ofrece traer lo nuevo.
      if (esVersionCambiada(fallo)) {
        mostrarRechazo(fallo, "guardar los cambios", { texto: "Recargar", onClick: () => void recargar() });
        return;
      }
      mostrarRechazo(fallo, "guardar los cambios");
      return;
    }
    const nombre = numeroOrdenInsumo(ed.numero);
    // La misma versión: no había nada que cambiar (o era el mismo guardado repetido).
    avisar.exito(version === ed.version ? `${nombre} ya decía eso: no había nada que cambiar` : `${nombre} actualizada`, { detalle: detalleGuardada() });
    await irA(hrefOrdenInsumoGuardada(ed.id));
    router.refresh();
  }

  // «Recargar»: la página vuelve a leer la orden y el formulario empieza de nuevo con ella (la página lo monta con `key` = versión).
  async function recargar() {
    await avisoSalida.retirarYa();
    router.refresh();
  }

  const errorHoja = errorEn("hoja");
  const errorLineas = errorEn("lineas");

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={sede}
        titulo={editar ? `Editar ${numeroOrdenInsumo(editar.numero)}` : "Nueva orden de insumos"}
        subtitulo={
          editar
            ? "Corrige lo que haga falta y guarda. El número y la fecha de emisión no cambian."
            : "Lo que le pides a un proveedor del Taller. La factura y la recepción vienen después."
        }
        volver={<Volver href={RUTA_ORDENES_INSUMO} a="Órdenes de insumos" />}
      >
        <div data-guia="oi-form.cifras" className="anim-sube flex items-end gap-6 text-right" style={{ ["--i" as string]: 1 }}>
          {/* Al editar, el número ya está en el título. */}
          {!editar && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-taupe-profundo">N.º</p>
              <p className="font-display mt-1 text-2xl tabular-nums text-tinta" title="Se confirma al guardar">
                {datos.siguiente != null ? numeroOrdenInsumo(datos.siguiente) : "Al guardar"}
              </p>
            </div>
          )}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-taupe-profundo">Total</p>
            <p className="font-display mt-1 text-2xl tabular-nums text-tinta" aria-live="polite">
              {soles(total)}
            </p>
          </div>
        </div>
      </EncabezadoPagina>

      {datos.falla && (
        <Aviso tono="error" titulo="No se pudo leer todo lo que la orden necesita">
          {datos.falla}
        </Aviso>
      )}

      <form onSubmit={guardar} noValidate className="space-y-6">
        {/* Proveedor, a qué taller llega, entrega y nota: dos por fila y, con lugar (tarjeta de 52 rem o más), los cuatro en una. */}
        <section data-guia="oi-form.datos" className="@container card-cayla p-4 sm:p-5" aria-label="Proveedor y a dónde llega">
          <div className="grid gap-x-5 gap-y-4 @min-[28rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
            <CampoGuiado id="proveedor" guia={guia}>
              <p className={TITULO_FIJO}>{etiqueta("proveedor", "Proveedor")}</p>
              {/* El combo no trae su renglón de error: el de un dato va bajo su campo (`Campo`), con su «!» (ADR-0358). */}
              <Campo etiqueta="Proveedor" htmlFor="oi-proveedor" etiquetaOculta pie={errorEn("proveedor")?.texto} tono="error" sinPie={!errorEn("proveedor")}>
                <ComboBuscable
                  id="oi-proveedor"
                  caja
                  etiquetaAccesible="Proveedor"
                  marcador="Nombre o RUC…"
                  valor={orden.proveedorId}
                  onValor={(proveedorId) => cambiar((o) => ({ ...o, proveedorId }))}
                  opciones={opcionesProveedor}
                />
              </Campo>
            </CampoGuiado>
            {unTaller && ctx.talleres.has(orden.destinoId) ? (
              // Un solo taller: no hay nada que elegir. Se dice a dónde llega, sin un control que no hace nada.
              <div data-campo="destino">
                <p className={TITULO_FIJO}>Llega a</p>
                <p className="flex h-10 items-center text-sm text-tinta">{unTaller.nombre}</p>
                {errorEn("destino") && (
                  <Aviso tono="error" chico className="mt-1.5">
                    {errorEn("destino")!.texto}
                  </Aviso>
                )}
              </div>
            ) : (
              <CampoGuiado id="destino" guia={guia}>
                <p className={TITULO_FIJO}>{etiqueta("destino", "Llega a")}</p>
                <CampoSelect
                  id="oi-destino"
                  caja
                  etiqueta="Llega a"
                  marcador={datos.talleres.length ? "Elige el taller" : "No hay un taller activo"}
                  deshabilitado={datos.talleres.length === 0}
                  valor={orden.destinoId}
                  onValor={(destinoId) => {
                    setDestinoElegido(true);
                    cambiar((o) => ({ ...o, destinoId }));
                  }}
                  opciones={opcionesTaller}
                  tono={errorEn("destino") ? "error" : undefined}
                  pie={errorEn("destino")?.texto}
                />
              </CampoGuiado>
            )}
            <CampoGuiado id="entrega" guia={guia}>
              <p className={TITULO_FIJO}>
                {etiqueta("entrega", "Entrega estimada")}
                <span className="text-[12px] font-normal text-taupe">si la sabes</span>
              </p>
              <CampoFecha
                id="oi-entrega"
                caja
                etiqueta="Entrega estimada"
                valor={orden.entrega}
                onValor={(entrega) => cambiar((o) => ({ ...o, entrega }))}
                tono={problemaEntrega ? "error" : "neutro"}
                pie={problemaEntrega ?? undefined}
              />
            </CampoGuiado>
            <CampoGuiado id="nota" guia={guia}>
              <p className={TITULO_FIJO}>
                {etiqueta("nota", "Nota")}
                <span className="text-[12px] font-normal text-taupe">opcional</span>
              </p>
              <CampoTexto
                id="oi-nota"
                caja
                etiqueta="Nota"
                maxLength={TOPES_INSUMO.nota}
                value={orden.nota}
                onChange={(e) => {
                  const nota = e.target.value;
                  cambiar((o) => ({ ...o, nota }));
                }}
                tono={errorEn("nota") ? "error" : undefined}
                pie={errorEn("nota")?.texto}
              />
            </CampoGuiado>
          </div>
        </section>

        <section data-guia="oi-form.lineas" className="@container card-cayla space-y-3 p-4 sm:p-5" aria-label="Lo que pides">
          <TituloSeccion
            dato={
              <span className="tabular-nums">
                {orden.lineas.length} {orden.lineas.length === 1 ? "línea" : "líneas"}
                {cantidades.length > 0 && ` · ${textoCantidades(cantidades)}`}
              </span>
            }
          >
            Lo que pides
          </TituloSeccion>

          {orden.lineas.length === 0 && (
            <CampoGuiado id="lineas" guia={guia}>
              <Aviso tono="info" chico>
                Agrega al menos un insumo para poder guardar la orden.
              </Aviso>
            </CampoGuiado>
          )}
          {errorLineas && (
            <Aviso tono="error" chico>
              {errorLineas.texto}
            </Aviso>
          )}

          {/* Con lugar, una FILA por línea: los títulos van una sola vez, aquí arriba (los lectores de pantalla tienen la etiqueta de cada
              caja, por eso este encabezado se les oculta). Hablan con la misma voz que los títulos de los campos de arriba. */}
          {orden.lineas.length > 0 && (
            <div aria-hidden className={`hidden gap-x-2.5 px-3 text-[13px] font-semibold text-tinta @min-[60rem]:grid ${FILA_ANCHA}`}>
              <span />
              <span>Insumo</span>
              {/* Sin «opcional» a la vista: en la columna angosta se cortaba; cada caja lo dice con su ejemplo y la línea con su punto. */}
              <span className="truncate" title="Descripción, opcional">
                Descripción
              </span>
              <span>Cantidad</span>
              <span>Precio u.</span>
              <span className="truncate">
                Descuento <span className="text-[12px] font-normal text-taupe">si hay</span>
              </span>
              <span className="text-right">Subtotal</span>
              <span />
            </div>
          )}

          {orden.lineas.map((l, i) => {
            const insumo = l.insumoId ? (insumoPor.get(l.insumoId) ?? null) : null;
            return (
              <LineaOrdenInsumo
                key={l.clave}
                linea={l}
                numero={i + 1}
                guia={guia}
                etiqueta={etiqueta}
                estado={estadoVisible}
                opcionesInsumo={opcionesInsumo}
                unidad={insumo?.unidadMedida ?? null}
                nombreInsumo={insumo?.nombre ?? null}
                tipoInsumo={insumo?.tipo ?? null}
                errorBase={errorDeLinea(i + 1)?.texto ?? null}
                onInsumo={(insumoId) => elegirInsumo(l.clave, insumoId)}
                onCambio={(cambios) => cambiarLinea(l.clave, cambios)}
                onQuitar={() => quitarLinea(l.clave)}
              />
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand pt-4">
            <Boton type="button" onClick={agregarLinea} disabled={orden.lineas.length >= TOPES_INSUMO.lineas} data-guia="oi-form.agregar">
              + Agregar otro insumo
            </Boton>
            <p className="text-sm text-taupe">
              Total <b className="font-display ml-1 text-xl font-normal tabular-nums text-tinta">{soles(total)}</b>
            </p>
          </div>
        </section>

        <section data-guia="oi-form.guardar" className="space-y-3" aria-label="Guardar">
          {!esPersona && (
            <CampoGuiado id="responsable" guia={guia} titulo={editar ? "Quién hace el cambio" : "Quién hace la orden"} className="max-w-sm">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}
          {errorHoja && (
            <Aviso
              tono={errorHoja.tono}
              titulo={errorHoja.titulo ?? (editar ? "No se guardaron los cambios" : "No se guardó la orden")}
              accion={
                errorHoja.accion ? (
                  <Boton type="button" onClick={errorHoja.accion.onClick}>
                    {errorHoja.accion.texto}
                  </Boton>
                ) : undefined
              }
            >
              {errorHoja.texto}
            </Aviso>
          )}
          <PieGuia guia={guia} listo="Todo listo para guardar." />
          <div className="pie-acciones">
            <BotonEnlace href={RUTA_ORDENES_INSUMO}>Cancelar</BotonEnlace>
            <Boton type="submit" peso="primario" cargando={guardando} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {guardando ? "Guardando…" : editar ? "Guardar cambios" : "Guardar orden"}
            </Boton>
          </div>
        </section>
      </form>

      {avisoSalida.aviso}
    </div>
  );
}

// Cómo se escribe el descuento: guarda un valor del formulario (`descuento_pct` lo recuerda), así que es la cara «campo» del segmento
// (ADR-0358, «Pestañas y segmentos»), como en la orden de compra.
const MODOS: { clave: ModoDescuento; etiqueta: string }[] = [
  { clave: "pct", etiqueta: "%" },
  { clave: "soles", etiqueta: "S/" },
];

function LineaOrdenInsumo({
  linea: l,
  numero,
  guia,
  etiqueta,
  estado,
  opcionesInsumo,
  unidad,
  nombreInsumo,
  tipoInsumo,
  errorBase,
  onInsumo,
  onCambio,
  onQuitar,
}: {
  linea: LineaInsumoBorrador;
  numero: number;
  guia: ReturnType<typeof useGuiaCampos>;
  /** El título con su marca, y la marca sola: null = llegó completa al editar (sin ✓). */
  etiqueta: (id: string, texto: ReactNode) => ReactNode;
  estado: (id: string) => EstadoCampo | null;
  opcionesInsumo: ReturnType<typeof opcionesDeInsumo>;
  /** La unidad del insumo elegido (en la que se escribe la cantidad); null sin insumo. */
  unidad: string | null;
  nombreInsumo: string | null;
  tipoInsumo: string | null;
  /** Un rechazo de la base que nombra esta línea. */
  errorBase: string | null;
  onInsumo: (insumoId: string) => void;
  onCambio: (cambios: Partial<LineaInsumoBorrador>) => void;
  onQuitar: () => void;
}) {
  const id = `linea-${l.clave}`;
  const c = calcularLineaInsumo(l);
  // Miles con punto («1.500»: ¿mil quinientos o uno y medio?): no se adivina, se dice a la vista cómo escribirlo.
  const duda = dudaDeLineaInsumo(l, unidad);
  // El otro lado del descuento, ya calculado, junto al subtotal: «−S/ 40.00» si se escribió en %, «−9.17 %» si se escribió en soles.
  const descuentoSoles = c.importeCentimos == null || c.descuentoCentimos === 0 ? null : soles(c.descuentoCentimos / 100);
  const descuentoPct = descuentoSoles ? `${aTexto(Math.round((c.pctEscalado ?? 0) / 100), 2)} %` : null;
  const equivalente = descuentoSoles ? (l.modoDescuento === "pct" ? `−${descuentoSoles}` : `−${descuentoPct}`) : null;
  // «metros» al lado de la caja; «metro» si la cantidad es justo 1. Sin insumo, nada: todavía no se sabe en qué se pide.
  const cantidadLeida = c.cantidadMilesimas != null ? c.cantidadMilesimas / 1000 : null;
  const unidadALaVista = unidad ? nombreUnidad(unidad, cantidadLeida) : null;
  const porUnidad = unidad ? nombreUnidad(unidad, 1) : "unidad";
  const quitar = (clase: string) => (
    <button type="button" onClick={onQuitar} className={`btn-cayla btn-sutil h-8 w-8 shrink-0 p-0 ${clase}`} aria-label={`Quitar la línea ${numero}`} title="Quitar esta línea">
      <X aria-hidden className="h-4 w-4" />
    </button>
  );

  // Dos caras, según el ancho de la SECCIÓN (`@container` de «Lo que pides»), no de la ventana: con 60 rem o más, la línea es UNA FILA
  // (los títulos van en el encabezado de arriba); más angosta (y en el celular), una tarjeta: «Línea N» con su ✕, el insumo, la
  // descripción, cantidad y precio, el descuento y el subtotal.
  return (
    <CampoGuiado id={id} guia={guia} retiene="fila" className="rounded-xl border border-sand bg-papel p-3 @min-[60rem]:rounded-lg @min-[60rem]:py-2">
      <div data-guia="oi-form.linea" className={`grid grid-cols-2 items-start gap-x-2.5 gap-y-2 @min-[60rem]:items-center ${FILA_ANCHA}`}>
        <div className="col-span-2 flex items-center justify-between gap-2 @min-[60rem]:col-span-1 @min-[60rem]:justify-start">
          <p className="text-[13px] font-semibold text-tinta @min-[60rem]:hidden">{etiqueta(id, `Línea ${numero}`)}</p>
          <span className="hidden items-center gap-1 text-[12px] tabular-nums text-taupe @min-[60rem]:inline-flex" title={`Línea ${numero}`}>
            {estado(id) ? <MarcaCampo estado={estado(id)!} /> : <span aria-hidden className="inline-block h-[18px] w-[18px]" />}
            {numero}
          </span>
          {quitar("@min-[60rem]:hidden")}
        </div>
        <div className="col-span-2 @min-[60rem]:col-span-1">
          <p className={`${TITULO} @min-[60rem]:hidden`}>Insumo</p>
          <ComboBuscable
            caja
            etiquetaAccesible={`Insumo de la línea ${numero}`}
            marcador="Nombre o código…"
            valor={l.insumoId}
            onValor={onInsumo}
            opciones={opcionesInsumo}
          />
        </div>
        <div className="col-span-2 @min-[60rem]:col-span-1">
          <p className={`${TITULO} @min-[60rem]:hidden`}>
            Descripción <span className="text-[12px] font-normal text-taupe">opcional</span>
          </p>
          <CampoTexto
            caja
            sinPie
            etiqueta={`Descripción de la línea ${numero}`}
            maxLength={TOPES_INSUMO.descripcion}
            placeholder={sugerirDescripcionInsumo(tipoInsumo).texto}
            value={l.descripcion}
            onChange={(e) => onCambio({ descripcion: e.target.value })}
          />
        </div>
        <div className="min-w-0">
          <p className={`${TITULO} @min-[60rem]:hidden`}>Cantidad</p>
          <div className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <CampoTexto
                caja
                sinPie
                etiqueta={`Cantidad de la línea ${numero}${unidad ? `, en ${nombreUnidad(unidad)}` : ""}`}
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
        <div className="min-w-0">
          <p className={`${TITULO} @min-[60rem]:hidden`}>Precio por {porUnidad}</p>
          <CampoTexto
            caja
            sinPie
            etiqueta={`Precio por ${porUnidad} de la línea ${numero}, en soles`}
            inputMode="decimal"
            placeholder="0.00"
            value={l.precio}
            onChange={(e) => onCambio({ precio: e.target.value })}
          />
        </div>
        <div className="col-span-2 @min-[60rem]:col-span-1">
          <p className={`${TITULO} @min-[60rem]:hidden`}>
            Descuento <span className="text-[12px] font-normal text-taupe">si hay</span>
          </p>
          <div className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <CampoTexto
                caja
                sinPie
                etiqueta={`Descuento de la línea ${numero}, ${l.modoDescuento === "pct" ? "en porcentaje" : "en soles"}`}
                inputMode="decimal"
                placeholder={l.modoDescuento === "pct" ? "0 %" : "0.00"}
                value={l.descuento}
                onChange={(e) => onCambio({ descuento: e.target.value })}
              />
            </div>
            <SegmentoDeslizante
              className="shrink-0"
              etiqueta={`Descuento de la línea ${numero} en`}
              opciones={MODOS}
              valor={l.modoDescuento}
              onCambio={(clave) => onCambio({ modoDescuento: clave as ModoDescuento, descuento: "" })}
            />
          </div>
        </div>
        <div className="col-span-2 flex items-baseline justify-between gap-3 border-t border-sand pt-2 @min-[60rem]:col-span-1 @min-[60rem]:block @min-[60rem]:border-0 @min-[60rem]:pt-0 @min-[60rem]:text-right">
          <p className={`${TITULO} @min-[60rem]:hidden`}>Subtotal</p>
          {/* En la tarjeta, el descuento va delante del monto, en la misma línea; en la fila ancha, debajo del monto. */}
          <p className="flex items-baseline justify-end gap-x-2 @min-[60rem]:flex-col-reverse @min-[60rem]:items-end @min-[60rem]:gap-0">
            {equivalente && (
              <span className="text-xs tabular-nums text-taupe" title={`Descuento de la línea: ${descuentoSoles} (${descuentoPct})`}>
                {equivalente}
                <span className="sr-only"> de descuento</span>
              </span>
            )}
            <span className="font-display text-lg tabular-nums text-tinta">{c.subtotalCentimos == null ? "—" : soles(c.subtotalCentimos / 100)}</span>
          </p>
        </div>
        <div className="hidden justify-end @min-[60rem]:flex">{quitar("")}</div>
      </div>
      {l.unidadCambio && (
        <Aviso tono="atencion" chico className="mt-2" guia="oi-form.unidad-cambiada">
          {avisoDeUnidadCambiada(nombreInsumo ?? "este insumo", l.unidadCambio)}
        </Aviso>
      )}
      {duda && (
        <Aviso tono="atencion" chico className="mt-2">
          {duda}
        </Aviso>
      )}
      {errorBase && (
        <Aviso tono="error" chico className="mt-2">
          {errorBase}
        </Aviso>
      )}
    </CampoGuiado>
  );
}
