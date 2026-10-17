"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AQuienPedir } from "@/components/analisis/AQuienPedir";
import { Carril, type GrupoCarril } from "@/components/analisis/Carril";
import { useAnalisis } from "@/components/analisis/contexto";
import { Icono } from "@/components/analisis/iconos";
import { nombreLargo, TipRico } from "@/components/analisis/piezas";
import type { ModeloAnalisis } from "@/lib/analisis-modelo";
import { diasQueQuedan, otraSedeQueLaTiene, porLlegar } from "@/lib/analisis-reglas";
import { dondeComprarDe, hrefComprar, hrefComprarLasQueFaltan } from "@/lib/analisis-acciones";
import {
  FUENTE_LARGA,
  modelosPorPedir,
  proveedorDelModelo,
  textoFuenteDeLaFila,
  textoPidelo,
  textoPideloCompleto,
  textoSinAQuienPedir,
  textoVieneDe,
} from "@/lib/analisis-a-quien-pedir";
import { textoRitmo } from "@/lib/analisis-pedir";
import { notaDePedidoEnFila, pedidoPorTipo, type PedidoDeTipo } from "@/lib/analisis-pedido-en-camino-reglas";
import {
  atrasoDe,
  cuandoLlega,
  cuentasFiltroAcaba,
  EJE_ACABA,
  faltanDelModelo,
  FILTROS_ACABA,
  LINEA_SEMANA,
  lineasAtrasadas,
  lineasPorLlegar,
  notaAtrasada,
  pasaFiltroAcaba,
  pistaAcaba,
  prendasQueSeAcaban,
  seAcabaEnOtras,
  TEXTO_VACIO_ACABA,
  textoAtraso,
  textoPedirA,
  textoProveedorGenerico,
  textoTambienSeAcaba,
  tipOtraTienda,
  tipTambienSeAcaba,
  tituloAtrasada,
  tituloDelCarril,
  tituloPorLlegar,
  vacioAcaba,
  ventanasPorSede,
  type FiltroAcaba,
  type VacioAcaba,
} from "@/lib/analisis-acaba";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { Vacio } from "@/components/ui/Vacio";
import { Check } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";

// Análisis v4 (ADR-0357): «Se está acabando», la maqueta aprobada (vistaAcaba, filtrosAcaba y el carril). Un solo grupo, cuyo título sale del
// filtro («Se están acabando», «Cómpralas», «Ya vienen»): todo lo que se acaba se compra por defecto (decisión 7) salvo lo que ya viene en camino;
// si otra tienda la tiene, se dice cuántas tiene y se ofrece pedírsela, y la persona decide. Cada fila: cuántos días le quedan, si ya viene algo en
// camino y cuándo, y su botón. Los filtros reparten lo mismo en «Comprar» (no viene nada) y «Por llegar» (ya viene).
//
// Dos formas de ver la MISMA lista (el segmento «Por días / Por proveedor» de la cabecera, F1): por días, el carril; por proveedor, «A quién pedir»
// (lo que todavía no viene, junto por a quién se le pide). La lógica pura vive en `lib/analisis-acaba.ts` y `lib/analisis-a-quien-pedir.ts`; los
// destinos de los botones, en `lib/analisis-acciones.ts` (un destino que la cuenta no ve, no se dibuja).

const AYUDA_CARRIL: Record<FiltroAcaba, string> = {
  todos:
    "Lo que, al ritmo que se vende, se acaba en dos semanas o menos. Lo que no viene en camino es para comprar; lo que ya viene dice «Por llegar» y cuándo, y no se pide otra vez. Si una llegada se atrasó, dice «Atrasada» y vuelve a «Comprar». «Pídelo a …» dice a quién; «Viene de …», de quién viene. Si otra tienda la tiene, verás cuántas tiene; toca la prenda para ver cuánto vende cada tienda y decide si pedirla.",
  comprar:
    "Lo que se acaba y no viene nada en camino a tiempo: hay que comprarlo. «Pídelo a …» dice a quién: a quien le compraste la última vez o, si no hay compra, a quien está anotado en su ficha. Una llegada atrasada también está aquí. Si otra tienda la tiene, verás cuántas tiene y decides si pedirla.",
  llega:
    "Lo que se acaba pero ya viene en camino: no hace falta pedirlo otra vez. Cada fila dice cuántas llegan y cuándo, y de quién viene. Si la llegada se atrasa, pasa a «Comprar».",
};

