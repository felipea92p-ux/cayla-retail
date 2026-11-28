"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Archive, Check, ClipboardList, MessageCircle, SearchX } from "lucide-react";
import { money } from "@/lib/money";
import type { VarianteBusqueda } from "@/components/PuntoDeVenta";
import { coincide, colaPorAvisar, encendida, paraQuienPedido, textoEstadoPedido, type Apartado, type AvisoApartado, type PedidoApartado } from "@/lib/separaciones-reglas";
import { enPendientes } from "@/lib/apartados-pestanas";
import { adelantosGuardados, comoSePendiente, ordenPendientes, type ComoSePendiente } from "@/lib/apartados-pendientes";
import { listaDicha, prendaDicha } from "@/lib/lista-dicha";
import { ordenarFilas, type OrdenViva } from "@/lib/tabla-viva-reglas";
import { envioConCliente, type PedidoParaSubir } from "@/lib/pedidos-con-cliente-reglas";
import { FotoPrenda, fechaCorta } from "@/components/apartados/piezas";
import type { PrendaApartable } from "@/components/apartados/ApartarVista";
import { AvisoCancelacionModal, CancelarPedidoModal, DevolverModal, EnviarPedidoModal, RecordarModal } from "@/components/apartados/ModalesApartado";
import { DetalleApartadoModal } from "@/components/apartados/DetalleApartado";
import { ApartadoEnFila, columnaCanal, soloElBoton } from "@/components/apartados/filas";
import { useCanalesDeApartados } from "@/components/apartados/CanalChip";
import { SubirPedidoAlAlmacenModal } from "@/components/PedidoClienteModales";
import { Boton } from "@/components/ui/campos";
import { Buscador } from "@/components/ui/Buscador";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { TablaViva, useTablaViva, type ColumnaViva, type FiltroDeAfuera } from "@/components/ui/TablaViva";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";

const APARTADO = { uno: "apartado", varios: "apartados", genero: "m" } as const;
/** El orden de las insignias en el globo de «Estado»: el de la urgencia, como la lista. */
const ORDEN_INSIGNIAS = ["Por devolver", "Vencido", "Vence hoy", "Vence mañana", "Vence en 2 días", "A tiempo"];
const TONO_DE_INSIGNIA = (v: string): TonoChip => (v === "Por devolver" || v === "Vencido" ? "rojo" : v === "A tiempo" ? "verde" : "ambar");

type Fila = { a: Apartado; como: ComoSePendiente };

/** La insignia del estado y su única línea (adónde va la plata, cuándo se cancela solo o cuándo vence). `enLinea`: bajo el nombre. */
function EstadoDeFila({ como, enLinea = false }: { como: ComoSePendiente; enLinea?: boolean }) {
  const debajo = como.debajo ? (como.debajo.tipo === "vence" ? `vence ${fechaCorta(como.debajo.iso)}` : como.debajo.texto) : null;
  return (
    <span className={enLinea ? "mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5" : "block"}>
      <Chip tono={como.tono} vivo={como.clave === "vencida"}>{como.insignia}</Chip>
      {debajo && <span className={enLinea ? "text-sm text-secundario" : "tv-sub"}>{debajo}</span>}
    </span>
  );
}

/**
 * «Pendientes» (ADR-0720): todo lo que sigue vivo, cada apartado una vez, en una sola lista con la forma que Felipe eligió en Recibir
 * (ADR-0676: `TablaViva`, una tarjeta con su cabecera que ordena y filtra). Lo urgente va primero y cada fila lleva un solo botón, solo
 * donde hay algo que hacer hoy: devolver el adelanto o escribirle. Tocar un apartado abierto es cobrarlo y entregarlo (`onAbrir`).
 * Abajo, los pedidos entre tiendas: también son trabajo vivo.
 */
