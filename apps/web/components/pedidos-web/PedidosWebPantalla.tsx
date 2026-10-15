"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Smartphone, Truck } from "lucide-react";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { Pestanas } from "@/components/ui/Pestanas";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { Encabezado, Tabla, fila } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";
import { PedidoWebHoja } from "@/components/pedidos-web/PedidoWebHoja";
import { EnviarPedidoWebHoja } from "@/components/pedidos-web/EnviarPedidoWebHoja";
import { RegistrarPagoHoja } from "@/components/pedidos-web/RegistrarPagoHoja";
import { AnularPagoHoja } from "@/components/pedidos-web/AnularPagoHoja";
import { haceCuanto } from "@/lib/vender-hoy-reglas";
import { soles } from "@/lib/precio-sede-reglas";
import {
  agruparPorPestana,
  cifrasDe,
  estadoVisible,
  momentoDe,
  PESTANAS_PEDIDOS,
  plazoCorto,
  URGENTE_MS,
  type EnvioPorHacer,
  type PagoDeLista,
  type ParaEnviar,
  type PedidoDeLista,
  type PedidoDetalle,
  type PestanaPedidos,
  type PrendaWeb,
  type TableroPedidosWeb,
} from "@/lib/pedidos-web-reglas";

const RUTA = "/vender/pedidos-web";
// En el celular la fila es una tarjeta (pedido y estado arriba, prendas y total abajo); desde `sm`, columnas.
const PLANTILLA = "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[6.5rem_minmax(0,1.2fr)_7.5rem_6.5rem_minmax(0,1.5fr)]";