type ModoAcaba = "dias" | "proveedor";

export function PestanaAcaba({ modoInicial = "dias" }: { /** Solo para las pruebas (no hay clic en un render de servidor): con qué forma abre. La pantalla no lo pasa. */ modoInicial?: ModoAcaba }) {
  const { datos, acceso, prendas, liquidarDesde, filtroAcaba, setFiltroAcaba, diasDeVentas } = useAnalisis();
  // Cómo se ve la lista: por días (el carril) o por proveedor («A quién pedir»). Es de esta pestaña: al salir y volver, vuelve a «Por días».
  const [modo, setModo] = useState<ModoAcaba>(modoInicial);
  // Cada forma dibuja su propia tarjeta, y el segmento (en su cabecera) se vuelve a montar al pasar de una a otra: quien lo maneja con el
  // teclado (← →) perdería el foco. Tras el cambio, si el foco quedó en la nada, vuelve a la opción que eligió.
  const devolverFoco = useRef(false);
  useEffect(() => {
    if (!devolverFoco.current) return;
    devolverFoco.current = false;
    if (document.activeElement && document.activeElement !== document.body) return;
    // El nombre del segmento (su `etiqueta`, más abajo): la huella de la guía lo lee escrito en el JSX, por eso va repetido y no en una constante.
    document.querySelector<HTMLElement>('[role="radiogroup"][aria-label="Cómo ver lo que se acaba"] [role="radio"][aria-checked="true"]')?.focus({ preventScroll: true });
  }, [modo]);
  // En la tienda (sin buscar): decide si hay carril. Con lo buscado: las filas y las cuentas de cada filtro.
  const enLaTienda = useMemo(() => prendasQueSeAcaban(datos.prendas, liquidarDesde).length, [datos.prendas, liquidarDesde]);
  const seAcaban = useMemo(() => prendasQueSeAcaban(prendas, liquidarDesde), [prendas, liquidarDesde]);
  // Los días de ventas de cada tienda, para saber si el modelo también se acaba en otra (con los días de ELLA, no los míos).
  const ventanas = useMemo(() => ventanasPorSede(datos.preparacion, datos.hoy), [datos.preparacion, datos.hoy]);
  // Lo ya pedido por tipo (A4): una orden se pide por tipo y marca, así que se dice en la fila de «Comprar» de ese TIPO, nunca como «esta prenda viene».
  const pedidoDe = useMemo(() => pedidoPorTipo(datos.pedido ?? [], datos.hoy), [datos.pedido, datos.hoy]);

  const vacio = vacioAcaba({ prendas: datos.prendas.length, seAcaban: enLaTienda, fallas: datos.fallas.length });
  if (vacio) return <SinCarril tipo={vacio} />;

  const visibles = seAcaban.filter((p) => pasaFiltroAcaba(p, filtroAcaba, datos.hoy));
  // «Por proveedor» muestra lo que todavía hay que comprar (lo que ya viene en camino no se pide otra vez): la misma regla del filtro «Comprar»
  // (`modelosPorPedir`). Sin proveedores leídos o sin nada que pedir no hay nada que agrupar, y el modo no se puede elegir.
  const porPedir = modelosPorPedir(seAcaban, datos.hoy);
  const sinProveedoresLeidos = datos.proveedores === null;
  const puedePorProveedor = !sinProveedoresLeidos && porPedir.length > 0;
  const enProveedor = modo === "proveedor" && puedePorProveedor;

  // El segmento vive en la cabecera de las dos formas y a la derecha de todo (los filtros, solo «por días», quedan a su izquierda): al cambiar de
  // forma no se mueve de debajo del mouse (ADR-0185).
  const segmento = (
    <SegmentoDeslizante
      forma="modo"
      etiqueta="Cómo ver lo que se acaba"
      valor={enProveedor ? "proveedor" : "dias"}
      onCambio={(c) => {
        devolverFoco.current = true;
        setModo(c === "proveedor" ? "proveedor" : "dias");
      }}
      opciones={[
        { clave: "dias", etiqueta: "Por días", guia: "analisis.acaba-modo-dias" },
        {
          clave: "proveedor",
          etiqueta: "Por proveedor",
          guia: "analisis.acaba-modo-proveedor",
          deshabilitada: !puedePorProveedor,
          ayuda: sinProveedoresLeidos ? "No se pudo leer a qué proveedor se le pide" : porPedir.length === 0 ? "Todo lo que se acaba ya viene en camino: no hay nada que pedir" : undefined,
        },
      ]}
    />
  );
  if (enProveedor) return <AQuienPedir modelos={porPedir} herramienta={segmento} />;

  // «Comprar todas» es para lo que hay que comprar: sobre lo que ya viene en camino no se ofrece.
  // En «Todos» la lista incluye lo que ya viene: el botón mira solo lo que falta pedir (el mismo criterio del filtro «Comprar»).
  const comprarTodas = filtroAcaba === "llega" ? null : hrefComprarLasQueFaltan(visibles, datos.hoy, acceso, dondeComprarDe(datos));
  const yaViene = filtroAcaba === "llega";
  // Con varios proveedores no hay UNA orden para todas (A9: no se abren N órdenes), y un botón que desaparece sin decir por qué deja al comprador sin saber
  // dónde se pide. En su lugar, el camino: la misma lista por proveedor, donde cada uno trae su «Pedir a X». No navega ni guarda nada.
  const pedirPorProveedor = !comprarTodas && !yaViene && acceso.ordenes && puedePorProveedor && modelosPorPedir(visibles, datos.hoy).length > 1;
  const grupo: GrupoCarril = {
    clave: "comprar",
    titulo: tituloDelCarril(filtroAcaba, visibles.length),
    ayuda: AYUDA_CARRIL[filtroAcaba],
    // Lo que ya viene no es una urgencia: ni el ícono de comprar ni su rojo.
    icono: yaViene ? "llega" : "caja",
    est: yaViene ? "bien" : "urg",
    prendas: visibles,
    lote: comprarTodas ? (
      <Link href={comprarTodas} className="btn-cayla btn-secundario btn-s">
        Comprar todas
      </Link>
    ) : pedirPorProveedor ? (
      <button
        type="button"
        className="btn-cayla btn-secundario btn-s"
        title="Son de varios proveedores: ábrelas por proveedor y pide a cada uno"
        onClick={() => {
          devolverFoco.current = true;
          setModo("proveedor");
        }}
      >
        Pídelas por proveedor
      </button>
    ) : undefined,
  };

  return (
    <Carril
      titulo="Cuántos días te quedan"
      nota={textoRitmo(diasDeVentas)}
      herramienta={
        <>
          <Filtros filtro={filtroAcaba} cuentas={cuentasFiltroAcaba(seAcaban, datos.hoy)} onFiltro={setFiltroAcaba} />
          {segmento}
        </>
      }
      eje={[...EJE_ACABA]}
      grupos={[grupo]}
      pista={(p) => <Pista p={p} />}
      pildoras={(p) => <Pildoras p={p} ventanas={ventanas} />}
      accion={(p) => <Accion p={p} pedidoDe={pedidoDe} />}
    />
  );
}