export function PendientesVista({
  ubicacionId,
  ubicacionEtiqueta,
  hoy,
  puedeGestionar,
  cajaAbierta,
  apartados,
  prendas,
  avisos,
  apagadas = [],
  pedidos = [],
  buscarInicial = "",
  onAbrir,
  onBuscarEnHistorial,
  onApartarPedido,
}: {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  hoy: string;
  /** Devolver el adelanto (D5): líder o terminal de ventas. */
  puedeGestionar: boolean;
  cajaAbierta: boolean;
  apartados: Apartado[];
  prendas: VarianteBusqueda[];
  avisos: Record<string, AvisoApartado>;
  /** Lo que la tienda apagó en «Opciones» (paso 5). */
  apagadas?: string[];
  pedidos?: PedidoApartado[];
  /** Lo que se buscaba en el Historial y no estaba ahí: llega escrito. */
  buscarInicial?: string;
  /** Abrir un apartado abierto: su cobro y entrega. */
  onAbrir: (id: string) => void;
  /** El buscador no encontró a nadie aquí: buscarlo en el Historial, con lo escrito. */
  onBuscarEnHistorial: (texto: string) => void;
  onApartarPedido?: (p: PedidoApartado) => void;
}) {
  const porVariante = useMemo(() => new Map(prendas.map((p) => [p.varianteId, p])), [prendas]);
  const ubicacion = { ubicacionId, etiqueta: ubicacionEtiqueta };
  const conEstante = encendida(apagadas, "estante");
  const conLote = encendida(apagadas, "lote");
  const conAbonos = encendida(apagadas, "abonos");
  const conOtraSede = encendida(apagadas, "otra_sede");
  // ADR-0607: con más de un canal a la vista, cada fila dice por cuál se vendió y la lista se puede acotar a uno.
  const canales = useCanalesDeApartados();
  const conCanal = canales.length >= 2;
  const [texto, setTexto] = useState(buscarInicial);
  const [devolver, setDevolver] = useState<Apartado | null>(null);
  const [avisarCancelado, setAvisarCancelado] = useState<Apartado | null>(null);
  const [verDetalle, setVerDetalle] = useState<Apartado | null>(null);
  const filaQueAbrio = useRef<HTMLElement | null>(null);
  // Escribirle (uno o la cola del día): lo avisado en esta visita se marca al instante; la base lo confirma al refrescar.
  const [recordar, setRecordar] = useState<Apartado[] | null>(null);
  const [avisadasAhora, setAvisadasAhora] = useState<ReadonlySet<string>>(() => new Set());
  const avisoDe = (id: string): AvisoApartado | undefined =>
    avisadasAhora.has(id) ? { avisos: (avisos[id]?.avisos ?? 0) + 1, ultimoEn: new Date().toISOString(), ultimoPor: null } : avisos[id];
  const conAvisosAhora = Object.fromEntries(apartados.map((a) => [a.id, avisoDe(a.id)]).filter(([, v]) => v)) as Record<string, AvisoApartado>;
  const { porAvisar, avisadasHoy } = colaPorAvisar(apartados, conAvisosAhora, hoy);
  const [enviarPedido, setEnviarPedido] = useState<PedidoApartado | null>(null);
  const [cancelarPedido, setCancelarPedido] = useState<PedidoApartado | null>(null);
  const [subirPedido, setSubirPedido] = useState<PedidoParaSubir | null>(null);
  const prendaDe = (id: string) => (prendas as PrendaApartable[]).find((p) => p.varianteId === id);

  const vivos = apartados.filter(enPendientes);
  const q = texto.trim();
  const filas: Fila[] = vivos.filter((a) => coincide(a, q)).map((a) => ({ a, como: comoSePendiente(a, hoy, avisoDe(a.id)) }));

  function abrir({ a }: Fila) {
    if (a.estado === "abierta") return onAbrir(a.id);
    // Lo cancelado: quien gestiona le devuelve el adelanto; quien no, ve el apartado.
    filaQueAbrio.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (puedeGestionar) setDevolver(a);
    else setVerDetalle(a);
  }

  /** El único botón de la fila (ADR-0720): devolver, escribirle o, si ya se le escribió hoy, «Avisado hoy» (abre el mensaje otra vez). */
  const accionDe = useCallback(
    (f: Fila) => {
    const { a, como } = f;
    if (como.accion === "devolver") {
      if (puedeGestionar) return <Boton peso="primario" className="btn-chico" onClick={soloElBoton(() => setDevolver(a))}>Devolver</Boton>;
      // Quien no devuelve plata sí puede avisarle que se canceló.
      return a.celular !== "" ? <Boton peso="fantasma" className="btn-chico" onClick={soloElBoton(() => setAvisarCancelado(a))}>Avisarle</Boton> : <span className="text-sm text-tenue">Lo devuelve la líder</span>;
    }
    if (como.accion === "escribir")
      return (
        <Boton peso="fantasma" className="btn-chico" onClick={soloElBoton(() => setRecordar([a]))} aria-label={`Escribirle a ${a.nombres} por WhatsApp`}>
          <span className="inline-flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5" aria-hidden /> Escribirle</span>
        </Boton>
      );
    if (como.accion === "avisado")
      return (
        <Boton peso="fantasma" className="btn-chico border-verde/40 text-verde-profundo" onClick={soloElBoton(() => setRecordar([a]))} aria-label={`Ya se le avisó hoy a ${a.nombres}; escribirle otra vez`} title="Se le avisó hoy">
          <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5" aria-hidden /> Avisado hoy</span>
        </Boton>
      );
    return <span aria-hidden />;
    },
    [puedeGestionar],
  );

  const columnas = useMemo<ColumnaViva<Fila>[]>(() => {
    const cols: ColumnaViva<Fila>[] = [
      {
        clave: "apartado",
        titulo: "Apartado",
        tipo: "texto",
        valor: ({ a }) => `${a.nombres} ${a.apellidos}`,
        principal: true,
        alinear: "izquierda",
        ancho: "minmax(0,2fr)",
        celda: ({ a }, { debajo }) => (
          <ApartadoEnFila
            a={a}
            porVariante={porVariante}
            debajo={debajo}
            etiqueta={`${a.estado === "abierta" ? "Cobrar y entregar" : puedeGestionar ? "Devolver el adelanto de" : "Ver"} el apartado ${a.codigo} de ${a.nombres} ${a.apellidos}`}
          />
        ),
      },
      {
        clave: "estado",
        titulo: "Estado",
        tipo: "opcion",
        valor: ({ como }) => como.insignia,
        ordenOpciones: ORDEN_INSIGNIAS,
        filtra: true,
        ancho: "13rem",
        sinNombreEnTarjeta: true,
        guia: "apartados.pendientes-estado",
        seVa: 740,
        celda: ({ como }) => <EstadoDeFila como={como} />,
        resumen: ({ como }) => <EstadoDeFila como={como} enLinea />,
        dibujarOpcion: (v) => <Chip tono={TONO_DE_INSIGNIA(v)}>{v}</Chip>,
        frase: (v) => listaDicha(v.map((x) => x.toLowerCase()), "o"),
      },
      ...(conCanal ? [columnaCanal<Fila>(canales, (f) => f.a)] : []),
      {
        clave: "falta",
        titulo: "Le falta",
        tipo: "monto",
        valor: ({ como }) => como.falta,
        texto: ({ como }) => (como.falta === null ? "—" : money(como.falta)),
        ancho: "8rem",
        textosOrden: { asc: "Le falta menos primero", desc: "Le falta más primero" },
      },
    ];
    if (conEstante) {
      const ficha = (a: Apartado) =>
        a.estante ? (
          <span className="inline-flex items-center gap-1 rounded-sm vd-gota-chica px-1.5 font-mono text-sm text-tinta">
            <Archive className="h-3 w-3" aria-hidden /> {a.estante}
          </span>
        ) : null;
      cols.push({
        clave: "estante",
        titulo: "Estante",
        tipo: "texto",
        valor: ({ a }) => a.estante,
        ancho: "7rem",
        seVa: 840,
        celda: ({ a }) => ficha(a) ?? <span className="text-tenue">—</span>,
        resumen: ({ a }) => ficha(a),
      });
    }
    cols.push({
      clave: "accion",
      titulo: "",
      tipo: "texto",
      valor: () => null,
      ordena: false,
      ancho: "9.5rem",
      sinNombreEnTarjeta: true,
      celda: (f) => accionDe(f),
    });
    return cols;
  }, [porVariante, conEstante, conCanal, canales, accionDe, puedeGestionar]);

  // De fábrica, lo urgente primero (por devolver, vencido, por vencer, a tiempo): el orden de la columna «Estado».
  const ordenar = useMemo(
    () => (lista: readonly Fila[], orden: OrdenViva) => {
      if (orden.clave !== "estado") return ordenarFilas(lista, columnas.find((c) => c.clave === orden.clave), orden.dir);
      const urgencia = ordenPendientes(lista.map((f) => f.a), hoy).map((a) => lista.find((f) => f.a.id === a.id) as Fila);
      return orden.dir === "asc" ? urgencia : urgencia.reverse();
    },
    [columnas, hoy],
  );
  const tabla = useTablaViva({ filas, columnas, ordenInicial: { clave: "estado", dir: "asc" }, ordenar });
  const deAfuera: FiltroDeAfuera[] = q ? [{ clave: "busqueda", pildora: `Busca: «${q}»`, frase: `con «${q}»`, quitar: () => setTexto("") }] : [];


  return (
    <div className="ap-cuerpo space-y-6 p-5 sm:p-6">
      <section className="@container/barra-filtros space-y-4" aria-label="Apartados pendientes">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Buscador
            valor={texto}
            onCambio={setTexto}
            placeholder="Nombre, DNI, celular o código" // sugerir-fijo: dice por qué se puede buscar; no depende de nada elegido antes
            etiqueta="Buscar un apartado por el nombre, el DNI o el celular del cliente, o por su código"
            guia="apartados.pendientes-buscador"
            className="w-full sm:max-w-sm"
          />
          {/* «Escribirles a los N» es la cola del día del ERP (`colaPorAvisar`): sin quien ya tiene su aviso de hoy. Con uno solo, su fila
              basta; con todos avisados, se dice en el mismo lugar. */}
          {conLote && porAvisar.length > 1 && (
            <Boton peso="fantasma" className="sm:ml-auto" onClick={() => setRecordar(porAvisar)} data-guia="apartados.lote">
              <span className="inline-flex items-center gap-2"><MessageCircle className="h-4 w-4" aria-hidden /> Escribirles a los {porAvisar.length}</span>
            </Boton>
          )}
          {conLote && porAvisar.length === 0 && avisadasHoy.length > 0 && (
            <span data-guia="apartados.lote" className="inline-flex items-center gap-1.5 text-sm font-semibold text-verde-profundo sm:ml-auto">
              <Check className="h-4 w-4" aria-hidden /> Todos avisados hoy
            </span>
          )}
        </div>
        {filas.length === 0 ? (
          q ? (
            // No está aquí: puede que ya se haya entregado o devuelto. El puente lo busca en el Historial con lo escrito (la maqueta aprobada).
            <div className="ap-placa rounded-tarjeta border border-sand py-5">
              <Vacio tamano="chico" icono={<SearchX />} accion={{ texto: "Búscalo en Historial", onClick: () => onBuscarEnHistorial(q) }}>
                Nadie con «{q}» en Pendientes.
              </Vacio>
            </div>
          ) : (
            <Vacio icono={<ClipboardList />} titulo="Nada pendiente">
              Lo que se aparte en {ubicacionEtiqueta} aparecerá aquí hasta que se entregue o se devuelva.
            </Vacio>
          )
        ) : (
          <TablaViva
            tabla={tabla}
            clave={(f) => f.a.id}
            etiqueta={`Apartados pendientes de ${ubicacionEtiqueta}`}
            sustantivo={APARTADO}
            hoy={hoy}
            total={vivos.length}
            cola="pendientes"
            suma={(v) => `${money(adelantosGuardados(v.map((f) => f.a)))} recibidos en adelantos`}
            deAfuera={deAfuera}
            onAbrir={abrir}
            guiaFila="apartados.pendientes-fila"
          />
        )}
      </section>

      {conOtraSede && pedidos.length > 0 && (
        // Los pedidos a otras tiendas (o de ellas): trabajo vivo, con la misma forma de fila.
        <section data-guia="apartados.pedidos" className="ap-placa rounded-2xl border border-sand">
          <TituloSeccion nivel={3} cuenta={pedidos.length} className="border-b border-sand px-5 py-3">
            Pedidos entre tiendas
          </TituloSeccion>
          <ul className="divide-y divide-sand">
            {pedidos.map((pe) => {
              const pr = prendaDe(pe.varianteId);
              const activo = pe.estado === "pedido" || pe.estado === "en_camino" || pe.estado === "llego";
              const envio = pe.direccion === "me_piden" && pe.estado === "pedido" ? envioConCliente(pe.reservaEn) : null;
              const prendaTexto = prendaDicha({ nombre: pr?.referencia ?? "Prenda", color: pr?.color, talla: pr?.talla });
              const pide = Boolean(envio?.subirAlAlmacen || envio?.enviar || (pe.direccion === "pedi" && pe.estado === "llego"));
              return (
                <li key={pe.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                  <FotoPrenda fotoUrl={pr?.fotoUrl} referencia={pr?.referencia ?? "Prenda"} colorHex={pr?.colorHex} categoria={pr?.categoria} categoriaPrefijo={pr?.categoriaPrefijo} categoriaFamilia={pr?.categoriaFamilia} ancho={40} className="w-10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-tinta">{pr?.referencia ?? "Prenda"}</p>
                    <p className="text-sm text-secundario">{prendaDicha({ color: pr?.color, talla: pr?.talla })}</p>
                    <p className="text-sm text-secundario">
                      {pe.trasladoNumero != null ? `Traslado N.º ${pe.trasladoNumero} ${paraQuienPedido(pe).replace(/^Para /, "para ")}` : paraQuienPedido(pe)}
                      {pe.guardadaHasta && `, guardada hasta el ${fechaCorta(pe.guardadaHasta)}`}
                      {pe.estado === "cancelado" && pe.canceladoMotivo && ` (${pe.canceladoMotivo})`}
                    </p>
                  </div>
                  <Chip tono={pide ? "ambar" : pe.estado === "cancelado" ? "apagado" : pe.estado === "llego" ? "verde" : "pizarra"} tachado={false}>
                    {textoEstadoPedido(pe)}
                  </Chip>
                  <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1.5">
                    {activo && pe.estado !== "en_camino" && (
                      <button type="button" onClick={() => setCancelarPedido(pe)} className="btn-enlace text-sm">
                        {pe.direccion === "me_piden" ? "No la tenemos" : "Cancelar el pedido"}
                      </button>
                    )}
                    {envio?.subirAlAlmacen && (
                      <Boton peso={envio.enviar ? "fantasma" : "primario"} className="btn-chico" onClick={() => setSubirPedido({ id: pe.id, prenda: prendaTexto, otraSede: pe.otraSede, reservaEn: pe.reservaEn })}>
                        Subir al almacén
                      </Boton>
                    )}
                    {envio?.enviar && (
                      <Boton peso="primario" className="btn-chico" onClick={() => setEnviarPedido(pe)}>
                        Enviar
                      </Boton>
                    )}
                    {pe.direccion === "pedi" && pe.estado === "llego" && onApartarPedido && (
                      <Boton peso="primario" className="btn-chico" onClick={() => onApartarPedido(pe)} disabled={!cajaAbierta} title={cajaAbierta ? undefined : "Abre la caja para cobrar el adelanto."}>
                        Apartar con adelanto
                      </Boton>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {enviarPedido && <EnviarPedidoModal pedido={enviarPedido} prenda={prendaDe(enviarPedido.varianteId)} ubicacion={ubicacion} onClose={() => setEnviarPedido(null)} />}
      {cancelarPedido && <CancelarPedidoModal pedido={cancelarPedido} ubicacion={ubicacion} onClose={() => setCancelarPedido(null)} />}
      {subirPedido && <SubirPedidoAlAlmacenModal pedido={subirPedido} ubicacion={ubicacion} onClose={() => setSubirPedido(null)} />}
      {recordar && (
        <RecordarModal cola={recordar} ubicacion={ubicacion} hoy={hoy} onAvisada={(id) => setAvisadasAhora((s) => new Set([...s, id]))} onClose={() => setRecordar(null)} />
      )}
      {devolver && (
        <DevolverModal
          apartado={devolver}
          ubicacion={ubicacion}
          cajaAbierta={cajaAbierta}
          onClose={() => setDevolver(null)}
          onAvisar={() => {
            setAvisarCancelado(devolver);
            setDevolver(null);
          }}
        />
      )}
      {avisarCancelado && <AvisoCancelacionModal apartado={avisarCancelado} ubicacion={ubicacion} onClose={() => setAvisarCancelado(null)} />}
      {verDetalle && (
        <DetalleApartadoModal
          apartado={verDetalle}
          ubicacion={ubicacion}
          hoy={hoy}
          cajaAbierta={cajaAbierta}
          puedeGestionar={puedeGestionar}
          conAbonos={conAbonos}
          conEstante={conEstante}
          prendas={prendas}
          modoInicial="ver"
          alCerrarEnfocar={filaQueAbrio}
          onEntregar={(id) => {
            setVerDetalle(null);
            onAbrir(id);
          }}
          onClose={() => setVerDetalle(null)}
        />
      )}
    </div>
  );
}
