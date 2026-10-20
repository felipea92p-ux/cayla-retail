"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Banknote, CircleCheck, CircleHelp, Inbox, MessageSquareText, Smartphone, Truck } from "lucide-react";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { Boton } from "@/components/ui/campos";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip } from "@/components/ui/Chip";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { FiltroPuesto } from "@/components/ui/FiltrosPuestos";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { ResumenSede } from "@/components/ui/ResumenSede";
import { Encabezado, Tabla, fila } from "@/components/ui/Tabla";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { Aviso } from "@/components/ui/Aviso";
import { CaminoDePedidos } from "@/components/tienda-web/CaminoDePedidos";
import { PedidoWebHoja } from "@/components/pedidos-web/PedidoWebHoja";
import { EnviarPedidoWebHoja } from "@/components/pedidos-web/EnviarPedidoWebHoja";
import { EditarMensajePredeterminadoHoja } from "@/components/pedidos-web/EditarMensajePredeterminadoHoja";
import { RegistrarPagoHoja } from "@/components/pedidos-web/RegistrarPagoHoja";
import { AnularPagoHoja } from "@/components/pedidos-web/AnularPagoHoja";
import { AnularPedidoPagadoHoja } from "@/components/pedidos-web/AnularPedidoPagadoHoja";
import { haceCuanto } from "@/lib/vender-hoy-reglas";
import { soles } from "@/lib/precio-sede-reglas";
import {
  agruparPorPestana,
  MENSAJE_PREDETERMINADO_WEB,
  cifrasDe,
  loQueTeToca,
  momentoDe,
  motivoDeCierre,
  NOMBRE_ESTACION,
  pestanaDe,
  porQueSeCerraron,
  relojDeFila,
  todoAlDia,
  verboDe,
  type EnvioPorHacer,
  type PagoDeLista,
  type ParaEnviar,
  type PedidoDeLista,
  type PedidoDetalle,
  type PestanaPedidos,
  type PlazosPedidosWeb,
  type PrendaWeb,
  type TableroPedidosWeb,
  type TonoReloj,
} from "@/lib/pedidos-web-reglas";

const RUTA = "/tienda-web/pedidos";
// En el celular la fila es una tarjeta (pedido y total arriba; el cliente, su plazo y su verbo abajo); desde `sm`, columnas.
const PLANTILLA = "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[6.5rem_minmax(0,1.5fr)_7rem_minmax(0,1.3fr)_9.5rem]";
const COLUMNAS = [{ titulo: "Pedido" }, { titulo: "Cliente y prendas" }, { titulo: "Total", alinear: "der" as const }, { titulo: "Plazo" }, { titulo: "" }];
const COLUMNAS_CERRADOS = [{ titulo: "Pedido" }, { titulo: "Cliente y prendas" }, { titulo: "Total", alinear: "der" as const }, { titulo: "Cómo se cerró" }];
// Lo cerrado que se ve sin abrir «Ver los …» en un día tranquilo (en uno con pedidos, la barra de motivos basta).
const CERRADOS_A_LA_VISTA = 3;

// Una estación filtrada que no tiene nada: qué pasa y cuándo aparece algo.
const VACIOS: Record<Exclude<PestanaPedidos, "cerrados">, { titulo: string; frase: string }> = {
  confirmar: { titulo: "No hay pedidos por confirmar", frase: "Cuando un cliente toque «Separar» en la web, su pedido aparece aquí y te escribe por WhatsApp." },
  cobrar: { titulo: "Nada por cobrar", frase: "Los pedidos confirmados esperan aquí su pago." },
  entregar: { titulo: "Nada por entregar", frase: "Lo pagado que falta recoger aparece aquí." },
};

const TONO_RELOJ: Record<TonoReloj, string> = {
  tinta: "text-tinta",
  ambar: "text-ambar",
  rojo: "text-rojo-profundo",
  verde: "text-verde",
  pizarra: "text-pizarra",
};

