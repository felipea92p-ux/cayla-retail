"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { ComboBuscable, type OpcionCombo } from "@/components/ui/ComboBuscable";
import { Boton, BotonEnlace, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { traducirError } from "@/lib/error-escritura";
import { opcionesDeMarca } from "@/lib/marca-proveedor-reglas";
import { sugerirDescripcion } from "@/lib/sugerencias-alta-producto";
import { soles } from "@/lib/compras-reglas";
import {
  POR_REPARTIR,
  TOPES,
  aTexto,
  argsCrearOrden,
  calcularLinea,
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
import { numeroOrdenCompra, type DatosNuevaOrden } from "@/lib/ordenes-compra-reglas";
import { crearOrdenCompra } from "@/lib/ordenes-compra-acciones";

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

const TITULO = "mb-1.5 text-[13px] font-semibold text-tinta";

type Props = {
  datos: DatosNuevaOrden;
  sede: string;
  hoy: string;
  /** La sede donde se trabaja, si es una tienda o un almacén: «Llega a» arranca ahí (decisión por defecto de la fase 1). */
  destinoInicial: string;
};

export function NuevaOrdenCompra({ datos, sede, hoy, destinoInicial }: Props) {
  const router = useRouter();
  const [orden, setOrden] = useState<OrdenBorrador>(() => ({ proveedorId: "", destino: destinoInicial, entrega: "", nota: "", lineas: [lineaVacia("l1")] }));
  const [guardando, setGuardando] = useState(false);
  const contador = useRef(1);
  // El id de la orden se genera al primer «Guardar» y se reusa en cada reintento: la base devuelve la misma orden si llega dos veces.
  const idOrden = useRef<string | null>(null);

  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();

  const ctx: ContextoValidacion = useMemo(
    () => ({
      hoy,
      proveedoresActivos: new Set(datos.proveedores.map((p) => p.id)),
      categoriasActivas: new Set(datos.categorias.map((c) => c.id)),
      marcasActivas: new Set(datos.marcas.map((m) => m.id)),
      destinos: new Set(datos.destinos.map((d) => d.id)),
    }),
    [datos, hoy],
  );
  const campos = camposDeLaOrden(orden, ctx, { pide: !esPersona, listo: responsable.listo, motivo: responsable.motivo });
  const guia = useGuiaCampos(campos, { enModal: false });

  // «¿Salir sin guardar?»: solo cuenta lo que la persona llenó (la sede de «Llega a» viene puesta).
  const [fotoAlAbrir] = useState(() => JSON.stringify(orden));
  const avisoSalida = useSalidaSinGuardar(
    JSON.stringify(orden) !== fotoAlAbrir,
    "Llenaste parte de esta orden y todavía no se guardó. Si sales ahora, se pierde lo que llenaste.",
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
    () => [...datos.destinos.map((d) => ({ valor: d.id, texto: d.nombre })), { valor: POR_REPARTIR, texto: "Por repartir (llega a Lima)" }],
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
    setOrden((o) => ({ ...o, lineas: o.lineas.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)) }));
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
  const problemaEntrega = problemaDeEntrega(orden.entrega, hoy);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (guardando) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    idOrden.current ??= crypto.randomUUID();
    setGuardando(true);
    const firma = esPersona ? firmaOmitida("orden_compra_crear") : responsable.firma();
    const { numero, error } = await crearOrdenCompra(argsCrearOrden(idOrden.current, orden), firma);
    setGuardando(false);
    if (!esPersona) responsable.despues(error);
    if (error || numero == null) {
      avisar.error(traducirError(error, "guardar la orden de compra"));
      return;
    }
    const proveedor = datos.proveedores.find((p) => p.id === orden.proveedorId)?.nombre ?? "";
    avisar.exito(`${numeroOrdenCompra(numero)} guardada`, {
      detalle:
        datos.siguiente != null && numero !== datos.siguiente
          ? `Otra orden tomó la ${numeroOrdenCompra(datos.siguiente)} un momento antes: esta quedó como ${numeroOrdenCompra(numero)}.`
          : `${proveedor} · ${soles(total)}`,
    });
    // La guardia de «¿Salir sin guardar?» se retira ANTES de navegar (ver useSalidaSinGuardar: juntos, Next podía recargar todo).
    await avisoSalida.retirarYa();
    router.push("/compras/ordenes");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={sede}
        titulo="Nueva orden de compra"
        subtitulo="Lo que le pides al proveedor. La factura y el envío vienen después."
        volver={<Volver href="/compras/ordenes" a="Órdenes de compra" />}
      >
        <div className="anim-sube flex items-end gap-6 text-right" style={{ ["--i" as string]: 1 }}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-taupe-profundo">N.º</p>
            <p className="font-display mt-1 text-2xl tabular-nums text-tinta" title="Se confirma al guardar">
              {datos.siguiente != null ? numeroOrdenCompra(datos.siguiente) : "Al guardar"}
            </p>
          </div>
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
        <section className="card-cayla grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2" aria-label="Proveedor y destino">
          <CampoGuiado id="proveedor" guia={guia} titulo="Proveedor" ayuda="uno por orden">
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
          <CampoGuiado id="destino" guia={guia} titulo="Llega a">
            <CampoSelect
              id="oc-destino"
              caja
              etiqueta="Llega a"
              marcador="Elige a dónde llega"
              valor={orden.destino}
              onValor={(destino) => setOrden((o) => ({ ...o, destino }))}
              opciones={opcionesDestino}
            />
            {orden.destino === POR_REPARTIR && <p className="mt-1.5 text-xs text-taupe">Se separa en Lima y se envía a cada tienda después.</p>}
          </CampoGuiado>
          <CampoGuiado id="entrega" guia={guia} titulo="Entrega estimada" ayuda="si la sabes">
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
          <CampoGuiado id="nota" guia={guia} titulo="Nota" ayuda="opcional">
            <CampoTexto
              id="oc-nota"
              caja
              etiqueta="Nota"
              maxLength={TOPES.nota}
              value={orden.nota}
              onChange={(e) => setOrden((o) => ({ ...o, nota: e.target.value }))}
            />
          </CampoGuiado>
        </section>

        <section className="card-cayla space-y-4 p-5" aria-label="Lo que pides">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl text-tinta">Lo que pides</h2>
            <p className="text-sm tabular-nums text-taupe">
              {orden.lineas.length} {orden.lineas.length === 1 ? "línea" : "líneas"} · {cuantas.toLocaleString("es-PE")} {cuantas === 1 ? "unidad" : "unidades"}
            </p>
          </div>

          {orden.lineas.length === 0 && (
            <CampoGuiado id="lineas" guia={guia}>
              <p className="rounded-xl border border-dashed border-sand p-4 text-sm text-taupe">Agrega al menos una prenda para poder guardar la orden.</p>
            </CampoGuiado>
          )}

          {orden.lineas.map((l, i) => (
            <LineaOrden
              key={l.clave}
              linea={l}
              numero={i + 1}
              guia={guia}
              opcionesCategoria={opcionesCategoria}
              opcionesMarca={opcionesMarca}
              placeholderDescripcion={sugerirDescripcion(categoriaPor.get(l.categoriaId) ?? null).texto}
              onCambio={(cambios) => cambiarLinea(l.clave, cambios)}
              onQuitar={() => quitarLinea(l.clave)}
            />
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand pt-4">
            <Boton type="button" onClick={agregarLinea} disabled={orden.lineas.length >= TOPES.lineas}>
              + Agregar otra prenda
            </Boton>
            <p className="text-sm text-taupe">
              Total <b className="font-display ml-1 text-xl font-normal tabular-nums text-tinta">{soles(total)}</b>
            </p>
          </div>
        </section>

        <section className="space-y-3" aria-label="Guardar">
          {!esPersona && (
            <CampoGuiado id="responsable" guia={guia} titulo="Quién hace la orden" className="max-w-sm">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}
          <PieGuia guia={guia} listo="Todo listo para guardar." />
          <div className="flex flex-wrap justify-end gap-2.5">
            <BotonEnlace href="/compras/ordenes">Cancelar</BotonEnlace>
            <Boton type="submit" peso="primario" cargando={guardando} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {guardando ? "Guardando…" : "Guardar orden"}
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
  opcionesCategoria,
  opcionesMarca,
  placeholderDescripcion,
  onCambio,
  onQuitar,
}: {
  linea: LineaBorrador;
  numero: number;
  guia: ReturnType<typeof useGuiaCampos>;
  opcionesCategoria: OpcionCombo<string>[];
  opcionesMarca: OpcionCombo<string>[];
  placeholderDescripcion: string;
  onCambio: (cambios: Partial<LineaBorrador>) => void;
  onQuitar: () => void;
}) {
  const id = `linea-${l.clave}`;
  const c = calcularLinea(l);
  // El otro lado del descuento, ya calculado: «= S/ 40.00» si se escribió en %, «= 9.17 %» si se escribió en soles.
  const equivalente =
    c.brutoCentimos == null || c.descuentoCentimos === 0
      ? null
      : l.modoDescuento === "pct"
        ? `= ${soles(c.descuentoCentimos / 100)}`
        : `= ${aTexto(Math.round((c.pctEscalado ?? 0) / 100), 2)} %`;

  // Las columnas siguen el ancho de la TARJETA (`@container`), no el de la ventana: con el menú abierto, una laptop deja la tarjeta en
  // ~460 px y la fila de cuatro cifras se montaba (el subtotal sobre el descuento). Angosta: cantidad y precio juntos, el descuento y
  // el subtotal debajo; desde 36 rem de tarjeta, las cuatro en una fila.
  return (
    <CampoGuiado id={id} guia={guia} retiene="fila" className="@container rounded-xl border border-sand bg-papel p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-tinta">{guia.etiqueta(id, `Línea ${numero}`)}</p>
        <button type="button" onClick={onQuitar} className="btn-cayla btn-sutil h-8 w-8 p-0" aria-label={`Quitar la línea ${numero}`} title="Quitar esta línea">
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-x-4 gap-y-3 @md:grid-cols-2">
        <div>
          <p className={TITULO}>Categoría</p>
          <ComboBuscable caja etiquetaAccesible={`Categoría de la línea ${numero}`} marcador="Elige la categoría…" valor={l.categoriaId} onValor={(categoriaId) => onCambio({ categoriaId })} opciones={opcionesCategoria} />
        </div>
        <div>
          <p className={TITULO}>Marca</p>
          <ComboBuscable caja etiquetaAccesible={`Marca de la línea ${numero}`} marcador="Elige la marca…" valor={l.marcaId} onValor={(marcaId) => onCambio({ marcaId })} opciones={opcionesMarca} />
        </div>
        <div className="@md:col-span-2">
          <p className={TITULO}>
            Descripción <span className="text-[12px] font-normal text-taupe">opcional</span>
          </p>
          <CampoTexto caja etiqueta={`Descripción de la línea ${numero}`} maxLength={TOPES.descripcion} placeholder={placeholderDescripcion} value={l.descripcion} onChange={(e) => onCambio({ descripcion: e.target.value })} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 @xl:grid-cols-[minmax(0,7rem)_minmax(0,9rem)_minmax(0,1fr)_auto]">
        <div>
          <p className={TITULO}>Cantidad</p>
          <CampoTexto caja etiqueta={`Cantidad de la línea ${numero}`} inputMode="numeric" placeholder="0" value={l.cantidad} onChange={(e) => onCambio({ cantidad: e.target.value })} />
        </div>
        <div>
          <p className={TITULO}>Precio por unidad</p>
          <CampoTexto caja etiqueta={`Precio por unidad de la línea ${numero}, en soles`} inputMode="decimal" placeholder="0.00" value={l.precio} onChange={(e) => onCambio({ precio: e.target.value })} />
        </div>
        <div className="col-span-2 @xl:col-span-1">
          <p className={TITULO}>
            Descuento <span className="text-[12px] font-normal text-taupe">si hay</span>
          </p>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <CampoTexto
                caja
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
          {equivalente && <p className="mt-1 text-xs tabular-nums text-taupe">{equivalente}</p>}
        </div>
        <div className="col-span-2 flex items-baseline justify-between gap-3 border-t border-sand pt-2 @xl:col-span-1 @xl:block @xl:border-0 @xl:pt-0 @xl:text-right">
          <p className={TITULO}>Subtotal</p>
          <p className="font-display pt-1 text-xl tabular-nums text-tinta">{c.subtotalCentimos == null ? "—" : soles(c.subtotalCentimos / 100)}</p>
        </div>
      </div>
    </CampoGuiado>
  );
}
