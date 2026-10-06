"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { useAnalisis } from "@/components/analisis/contexto";
import { Carril, type GrupoCarril } from "@/components/analisis/Carril";
import { HojaLiquidarDesde } from "@/components/analisis/HojaLiquidarDesde";
import { Icono } from "@/components/analisis/iconos";
import { Ayuda, ChipEstado, COLOR_ESTADO, nombreLargo, soles } from "@/components/analisis/piezas";
import type { PrendaAnalisis } from "@/lib/analisis-tipos";
import { edadDelInventario, GRUPOS_QUIETAS, LIQUIDAR_MAX, LIQUIDAR_MIN, liquidarDesdeValido, plural, prendasDe, sedeQueMasVende, totalEnTienda, VENDIDAS_PARA_ENVIAR } from "@/lib/analisis-reglas";
import { hrefEnviar, hrefLiquidar } from "@/lib/analisis-acciones";
import {
  barraDeEdad,
  cifrasQuietas,
  destinoDeTodas,
  gruposQuietas,
  marcasEje,
  notaSinCosto,
  pistaQuieta,
  TEXTO_VACIO_QUIETAS,
  TRAMOS_EDAD,
  vacioQuietas,
  type VacioQuietas,
} from "@/lib/analisis-quietas";

// Análisis v4 (ADR-0357): la pestaña «No se vende», como la maqueta aprobada (`vistaNose()`): arriba, cuánto hay quieto y la edad
// de lo que tiene la tienda (solo la elegida arriba: la comparación entre tiendas vive en CAYLA Global); abajo, el carril «Días sin venderse» con el control «Liquidar desde», que mueve las prendas de
// grupo EN VIVO (sin guardar). Guardarlo para todos es otra cosa y la pide un botón aparte. Cada fila abre el flujo que ya existe
// (Traslados, Etiquetas): Análisis no guarda nada por su cuenta (ADR-0245).

/** Números como se leen en tienda: «1,250». */
const nf = (n: number): string => Math.round(n).toLocaleString("es-PE");