// El color de cada motivo en la barra de «por qué se cerraron»: lo entregado en verde, lo que perdió la tienda (nadie lo confirmó, no
// había stock) en rojo y ámbar, lo del cliente en tonos tranquilos. Solo tokens (ADR-0169).
const TONO_MOTIVO: Record<string, string> = {
  entregado: "bg-verde",
  sin_confirmar: "bg-rojo",
  sin_stock: "bg-ambar",
  cliente_desistio: "bg-taupe",
  cliente_no_respondio: "bg-pizarra",
};

/** Una prenda en miniatura (sin foto: el ícono de su categoría sobre su color, ADR-0333). */
export function MiniPrenda({ prenda, tamano = "sm" }: { prenda: PrendaWeb; tamano?: "sm" | "md" | "lg" }) {
  return (
    <MiniaturaPrenda
      fotoUrl={prenda.foto}
      colorHex={prenda.colorHex}
      tamano={tamano}
      prefijo={prenda.categoriaPrefijo}
      familia={prenda.categoriaFamilia}
      categoria={prenda.categoria}
    />
  );
}

/**
 * Tienda web ▸ Pedidos (ADR-0408, actividad 8; ADR-0430 y su actualización del 2026-10-17). Una sola navegación: el CAMINO, cuyas cuatro
 * estaciones cuentan los pedidos de cada paso y filtran la lista (sin filtro, la lista es «Lo que te toca»: todo lo que pide algo, con lo
 * que se pierde arriba). Cada fila dice su plazo una vez y su verbo; el verbo abre la hoja del pedido, donde se hace. Cuando no queda
 * nada, «Todo al día» en una línea. Lo cerrado va al final con por qué se cerró. Lo que antes era una nota de cinco reglas al pie vive en
 * «¿Cómo funciona?», una regla bajo cada estación. Lo cobrado hoy va en la cabecera: no es un paso del pedido.
 *
 * Tocar un pedido lo abre (la URL lo recuerda: `?pedido=`). La hoja confirma, no confirma o anula; lo de enviar abre su propia hoja, y
 * cobrar (actividad 9) también: «Registrar un pago» y «Anular un pago» (o «Devolver») se abren ENCIMA de la del pedido, que se pone al
 * día al guardar; y «Anular el pedido» de uno pagado, igual. Toda escritura pasa por una hoja con el combo «Responsable» (ADR-0162).
 */
