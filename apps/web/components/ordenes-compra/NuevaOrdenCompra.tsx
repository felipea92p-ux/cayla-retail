"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { ComboBuscable, type OpcionCombo } from "@/components/ui/ComboBuscable";
import { Boton, BotonEnlace, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
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
import { opcionesDeMarca } from "@/lib/marca-proveedor-reglas";
import { lineaPorRevisar, revisaLaLinea, type OrdenDeAnalisis } from "@/lib/orden-compra-desde-analisis";
import { sugerirDescripcion } from "@/lib/sugerencias-alta-producto";
import { soles } from "@/lib/compras-reglas";
import { TEXTO_AVISO_ORDEN, tituloAvisoOrden } from "@/lib/nos-debe-reglas";
import {
  POR_REPARTIR,
  TOPES,
  aTexto,
  argsCrearOrden,
  argsEditarOrden,
  calcularLinea,
  dudaDeLinea,
  camposDeLaOrden,
  lineaVacia,
  problemaDeEntrega,
  totalCentimos,
  unidades,
  type ContextoValidacion,
  type LineaBorrador,
  type ModoDescuento,
  type OrdenBorrador,
} from "@/lib/orden-compra-alta";
import {
  HINT_YA_GUARDADA,
  avisoDeCorte,
  fraseDestino,
  hrefOrdenGuardada,
  numeroOrdenCompra,
  type DatosNuevaOrden,
} from "@/lib/ordenes-compra-reglas";
import { crearOrdenCompra, editarOrdenCompra } from "@/lib/ordenes-compra-acciones";
import { TituloSeccion } from "@/components/ui/TituloSeccion";

// Nueva orden de compra (ADR-0362, fase 1 · actividad 2). Arriba, a quién se le pide y a dónde llega; abajo, lo que se pide, una
// tarjeta por línea (categoría y marca obligatorias, descripción opcional, cantidad, precio y descuento), con el total al pie. Se usa
// sobre todo en el celular, en Gamarra: cada línea es una tarjeta que se apila, y el botón de guardar queda a la vista.
//
// Quién firma (decisión 39): con la cuenta de una PERSONA no hay combo —firma ella (`orden_compra_crear`)—; desde una TERMINAL, el combo
// «Responsable». El número se ve bloqueado (vista previa): la base lo toma al guardar y, si otra orden lo tomó un momento antes, se dice.
// Un doble clic no crea dos órdenes: el id se genera una vez y la base devuelve la misma si llega repetido.
//
// La guía de foco (CLAUDE.md «Guía de foco»): cada bloque se enciende cuando es lo que sigue, y «Falta: …» sobre el botón lleva a cada
// cosa. Sale de `camposDeLaOrden`, que son las reglas de `crear_orden_compra` (la entrega estimada es sugerida: nunca bloquea).
//
// EDITAR (actividad 4): la misma pantalla, con la orden como está (`editar`). Cambia el título («Editar OC-000129»), el botón («Guardar
// cambios») y lo que se guarda (`editar_orden_compra`, con la versión que se vio al abrir). Lo que ya venía completo no se llena de ✓
// (regla 4 de la guía): solo lleva marca lo que llegó pendiente o lo que se deja pendiente al editar. Si otra persona guardó la orden
// mientras tanto, el aviso lo dice y ofrece «Recargar»: la página trae la orden nueva y el formulario vuelve a empezar con ella.
//
// DESDE ANÁLISIS (ADR-0357, «Actualización 2026-10-16», A9; decisión D8): «Comprar» y «Pedir a X» abren esta pantalla con el proveedor, la tienda y una
// línea por modelo que se acaba (`deAnalisis`, `lib/orden-compra-desde-analisis.ts`). Es un BORRADOR: no se guarda solo y Análisis no pone cantidades (ADR-0357,
// decisión 7). El proveedor y la tienda los eligió la persona al apretar el botón (llegan completos, sin ✓, como al editar); las líneas llegaron armadas
// y dicen «Por revisar» hasta que las toca (regla 4 de la guía), y la luz va a la primera cantidad: la entrega estimada, que solo se sugiere, espera detrás.

const TITULO = "mb-1 text-[13px] font-semibold text-tinta";
// El título de un campo de la cabecera de la orden: una sola línea de alto fijo, así las cajas de al lado quedan alineadas en cualquier
// estado de la guía (✓, «Sigue aquí», falta, opcional).
const TITULO_FIJO = "mb-1.5 flex h-6 items-center gap-x-2 overflow-hidden whitespace-nowrap text-[13px] font-semibold text-tinta";
// La fila de una línea cuando hay lugar (sección de 56 rem o más). La comparten el encabezado y cada fila: marca de la guía y número ·
// categoría · marca · descripción · cantidad · precio · descuento (caja + «% / S/») · subtotal · quitar.
const FILA_ANCHA = "@min-[56rem]:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)_4.5rem_6rem_minmax(9rem,11rem)_6.5rem_2rem]";

/** Editar una orden «generada» en vez de crear una (actividad 4). */
export type EdicionOrden = {
  id: string;
  numero: number;
  /** La versión que se vio al abrir: la base rechaza el guardado si otra persona guardó después. */
  version: number;
  inicial: OrdenBorrador;
  /** La entrega estimada guardada: dejarla como está vale aunque ya haya pasado. */
  entregaOriginal: string;
};

type Props = {
  datos: DatosNuevaOrden;
  sede: string;
  hoy: string;
  /** La sede donde se trabaja, si es una tienda o un almacén: «Llega a» arranca ahí (decisión por defecto de la fase 1). */
  destinoInicial: string;
  editar?: EdicionOrden;
  /** La orden que armó Análisis (el proveedor, la tienda y las prendas que se acaban, sin cantidades); solo al crear. */
  deAnalisis?: OrdenDeAnalisis;
  /** A dónde regresan «Volver» y «Cancelar»: a la lista de órdenes, o a Análisis si la orden salió de ahí. */
  volver?: { href: string; a: string };
};

const VOLVER_A_LA_LISTA = { href: "/compras/ordenes", a: "Órdenes de compra" };

export function NuevaOrdenCompra({ datos, sede, hoy, destinoInicial, editar, deAnalisis, volver = VOLVER_A_LA_LISTA }: Props) {
  const router = useRouter();
  const [orden, setOrden] = useState<OrdenBorrador>(
    () => editar?.inicial ?? deAnalisis?.orden ?? { proveedorId: "", destino: destinoInicial, entrega: "", nota: "", lineas: [lineaVacia("l1")] },
  );
  const [guardando, setGuardando] = useState(false);
  // «Llega a» viene puesto con la sede donde se trabaja: hasta que la persona lo elige (aunque elija la misma), la guía lo trata como
  // sugerido y no lo marca con ✓ (ADR-0284 act. h). Al editar, el destino es el que la orden ya tenía: cuenta como elegido.
  // Si la tienda vino de Análisis, la eligió la persona al apretar el botón: cuenta como elegida.
  const [destinoElegido, setDestinoElegido] = useState(Boolean(editar) || Boolean(deAnalisis?.destinoDeAnalisis));
  // Las claves de línea siguen desde las que ya tiene la orden (l1…lN).
  const contador = useRef(editar ? editar.inicial.lineas.length : (deAnalisis?.orden.lineas.length ?? 1));
  // El id de la orden se genera al primer «Guardar» y se reusa en cada reintento: la base devuelve la misma orden si llega dos veces.
  const idOrden = useRef<string | null>(null);
  // El candado contra dos clics en el mismo instante (ver `guardar`).
  const enVuelo = useRef(false);

  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();

  const ctx: ContextoValidacion = useMemo(
    () => ({
      hoy,
      proveedoresActivos: new Set(datos.proveedores.map((p) => p.id)),
      categoriasActivas: new Set(datos.categorias.map((c) => c.id)),
      marcasActivas: new Set(datos.marcas.map((m) => m.id)),
      destinos: new Set(datos.destinos.map((d) => d.id)),
      entregaOriginal: editar?.entregaOriginal,
      destinoElegido,
      lineasPrimero: Boolean(deAnalisis),
    }),
    [datos, hoy, editar?.entregaOriginal, destinoElegido, deAnalisis],
  );
  const campos = camposDeLaOrden(orden, ctx, { pide: !esPersona, listo: responsable.listo, motivo: responsable.motivo });
  const guia = useGuiaCampos(campos, { enModal: false });

  // Al editar, lo que llegó completo no se marca con ✓ (regla 4 de la guía): quien entra a corregir un precio no necesita leer diez
  // tildes. Si se deja pendiente al editar (se borra, se agrega una línea), vuelve a llevar su marca. Lo mismo desde Análisis: el proveedor y la
  // tienda llegan completos y sin ✓; las líneas llegan sin cantidad, así que ellas sí llevan marca.
  const [completosAlAbrir] = useState(() => new Set(editar || deAnalisis ? campos.filter((c) => c.hecho).map((c) => c.id) : []));
  const estadoVisible = (id: string): EstadoCampo | null => {
    const estado = guia.estado(id);
    return estado === "hecho" && completosAlAbrir.has(id) ? null : estado;
  };
  const etiqueta = (id: string, texto: ReactNode) => <ConMarca estado={estadoVisible(id)}>{texto}</ConMarca>;

  // «¿Salir sin guardar?»: solo cuenta lo que la persona llenó o cambió (la sede de «Llega a» viene puesta).
  const [fotoAlAbrir] = useState(() => JSON.stringify(orden));
  const avisoSalida = useSalidaSinGuardar(
    JSON.stringify(orden) !== fotoAlAbrir,
    editar
      ? "Cambiaste esta orden y todavía no se guardó. Si sales ahora, se pierden los cambios."
      : "Llenaste parte de esta orden y todavía no se guardó. Si sales ahora, se pierde lo que llenaste.",
  );

  // ---- opciones de los combos ----
  const nombreMarca = useMemo(() => new Map(datos.marcas.map((m) => [m.id, m.nombre])), [datos.marcas]);
  const opcionesProveedor: OpcionCombo<string>[] = useMemo(
    () =>
      datos.proveedores.map((p) => {
        const suyas = datos.vinculos.filter((v) => v.proveedorId === p.id).map((v) => nombreMarca.get(v.marcaId) ?? "");
        return {
          valor: p.id,
          texto: p.nombre,
          detalle: suyas.length ? `trae ${suyas.slice(0, 3).join(", ")}${suyas.length > 3 ? ` +${suyas.length - 3}` : ""}` : p.ruc ? `RUC ${p.ruc}` : undefined,
          // Se le busca por su marca («Kero») o su RUC, no solo por la razón social.
          claves: [...suyas, ...(p.ruc ? [p.ruc] : [])],
        };
      }),
    [datos.proveedores, datos.vinculos, nombreMarca],
  );
  // Con el proveedor elegido, sus marcas van primero (la orden acepta cualquiera y no toca el catálogo: decisión por defecto).
  const opcionesMarca: OpcionCombo<string>[] = useMemo(
    () => opcionesDeMarca(datos.marcas, datos.proveedores, datos.vinculos, orden.proveedorId),
    [datos.marcas, datos.proveedores, datos.vinculos, orden.proveedorId],
  );
  const opcionesCategoria: OpcionCombo<string>[] = useMemo(() => datos.categorias.map((c) => ({ valor: c.id, texto: c.nombre })), [datos.categorias]);
  const opcionesDestino = useMemo(
    // «Por repartir», corto en la caja: «(llega a Lima)» la partía en dos renglones en una pantalla angosta. Lo explica el título de su
    // grupo en la lista abierta, ANTES de elegirlo (Formidable, 2026-10-10: dos de dos pruebas ciegas no sabían qué era).
    () => [
      ...datos.destinos.map((d) => ({ valor: d.id, texto: d.nombre, grupo: "Directo a la tienda" })),
      { valor: POR_REPARTIR, texto: "Por repartir", grupo: "Llega a Lima para repartir" },
    ],
    [datos.destinos],
  );
  const categoriaPor = useMemo(() => new Map(datos.categorias.map((c) => [c.id, c])), [datos.categorias]);

  // La única marca de un proveedor se pone sola en las líneas que todavía no tienen marca (casi todos traen una sola).
  const marcaUnicaDe = (proveedorId: string) => {
    const suyas = datos.vinculos.filter((v) => v.proveedorId === proveedorId);
    return suyas.length === 1 ? suyas[0]!.marcaId : "";
  };

  function elegirProveedor(proveedorId: string) {
    const unica = marcaUnicaDe(proveedorId);
    setOrden((o) => ({ ...o, proveedorId, lineas: o.lineas.map((l) => (l.marcaId || !unica ? l : { ...l, marcaId: unica })) }));
  }
  function cambiarLinea(clave: string, cambios: Partial<LineaBorrador>) {
    // Revisar lo que llegó armado (su categoría, su marca o su descripción) la saca de «Por revisar»; escribir la cantidad o el precio, no: la marca
    // que Análisis (o el proveedor) puso sigue sin mirar hasta que se toca o la línea queda completa (`lineaPorRevisar`). Una línea común no gana ninguna
    // marca (su edición y su vuelta atrás siguen siendo «sin cambios» para el aviso de «¿Salir sin guardar?»).
    setOrden((o) => ({ ...o, lineas: o.lineas.map((l) => (l.clave === clave ? { ...l, ...cambios, ...(l.prellenada && revisaLaLinea(cambios) ? { prellenada: false } : {}) } : l)) }));
  }
  function agregarLinea() {
    contador.current += 1;
    const clave = `l${contador.current}`;
    setOrden((o) => ({ ...o, lineas: [...o.lineas, lineaVacia(clave, marcaUnicaDe(o.proveedorId))] }));
    // La línea nueva es lo que sigue: se lleva a la vista y a su categoría.
    requestAnimationFrame(() => guia.ir(`linea-${clave}`));
  }
  function quitarLinea(clave: string) {
    setOrden((o) => ({ ...o, lineas: o.lineas.filter((l) => l.clave !== clave) }));
  }

  const total = totalCentimos(orden.lineas) / 100;
  const cuantas = unidades(orden.lineas);
  const problemaEntrega = problemaDeEntrega(orden.entrega, hoy, editar?.entregaOriginal);
  // «Nos debe» (ADR-0362, fase 5a, decisión 14): si el proveedor elegido debe prendas por reponer, se avisa antes de pedirle lo nuevo.
  const deudaDelProveedor = orden.proveedorId ? (datos.nosDebe?.[orden.proveedorId] ?? null) : null;
  const nombreDelProveedor = datos.proveedores.find((p) => p.id === orden.proveedorId)?.nombre ?? deudaDelProveedor?.nombre ?? "Este proveedor";

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    // Dos clics en el MISMO instante: `guardando` es estado de React y se aplica después del clic, así que dejaba pasar dos llamadas (la base
    // guardaba una orden, pero la pantalla quedaba en el formulario y se gastaba un número; chaos 2026-10-10). El candado es el de la casa
    // (Ajustar inventario, Editar meta): una ref que se pone en el mismo tick y se suelta al terminar.
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
      const firma = esPersona ? firmaOmitida("orden_compra_crear") : responsable.firma();
      const { numero, error } = await crearOrdenCompra(argsCrearOrden(id, orden), firma);
      setGuardando(false);
      if (!esPersona) responsable.despues(error);
      if (error || numero == null) {
        // Se cortó la señal: el pedido pudo llegar a la base y perderse solo la respuesta. Reintentar sin cambiar nada es seguro (el mismo
        // id no crea otra orden); decir «no se guardó nada» invitaba a corregir algo creyendo que no existía (Formidable, 2026-10-10).
        if (error && esFalloDeRed(error)) {
          avisar.error(avisoDeCorte("crear"));
          return;
        }
        // Sí se había guardado, con lo de antes, y la persona corrigió algo entre un intento y otro: se corrige en la orden misma.
        if (error?.hint === HINT_YA_GUARDADA) {
          avisar.error(traducirError(error, "guardar la orden de compra"), {
            accion: { texto: "Corregirla", onClick: () => void irA(`/compras/ordenes/editar/${id}`) },
          });
          return;
        }
        avisar.error(traducirError(error, "guardar la orden de compra"));
        return;
      }
      avisar.exito(`${numeroOrdenCompra(numero)} guardada`, {
        detalle:
          datos.siguiente != null && numero !== datos.siguiente
            ? `Otra orden tomó la ${numeroOrdenCompra(datos.siguiente)} un momento antes: esta quedó como ${numeroOrdenCompra(numero)}.`
            : detalleGuardada(),
      });
      // De vuelta a la lista en el destino de ESTA orden, con ella marcada: volver a la sede de quien trabaja escondía una orden para otra
      // tienda, y las dos pruebas ciegas dudaron si se había guardado (Formidable, 2026-10-10).
      await irA(hrefOrdenGuardada(orden.destino === POR_REPARTIR ? null : orden.destino, id));
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
  }

  // «Textiles Andina SAC · S/ 1,260.00 · llega a Tienda TRU»: lo guardado, dicho como se ve en la lista.
  function detalleGuardada(): string {
    const proveedor = datos.proveedores.find((p) => p.id === orden.proveedorId)?.nombre ?? "";
    const destino = fraseDestino(orden.destino === POR_REPARTIR ? null : (datos.destinos.find((d) => d.id === orden.destino)?.nombre ?? null));
    return [proveedor, soles(total), destino.charAt(0).toLowerCase() + destino.slice(1)].filter(Boolean).join(" · ");
  }

  // La guardia de «¿Salir sin guardar?» se retira ANTES de navegar (ver useSalidaSinGuardar: juntos, Next podía recargar todo).
  async function irA(href: string) {
    await avisoSalida.retirarYa();
    router.push(href);
  }

  async function guardarCambios(e: EdicionOrden) {
    setGuardando(true);
    const firma = esPersona ? firmaOmitida("orden_compra_editar") : responsable.firma();
    const { version, error } = await editarOrdenCompra(argsEditarOrden(e.id, e.version, orden), firma);
    setGuardando(false);
    if (!esPersona) responsable.despues(error);
    if (error || version == null) {
      // Se cortó la señal: el cambio pudo llegar. Reintentar sin cambiar nada es seguro (la base reconoce el mismo pedido).
      if (error && esFalloDeRed(error)) {
        avisar.error(avisoDeCorte("editar"));
        return;
      }
      // La orden cambió desde que se abrió (otra persona, la misma en otro intento, o se anuló: la base dice cuál): lo escrito sigue a
      // la vista y se ofrece traer lo nuevo.
      if (esVersionCambiada(error)) {
        avisar.error(traducirError(error, "guardar los cambios"), { accion: { texto: "Recargar", onClick: () => void recargar() } });
        return;
      }
      avisar.error(traducirError(error, "guardar los cambios"));
      return;
    }
    const nombre = numeroOrdenCompra(e.numero);
    // La misma versión: no había nada que cambiar (o era el mismo guardado repetido).
    avisar.exito(version === e.version ? `${nombre} ya decía eso: no había nada que cambiar` : `${nombre} actualizada`, {
      detalle: detalleGuardada(),
    });
    await irA(hrefOrdenGuardada(orden.destino === POR_REPARTIR ? null : orden.destino, e.id));
    router.refresh();
  }

  // «Recargar»: la página vuelve a leer la orden y el formulario empieza de nuevo con ella (la página lo monta con `key` = versión).
  async function recargar() {
    await avisoSalida.retirarYa();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={sede}
        titulo={editar ? `Editar ${numeroOrdenCompra(editar.numero)}` : "Nueva orden de compra"}
        subtitulo={
          editar
            ? "Corrige lo que haga falta y guarda. El número y la fecha de emisión no cambian."
            : "Lo que le pides al proveedor. La factura y el envío vienen después."
        }
        volver={<Volver href={volver.href} a={volver.a} />}
      >
        <div data-guia="orden-form.cifras" className="anim-sube flex items-end gap-6 text-right" style={{ ["--i" as string]: 1 }}>
          {/* Al editar, el número ya está en el título. */}
          {!editar && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-taupe-profundo">N.º</p>
              <p className="font-display mt-1 text-2xl tabular-nums text-tinta" title="Se confirma al guardar">
                {datos.siguiente != null ? numeroOrdenCompra(datos.siguiente) : "Al guardar"}
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
        {/* Proveedor, destino, entrega y nota: dos por fila y, con lugar (tarjeta de 52 rem o más), los cuatro en una (Felipe, 2026-10-10:
            «hay mucho espacio, se puede compactar más»). */}
        <section data-guia="orden-form.datos" className="@container card-cayla p-4 sm:p-5" aria-label="Proveedor y destino">
          <div className="grid gap-x-5 gap-y-4 @min-[28rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
          {/* Cada título va en una fila de ALTO FIJO (`TITULO_FIJO`), no en el de `CampoGuiado`: su alto cambiaba con el estado de la guía
              (con ✓ 25 px, con «Sigue aquí» 21 px) y las cuatro cajas quedaban a distinta altura mientras se llenaba (Felipe, 2026-10-10:
              «debería estar alineado»). El proveedor va sin ayuda al lado: con «Sigue aquí» no cabía en la columna. */}
          <CampoGuiado id="proveedor" guia={guia}>
            <p className={TITULO_FIJO}>{etiqueta("proveedor", "Proveedor")}</p>
            <ComboBuscable
              id="oc-proveedor"
              caja
              etiquetaAccesible="Proveedor"
              marcador="Nombre, marca o RUC…"
              valor={orden.proveedorId}
              onValor={elegirProveedor}
              opciones={opcionesProveedor}
            />
          </CampoGuiado>
          <CampoGuiado id="destino" guia={guia}>
            <p className={TITULO_FIJO}>{etiqueta("destino", "Llega a")}</p>
            <CampoSelect
              id="oc-destino"
              caja
              etiqueta="Llega a"
              marcador="Elige a dónde llega"
              valor={orden.destino}
              onValor={(destino) => {
                setDestinoElegido(true);
                setOrden((o) => ({ ...o, destino }));
              }}
              opciones={opcionesDestino}
            />
            {orden.destino === POR_REPARTIR && <p className="mt-1.5 text-xs text-taupe">Se separa en Lima y se envía a cada tienda después.</p>}
          </CampoGuiado>
          <CampoGuiado id="entrega" guia={guia}>
            <p className={TITULO_FIJO}>
              {etiqueta("entrega", "Entrega estimada")}
              <span className="text-[12px] font-normal text-taupe">si la sabes</span>
            </p>
            <CampoFecha
              id="oc-entrega"
              caja
              etiqueta="Entrega estimada"
              valor={orden.entrega}
              onValor={(entrega) => setOrden((o) => ({ ...o, entrega }))}
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
              id="oc-nota"
              caja
              etiqueta="Nota"
              maxLength={TOPES.nota}
              value={orden.nota}
              onChange={(e) => setOrden((o) => ({ ...o, nota: e.target.value }))}
            />
          </CampoGuiado>
          </div>
        </section>

        {/* Lo que este proveedor todavía debe de otra compra: se le puede pedir en esta orden, o marcar al recibirlo (fase 5a). */}
        {deudaDelProveedor && deudaDelProveedor.unidades > 0 && (
          <Aviso tono="info" guia="orden-form.nos-debe" titulo={tituloAvisoOrden(nombreDelProveedor, deudaDelProveedor)}>
            {TEXTO_AVISO_ORDEN}
          </Aviso>
        )}

        {/* Lo que Análisis dejó armado: se dice de dónde vino y qué falta, y lo que no se pudo traer (principio 9). Nada de esto se guarda solo. */}
        {deAnalisis && deAnalisis.prellenadas > 0 && (
          <Aviso tono="info" guia="orden-form.de-analisis" titulo="Estas prendas las trajo Análisis">
            Revisa la categoría y la marca de cada una, y escribe cuántas pides y a qué precio: Análisis no sugiere cantidades. Esta orden no se guarda sola.
          </Aviso>
        )}
        {deAnalisis?.sinTraer && <Aviso tono="atencion">{deAnalisis.sinTraer}</Aviso>}

        <section data-guia="orden-form.lineas" className="@container card-cayla space-y-3 p-4 sm:p-5" aria-label="Lo que pides">
          <TituloSeccion
            dato={
              <>
                {orden.lineas.length} {orden.lineas.length === 1 ? "línea" : "líneas"} · <b>{cuantas.toLocaleString("es-PE")}</b> {cuantas === 1 ? "unidad" : "unidades"}
              </>
            }
          >
            Lo que pides
          </TituloSeccion>

          {orden.lineas.length === 0 && (
            <CampoGuiado id="lineas" guia={guia}>
              <p className="rounded-xl border border-dashed border-sand p-4 text-sm text-taupe">Agrega al menos una prenda para poder guardar la orden.</p>
            </CampoGuiado>
          )}

          {/* Con lugar, una FILA por línea (Felipe, 2026-10-10): los títulos van una sola vez, aquí arriba, y no sobre cada caja. Los
              lectores de pantalla tienen la etiqueta de cada caja, por eso este encabezado se les oculta. Hablan con la misma voz que
              los títulos de los campos de arriba (13 px, semibold, tinta): en 12 px y taupe no se leían (Felipe, 2026-10-10). */}
          {orden.lineas.length > 0 && (
            <div aria-hidden className={`hidden gap-x-2.5 px-3 text-[13px] font-semibold text-tinta @min-[56rem]:grid ${FILA_ANCHA}`}>
              <span />
              <span>Categoría</span>
              <span>Marca</span>
              <span className="truncate">
                Descripción <span className="text-[12px] font-normal text-taupe">opcional</span>
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

          {orden.lineas.map((l, i) => (
            <LineaOrden
              key={l.clave}
              linea={l}
              numero={i + 1}
              guia={guia}
              etiqueta={etiqueta}
              estado={estadoVisible}
              opcionesCategoria={opcionesCategoria}
              opcionesMarca={opcionesMarca}
              placeholderDescripcion={sugerirDescripcion(categoriaPor.get(l.categoriaId) ?? null).texto}
              onCambio={(cambios) => cambiarLinea(l.clave, cambios)}
              onQuitar={() => quitarLinea(l.clave)}
            />
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand pt-4">
            <Boton type="button" onClick={agregarLinea} disabled={orden.lineas.length >= TOPES.lineas} data-guia="orden-form.agregar">
              + Agregar otra prenda
            </Boton>
            <p className="text-sm text-taupe">
              Total <b className="font-display ml-1 text-xl font-normal tabular-nums text-tinta">{soles(total)}</b>
            </p>
          </div>
        </section>

        <section data-guia="orden-form.guardar" className="space-y-3" aria-label="Guardar">
          {!esPersona && (
            <CampoGuiado id="responsable" guia={guia} titulo={editar ? "Quién hace el cambio" : "Quién hace la orden"} className="max-w-sm">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}
          <PieGuia guia={guia} listo="Todo listo para guardar." />
          <div className="pie-acciones">
            <BotonEnlace href={volver.href}>Cancelar</BotonEnlace>
            <Boton type="submit" peso="primario" cargando={guardando} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {editar ? "Guardar cambios" : "Guardar orden"}
            </Boton>
          </div>
        </section>
      </form>

      {avisoSalida.aviso}
    </div>
  );
}

// Cómo se escribe el descuento: guarda un valor del formulario (`descuento_pct` lo recuerda), así que es la cara «campo» del segmento
// (ADR-0358, «Pestañas y segmentos»), no la de «modo».
const MODOS: { clave: ModoDescuento; etiqueta: string }[] = [
  { clave: "pct", etiqueta: "%" },
  { clave: "soles", etiqueta: "S/" },
];

function LineaOrden({
  linea: l,
  numero,
  guia,
  etiqueta,
  estado,
  opcionesCategoria,
  opcionesMarca,
  placeholderDescripcion,
  onCambio,
  onQuitar,
}: {
  linea: LineaBorrador;
  numero: number;
  guia: ReturnType<typeof useGuiaCampos>;
  /** El título con su marca, y la marca sola: null = llegó completa al editar (sin ✓). */
  etiqueta: (id: string, texto: ReactNode) => ReactNode;
  estado: (id: string) => EstadoCampo | null;
  opcionesCategoria: OpcionCombo<string>[];
  opcionesMarca: OpcionCombo<string>[];
  placeholderDescripcion: string;
  onCambio: (cambios: Partial<LineaBorrador>) => void;
  onQuitar: () => void;
}) {
  const id = `linea-${l.clave}`;
  const c = calcularLinea(l);
  // Miles con punto («1.000», «1.500»): no se adivina, se dice a la vista cómo escribirlo (chaos 2026-10-10).
  const duda = dudaDeLinea(l);
  // El otro lado del descuento, ya calculado: «−S/ 40.00» si se escribió en %, «−9.17 %» si se escribió en soles. Va junto al subtotal
  // de la línea, no bajo la caja del descuento (Felipe, 2026-10-10: debajo de la caja se veía mal y descuadraba la fila): ahí se lee
  // como lo que es, cuánto le quitó el descuento a la línea.
  const descuentoSoles = c.brutoCentimos == null || c.descuentoCentimos === 0 ? null : soles(c.descuentoCentimos / 100);
  const descuentoPct = descuentoSoles ? `${aTexto(Math.round((c.pctEscalado ?? 0) / 100), 2)} %` : null;
  const equivalente = descuentoSoles ? (l.modoDescuento === "pct" ? `−${descuentoSoles}` : `−${descuentoPct}`) : null;
  const quitar = (clase: string) => (
    <button type="button" onClick={onQuitar} className={`btn-cayla btn-sutil h-8 w-8 shrink-0 p-0 ${clase}`} aria-label={`Quitar la línea ${numero}`} title="Quitar esta línea">
      <X aria-hidden className="h-4 w-4" />
    </button>
  );

  // Dos caras, según el ancho de la SECCIÓN (`@container` de «Lo que pides»), no de la ventana: con el menú abierto una laptop deja la
  // sección en ~700 px. Con 56 rem o más, la línea es UNA FILA (Felipe, 2026-10-10: «hay mucho espacio… quizás por fila»): los títulos
  // van en el encabezado de arriba, la marca de la guía y el número abren la fila, y la ✕ la cierra. Más angosta (y en el celular), una
  // tarjeta apretada: «Línea N» con su ✕ arriba, categoría y marca, descripción, cantidad y precio, descuento y el subtotal.
  return (
    <CampoGuiado id={id} guia={guia} retiene="fila" className="rounded-xl border border-sand bg-papel p-3 @min-[56rem]:rounded-lg @min-[56rem]:py-2">
      <div data-guia="orden-form.linea" className={`grid grid-cols-2 items-start gap-x-2.5 gap-y-2 @min-[56rem]:items-center ${FILA_ANCHA}`}>
        <div className="col-span-2 flex items-center justify-between gap-2 @min-[56rem]:col-span-1 @min-[56rem]:justify-start">
          <p className="text-[13px] font-semibold text-tinta @min-[56rem]:hidden">{etiqueta(id, `Línea ${numero}`)}</p>
          <span className="hidden items-center gap-1 text-[12px] tabular-nums text-taupe @min-[56rem]:inline-flex" title={`Línea ${numero}`}>
            {/* Sin marca (llegó completa al editar), un hueco del mismo ancho: el número no se corre. */}
            {estado(id) ? <MarcaCampo estado={estado(id)!} /> : <span aria-hidden className="inline-block h-[18px] w-[18px]" />}
            {numero}
          </span>
          {quitar("@min-[56rem]:hidden")}
        </div>
        <div className="col-span-2 @min-[28rem]:col-span-1">
          <p className={`${TITULO} @min-[56rem]:hidden`}>Categoría</p>
          <ComboBuscable caja etiquetaAccesible={`Categoría de la línea ${numero}`} marcador="Categoría…" valor={l.categoriaId} onValor={(categoriaId) => onCambio({ categoriaId })} opciones={opcionesCategoria} />
        </div>
        <div className="col-span-2 @min-[28rem]:col-span-1">
          <p className={`${TITULO} @min-[56rem]:hidden`}>Marca</p>
          <ComboBuscable caja etiquetaAccesible={`Marca de la línea ${numero}`} marcador="Marca…" valor={l.marcaId} onValor={(marcaId) => onCambio({ marcaId })} opciones={opcionesMarca} />
        </div>
        <div className="col-span-2 @min-[56rem]:col-span-1">
          <p className={`${TITULO} @min-[56rem]:hidden`}>
            Descripción <span className="text-[12px] font-normal text-taupe">opcional</span>
          </p>
          {/* En una línea que trajo Análisis la descripción ya viene escrita (el nombre del modelo): el cursor de la guía va a la cantidad (`data-sin-cursor`). */}
          <CampoTexto
            caja
            sinPie
            etiqueta={`Descripción de la línea ${numero}`}
            maxLength={TOPES.descripcion}
            placeholder={placeholderDescripcion}
            value={l.descripcion}
            onChange={(e) => onCambio({ descripcion: e.target.value })}
            data-sin-cursor={l.prellenada ? "" : undefined}
          />
        </div>
        <div>
          <p className={`${TITULO} @min-[56rem]:hidden`}>Cantidad</p>
          <CampoTexto caja sinPie etiqueta={`Cantidad de la línea ${numero}`} inputMode="numeric" placeholder="0" value={l.cantidad} onChange={(e) => onCambio({ cantidad: e.target.value })} />
        </div>
        <div>
          <p className={`${TITULO} @min-[56rem]:hidden`}>Precio por unidad</p>
          <CampoTexto caja sinPie etiqueta={`Precio por unidad de la línea ${numero}, en soles`} inputMode="decimal" placeholder="0.00" value={l.precio} onChange={(e) => onCambio({ precio: e.target.value })} />
        </div>
        <div className="col-span-2 @min-[56rem]:col-span-1">
          <p className={`${TITULO} @min-[56rem]:hidden`}>
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
        <div className="col-span-2 flex items-baseline justify-between gap-3 border-t border-sand pt-2 @min-[56rem]:col-span-1 @min-[56rem]:block @min-[56rem]:border-0 @min-[56rem]:pt-0 @min-[56rem]:text-right">
          <p className={`${TITULO} @min-[56rem]:hidden`}>Subtotal</p>
          {/* En la tarjeta, el descuento va delante del monto, en la misma línea; en la fila ancha, debajo del monto. */}
          <p className="flex items-baseline justify-end gap-x-2 @min-[56rem]:flex-col-reverse @min-[56rem]:items-end @min-[56rem]:gap-0">
            {equivalente && (
              <span className="text-xs tabular-nums text-taupe" title={`Descuento de la línea: ${descuentoSoles} (${descuentoPct})`}>
                {equivalente}
                <span className="sr-only"> de descuento</span>
              </span>
            )}
            <span className="font-display text-lg tabular-nums text-tinta">{c.subtotalCentimos == null ? "—" : soles(c.subtotalCentimos / 100)}</span>
          </p>
        </div>
        <div className="hidden justify-end @min-[56rem]:flex">{quitar("")}</div>
      </div>
      {lineaPorRevisar(l, guia.estado(id) === "hecho") && (
        <p className="mt-2">
          <Chip tono="pizarra" title="Vino de Análisis: revisa la categoría y la marca, y escribe la cantidad.">
            Por revisar
          </Chip>
        </p>
      )}
      {duda && (
        <Aviso tono="atencion" chico className="mt-2">
          {duda}
        </Aviso>
      )}
    </CampoGuiado>
  );
}