/** Todos · Comprar · Por llegar, con cuántas tiene cada uno (de lo que pasa el buscador). */
function Filtros({ filtro, cuentas, onFiltro }: { filtro: FiltroAcaba; cuentas: Record<FiltroAcaba, number>; onFiltro: (f: FiltroAcaba) => void }) {
  return (
    <span className="filtro-a" role="group" aria-label="Filtrar lo que se acaba">
      {FILTROS_ACABA.map((f) => (
        <button key={f.clave} type="button" className="pildora" aria-pressed={filtro === f.clave} onClick={() => onFiltro(f.clave)}>
          {f.texto} <span className="nf">{cuentas[f.clave]}</span>
        </button>
      ))}
    </span>
  );
}

/** Cuántos días le quedan: rayada si se agotó; si no, una barra de 0 a 2 semanas, con la semana punteada. */
function Pista({ p }: { p: ModeloAnalisis }) {
  const pista = pistaAcaba(diasQueQuedan(p));
  return (
    <span className="pista">
      {pista?.agotada && (
        <>
          <span className="agot" />
          <b className="d">{pista.texto}</b>
        </>
      )}
      {pista && !pista.agotada && (
        <>
          <i className="barra cx" style={{ ["--n" as string]: pista.n, ["--c" as string]: pista.color }} />
          <b className={pista.dentro ? "d dentro" : "d"} style={{ ["--n" as string]: pista.n }}>
            {pista.texto}
          </b>
        </>
      )}
      <span className="linea" style={{ left: LINEA_SEMANA }} />
    </span>
  );
}

