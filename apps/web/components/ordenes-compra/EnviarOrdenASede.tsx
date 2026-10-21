"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { Boton, BotonEnlace, CampoSelect, CampoTexto } from "@/components/ui/campos";
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
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import type { EstadoCampo } from "@/lib/guia-campos";
import {
  AVISO_DE_CORTE_ENVIO,
  TOPES_ENVIO,
  argsCrearEnvio,
  camposDelEnvio,
  detalleDeEnvio,
  esEnviable,
  lineasDelEnvio,
  precargarCantidades,
  primerProblema,
  problemaDeCantidad,
  resumenDeAvisosEnvio,
  sugiereRecargar,
  tituloDeEnvio,
  unidadesDelEnvio,
  vaciarCantidades,
  type BorradorEnvio,
  type ContextoEnvio,
} from "@/lib/envio-orden-reglas";
import { hrefOrdenGuardada, numeroOrdenCompra, type DetalleOrden, type LineaDetalle } from "@/lib/ordenes-compra-reglas";
import { crearEnvioDeOrden } from "@/lib/ordenes-compra-acciones";

// Enviar una orden a una sede (ADR-0362, fase 3). Una guía lleva lo de UNA orden a UNA sede: arriba, a dónde va (la tienda de la orden, o
// la que se elige si llegó a Lima «Por repartir»), su número de guía y una nota, los dos opcionales; abajo, qué lleva, línea por línea,
// con lo que le queda por enviar ya puesto. Un cero (o la caja vacía) es «esta línea no va en esta guía»: lo que sobre se envía en otra.
// El comprobante no bloquea (decisión 9): se envía con o sin papel. Un envío no mueve stock: nace «en camino» y el stock entra cuando la
// sede lo recibe (fase 4). Las reglas viven en `crear_envio` (la base las vuelve a exigir todas); aquí se espeja lo que esa función
// rechazaría (`lib/envio-orden-reglas.ts`) para decirlo antes de pulsar.
//
// Quién firma (decisión 39): con la cuenta de una PERSONA firma ella (`orden_compra_envio`); desde una TERMINAL, el combo «Responsable».
// Un doble clic no envía dos veces: el token del envío se genera una vez y la base devuelve el mismo envío si el pedido se repite igual
// (también tras un corte de señal).
//
// La guía de foco (CLAUDE.md «Guía de foco»): cada bloque se enciende cuando es lo que sigue y «Falta: …» sobre el botón lleva a cada cosa.
// Sale de `camposDelEnvio`. En una orden «directo» todo viene listo y el botón ya se puede pulsar; en una «Por repartir» lo primero que
// sigue es la sede.

const TITULO_FIJO = "mb-1.5 flex h-6 items-center gap-x-2 overflow-hidden whitespace-nowrap text-[13px] font-semibold text-tinta";
// Una línea con lugar (sección de 40 rem o más): marca de la guía y número · prenda · lo que queda · cuántas van. Lo comparten el
// encabezado y cada fila.
const FILA_ANCHA = "@min-[40rem]:grid-cols-[2.5rem_minmax(0,1fr)_5.5rem_8rem]";
const CAJA_DE_LINEA = "rounded-xl border border-sand bg-papel p-3 @min-[40rem]:rounded-lg @min-[40rem]:py-2";

type Props = {
  /** Una orden «generada» con algo por enviar: la página no monta el formulario con otra. */
  orden: DetalleOrden;
  /** Las sedes a las que se puede enviar; solo se eligen en una «Por repartir». */
  sedes: { id: string; nombre: string }[];
  sede: string;
};

/** Lo que se muestra cuando el envío no salió: el texto, y si ofrece «Recargar» (lo que quedaba por enviar pudo cambiar). */
type ErrorDeHoja = { texto: string; recargar: boolean };