export function PestanaQuieta() {
  const { datos, acceso, prendas, liquidarDesde, setLiquidarDesde, sedeDe } = useAnalisis();
  const router = useRouter();
  const idUmbral = useId();
  const [guardar, setGuardar] = useState(false);

  // Hay carril o no, con las prendas de la tienda (sin buscar): si el buscador las deja fuera, el carril lo dice.
  const vacio = vacioQuietas(datos.prendas, liquidarDesde, datos.fallas.length);
  if (vacio) return <Vacio tipo={vacio} />;

  // Las cifras son de toda la tienda (como la cuenta de la pestaña); el carril, de lo que deja ver el buscador.
  const cifras = cifrasQuietas(prendasDe(datos.prendas, GRUPOS_QUIETAS, liquidarDesde));
  const faltan = notaSinCosto(cifras);
  const { enviar, liquidar, vigila } = gruposQuietas(prendas, liquidarDesde);
  const marcas = marcasEje(liquidarDesde);

  // Los botones de todo el grupo: «Enviar todas» solo si todas van a la misma tienda (si no, cada fila tiene la suya).
  const destino = destinoDeTodas(enviar);
  const enviarTodas = destino ? hrefEnviar(enviar, { id: destino }, acceso) : null;
  const liquidarTodas = hrefLiquidar(liquidar, acceso);
  const lote = (href: string | null, texto: string, etiqueta: string) =>
    href ? (
      <Link href={href} className="btn-cayla btn-secundario btn-s" aria-label={etiqueta}>
        {texto}
      </Link>
    ) : undefined;
  const sedeDestino = destino ? sedeDe(destino) : undefined;

  const grupos: GrupoCarril[] = [
    {
      clave: "enviar",
      titulo: "Mándalas a donde sí se venden",
      ayuda: `Aquí no se venden; en otra tienda se vendieron ${VENDIDAS_PARA_ENVIAR} o más este mes.`,
      icono: "camion",
      est: "ate",
      prendas: enviar,
      lote: lote(enviarTodas, "Enviar todas", `Enviar todas a ${sedeDestino?.ciudad ?? "otra tienda"}`),
    },
    {
      clave: "liquidar",
      titulo: "Liquidar",
      ayuda: `Llevan más de ${liquidarDesde} días sin venderse, aquí ni en otra tienda. En rojo, las de más de 3 meses. Cuánto rebajar lo eliges en Etiquetas.`,
      icono: "etiqueta",
      est: "ate",
      prendas: liquidar,
      lote: lote(liquidarTodas, "Liquidar todas", `Liquidar todas: ${liquidar.length} ${plural(liquidar.length, "prenda", "prendas")}`),
    },
    {
      clave: "vigila",
      titulo: "Vigílalas",
      ayuda: "Llevan más de un mes sin venderse, pero todavía no llegan a «Liquidar desde».",
      icono: "vigila",
      est: "nd",
      mudo: true,
      prendas: vigila,
    },
  ];

  // «Liquidar desde»: se mueve en vivo; si queda distinto de lo guardado, aparece «Guardar para todos».
  const control = (
    <span className="umbral">
      <label htmlFor={idUmbral}>Liquidar desde</label>
      <input
        id={idUmbral}
        type="range"
        min={LIQUIDAR_MIN}
        max={LIQUIDAR_MAX}
        step={1}
        value={liquidarDesde}
        aria-valuetext={`${liquidarDesde} días`}
        onChange={(e) => setLiquidarDesde(liquidarDesdeValido(e.target.value))}
      />
      <output htmlFor={idUmbral}>{liquidarDesde} días</output>
      {liquidarDesde !== datos.liquidarDesde && (
        <button type="button" className="btn-cayla btn-secundario btn-s" onClick={() => setGuardar(true)}>
          Guardar para todos
        </button>
      )}
    </span>
  );

  const pista = (p: PrendaAnalisis) => {
    const dias = p.diasSinVender ?? 0;
    const { n, zona, cifraALaIzquierda } = pistaQuieta(dias, liquidarDesde);
    return (
      <span className="pista zonas" style={{ ["--u" as string]: `${marcas.liquidar}%`, ["--r" as string]: `${marcas.tresMeses}%` }}>
        <i className="barra cx" style={{ ["--n" as string]: n }} />
        <span
          className="punto po"
          data-color-dato
          style={{ ["--n" as string]: n, ["--prenda" as string]: p.colorHex ?? "var(--color-grafico-neutro)", ["--c" as string]: COLOR_ESTADO[zona] }}
        />
        <b className="d" style={cifraALaIzquierda ? { left: "auto", right: `calc(${(1 - n) * 100}% + 12px)` } : { left: `calc(${n * 100}% + 12px)` }}>
          {dias} d
        </b>
      </span>
    );
  };

  const pildoras = (p: PrendaAnalisis, g: GrupoCarril) => {
    const vende = g.clave === "enviar" ? sedeQueMasVende(p.otras) : null;
    const sede = vende ? sedeDe(vende.sedeId) : undefined;
    if (vende && sede) {
      return (
        <span className="pil">
          <span className="cod">{sede.codigo}</span> vendió <b>{vende.vendidas30}</b>
        </span>
      );
    }
    return (
      <span className="pil">
        Tienes <b>{totalEnTienda(p)}</b>
      </span>
    );
  };

  const accion = (p: PrendaAnalisis, g: GrupoCarril) => {
    if (g.clave === "enviar") {
      const vende = sedeQueMasVende(p.otras);
      const href = vende ? hrefEnviar([p], { id: vende.sedeId }, acceso) : null;
      if (!vende || !href) return null;
      const texto = `Enviar a ${sedeDe(vende.sedeId)?.ciudad ?? "otra tienda"}`;
      return (
        <Link href={href} className="btn-cayla btn-secundario btn-s" aria-label={`${texto}: ${nombreLargo(p)}`}>
          {texto}
        </Link>
      );
    }
    if (g.clave === "liquidar") {
      const href = hrefLiquidar([p], acceso);
      return href ? (
        <Link href={href} className="btn-cayla btn-secundario btn-s" aria-label={`Liquidar: ${nombreLargo(p)}`}>
          Liquidar
        </Link>
      ) : null;
    }
    return null;
  };

  return (
    <>
      <div className="dos d21">
        <section className="tarjeta bloque q-numeros entra" style={{ ["--i" as string]: 0 }}>
          <Numero valor={nf(cifras.prendas)} et={plural(cifras.prendas, "prenda quieta", "prendas quietas")} sub={`${nf(cifras.unidades)} ${plural(cifras.unidades, "unidad", "unidades")}`} />
          <Numero
            valor={cifras.costo === null ? "—" : soles(cifras.costo)}
            et={
              <>
                costaron
                {faltan && <Ayuda texto={faltan} />}
              </>
            }
            sub={`a precio de venta ${cifras.precioVenta === null ? "—" : soles(cifras.precioVenta)}`}
          />
          <Numero valor={datos.rebajaDe100 === null ? "—" : String(datos.rebajaDe100)} et="de cada 100 ventas" sub="tuvieron rebaja" />
        </section>
        <EdadDeLoQueTienes />
      </div>

      <Carril
        titulo="Días sin venderse"
        herramienta={control}
        eje={[
          { texto: "0", left: "0%" },
          {
            texto: (
              <span className="zona" style={{ color: "var(--color-ambar)" }}>
                Liquidar
              </span>
            ),
            left: `${marcas.liquidar}%`,
          },
          {
            texto: (
              <span className="zona" style={{ color: "var(--color-rojo-profundo)" }}>
                3 meses
              </span>
            ),
            left: `${marcas.tresMeses}%`,
          },
          { texto: "4 meses", left: "100%" },
        ]}
        grupos={grupos}
        pista={pista}
        pildoras={pildoras}
        accion={accion}
      />

      {acceso.frescura && (
        <div className="tarjeta q-pie entra" style={{ ["--i" as string]: 3 }}>
          <span className="b-nota">¿Cambiar de lugar lo colgado sin rebajar?</span>
          <Link href="/inventario/frescura" className="btn-cayla btn-sutil btn-s">
            Frescura del piso <Icono nombre="sigue" />
          </Link>
        </div>
      )}

      {/* La hoja se cierra sola (con su salida) después de guardar: aquí solo se vuelve a leer el valor guardado. */}
      {guardar && <HojaLiquidarDesde dias={liquidarDesde} onCerrar={() => setGuardar(false)} onGuardado={() => router.refresh()} />}
    </>
  );
}