/**
 * «Por llegar 13» (con de dónde y cuándo, al pasar el mouse), «Atrasada 26 días» si algo debía llegar y no llegó (esa prenda vuelve a
 * «Comprar»), «AQP tiene 3» o a quién se compra, y «AQP también se acaba» si el mismo modelo falta en otra tienda (A8).
 */
function Pildoras({ p, ventanas }: { p: ModeloAnalisis; ventanas: Readonly<Record<string, number>> }) {
  const { datos, sedeDe } = useAnalisis();
  const llega = porLlegar(p, datos.hoy);
  const atraso = atrasoDe(p, datos.hoy);
  const otra = otraSedeQueLaTiene(p.otras);
  const sede = otra ? sedeDe(otra.sedeId) : undefined;
  // El proveedor ya se dice por su nombre en «Pídelo a …» (bajo «Comprar»); la etiqueta genérica solo sale si no se pudo nombrar.
  const quien = datos.proveedores ? proveedorDelModelo(p, datos.proveedores) : null;
  const proveedor = textoProveedorGenerico(quien, p.origen);
  const tambien = seAcabaEnOtras(p.otras, ventanas);
  const faltan = faltanDelModelo(p);
  // «Por llegar 24 · en 4 días» / «· sin fecha»: sin la fecha no se sabe si habrá días con el piso vacío (Felipe 2026-10-16).
  const cuando = cuandoLlega(p, datos.hoy);
  return (
    <>
      {faltan && (
        <span className="pil" data-tip={faltan.todas.length > 1 ? `Ya no hay: ${faltan.todas.join(", ")}` : undefined}>
          {faltan.texto}
        </span>
      )}
      {llega > 0 && (
        <span className="pil llega">
          <Icono nombre="llega" />
          Por llegar <b>{llega}</b>
          {cuando && <span className="cuando">· {cuando}</span>}
          <TipRico>
            <b>{tituloPorLlegar(p, datos.hoy)}</b>
            <span className="tl">
              {lineasPorLlegar(p, datos.hoy).map((linea, k) => (
                <span key={k}>{linea}</span>
              ))}
            </span>
          </TipRico>
        </span>
      )}
      {atraso && (
        <span className="pil tarde">
          <Icono nombre="reloj" />
          {textoAtraso(atraso.dias)}
          <TipRico>
            <b>{tituloAtrasada(atraso.unidades)}</b>
            <span className="tl">
              {lineasAtrasadas(p, datos.hoy).map((linea, k) => (
                <span key={k}>{linea}</span>
              ))}
              <span>{notaAtrasada(atraso.unidades, llega > 0)}</span>
            </span>
          </TipRico>
        </span>
      )}
      {otra && sede ? (
        <span className="pil puede" data-tip={tipOtraTienda(sede, otra.stock)}>
          <Icono nombre="flechas" />
          <span className="cod">{sede.codigo}</span> tiene <b>{otra.stock}</b>
        </span>
      ) : (
        proveedor && <span className="pil">{proveedor}</span>
      )}
      {tambien.map((o) => {
        const donde = sedeDe(o.sedeId);
        return donde ? (
          <span key={o.sedeId} className="pil" data-tip={tipTambienSeAcaba(donde, o)}>
            <span className="cod">{donde.codigo}</span> {textoTambienSeAcaba(o)}
          </span>
        ) : null;
      })}
    </>
  );
}

/**
 * «Comprar» (Compras o Producción, según de dónde viene), a quién pedirlo y, si otra tienda la tiene, «o pedir a Arequipa». Lo que YA viene en
 * camino a tiempo no dice «Pídelo a …» (eso es para lo que falta pedir y empujaba a pedirlo dos veces): dice «Viene de …», más tenue, o nada si no
 * se sabe de quién. Con un proveedor archivado o ninguno, dice que falta elegirlo. El bloque va aparte (`c-quien`) para que en una pantalla angosta
 * pase a la línea de las píldoras, junto a su barra.
 */