export function EnviarOrdenASede({ orden, sedes, sede }: Props) {
  const router = useRouter();
  const destino = orden.destino;
  const [sedeId, setSedeId] = useState("");
  const [cantidades, setCantidades] = useState<Record<string, string>>(() => precargarCantidades(orden));
  const [guiaTexto, setGuiaTexto] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  // Ya quedó enviado y la pantalla se está yendo a la lista: el botón no se vuelve a ofrecer en ese ratito (un segundo clic aquí mostraría
  // un segundo aviso, aunque la base devolvería el mismo envío).
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<ErrorDeHoja | null>(null);
  const avisoError = useRef<HTMLDivElement>(null);
  // El token del envío se genera una vez y se reusa en cada reintento: la base devuelve el mismo envío si el pedido es el mismo.
  const [token] = useState(() => crypto.randomUUID());
  // El candado contra dos clics en el mismo instante (ver `enviar`).
  const enVuelo = useRef(false);

  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();

  const ctx: ContextoEnvio = useMemo(
    () => ({ lineas: orden.lineas, sedes: new Set(sedes.map((s) => s.id)), sedeFija: destino?.id ?? null }),
    [orden.lineas, sedes, destino?.id],
  );
  const borrador: BorradorEnvio = { sedeId, cantidades, guia: guiaTexto, nota };
  const campos = camposDelEnvio(borrador, ctx, { pide: !esPersona, listo: responsable.listo, motivo: responsable.motivo });
  const guia = useGuiaCampos(campos, { enModal: false });

  // Lo que llegó listo no se marca con ✓ (regla 4 de la guía): en una orden «directo» todo viene puesto, y diez tildes no dicen nada. Si
  // algo se deja pendiente (se borra una cantidad, se escribe de más), vuelve a llevar su marca.
  const [completosAlAbrir] = useState(() => new Set(campos.filter((c) => c.hecho).map((c) => c.id)));
  const estadoVisible = (id: string): EstadoCampo | null => {
    const estado = guia.estado(id);
    return estado === "hecho" && completosAlAbrir.has(id) ? null : estado;
  };
  const etiqueta = (id: string, texto: ReactNode) => <ConMarca estado={estadoVisible(id)}>{texto}</ConMarca>;

  // «¿Salir sin guardar?»: cuenta lo que la persona cambió (las cantidades vienen puestas).
  const fotoActual = JSON.stringify({ sedeId, cantidades, guiaTexto, nota });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(
    fotoActual !== fotoAlAbrir,
    "Cambiaste lo que va en este envío y todavía no se envió. Si sales ahora, se pierde lo que cambiaste.",
  );

  // El error de la hoja se lleva a la vista y se anuncia (a un lector de pantalla también): estaba debajo del botón que se pulsó.
  useEffect(() => {
    if (error) avisoError.current?.focus();
  }, [error]);

  const opcionesSede = useMemo(() => sedes.map((s) => ({ valor: s.id, texto: s.nombre })), [sedes]);
  const enviables = orden.lineas.filter(esEnviable);
  const unidades = unidadesDelEnvio(orden.lineas, cantidades);
  const lineasQueVan = lineasDelEnvio(orden.lineas, cantidades);
  const yaSalio = orden.lineas.reduce((a, l) => a + (l.enviado ?? 0), 0);
  const nombre = numeroOrdenCompra(orden.numero);
  const nombreSede = destino?.nombre ?? sedes.find((s) => s.id === sedeId)?.nombre ?? "la sede";

  async function irA(href: string) {
    await avisoSalida.retirarYa();
    router.push(href);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviado) return;
    // Dos clics en el MISMO instante: `guardando` es estado de React y se aplica después del clic, así que dejaba pasar dos llamadas. El
    // candado es el de la casa (Nueva orden, Registrar comprobante): una ref que se pone en el mismo tick y se suelta al terminar.
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
    enVuelo.current = true;
    try {
      setError(null);
      setGuardando(true);
      const firma = esPersona ? firmaOmitida("orden_compra_envio") : responsable.firma();
      const { resultado, error: falla } = await crearEnvioDeOrden(argsCrearEnvio(borrador, ctx, token), firma);
      if (!esPersona) responsable.despues(falla);
      if (falla) {
        setGuardando(false);
        // Se cortó la señal: el envío pudo llegar a la base y perderse solo la respuesta. Reintentar sin cambiar nada es seguro (el mismo
        // token con los mismos datos devuelve el mismo envío); decir «no se guardó nada» invitaba a corregir algo creyendo que no existía.
        if (esFalloDeRed(falla)) setError({ texto: AVISO_DE_CORTE_ENVIO, recargar: false });
        else setError({ texto: traducirError(falla, "registrar el envío"), recargar: sugiereRecargar(falla.message) });
        return;
      }
      setEnviado(true);
      setGuardando(false);
      if (resultado) {
        avisar.exito(tituloDeEnvio(resultado, nombreSede), {
          detalle: detalleDeEnvio(nombre, resultado.unidades ?? unidades),
          // «Vuelve a la orden»: la lista la deja marcada y desde aquí se abre encima de ella (abrirla desde esta pantalla la dejaría
          // debajo de la ventana, con el formulario detrás).
          accion: { texto: "Ver la orden", onClick: () => router.push(`/compras/ordenes/ver/${orden.id}`) },
          duracion: 9000,
        });
        const sobrante = resumenDeAvisosEnvio(resultado.avisos);
        if (sobrante) avisar.aviso(sobrante.titulo, { detalle: sobrante.detalle, duracion: 12000 });
      } else {
        // La base contestó sin error pero con algo que no se entiende: el envío pudo quedar registrado.
        avisar.aviso("El envío se registró, pero no pudimos leer la respuesta", { detalle: `Abre ${nombre} y revisa que aparezca en sus envíos.`, duracion: 12000 });
      }
      await irA(hrefOrdenGuardada(destino?.id ?? null, orden.id));
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
  }

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={sede}
        titulo={`Enviar ${nombre}`}
        subtitulo={
          destino
            ? `${orden.proveedor.nombre} · va a ${destino.nombre}. Revisa cuántas salen y envía.`
            : `${orden.proveedor.nombre} · llegó a Lima. Elige a qué sede la mandas y cuántas van.`
        }
        volver={<Volver href="/compras/ordenes" a="Órdenes de compra" />}
      >
        <div data-guia="envio.cifras" className="anim-sube text-right" style={{ ["--i" as string]: 1 }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-taupe-profundo">Va en esta guía</p>
          <p className="font-display mt-1 text-2xl tabular-nums text-tinta" aria-live="polite">
            {unidades.toLocaleString("es-PE")} {unidades === 1 ? "unidad" : "unidades"}
          </p>
        </div>
      </EncabezadoPagina>

      {yaSalio > 0 && (
        <Aviso tono="info" guia="envio.aviso" titulo="Esta orden ya tuvo envíos">
          Ya salieron {yaSalio.toLocaleString("es-PE")} {yaSalio === 1 ? "unidad" : "unidades"}; abajo queda lo que falta por enviar.
        </Aviso>
      )}

      {/* Enviar deja la mercadería en camino hacia una sede: Enter dentro de una caja no lo envía; se envía con el botón. */}
      <form
        onSubmit={enviar}
        noValidate
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
        }}
        className="space-y-6"
      >
        <section data-guia="envio.destino" className="@container card-cayla p-4 sm:p-5" aria-label="A dónde va">
          <div className="grid gap-x-5 gap-y-4 @min-[28rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
            {destino ? (
              <div>
                <p className={TITULO_FIJO}>A qué sede va</p>
                <p className="flex h-10 items-center text-sm font-medium text-tinta">{destino.nombre}</p>
                <p className="mt-1.5 text-xs text-taupe">Esta orden llega directo a esa tienda: solo puede ir ahí.</p>
              </div>
            ) : (
              <CampoGuiado id="sede" guia={guia}>
                <p className={TITULO_FIJO}>{etiqueta("sede", "A qué sede va")}</p>
                <CampoSelect id="envio-sede" caja etiqueta="A qué sede va" marcador="Elige la sede" valor={sedeId} onValor={setSedeId} opciones={opcionesSede} />
                <p className="mt-1.5 text-xs text-taupe">Una guía va a una sola sede. Lo que sobre lo envías en otra.</p>
              </CampoGuiado>
            )}
            <CampoGuiado id="guia" guia={guia}>
              <p className={TITULO_FIJO}>
                {etiqueta("guia", "Número de guía")}
                <span className="text-[12px] font-normal text-taupe">opcional</span>
              </p>
              <CampoTexto id="envio-guia" caja mono etiqueta="Número de guía" maxLength={TOPES_ENVIO.guia} value={guiaTexto} onChange={(e) => setGuiaTexto(e.target.value)} />
            </CampoGuiado>
            <CampoGuiado id="nota" guia={guia} className="@min-[28rem]:col-span-2">
              <p className={TITULO_FIJO}>
                {etiqueta("nota", "Nota")}
                <span className="text-[12px] font-normal text-taupe">opcional</span>
              </p>
              <CampoTexto id="envio-nota" caja etiqueta="Nota" maxLength={TOPES_ENVIO.nota} value={nota} onChange={(e) => setNota(e.target.value)} />
            </CampoGuiado>
          </div>
        </section>

        <section data-guia="envio.lineas" className="@container card-cayla space-y-3 p-4 sm:p-5" aria-label="Qué lleva">
          <TituloSeccion
            accion={
              enviables.length > 1 ? (
                <span className="flex flex-wrap items-center gap-2">
                  <Boton type="button" peso="discreto" className="px-3 py-1.5 text-[11px]" onClick={() => setCantidades(precargarCantidades(orden))}>
                    Todo lo que queda
                  </Boton>
                  <Boton type="button" peso="discreto" className="px-3 py-1.5 text-[11px]" onClick={() => setCantidades(vaciarCantidades(orden))}>
                    Dejar todas en 0
                  </Boton>
                </span>
              ) : undefined
            }
          >
            Qué lleva
          </TituloSeccion>

          {!destino && enviables.length > 1 && (
            <p className="nota-cayla">Esta orden se reparte: deja en cada línea solo lo que va a esta sede. Lo que sobre lo envías después, en otra guía.</p>
          )}

          <div aria-hidden className={`hidden items-end gap-x-2.5 px-3 text-[13px] font-semibold text-tinta @min-[40rem]:grid ${FILA_ANCHA}`}>
            <span />
            <span>Prenda</span>
            <span>Quedan</span>
            <span>Van</span>
          </div>

          {orden.lineas.map((l) => {
            const itemId = l.id;
            return (
              <RenglonDelEnvio
                key={itemId ?? l.posicion}
                linea={l}
                cantidad={itemId ? (cantidades[itemId] ?? "") : ""}
                guia={guia}
                etiqueta={etiqueta}
                estado={estadoVisible}
                onCantidad={(texto) => {
                  if (itemId) setCantidades((c) => ({ ...c, [itemId]: texto }));
                }}
              />
            );
          })}

          <CampoGuiado id="lineas" guia={guia} className="ml-auto w-full max-w-sm pt-2">
            <div data-guia="envio.total" className="flex items-baseline justify-between gap-4 text-sm">
              <span className="text-taupe">
                {lineasQueVan.toLocaleString("es-PE")} {lineasQueVan === 1 ? "línea" : "líneas"} · va en esta guía
              </span>
              <span className="font-display text-xl tabular-nums text-tinta">
                {unidades.toLocaleString("es-PE")} {unidades === 1 ? "unidad" : "unidades"}
              </span>
            </div>
            {unidades === 0 && <p className="mt-1 text-xs text-taupe">Pon cantidad en al menos una prenda.</p>}
          </CampoGuiado>
        </section>

        <section data-guia="envio.enviar" className="space-y-3" aria-label="Enviar">
          {!esPersona && (
            <CampoGuiado id="responsable" guia={guia} titulo="Quién envía" className="max-w-sm">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}
          <PieGuia guia={guia} listo="Todo listo para enviar." />
          {error && (
            <Aviso
              ref={avisoError}
              enfocable
              tono="error"
              titulo="No se pudo registrar el envío"
              accion={error.recargar ? <Boton type="button" onClick={() => window.location.reload()}>Recargar</Boton> : undefined}
            >
              {error.texto}
            </Aviso>
          )}
          <div className="pie-acciones">
            <BotonEnlace href="/compras/ordenes">Cancelar</BotonEnlace>
            <Boton type="submit" peso="primario" cargando={guardando} textoCargando="Enviando…" disabled={enviado} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {enviado ? "Enviado" : "Enviar"}
            </Boton>
          </div>
        </section>
      </form>

      {avisoSalida.aviso}
    </div>
  );
}

