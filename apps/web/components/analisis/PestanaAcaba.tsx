"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Carril, type GrupoCarril } from "@/components/analisis/Carril";
import { useAnalisis } from "@/components/analisis/contexto";
import { Icono } from "@/components/analisis/iconos";
import { nombreLargo, TipRico } from "@/components/analisis/piezas";
import type { ModeloAnalisis } from "@/lib/analisis-modelo";
import { diasQueQuedan, otraSedeQueLaTiene, plural, porLlegar } from "@/lib/analisis-reglas";
import { hrefComprar, hrefComprarTodas } from "@/lib/analisis-acciones";
import {
  cuentasFiltroAcaba,
  EJE_ACABA,
  faltanDelModelo,
  FILTROS_ACABA,
  LINEA_SEMANA,
  lineasPorLlegar,
  pasaFiltroAcaba,
  pistaAcaba,
  prendasQueSeAcaban,
  TEXTO_VACIO_ACABA,
  textoPedirA,
  textoProveedor,
  tipOtraTienda,
  tituloPorLlegar,
  vacioAcaba,
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
  "Por defecto, todo lo que se acaba se compra al proveedor: el taller o terceros. Si otra tienda la tiene, verás cuántas tiene; toca la prenda para ver cuánto vende cada tienda y decide si pedirla.";

export function PestanaAcaba() {
  const { datos, acceso, prendas, liquidarDesde, filtroAcaba, setFiltroAcaba, diasDeVentas } = useAnalisis();
  // En la tienda (sin buscar): decide si hay carril. Con lo buscado: las filas y las cuentas de cada filtro.
  const enLaTienda = useMemo(() => prendasQueSeAcaban(datos.prendas, liquidarDesde).length, [datos.prendas, liquidarDesde]);
  const seAcaban = useMemo(() => prendasQueSeAcaban(prendas, liquidarDesde), [prendas, liquidarDesde]);

  const vacio = vacioAcaba({ prendas: datos.prendas.length, seAcaban: enLaTienda, fallas: datos.fallas.length });
  if (vacio) return <SinCarril tipo={vacio} />;

  const visibles = seAcaban.filter((p) => pasaFiltroAcaba(p, filtroAcaba));
  const comprarTodas = hrefComprarTodas(visibles, acceso);
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
    <Carril
      titulo="Cuántos días te quedan"
      nota={`Al ritmo de los últimos ${diasDeVentas} ${plural(diasDeVentas, "día", "días")}`}
      herramienta={<Filtros filtro={filtroAcaba} cuentas={cuentasFiltroAcaba(seAcaban)} onFiltro={setFiltroAcaba} />}
      eje={[...EJE_ACABA]}
      grupos={[grupo]}
      pista={(p) => <Pista p={p} />}
      pildoras={(p) => <Pildoras p={p} />}
      accion={(p) => <Accion p={p} />}
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

/** «Por llegar 13» (con de dónde y cuándo, al pasar el mouse), y «AQP tiene 3» o a quién se compra. */
function Pildoras({ p }: { p: ModeloAnalisis }) {
  const { datos, sedeDe } = useAnalisis();
  const llega = porLlegar(p);
  const otra = otraSedeQueLaTiene(p.otras);
  const sede = otra ? sedeDe(otra.sedeId) : undefined;
  const proveedor = textoProveedor(p.origen);
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
            <b>{tituloPorLlegar(p)}</b>
            <span className="tl">
              {lineasPorLlegar(p, datos.hoy).map((linea, k) => (
                <span key={k}>{linea}</span>
              ))}
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
    </>
  );
}

/** «Comprar» (Compras o Producción, según de dónde viene) y, si otra tienda la tiene, «o pedir a Arequipa». */
function Accion({ p }: { p: ModeloAnalisis }) {
  const { acceso, sedeDe, pedir } = useAnalisis();
  const comprar = hrefComprar(p, acceso);
  const otra = otraSedeQueLaTiene(p.otras);
  const sede = otra && acceso.pedir ? sedeDe(otra.sedeId) : undefined;
  return (
    <>
      {comprar && (
        <Link href={comprar} className="btn-cayla btn-secundario btn-s" aria-label={`Comprar: ${nombreLargo(p)}`}>
          Comprar
        </Link>
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