export function PedidosWebPantalla({
  tablero,
  tiendaId,
  tienda,
  ahoraIso,
  filtroInicial,
  detalle,
  detalleFallo,
  mensajePredeterminado: mensajeInicial,
}: {
  tablero: TableroPedidosWeb;
  tiendaId: string;
  tienda: string;
  ahoraIso: string;
  filtroInicial: PestanaPedidos | null;
  detalle: PedidoDetalle | null;
  detalleFallo: boolean;
  /** El texto del mensaje predeterminado que guardó la tienda (todas las tiendas). */
  mensajePredeterminado: string;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<PestanaPedidos | null>(filtroInicial);
  const [como, setComo] = useState(false);
  // El texto puede cambiarlo el editor de la cabecera: la pantalla lo guarda para que el pedido abierto lo use sin recargar.
  // Siempre hay texto: si la página no lo trajo, el de fábrica (un `undefined` aquí tumba la pantalla al abrir el editor).
  const [mensaje, setMensaje] = useState(mensajeInicial || MENSAJE_PREDETERMINADO_WEB);
  const [editandoMensaje, setEditandoMensaje] = useState(false);
  // «Ahora» parte de la hora del servidor (el primer dibujo es idéntico en los dos lados) y avanza cada minuto: «se cierra en 3 h».
  const [ahora, setAhora] = useState(() => Date.parse(ahoraIso));
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  // El pedido recién confirmado o cerrado respira una vez en su nuevo lugar.
  const [recien, setRecien] = useState<string | null>(null);
  // Cerrar la hoja no vuelve a pedir la página: se esconde y la URL pierde su `?pedido=` (sin recargar).
  const [cerradoId, setCerradoId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<EnvioPorHacer | null>(null);
  // Cobrar dentro del pedido (actividad 9): las hojas que se abren encima de la del pedido abierto.
  const [pagando, setPagando] = useState(false);
  const [anulandoPago, setAnulandoPago] = useState<PagoDeLista | null>(null);
  const [anulandoPedido, setAnulandoPedido] = useState(false);
  // Un pedido cerrado o anulado se refresca DESPUÉS de cambiar la URL al cerrar la hoja: un refresco pedido antes se perdía.
  const refrescarAlCerrar = useRef(false);

  const plazos = tablero.plazos;
  const cifras = cifrasDe(tablero, ahora);
  const grupos = agruparPorPestana(tablero.pedidos);
  const tocan = loQueTeToca(tablero.pedidos, plazos, ahora);
  const nadaQueHacer = tocan.length === 0 && tablero.paraEnviar.length === 0;
  const abierto = detalle && detalle.id !== cerradoId ? detalle : null;

  const urlCon = (f: PestanaPedidos | null, extra: Record<string, string>) => {
    const q = new URLSearchParams({ ...(f ? { pestana: f } : {}), ...extra }).toString();
    return q ? `${RUTA}?${q}` : RUTA;
  };
  const abrir = (id: string) => {
    setCerradoId(null);
    setPagando(false);
    setAnulandoPago(null);
    setAnulandoPedido(false);
    router.push(urlCon(filtro, { pedido: id }), { scroll: false });
  };
  const cerrar = () => {
    if (detalle) setCerradoId(detalle.id);
    setPagando(false);
    setAnulandoPago(null);
    setAnulandoPedido(false);
    window.history.replaceState(null, "", urlCon(filtro, {}));
    if (refrescarAlCerrar.current) {
      refrescarAlCerrar.current = false;
      router.refresh();
    }
  };
  const ponerFiltro = (f: PestanaPedidos | null) => {
    setFiltro(f);
    window.history.replaceState(null, "", urlCon(f, abierto ? { pedido: abierto.id } : {}));
  };
  // Tocar la estación puesta la quita: vuelve a «Lo que te toca».
  const alternar = (f: PestanaPedidos) => ponerFiltro(filtro === f ? null : f);
  // Tras guardar, el pedido cambia de estación. Con un filtro puesto, el filtro lo sigue; sin filtro, sigue en «Lo que te toca».
  const seguirA = (f: PestanaPedidos) => {
    if (filtro !== null) setFiltro(f);
  };

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={tienda}
        detalle="Tienda web"
        titulo="Pedidos"
        subtitulo={`Lo que separaron en la web para ${tienda}.`}
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            <Boton type="button" peso="fantasma" onClick={() => setEditandoMensaje(true)} data-guia="pedidos-web.mensaje">
              <span className="flex items-center gap-2">
                <MessageSquareText aria-hidden className="-my-1 h-4 w-4 shrink-0" />
                Mensaje predeterminado
              </span>
            </Boton>
            <Boton type="button" peso="fantasma" aria-expanded={como} aria-controls="pedidos-web-reglas" onClick={() => setComo((c) => !c)} data-guia="pedidos-web.como">
              <span className="flex items-center gap-2">
                <CircleHelp aria-hidden className="-my-1 h-4 w-4 shrink-0" />
                ¿Cómo funciona?
              </span>
            </Boton>
          </div>
        }
      >
        {cifras.cobradoHoy > 0 ? (
          <ResumenSede
            sede={tienda}
            cifras={[{ valor: cifras.cobradoHoy, formato: "soles", etiqueta: "Cobrado hoy", icono: Banknote, titulo: "Lo que entró hoy por pagos de pedidos web" }]}
          />
        ) : undefined}
      </EncabezadoPagina>

      {editandoMensaje && (
        <EditarMensajePredeterminadoHoja textoActual={mensaje} tienda={tienda} onClose={() => setEditandoMensaje(false)} onGuardado={setMensaje} />
      )}

      {detalleFallo && (
        <Aviso tono="atencion" titulo="No se pudo abrir ese pedido">
          Puede ser de otra tienda o ya no existir. Elige uno de la lista.
        </Aviso>
      )}

      {/* En un día tranquilo el camino solo diría ceros: se ve si hay algo, o si se pidió «¿Cómo funciona?». */}
      {(!nadaQueHacer || como || filtro !== null) && (
        <CaminoDePedidos
          cifras={cifras}
          plazos={plazos}
          etiqueta="El camino de los pedidos web: cada estación muestra los pedidos de ese paso"
          filtro={filtro}
          onFiltrar={alternar}
          conReglas={como}
          idReglas="pedidos-web-reglas"
          guia="pedidos-web.cifras"
          guiaEntregar="pedidos-web.estacion-entregar"
        />
      )}

      {tablero.paraEnviar.length > 0 && (
        <ParaEnviarSeccion
          paraEnviar={tablero.paraEnviar}
          onEnviar={(e) => setEnviando({ pedidoId: e.pedidoId, codigo: e.codigo, tiendaPedido: e.tienda, desdeId: tiendaId, desde: tienda, lineas: e.lineas })}
        />
      )}

      {nadaQueHacer && filtro === null ? (
        <section className="card-cayla">
          <Vacio icono={<CircleCheck />} titulo="Todo al día" guia="pedidos-web.todo-al-dia">
            {todoAlDia(tablero.pedidos, tienda, ahora)} Cuando llegue uno, lo verás aquí y con su número en el menú.
          </Vacio>
        </section>
      ) : filtro === "cerrados" ? (
        <CerradosSeccion pedidos={grupos.cerrados} ahora={ahora} filtrado onQuitar={() => ponerFiltro(null)} onAbrir={abrir} abiertoId={abierto?.id ?? null} />
      ) : (
        <ListaSeccion
          filtro={filtro}
          pedidos={filtro === null ? tocan : tocan.filter((p) => pestanaDe(p.estado) === filtro)}
          plazos={plazos}
          ahora={ahora}
          abiertoId={abierto?.id ?? null}
          recien={recien}
          onAbrir={abrir}
          onQuitar={() => ponerFiltro(null)}
        />
      )}

      {filtro === null && grupos.cerrados.length > 0 && (
        <CerradosSeccion
          pedidos={grupos.cerrados}
          ahora={ahora}
          aLaVista={nadaQueHacer ? CERRADOS_A_LA_VISTA : 0}
          onAbrir={abrir}
          abiertoId={abierto?.id ?? null}
        />
      )}

      {abierto && (
        <PedidoWebHoja
          key={abierto.id}
          pedido={abierto}
          tiendaId={tiendaId}
          tienda={tienda}
          ahora={ahora}
          mensajePredeterminado={mensaje}
          onClose={cerrar}
          onCambio={(estado, opciones) => {
            setRecien(abierto.id);
            if (estado === "anulado") {
              seguirA("cerrados");
              // Anulado con plata por devolver: la hoja sigue abierta y el pedido se relee ya. Si se cierra, al cerrar.
              if (opciones?.sigueAbierta) router.refresh();
              else refrescarAlCerrar.current = true;
              return;
            }
            if (estado === "entregado") {
              // Entregado (actividad 10): la hoja se cierra y, al cerrarse, la lista se pone al día con el pedido en «Cerrados».
              seguirA("cerrados");
              refrescarAlCerrar.current = true;
              return;
            }
            if (estado === "confirmado") seguirA("cobrar");
            router.refresh();
          }}
          onEnviar={(desdeId) => {
            const grupo = abierto.lineas.filter((l) => l.estado === "reservada" && l.ubicacionId === desdeId);
            if (grupo.length === 0) return;
            setEnviando({
              pedidoId: abierto.id,
              codigo: abierto.codigo,
              tiendaPedido: abierto.tienda,
              desdeId,
              desde: grupo[0]!.tiendaReserva ?? "otra tienda",
              lineas: grupo,
            });
          }}
          onReleer={() => router.refresh()}
          onPagar={() => setPagando(true)}
          onAnularPago={(g) => setAnulandoPago(g)}
          onAnularPedido={() => {
            // Lo que pasa con la boleta cambia en segundos (sale a SUNAT, la aceptan): la hoja de anular se abre con el pedido releído.
            setAnulandoPedido(true);
            router.refresh();
          }}
        />
      )}
      {abierto && pagando && (
        <RegistrarPagoHoja
          key={`pago-${abierto.id}`}
          pedido={abierto}
          onClose={() => setPagando(false)}
          onRegistrado={(estado) => {
            setRecien(abierto.id);
            // Pagado completo: pasa a «Por entregar».
            if (estado === "pagado") seguirA("entregar");
            router.refresh();
          }}
        />
      )}
      {abierto && anulandoPago && (
        <AnularPagoHoja
          key={`anular-${anulandoPago.id}`}
          pedido={abierto}
          pago={anulandoPago}
          ahora={ahora}
          onClose={() => setAnulandoPago(null)}
          onAnulado={() => {
            setRecien(abierto.id);
            router.refresh();
          }}
        />
      )}
      {abierto && anulandoPedido && (
        <AnularPedidoPagadoHoja
          key={`anular-pedido-${abierto.id}`}
          pedido={abierto}
          onClose={() => setAnulandoPedido(false)}
          onReleer={() => router.refresh()}
          onAnulado={() => {
            // La hoja del pedido se queda abierta y se relee: muestra lo que se devolvió y cómo quedó su boleta. En la lista pasa a
            // «Cerrados» (o, si queda plata por devolver, sigue en «Lo que te toca»).
            setRecien(abierto.id);
            seguirA("cerrados");
            router.refresh();
          }}
        />
      )}
      {enviando && (
        <EnviarPedidoWebHoja
          envio={enviando}
          onClose={() => setEnviando(null)}
          onEnviado={() => {
            setEnviando(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** «Lo que te toca» (sin filtro) o los pedidos de una estación. Una estación vacía dice qué pasa y deja quitar el filtro. */
function ListaSeccion({
  filtro,
  pedidos,
  plazos,
  ahora,
  abiertoId,
  recien,
  onAbrir,
  onQuitar,
}: {
  filtro: Exclude<PestanaPedidos, "cerrados"> | null;
  pedidos: PedidoDeLista[];
  plazos: PlazosPedidosWeb;
  ahora: number;
  abiertoId: string | null;
  recien: string | null;
  onAbrir: (id: string) => void;
  onQuitar: () => void;
}) {
  const titulo = filtro ? NOMBRE_ESTACION[filtro] : "Lo que te toca";
  return (
    <section className="card-cayla space-y-0" data-guia="pedidos-web.lista">
      <TituloSeccion
        cuenta={pedidos.length}
        dato={filtro ? undefined : "Primero lo que se pierde si no actúas"}
        accion={
          filtro ? (
            <FiltroPuesto onQuitar={onQuitar} etiqueta={`Quitar el filtro «${titulo}»`} guia="pedidos-web.quitar-filtro">
              {titulo}
            </FiltroPuesto>
          ) : undefined
        }
        className="border-b border-sand px-5 py-4"
      >
        {titulo}
      </TituloSeccion>
      {pedidos.length === 0 ? (
        filtro ? (
          <Vacio icono={<Smartphone />} titulo={VACIOS[filtro].titulo} filtros={[{ texto: titulo, onQuitar }]}>
            {VACIOS[filtro].frase}
          </Vacio>
        ) : (
          // Solo pasa si lo único pendiente es enviar algo a otra tienda: de los clientes de aquí, nada.
          <Vacio tamano="chico" icono={<Inbox />}>
            Ningún cliente de esta tienda espera nada.
          </Vacio>
        )
      ) : (
        <Tabla className="rounded-none border-0 shadow-none">
          <Encabezado plantilla={PLANTILLA} columnas={COLUMNAS} />
          {pedidos.map((p, i) => (
            <FilaPedido key={p.id} pedido={p} ahora={ahora} plazos={plazos} indice={i} abierto={abiertoId === p.id} recien={recien === p.id} primera={i === 0} onAbrir={() => onAbrir(p.id)} />
          ))}
        </Tabla>
      )}
    </section>
  );
}

/** Lo que abre una fila entera: el clic (que no suba desde la hoja abierta, que vive en un portal) y Enter o Espacio. */
function abreConLaFila(onAbrir: () => void) {
  return {
    role: "row" as const,
    tabIndex: 0,
    onClick: (e: React.MouseEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.target as Node)) return;
      onAbrir();
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onAbrir();
      }
    },
  };
}

/** Las prendas de un pedido en miniatura (hasta 4 y «+n»). */
function Prendas({ pedido: p }: { pedido: PedidoDeLista }) {
  const vistas = p.prendasVista.slice(0, 4);
  return (
    <span className="flex shrink-0 items-center gap-1.5" aria-label={`${p.prendas} ${p.prendas === 1 ? "prenda" : "prendas"}`}>
      {vistas.map((v, i) => (
        <MiniPrenda key={i} prenda={v} />
      ))}
      {p.prendasVista.length > vistas.length && <span className="text-[12px] text-taupe">+{p.prendasVista.length - vistas.length}</span>}
    </span>
  );
}

/** Un pedido que pide algo: el número y hace cuánto, el cliente con sus prendas, el total, su plazo (una vez) y su verbo. Toda la fila
 *  lo abre; el verbo dice qué toca y abre lo mismo. */
function FilaPedido({
  pedido: p,
  ahora,
  plazos,
  indice,
  abierto,
  recien,
  primera,
  onAbrir,
}: {
  pedido: PedidoDeLista;
  ahora: number;
  plazos: PlazosPedidosWeb;
  indice: number;
  abierto: boolean;
  recien: boolean;
  primera: boolean;
  onAbrir: () => void;
}) {
  const reloj = relojDeFila(p, plazos, ahora);
  const verbo = verboDe(p);
  return (
    <div
      {...abreConLaFila(onAbrir)}
      aria-current={abierto ? "true" : undefined}
      data-recien={recien ? "" : undefined}
      className={fila(PLANTILLA, "cursor-pointer items-center sm:items-center")}
    >
      <span className="min-w-0">
        <button
          type="button"
          onClick={(e) => {
            // La fila también abre: sin esto, el clic subiría y abriría dos veces.
            e.stopPropagation();
            onAbrir();
          }}
          className="font-semibold tabular-nums text-tinta hover:text-rojo-profundo"
          data-guia={primera ? "pedidos-web.abrir" : undefined}
        >
          {p.codigo}
        </button>
        <span className="block text-[12px] text-taupe">{haceCuanto(momentoDe(p), ahora)}</span>
      </span>
      <span className="text-right font-medium tabular-nums text-tinta sm:hidden">{soles(p.total)}</span>
      <span className="col-span-2 flex min-w-0 items-center gap-3 sm:col-span-1">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <AvatarPersona personaId={null} nombre={p.cliente} tamano={24} />
          <span className="truncate text-tinta">{p.cliente}</span>
        </span>
        <Prendas pedido={p} />
      </span>
      <span className="hidden text-right tabular-nums sm:block">
        <span className="block font-medium text-tinta">{soles(p.total)}</span>
        {p.estado === "confirmado" && p.pagado > 0 && <span className="block text-[12px] text-taupe">falta {soles(p.falta)}</span>}
      </span>
      <span className="col-span-2 min-w-0 sm:col-span-1" data-guia={primera ? "pedidos-web.plazo" : undefined}>
        <span className={`block text-[13px] font-medium ${TONO_RELOJ[reloj.tono]}`}>{reloj.texto}</span>
        {reloj.detalle && <span className="block text-[12px] text-taupe">{reloj.detalle}</span>}
        {/* El reloj de su plazo (ADR-0430): cuánto lleva del tiempo de este paso; se llena una vez al verse. */}
        {reloj.barra && <BarraAvance pct={reloj.barra.pct} alto="fina" tono={reloj.barra.tono} indice={indice} etiqueta={reloj.barra.etiqueta} className="mt-1.5 block max-w-[11rem]" />}
      </span>
      <span className="col-span-2 flex sm:col-span-1 sm:justify-end">
        {verbo && (
          <Boton
            type="button"
            peso="fantasma"
            aria-haspopup="dialog"
            className="btn-chico w-full sm:w-auto"
            onClick={(e) => {
              e.stopPropagation();
              onAbrir();
            }}
            data-guia={primera ? "pedidos-web.verbo" : undefined}
          >
            <span className="flex items-center justify-center gap-2">
              {verbo}
              <ArrowRight aria-hidden className="-my-1 h-4 w-4 shrink-0" />
            </span>
          </Boton>
        )}
      </span>
    </div>
  );
}

/**
 * Lo cerrado en los últimos 30 días: por qué se cerró, en una barra (lo entregado, lo que perdió la tienda, lo del cliente), y sus filas.
 * Al pie de «Lo que te toca» las filas se guardan tras «Ver los …» (en un día tranquilo se ven las primeras, porque es lo único que hay);
 * con la estación «Cerrados» puesta, se ven todas.
 */
function CerradosSeccion({
  pedidos,
  ahora,
  filtrado = false,
  aLaVista = 0,
  abiertoId,
  onAbrir,
  onQuitar,
}: {
  pedidos: PedidoDeLista[];
  ahora: number;
  filtrado?: boolean;
  aLaVista?: number;
  abiertoId: string | null;
  onAbrir: (id: string) => void;
  onQuitar?: () => void;
}) {
  const [abiertos, setAbiertos] = useState(false);
  const motivos = porQueSeCerraron(pedidos);
  const sinStock = motivos.find((m) => m.clave === "sin_stock")?.cuantos ?? 0;
  const visibles = filtrado ? pedidos : pedidos.slice(0, aLaVista);
  const guardados = filtrado ? [] : pedidos.slice(aLaVista);
  const filaCerrada = (p: PedidoDeLista) => {
    const m = motivoDeCierre(p);
    const porDevolver = p.estado === "anulado" && p.pagado > 0;
    return (
      <div key={p.id} {...abreConLaFila(() => onAbrir(p.id))} aria-current={abiertoId === p.id ? "true" : undefined} className={fila(PLANTILLA, "cursor-pointer items-center sm:items-center")}>
        <span className="min-w-0">
          <span className="font-semibold tabular-nums text-tinta">{p.codigo}</span>
          <span className="block text-[12px] text-taupe">{haceCuanto(momentoDe(p), ahora)}</span>
        </span>
        <span className="text-right font-medium tabular-nums text-tinta sm:hidden">{soles(p.total)}</span>
        <span className="col-span-2 flex min-w-0 items-center gap-3 sm:col-span-1">
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <AvatarPersona personaId={null} nombre={p.cliente} tamano={24} />
            <span className="truncate text-tinta">{p.cliente}</span>
          </span>
          <Prendas pedido={p} />
        </span>
        <span className="hidden text-right font-medium tabular-nums text-tinta sm:block">{soles(p.total)}</span>
        <span className="col-span-2 min-w-0 sm:col-span-2">
          <Chip tono={porDevolver ? "rojo" : "neutro"}>{porDevolver ? `Por devolver ${soles(p.pagado)}` : m.texto}</Chip>
        </span>
      </div>
    );
  };
  return (
    <section className="card-cayla space-y-0" data-guia="pedidos-web.cerrados">
      <TituloSeccion
        cuenta={pedidos.length}
        accion={
          filtrado && onQuitar ? (
            <FiltroPuesto onQuitar={onQuitar} etiqueta="Quitar el filtro «Cerrados»" guia="pedidos-web.quitar-filtro">
              Cerrados
            </FiltroPuesto>
          ) : undefined
        }
        className="border-b border-sand px-5 py-4"
      >
        {filtrado ? "Cerrados" : "Cerrados en los últimos 30 días"}
      </TituloSeccion>
      {pedidos.length === 0 ? (
        <Vacio icono={<Smartphone />} titulo="Todavía no hay pedidos cerrados" filtros={onQuitar ? [{ texto: "Cerrados", onQuitar }] : undefined}>
          Aquí quedan, por 30 días, los entregados, los que nadie confirmó a tiempo y los anulados.
        </Vacio>
      ) : (
        <>
          <div className={`space-y-2.5 px-5 py-4 ${visibles.length > 0 || guardados.length > 0 ? "border-b border-sand" : ""}`}>
            <BarraApilada
              decorativa
              alto={8}
              etiqueta="Por qué se cerraron"
              segmentos={motivos.map((m) => ({ clave: m.clave, nombre: m.texto, valor: m.cuantos, clase: TONO_MOTIVO[m.clave] ?? "bg-tinta/25" }))}
            />
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-tinta/75">
              {motivos.map((m) => (
                <li key={m.clave} className="inline-flex items-center gap-1.5">
                  <MuestraTramo clase={TONO_MOTIVO[m.clave] ?? "bg-tinta/25"} />
                  {m.texto} · <b className="font-semibold tabular-nums text-tinta">{m.cuantos}</b>
                </li>
              ))}
            </ul>
            {sinStock > 0 && (
              <p className="text-[12.5px] text-taupe">Si «no hay stock» crece, la vitrina está mostrando prendas que esta tienda no tiene.</p>
            )}
          </div>
          {(visibles.length > 0 || guardados.length > 0) && (
            <Tabla className="rounded-none border-0 shadow-none">
              {filtrado && <Encabezado plantilla={PLANTILLA} columnas={COLUMNAS_CERRADOS} />}
              {visibles.map(filaCerrada)}
              {guardados.length > 0 && <FilasDeMas abierto={abiertos} id="pedidos-web-cerrados">{guardados.map(filaCerrada)}</FilasDeMas>}
            </Tabla>
          )}
          {guardados.length > 0 && (
            <BotonVerMas
              abierto={abiertos}
              onCambiar={setAbiertos}
              controla="pedidos-web-cerrados"
              texto={visibles.length > 0 ? `Ver ${guardados.length} más` : `Ver los ${guardados.length}`}
            />
          )}
        </>
      )}
    </section>
  );
}

/** Lo que otra tienda espera de aquí: esta tienda lo envía (la hoja arma el traslado). Sin el cliente: no es de esta tienda. */
function ParaEnviarSeccion({ paraEnviar, onEnviar }: { paraEnviar: ParaEnviar[]; onEnviar: (e: ParaEnviar) => void }) {
  const prendas = paraEnviar.reduce((a, e) => a + e.lineas.length, 0);
  return (
    <section className="space-y-3" data-guia="pedidos-web.para-enviar">
      <TituloSeccion cuenta={prendas} dato="Reservadas aquí para un pedido web de otra tienda">
        Para enviar a otra tienda
      </TituloSeccion>
      <ul className="card-cayla divide-y divide-sand">
        {paraEnviar.map((e, i) => (
          <li key={e.pedidoId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
            <Truck aria-hidden className="h-4 w-4 shrink-0 text-taupe" />
            {/* Con base de 15rem: en el celular el botón baja a su propia línea en vez de apretar el texto a una palabra por línea. */}
            <span className="min-w-0 flex-1 basis-60">
              <span className="block font-semibold text-tinta">
                {e.codigo} <span className="font-normal text-taupe">· para {e.tienda}</span>
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-taupe">
                {e.lineas.map((l) => (
                  <span key={l.lineaId} className="inline-flex items-center gap-1.5">
                    <MiniPrenda prenda={l} />
                    {[l.referencia, l.color, l.talla].filter(Boolean).join(" · ")}
                    {l.lugar === "piso" ? " (colgada en el piso)" : l.lugar === "almacen" ? " (en el almacén)" : ""}
                  </span>
                ))}
              </span>
            </span>
            <Boton type="button" peso="primario" aria-haspopup="dialog" onClick={() => onEnviar(e)} data-guia={i === 0 ? "pedidos-web.enviar" : undefined}>
              Enviar a {e.tienda}
            </Boton>
          </li>
        ))}
      </ul>
    </section>
  );
}