/**
 * Una línea de la orden en la guía. Dos caras, según el ancho de la SECCIÓN (`@container`), no de la ventana: con 40 rem o más es UNA FILA
 * (los títulos van una sola vez, arriba); más angosta, una tarjeta que se apila. La que ya salió toda no lleva caja: solo dice que ya salió.
 */
function RenglonDelEnvio({
  linea: l,
  cantidad,
  guia,
  etiqueta,
  estado,
  onCantidad,
}: {
  linea: LineaDetalle;
  cantidad: string;
  guia: ReturnType<typeof useGuiaCampos>;
  etiqueta: (id: string, texto: ReactNode) => ReactNode;
  estado: (id: string) => EstadoCampo | null;
  onCantidad: (texto: string) => void;
}) {
  const prenda = (
    <div className="min-w-0">
      <p className="text-tinta">{[l.categoria, l.marca].join(" · ")}</p>
      {l.descripcion && <p className="text-xs text-taupe">{l.descripcion}</p>}
      <p className="mt-0.5 text-xs tabular-nums text-taupe">
        Pediste {l.cantidad.toLocaleString("es-PE")}
        {l.enviado ? ` · ya salieron ${l.enviado.toLocaleString("es-PE")}` : ""}
      </p>
    </div>
  );

  if (!esEnviable(l) || !l.id) {
    return (
      <div className={`${CAJA_DE_LINEA} opacity-70`}>
        <div className={`grid grid-cols-2 items-start gap-x-2.5 gap-y-2 @min-[40rem]:items-center ${FILA_ANCHA}`}>
          <p className="col-span-2 text-[13px] font-semibold text-tinta @min-[40rem]:hidden">Línea {l.posicion}</p>
          <span className="hidden items-center gap-1 text-[12px] tabular-nums text-taupe @min-[40rem]:inline-flex" title={`Línea ${l.posicion}`}>
            <span aria-hidden className="inline-block h-[18px] w-[18px]" />
            {l.posicion}
          </span>
          <div className="col-span-2 @min-[40rem]:col-span-1">{prenda}</div>
          <p className="col-span-2 text-sm text-verde-profundo">Ya salió todo</p>
        </div>
      </div>
    );
  }

  const id = `linea-${l.id}`;
  const problema = problemaDeCantidad(cantidad, l.porEnviar ?? 0);
  return (
    <CampoGuiado id={id} guia={guia} className={CAJA_DE_LINEA}>
      <div data-guia="envio.renglon" className={`grid grid-cols-2 items-start gap-x-2.5 gap-y-2 @min-[40rem]:items-center ${FILA_ANCHA}`}>
        <p className="col-span-2 text-[13px] font-semibold text-tinta @min-[40rem]:hidden">{etiqueta(id, `Línea ${l.posicion}`)}</p>
        <span className="hidden items-center gap-1 text-[12px] tabular-nums text-taupe @min-[40rem]:inline-flex" title={`Línea ${l.posicion}`}>
          {/* Sin marca (llegó completo), un hueco del mismo ancho: el número no se corre. */}
          {estado(id) ? <MarcaCampo estado={estado(id)!} /> : <span aria-hidden className="inline-block h-[18px] w-[18px]" />}
          {l.posicion}
        </span>
        <div className="col-span-2 @min-[40rem]:col-span-1">{prenda}</div>
        <p className="text-sm tabular-nums text-tinta/80">
          <span className="text-xs text-taupe @min-[40rem]:hidden">Quedan </span>
          {(l.porEnviar ?? 0).toLocaleString("es-PE")}
        </p>
        <div>
          <CampoTexto
            caja
            sinPie={!problema}
            tono={problema ? "error" : undefined}
            pie={problema ?? undefined}
            etiqueta={`Cuántas van de la línea ${l.posicion}`}
            inputMode="numeric"
            placeholder="0"
            value={cantidad}
            onChange={(e) => onCantidad(e.target.value)}
          />
        </div>
      </div>
    </CampoGuiado>
  );
}