const VACIOS: Record<PestanaPedidos, { titulo: string; frase: string }> = {
  confirmar: { titulo: "No hay pedidos por confirmar", frase: "Cuando un cliente toque «Separar» en la web, su pedido aparece aquí y te escribe por WhatsApp." },
  cobrar: { titulo: "Nada por cobrar", frase: "Los pedidos confirmados esperan aquí su pago." },
  entregar: { titulo: "Nada por entregar", frase: "Lo pagado que falta recoger aparece aquí." },
  cerrados: { titulo: "Todavía no hay pedidos cerrados", frase: "Aquí quedan, por 30 días, los entregados, los que se cerraron sin confirmar y los anulados." },
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
 * Ventas ▸ Pedidos web (ADR-0408, actividad 8; maqueta v4, «Pedidos web»): las cifras de la tienda (cada una lleva a su pestaña),
 * lo que otra tienda espera de aquí («Para enviar»), y la lista en sus cuatro pestañas. Tocar un pedido lo abre (la URL lo recuerda:
 * `?pedido=`). La hoja confirma, no confirma o anula; lo de enviar abre su propia hoja, y cobrar (actividad 9) también: «Registrar un
 * pago» y «Anular un pago» (o «Devolver») se abren ENCIMA de la del pedido, que se pone al día al guardar. Toda escritura pasa por
 * una hoja con el combo «Responsable» (ADR-0162).
 */
export function PedidosWebPantalla({
  tablero,
  tiendaId,
  tienda,
  ahoraIso,
  pestanaInicial,
  detalle,
  detalleFallo,
}: {
  tablero: TableroPedidosWeb;
  tiendaId: string;
  tienda: string;
  ahoraIso: string;
  pestanaInicial: PestanaPedidos | null;
  detalle: PedidoDetalle | null;
  detalleFallo: boolean;
}) {
  const router = useRouter();
  const grupos = agruparPorPestana(tablero.pedidos);
  // La pestaña de entrada: la pedida en la URL, o la primera con algo (empezando por lo que vence); si no hay nada abierto pero queda
  // plata por devolver de un anulado, «Cerrados» (es lo único que falta hacer).
  const [pestana, setPestana] = useState<PestanaPedidos>(
    () =>
      pestanaInicial ??
      (["confirmar", "cobrar", "entregar"] as const).find((p) => grupos[p].length > 0) ??
      (grupos.cerrados.some((p) => p.estado === "anulado" && p.pagado > 0) ? "cerrados" : "confirmar"),
  );
  // «Ahora» parte de la hora del servidor (el primer dibujo es idéntico en los dos lados) y avanza cada minuto: «vence en 3 h».
  const [ahora, setAhora] = useState(() => Date.parse(ahoraIso));
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  // El pedido recién confirmado o cerrado respira una vez en su nueva pestaña.
  const [recien, setRecien] = useState<string | null>(null);
  // Cerrar la hoja no vuelve a pedir la página: se esconde y la URL pierde su `?pedido=` (sin recargar).
  const [cerradoId, setCerradoId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<EnvioPorHacer | null>(null);
  // Cobrar dentro del pedido (actividad 9): las hojas que se abren encima de la del pedido abierto.
  const [pagando, setPagando] = useState(false);
  const [anulandoPago, setAnulandoPago] = useState<PagoDeLista | null>(null);
  // Un pedido cerrado o anulado se refresca DESPUÉS de cambiar la URL al cerrar la hoja: un refresco pedido antes se perdía.
  const refrescarAlCerrar = useRef(false);

  const cifras = cifrasDe(tablero, ahora);
  const lista = grupos[pestana];
  const abierto = detalle && detalle.id !== cerradoId ? detalle : null;
  const plazos = tablero.plazos;

  const urlCon = (extra: Record<string, string>) => `${RUTA}?${new URLSearchParams({ pestana, ...extra }).toString()}`;
  const abrir = (id: string) => {
    setCerradoId(null);
    setPagando(false);
    setAnulandoPago(null);
    router.push(urlCon({ pedido: id }), { scroll: false });
  };
  const cerrar = () => {
    if (detalle) setCerradoId(detalle.id);
    setPagando(false);
    setAnulandoPago(null);
    window.history.replaceState(null, "", urlCon({}));
    if (refrescarAlCerrar.current) {
      refrescarAlCerrar.current = false;
      router.refresh();
    }
  };
  const cambiarPestana = (p: PestanaPedidos) => {
    setPestana(p);
    window.history.replaceState(null, "", `${RUTA}?${new URLSearchParams({ pestana: p, ...(abierto ? { pedido: abierto.id } : {}) }).toString()}`);
  };

  return (
    <div className="space-y-6">
      {detalleFallo && (
        <Aviso tono="atencion" titulo="No se pudo abrir ese pedido">
          Puede ser de otra tienda o ya no existir. Elige uno de la lista.
        </Aviso>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-guia="pedidos-web.cifras">
        <TarjetaCifra
          punto={cifras.porConfirmar > 0 ? (cifras.proximoVenceEnMs !== null && cifras.proximoVenceEnMs < URGENTE_MS ? "rojo" : "ambar") : "neutro"}
          etiqueta="Por confirmar"
          className="anim-entra"
          style={{ ["--i" as string]: 0 }}
          valor={<CifraQueCuenta valor={cifras.porConfirmar} alMontar />}
          activa={pestana === "confirmar"}
          onClick={() => cambiarPestana("confirmar")}
        >
          {cifras.proximoVenceEnMs !== null ? `El próximo vence en ${plazoCorto(cifras.proximoVenceEnMs)}` : "Nada esperando"}
        </TarjetaCifra>
        <TarjetaCifra
          punto={cifras.sinPagar > 0 ? "rojo" : cifras.confirmados > 0 ? "ambar" : "neutro"}
          etiqueta="Por cobrar"
          className="anim-entra"
          style={{ ["--i" as string]: 1 }}
          valor={<CifraQueCuenta valor={cifras.porCobrar} formato="soles" alMontar />}
          activa={pestana === "cobrar"}
          onClick={() => cambiarPestana("cobrar")}
        >
          {cifras.sinPagar > 0
            ? `${cifras.sinPagar} sin pagar hace más de ${plazos.horasAvisoSinPagar} h`
            : cifras.confirmados === 0
              ? "Nada por cobrar"
              : `${cifras.confirmados} ${cifras.confirmados === 1 ? "pedido confirmado" : "pedidos confirmados"}`}
        </TarjetaCifra>
        <TarjetaCifra
          punto={cifras.sinRecoger > 0 ? "rojo" : cifras.porEntregar > 0 ? "verde" : "neutro"}
          etiqueta="Por entregar"
          className="anim-entra"
          style={{ ["--i" as string]: 2 }}
          valor={<CifraQueCuenta valor={cifras.porEntregar} alMontar />}
          activa={pestana === "entregar"}
          onClick={() => cambiarPestana("entregar")}
        >
          {cifras.sinRecoger > 0 ? `${cifras.sinRecoger} sin recoger hace más de ${plazos.diasAvisoSinRecoger} días` : "Pagados"}
        </TarjetaCifra>
        {cifras.porDevolver > 0 ? (
          // Plata de clientes en pedidos anulados: lo que falta hacer con el dinero va primero (lleva a «Cerrados»).
          <TarjetaCifra
            punto="rojo"
            etiqueta="Cobrado hoy"
            className="anim-entra"
            style={{ ["--i" as string]: 3 }}
            valor={<CifraQueCuenta valor={cifras.cobradoHoy} formato="soles" alMontar />}
            activa={pestana === "cerrados"}
            onClick={() => cambiarPestana("cerrados")}
          >
            {`${soles(cifras.porDevolver)} por devolver en ${cifras.pedidosPorDevolver} ${cifras.pedidosPorDevolver === 1 ? "pedido anulado" : "pedidos anulados"}`}
          </TarjetaCifra>
        ) : (
          <TarjetaCifra
            punto="neutro"
            etiqueta="Cobrado hoy"
            className="anim-entra"
            style={{ ["--i" as string]: 3 }}
            valor={<CifraQueCuenta valor={cifras.cobradoHoy} formato="soles" alMontar />}
          >
            En pedidos web
          </TarjetaCifra>
        )}
      </div>

      {tablero.paraEnviar.length > 0 && (
        <ParaEnviarSeccion
          paraEnviar={tablero.paraEnviar}
          onEnviar={(e) => setEnviando({ pedidoId: e.pedidoId, codigo: e.codigo, tiendaPedido: e.tienda, desdeId: tiendaId, desde: tienda, lineas: e.lineas })}
        />
      )}

      <section className="card-cayla space-y-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-sand px-5 py-4">
          <Pestanas
            etiquetaAccesible="Estado del pedido"
            guia="pedidos-web.pestanas"
            idIndicador="pedidos-web"
            activa={pestana}
            onCambio={(c) => cambiarPestana(c as PestanaPedidos)}
            items={PESTANAS_PEDIDOS.map((p) => ({
              clave: p.clave,
              etiqueta: p.etiqueta,
              conteo: grupos[p.clave].length,
              ...(p.clave === "confirmar" && grupos.confirmar.length > 0 ? { pide: "esperan confirmación" } : {}),
              ...(p.clave === "entregar" ? { guia: "pedidos-web.pestana-entregar" } : {}),
            }))}
          />
        </div>
        {lista.length === 0 ? (
          <Vacio icono={<Smartphone />} titulo={VACIOS[pestana].titulo} guia="pedidos-web.lista">
            {VACIOS[pestana].frase}
          </Vacio>
        ) : (
          <Tabla className="rounded-none border-0 shadow-none" guia="pedidos-web.lista">
            <Encabezado
              plantilla={PLANTILLA}
              columnas={[{ titulo: "Pedido" }, { titulo: "Cliente" }, { titulo: "Prendas" }, { titulo: "Total", alinear: "der" }, { titulo: "Estado" }]}
            />
            {lista.map((p, i) => (
              <FilaPedido
                key={p.id}
                pedido={p}
                ahora={ahora}
                abierto={abierto?.id === p.id}
                recien={recien === p.id}
                primera={i === 0}
                onAbrir={() => abrir(p.id)}
              />
            ))}
          </Tabla>
        )}
      </section>

      <div className="nota-cayla space-y-2 text-[13px]" data-guia="pedidos-web.nota">
        <p>
          Separar no toca el stock: la prenda se reserva recién cuando confirmas, y sale del stock al entregarla. Un pedido por confirmar se
          cierra solo a las {plazos.horasParaConfirmar} horas. Los pagos se registran dentro de cada pedido: el efectivo entra a la caja
          abierta, y con el pago que lo completa sale su boleta. Se entrega con el código de 4 cifras que el cliente ve en su pedido. Los
          pedidos web van aparte de los apartados de tienda.
        </p>
      </div>

      {abierto && (
        <PedidoWebHoja
          key={abierto.id}
          pedido={abierto}
          tiendaId={tiendaId}
          tienda={tienda}
          ahora={ahora}
          onClose={cerrar}
          onCambio={(estado, opciones) => {
            setRecien(abierto.id);
            if (estado === "anulado") {
              setPestana("cerrados");
              // Anulado con plata por devolver: la hoja sigue abierta y el pedido se relee ya. Si se cierra, al cerrar.
              if (opciones?.sigueAbierta) router.refresh();
              else refrescarAlCerrar.current = true;
              return;
            }
            if (estado === "entregado") {
              // Entregado (actividad 10): la hoja se cierra y, al cerrarse, la lista se pone al día con el pedido en «Cerrados».
              setPestana("cerrados");
              refrescarAlCerrar.current = true;
              return;
            }
            if (estado === "confirmado") setPestana("cobrar");
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
        />
      )}
      {abierto && pagando && (
        <RegistrarPagoHoja
          key={`pago-${abierto.id}`}
          pedido={abierto}
          onClose={() => setPagando(false)}
          onRegistrado={(estado) => {
            setRecien(abierto.id);
            // Pagado completo: en la lista pasa a «Por entregar».
            if (estado === "pagado") setPestana("entregar");
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

/** Un pedido de la lista: el número y hace cuánto, el cliente, sus prendas en miniatura, el total y en qué está. Toda la fila lo abre. */
function FilaPedido({
  pedido: p,
  ahora,
  abierto,
  recien,
  primera,
  onAbrir,
}: {
  pedido: PedidoDeLista;
  ahora: number;
  abierto: boolean;
  recien: boolean;
  primera: boolean;
  onAbrir: () => void;
}) {
  const estado = estadoVisible(p, ahora);
  const vistas = p.prendasVista.slice(0, 4);
  return (
    <div
      role="row"
      tabIndex={0}
      aria-current={abierto ? "true" : undefined}
      data-recien={recien ? "" : undefined}
      onClick={(e) => {
        // Un clic que sube desde la hoja abierta (vive en un portal) no vuelve a abrir.
        if (!e.currentTarget.contains(e.target as Node)) return;
        onAbrir();
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAbrir();
        }
      }}
      className={`${fila(PLANTILLA, "cursor-pointer items-center sm:items-center")}`}
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
      <span className="col-start-2 row-start-1 flex justify-end sm:hidden">
        <Chip tono={estado.tono} vivo={estado.vivo}>
          {estado.texto.split(" · ")[0]}
        </Chip>
      </span>
      <span className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">
        <AvatarPersona personaId={null} nombre={p.cliente} tamano={24} />
        <span className="truncate text-tinta">{p.cliente}</span>
      </span>
      <span className="flex items-center gap-1.5" aria-label={`${p.prendas} ${p.prendas === 1 ? "prenda" : "prendas"}`}>
        {vistas.map((v, i) => (
          <MiniPrenda key={i} prenda={v} />
        ))}
        {p.prendasVista.length > vistas.length && <span className="text-[12px] text-taupe">+{p.prendasVista.length - vistas.length}</span>}
      </span>
      <span className="text-right font-medium tabular-nums text-tinta sm:block">{soles(p.total)}</span>
      <span className="col-span-2 hidden min-w-0 sm:col-span-1 sm:block">
        <Chip tono={estado.tono} vivo={estado.vivo}>
          {estado.texto}
        </Chip>
        {estado.accion && <span className="mt-0.5 block truncate text-[12px] text-taupe">{estado.accion}</span>}
      </span>
    </div>
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