function Accion({ p, pedidoDe }: { p: ModeloAnalisis; pedidoDe: ReadonlyMap<string, PedidoDeTipo> }) {
  const { datos, acceso, sedeDe, pedir } = useAnalisis();
  const comprar = hrefComprar(p, acceso, dondeComprarDe(datos));
  const otra = otraSedeQueLaTiene(p.otras);
  const sede = otra && acceso.pedir ? sedeDe(otra.sedeId) : undefined;
  const quien = datos.proveedores ? proveedorDelModelo(p, datos.proveedores) : null;
  const viene = porLlegar(p, datos.hoy) > 0;
  // «Pídelo a Textil Andino» (sin su sufijo legal; el nombre completo va en el tooltip y el `aria-label`). «Comprar» abre la orden con ESE mismo
  // proveedor (A9: `hrefComprar` usa `proveedorDelModelo`), así que lo que dice la fila es lo que llega al formulario. La fuente se dice siempre («le compraste la última vez» o «anotado en su ficha»): un tooltip no se alcanza con el
  // dedo ni con el teclado.
  const pidelo = quien && !viene ? textoPidelo(quien) : null;
  const pideloCompleto = quien && !viene ? textoPideloCompleto(quien) : null;
  const fuente = quien && pidelo ? textoFuenteDeLaFila(quien) : null;
  const sinQuien = quien && !viene ? textoSinAQuienPedir(quien) : null;
  const vieneDe = quien && viene ? textoVieneDe(p.llega, quien, datos.hoy) : null;
  // «Ya pedido: 40 Polos · llegan el 12 nov.» (A4): solo en lo que sigue en «Comprar». No cambia en qué grupo cae la prenda (una orden no
  // dice a qué modelo irá); avisa que hay una orden abierta de su tipo antes de pedir otra vez.
  const tipo = p.categoria?.trim();
  const delTipo = tipo ? pedidoDe.get(tipo) : undefined;
  const yaPedido = !viene && tipo && delTipo ? notaDePedidoEnFila(tipo, delTipo) : null;
  return (
    <>
      {comprar && (
        <Link href={comprar} className="btn-cayla btn-secundario btn-s" aria-label={`Comprar: ${nombreLargo(p)}`}>
          Comprar
        </Link>
      )}
      {(pidelo || sinQuien || vieneDe || yaPedido || sede) && (
        <span className="c-quien">
          {quien && pidelo && pideloCompleto && (
            <span className="pidelo" role="group" aria-label={pideloCompleto} data-tip={`${pideloCompleto.endsWith(".") ? pideloCompleto : `${pideloCompleto}.`} ${FUENTE_LARGA[quien.fuente]}`}>
              <span className="pidelo-q">{pidelo}</span>
              {fuente && <span className="pidelo-f">{fuente}</span>}
            </span>
          )}
          {sinQuien && quien && (
            <span className="pidelo sin" data-tip={FUENTE_LARGA[quien.fuente]}>
              <span className="pidelo-q">{sinQuien.titulo}</span>
              <span className="pidelo-f">{sinQuien.detalle}</span>
            </span>
          )}
          {vieneDe && (
            <span className="pidelo viene" data-tip="Ya viene en camino: no hace falta pedirlo otra vez. El detalle está en «Por llegar».">
              <span className="pidelo-q">{vieneDe}</span>
            </span>
          )}
          {yaPedido && (
            <span className="pidelo viene" role="group" aria-label={`${yaPedido.titulo}${yaPedido.detalle ? `, ${yaPedido.detalle}` : ""}`} data-tip={yaPedido.ayuda}>
              <span className="pidelo-q">{yaPedido.titulo}</span>
              {yaPedido.detalle && <span className="pidelo-f">{yaPedido.detalle}</span>}
            </span>
          )}
          {sede && (
            <button type="button" className="alt" aria-label={`${textoPedirA(sede)}: ${nombreLargo(p)}`} onClick={() => pedir([p], sede.id)}>
              {textoPedirA(sede)}
            </button>
          )}
        </span>
      )}
    </>
  );
}

/** Sin carril: nada se acaba (en positivo), o no se pudieron leer las prendas. */
function SinCarril({ tipo }: { tipo: VacioAcaba }) {
  const texto = TEXTO_VACIO_ACABA[tipo];
  // «No pude ver tus prendas» no es un vacío sino una lectura que falló: va como aviso de error (Felipe 2026-10-08).
  if (tipo === "sin-datos")
    return (
      <Aviso tono="error" titulo={texto.titulo}>
        {texto.linea}
      </Aviso>
    );
  // La pieza única de vacío (ADR-0358, ronda 5): el título ya dice el estado, así que el chip «bien / sin datos» ya no se repite.
  return (
    <section className="tarjeta entra" style={{ ["--i" as string]: 0 }}>
      <Vacio icono={<Check />} titulo={texto.titulo}>
        {texto.linea}
      </Vacio>
    </section>
  );
}
