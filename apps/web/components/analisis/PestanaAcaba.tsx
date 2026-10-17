"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AQuienPedir } from "@/components/analisis/AQuienPedir";
import { Carril, type GrupoCarril } from "@/components/analisis/Carril";
import { useAnalisis } from "@/components/analisis/contexto";
import { Icono } from "@/components/analisis/iconos";
import { nombreLargo, TipRico } from "@/components/analisis/piezas";
import type { ModeloAnalisis } from "@/lib/analisis-modelo";
import { diasQueQuedan, otraSedeQueLaTiene, porLlegar } from "@/lib/analisis-reglas";
import { hrefComprar, hrefComprarTodas } from "@/lib/analisis-acciones";
import { FUENTE_LARGA, modelosPorPedir, proveedorDelModelo, textoFuenteDeLaFila, textoPidelo } from "@/lib/analisis-a-quien-pedir";
import { textoRitmo } from "@/lib/analisis-pedir";
import {
  atrasoDe,
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
  tituloPorLlegar,
  vacioAcaba,
  ventanasPorSede,
  type FiltroAcaba,
  type VacioAcaba,
} from "@/lib/analisis-acaba";
import { Vacio } from "@/components/ui/Vacio";
import { Check } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";

// Análisis v4 (ADR-0357): «Se está acabando», la maqueta aprobada (vistaAcaba, filtrosAcaba y el carril). Un solo grupo,
// «Cómpralas»: todo lo que se acaba se compra por defecto (decisión 7); si otra tienda la tiene, se dice cuántas tiene y se
// ofrece pedírsela, y la persona decide. Cada fila: cuántos días le quedan, si ya viene algo en camino y su botón. Los
// filtros reparten lo mismo en «Comprar» (no viene nada) y «Por llegar» (ya viene). La lógica pura vive en
// `lib/analisis-acaba.ts`; los destinos de los botones, en `lib/analisis-acciones.ts` (un destino que la cuenta no ve, no se dibuja).

const AYUDA_COMPRAR =
  "Por defecto, todo lo que se acaba se compra al proveedor: el taller o terceros. «Pídelo a …» dice a quién: al de tu última compra o, si el modelo no tiene ninguna, al del catálogo. Si otra tienda la tiene, verás cuántas tiene, y si también se le acaba, te lo dice; toca la prenda para ver cuánto vende cada tienda y decide si pedirla. Lo que ya viene en camino dice «Por llegar»; si se atrasó, dice «Atrasada», y si no viene nada más vuelve a «Comprar».";

export function PestanaAcaba() {
  const { datos, acceso, prendas, liquidarDesde, filtroAcaba, setFiltroAcaba, diasDeVentas } = useAnalisis();
  // En la tienda (sin buscar): decide si hay carril. Con lo buscado: las filas y las cuentas de cada filtro.
  const enLaTienda = useMemo(() => prendasQueSeAcaban(datos.prendas, liquidarDesde).length, [datos.prendas, liquidarDesde]);
  const seAcaban = useMemo(() => prendasQueSeAcaban(prendas, liquidarDesde), [prendas, liquidarDesde]);
  // Los días de ventas de cada tienda, para saber si el modelo también se acaba en otra (con los días de ELLA, no los míos).
  const ventanas = useMemo(() => ventanasPorSede(datos.preparacion, datos.hoy), [datos.preparacion, datos.hoy]);

  const vacio = vacioAcaba({ prendas: datos.prendas.length, seAcaban: enLaTienda, fallas: datos.fallas.length });
  if (vacio) return <SinCarril tipo={vacio} />;

  const visibles = seAcaban.filter((p) => pasaFiltroAcaba(p, filtroAcaba, datos.hoy));
  const comprarTodas = hrefComprarTodas(visibles, acceso);
  // «A quién pedir» junta lo que todavía hay que comprar (lo que ya viene en camino no se pide otra vez). NO depende del filtro del carril:
  // los botones del filtro viven debajo de la tarjeta, y una tarjeta que aparece y desaparece al elegir «Por llegar» los correría de
  // debajo del mouse (ADR-0185). Sí sigue al buscador, que está arriba de todo y no se mueve.
  const porPedir = modelosPorPedir(seAcaban, datos.hoy);
  const grupo: GrupoCarril = {
    clave: "comprar",
    titulo: "Cómpralas",
    ayuda: AYUDA_COMPRAR,
    icono: "caja",
    est: "urg",
    prendas: visibles,
    lote: comprarTodas ? (
      <Link href={comprarTodas} className="btn-cayla btn-secundario btn-s">
        Comprar todas
      </Link>
    ) : undefined,
  };

  return (
    <>
      <AQuienPedir modelos={porPedir} />
      <Carril
        titulo="Cuántos días te quedan"
        nota={textoRitmo(diasDeVentas)}
        herramienta={<Filtros filtro={filtroAcaba} cuentas={cuentasFiltroAcaba(seAcaban, datos.hoy)} onFiltro={setFiltroAcaba} />}
        eje={[...EJE_ACABA]}
        grupos={[grupo]}
        pista={(p) => <Pista p={p} />}
        pildoras={(p) => <Pildoras p={p} ventanas={ventanas} />}
        accion={(p) => <Accion p={p} />}
      />
    </>
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

/** «Comprar» (Compras o Producción, según de dónde viene), a quién pedirlo («Pídelo a …») y, si otra tienda la tiene, «o pedir a Arequipa». */
function Accion({ p }: { p: ModeloAnalisis }) {
  const { datos, acceso, sedeDe, pedir } = useAnalisis();
  const comprar = hrefComprar(p, acceso);
  const otra = otraSedeQueLaTiene(p.otras);
  const sede = otra && acceso.pedir ? sedeDe(otra.sedeId) : undefined;
  // «Pídelo a Textil Andino»: a quién. Solo informa: a dónde lleva «Comprar» no cambia con esto (eso es A9).
  const quien = datos.proveedores ? proveedorDelModelo(p, datos.proveedores) : null;
  const pidelo = quien ? textoPidelo(quien) : null;
  // Si el nombre sale del catálogo, la fila lo dice a la vista (un tooltip no se alcanza con el dedo ni con el teclado).
  const fuente = quien ? textoFuenteDeLaFila(quien) : null;
  return (
    <>
      {comprar && (
        <Link href={comprar} className="btn-cayla btn-secundario btn-s" aria-label={`Comprar: ${nombreLargo(p)}`}>
          Comprar
        </Link>
      )}
      {quien && pidelo && (
        <span className="pidelo" data-tip={`${pidelo}. ${FUENTE_LARGA[quien.fuente]}`}>
          <span className="pidelo-q">{pidelo}</span>
          {fuente && <span className="pidelo-f">{fuente}</span>}
        </span>
      )}
      {sede && (
        <button type="button" className="alt" aria-label={`${textoPedirA(sede)}: ${nombreLargo(p)}`} onClick={() => pedir([p], sede.id)}>
          {textoPedirA(sede)}
        </button>
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