/** Una cifra grande de arriba (la `numero()` de la maqueta): el número, qué es y su detalle. */
function Numero({ valor, et, sub }: { valor: string; et: ReactNode; sub: ReactNode }) {
  return (
    <div className="q-numero">
      <b>{valor}</b>
      <span className="et">{et}</span>
      <span className="sub">{sub}</span>
    </div>
  );
}

/**
 * Lo que tiene la tienda, por tiempo sin venderse: cuántas unidades llevan hasta 1, 2, 3 o más meses. Solo de la tienda elegida arriba
 * (Felipe, 2026-10-06: comparar las tres tiendas es de CAYLA Global, decisión 3 de ADR-0357, act.).
 */
function EdadDeLoQueTienes() {
  const { datos } = useAnalisis();
  const { total, tramos } = barraDeEdad(edadDelInventario(datos.prendas));
  return (
    <section className="tarjeta bloque entra" style={{ ["--i" as string]: 1 }}>
      <div className="b-cab" style={{ marginBottom: 8 }}>
        <h3 className="b-tit" style={{ fontSize: 18 }}>
          Lo que tienes, por tiempo sin venderse
        </h3>
      </div>
      <div className="edad">
        {total === 0 ? (
          <i className="q-sin">Sin prendas</i>
        ) : (
          tramos.map((t, k) => (
            <i
              key={t.clase}
              className={`${t.clase} cx`}
              style={{ flex: t.flex, ["--d" as string]: k }}
              data-tip={`${t.etiqueta} sin venderse: ${nf(t.unidades)} ${plural(t.unidades, "unidad", "unidades")}`}
            >
              {t.cifraAdentro ? nf(t.unidades) : ""}
            </i>
          ))
        )}
      </div>
      <div className="leyenda" style={{ marginTop: 10 }}>
        {TRAMOS_EDAD.map((t) => (
          <span key={t.clase}>
            <i className={t.clase} />
            {t.etiqueta}
          </span>
        ))}
      </div>
    </section>
  );
}

/** Sin carril: todo se mueve (la respuesta corta y buena) o no se pudieron leer las prendas (nunca «todo se mueve» por una falla). */
function Vacio({ tipo }: { tipo: VacioQuietas }) {
  const todo = tipo === "todo-se-mueve";
  const texto = TEXTO_VACIO_QUIETAS[tipo];
  return (
    <section className="tarjeta vacio-vista entra" style={{ ["--i" as string]: 0 }}>
      <span className="q-vacia-ic" style={{ ["--c" as string]: COLOR_ESTADO[todo ? "bien" : "nd"] }}>
        <Icono nombre={todo ? "check" : "nd"} />
      </span>
      <div>
        {todo ? <ChipEstado est="bien" /> : <ChipEstado est="nd">Sin datos</ChipEstado>}
        <h2>{texto.titulo}</h2>
        <p>{texto.linea}</p>
      </div>
    </section>
  );
}
