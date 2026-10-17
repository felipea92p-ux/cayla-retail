"use client";

import Link from "next/link";
import { useAnalisis } from "@/components/analisis/contexto";
import { Carril, type GrupoCarril } from "@/components/analisis/Carril";
import { Icono } from "@/components/analisis/iconos";
import { Ayuda, COLOR_ESTADO, nombreLargo, Numero, soles } from "@/components/analisis/piezas";
import type { ModeloAnalisis } from "@/lib/analisis-modelo";
import { edadDelInventario, GRUPOS_QUIETAS, plural, prendasDe, totalEnTienda } from "@/lib/analisis-reglas";
import { destinoParaEnviar, loQueLlevaElEnvio, razonTiendaSinLeer, textoPuedesMandar, tiendasSinLeer } from "@/lib/analisis-enviar";
import { hrefEnviar, hrefLiquidar, hrefRegistrarVentas } from "@/lib/analisis-acciones";
import { nuncaSalio } from "@/lib/analisis-piso";
import {
  barraDeEdad,
  cifrasQuietas,
  destinoDeTodas,
  escalonMayor,
  etiquetasEje,
  finDelEje,
  gruposQuietas,
  marcaTresMeses,
  notaSinCosto,
  pistaQuieta,
  lineaTodaviaNoQuietas,
  marcaLiquidarComun,
  modelosSinConQueComparar,
  notaDeUmbrales,
  puedeJuzgarQuietas,
  razonSinRitmo,
  TEXTO_VACIO_QUIETAS,
  TRAMOS_EDAD,
  vacioQuietas,
  type VacioQuietas,
} from "@/lib/analisis-quietas";
import { Vacio } from "@/components/ui/Vacio";
import { Check, Hourglass } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";

// Análisis v4 (ADR-0357): la pestaña «No se vende», como la maqueta aprobada (`vistaNose()`): arriba, cuánto hay quieto y la edad
// de lo que tiene la tienda (solo la elegida arriba: la comparación entre tiendas vive en CAYLA Global); abajo, el carril «Días en el piso sin venderse».
// Cada tipo se juzga SOLO contra lo que tardan en venderse los suyos (act. 2026-10-17, B1: se retiró «Liquidar desde», el número fijo de días); un tipo que
// todavía no vendió lo suficiente queda en «Todavía sin ritmo». Cada fila abre el flujo que ya existe (Traslados, Etiquetas): Análisis no guarda nada por
// su cuenta (ADR-0245).

/** Números como se leen en tienda: «1,250». */
const nf = (n: number): string => Math.round(n).toLocaleString("es-PE");

export function PestanaQuieta() {
  const { datos, acceso, prendas, sedeDe, irA } = useAnalisis();

  // Hay carril o no, con las prendas de la tienda (sin buscar): si el buscador las deja fuera, el carril lo dice. Sin datos, la
  // pestaña solo lo dice; con «Todo se mueve» o «Todavía no», las cifras y la edad de la ropa siguen a la vista.
  const vacio = vacioQuietas(datos.prendas, datos.fallas.length, datos.hoy);
  const sinSalir = datos.sabePiso ? datos.prendas.filter(nuncaSalio).length : 0;
  // Quietos, pero de un tipo que no vendió nada: no hay con qué compararlos y no se juzgan; se cuentan aparte para que no desaparezcan sin decirlo.
  const sinComparar = modelosSinConQueComparar(datos.prendas);
  if (vacio === "sin-datos") return <SinCarril tipo={vacio} />;

  // Las cifras son de toda la tienda (como la cuenta de la pestaña); el carril, de lo que deja ver el buscador.
  const cifras = cifrasQuietas(prendasDe(datos.prendas, GRUPOS_QUIETAS));
  const faltan = notaSinCosto(cifras);
  const { enviar, liquidar, duda, vigila, sinRitmo } = gruposQuietas(prendas);
  // El eje se alarga hasta el escalón de «Liquidar» más largo de los tipos que lo tienen; la marca «Liquidar» solo si todas las filas con escalón lo
  // comparten (si cada tipo tiene el suyo, cada fila lo dibuja en su pista y una marca común mentiría).
  const enCarril = [...enviar, ...liquidar, ...duda, ...vigila, ...sinRitmo];
  const fin = finDelEje(escalonMayor(enCarril));
  const comun = marcaLiquidarComun(enCarril);
  const notaUmbral = notaDeUmbrales(datos.prendas, datos.frescura);
  const etiquetas = etiquetasEje(fin, comun);
  const tresMeses = marcaTresMeses(fin);
  // «Liquidar» y «Mándalas» vacíos porque todavía no se puede juzgar (ningún tipo con ritmo llegó a su escalón), no porque todo se mueva: se dice (B1).
  const sinQueLiquidar = enviar.length === 0 && liquidar.length === 0 && !puedeJuzgarQuietas(datos.prendas, datos.hoy);

  // Los botones de todo el grupo: «Enviar todas» solo si todas van a la misma tienda (si no, cada fila tiene la suya).
  const destino = destinoDeTodas(enviar);
  // Lo que de verdad se puede mandar hoy: solo lo que el destino vendió y está en el almacén. Con 0, el botón no se ofrece (abriría un traslado vacío) y se dice por qué.
  const lleva = destino ? loQueLlevaElEnvio(enviar, destino) : null;
  const enviarTodas = destino && lleva && lleva.movibles > 0 ? hrefEnviar(enviar, { id: destino }, acceso) : null;
  const nombreDeSede = (id: string) => sedeDe(id)?.ciudad ?? "otra tienda";
  // Por qué una fila está en «Aún no se sabe»: una venta sin registrar, o una tienda que no se pudo leer (y por eso no se sabe si allá se vende).
  const razonDuda = (p: ModeloAnalisis): string | null => {
    const sinLeer = tiendasSinLeer(p.otras);
    const partes = [(p.enDuda ?? 0) > 0 ? "Hay una venta anotada en caja de su tipo, talla y color que nadie registró." : null, sinLeer.length > 0 ? razonTiendaSinLeer(sinLeer, nombreDeSede) : null];
    return partes.filter(Boolean).join(" ") || null;
  };
  const algunaEnDuda = duda.some((p) => (p.enDuda ?? 0) > 0);
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
      ayuda: "Aquí no se venden; en otra tienda se vendieron 2 o más este mes y ya les queda poco stock. Se manda solo lo que allá se vendió y lo que está en el almacén.",
      icono: "camion",
      est: "ate",
      prendas: enviar,
      detalle: lleva && lleva.deLoVendido > 0 && lleva.movibles < lleva.deLoVendido ? <span className="b-nota">{textoPuedesMandar(lleva.movibles, lleva.deLoVendido)}</span> : undefined,
      lote: lote(enviarTodas, "Enviar todos", `Enviar todos a ${sedeDestino?.ciudad ?? "otra tienda"}`),
    },
    {
      clave: "liquidar",
      titulo: "Liquidar",
      ayuda: "Llevan en el piso sin venderse más de lo que tardan 9 de cada 10 de su tipo que sí se vendieron, aquí y sin que otra tienda las venda. En rojo, las de más de 3 meses. Los precios los fijas en Catálogo ▸ Etiquetas.",
      icono: "etiqueta",
      est: "ate",
      prendas: liquidar,
      lote: lote(liquidarTodas, "Liquidar todos", `Liquidar todos: ${liquidar.length} ${plural(liquidar.length, "modelo", "modelos")}`),
    },
    {
      // ADR-0357, act. 2026-10-14: quietas, pero alguna unidad colgada puede ser una venta anotada en caja que nadie registró (la cuenta de
      // Frescura). No se mandan ni se liquidan hasta saberlo: el botón lleva a registrar esas ventas.
      clave: "duda",
      titulo: "Aún no se sabe",
      ayuda: "No se sabe todavía qué hacer con ellas: puede que ya se hayan vendido (hay una venta anotada en caja que nadie registró) o no se pudo leer otra tienda y no se sabe si allá se vende. Cada fila dice cuál.",
      icono: "info",
      est: "info",
      prendas: duda,
      // «Registrar ventas» solo si alguna fila lo necesita: una tienda sin leer no se arregla registrando nada.
      lote: algunaEnDuda ? lote(hrefRegistrarVentas(acceso), "Registrar ventas", "Registrar las ventas sin su prenda") : undefined,
    },
    {
      clave: "vigila",
      titulo: "Vigílalas",
      ayuda: "Llevan sin venderse más de lo que tardan 3 de cada 4 de su tipo, pero todavía no llegan a liquidar.",
      icono: "vigila",
      est: "nd",
      mudo: true,
      prendas: vigila,
    },
    {
      // ADR-0357, act. 2026-10-17 (B1): su tipo todavía no vendió lo suficiente para saber cuánto tarda en venderse. No hay un número de días con que
      // medirlas («no es lo mismo un polo que un jean»): ni se rebajan, ni se mandan, ni se vigilan por ahora. Neutro, sin acción.
      clave: "sin_ritmo",
      titulo: "Todavía sin ritmo",
      ayuda: "Todavía no se sabe cuánto tarda en venderse su tipo (vendió poco en tu piso, o no se pudo leer), así que no se rebajan ni se mandan por ahora. Cada fila dice por qué.",
      icono: "reloj",
      est: "info",
      prendas: sinRitmo,
    },
  ];

  const pista = (p: ModeloAnalisis) => {
    const dias = p.diasSinVender ?? 0;
    // Cada fila dibuja su zona de liquidar desde el escalón de SU tipo (la vara de Frescura); un tipo sin ritmo no tiene zona (ni número inventado).
    const { n, zona, cifraALaIzquierda, liquidar: desde } = pistaQuieta(dias, fin, p.umbrales?.liquidar ?? null);
    return (
      <span className={desde === null ? "pista zonas sin-zona" : "pista zonas"} style={{ ...(desde === null ? {} : { ["--u" as string]: `${desde}%` }), ["--r" as string]: `${tresMeses}%` }}>
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

  const pildoras = (p: ModeloAnalisis, g: GrupoCarril) => {
    const vende = g.clave === "enviar" ? destinoParaEnviar(p.otras) : null;
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

  const accion = (p: ModeloAnalisis, g: GrupoCarril) => {
    if (g.clave === "enviar") {
      const vende = destinoParaEnviar(p.otras);
      const href = vende ? hrefEnviar([p], { id: vende.sedeId }, acceso) : null;
      if (!vende) return null;
      // Todo lo que allá se vendió está en el piso: el botón abriría un traslado vacío. Se dice qué hacer en vez de dibujarlo.
      if (!href && acceso.traslados) return <span className="b-nota">Sácala del piso primero</span>;
      if (!href) return null;
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
          <Numero valor={nf(cifras.prendas)} et={plural(cifras.prendas, "modelo quieto", "modelos quietos")} sub={`${nf(cifras.unidades)} ${plural(cifras.unidades, "unidad", "unidades")}`} />
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

      {/* Lo que nunca salió al piso no cuenta aquí (20261007120000): tiene su pestaña, y esto lleva a ella. */}
      {sinSalir > 0 && (
        <div className="tarjeta q-pie entra" style={{ ["--i" as string]: 1 }}>
          <span className="b-nota">
            <b>{nf(sinSalir)}</b> {plural(sinSalir, "modelo nunca salió al piso: no cuenta aquí.", "modelos nunca salieron al piso: no cuentan aquí.")}
          </span>
          <button type="button" className="btn-cayla btn-sutil btn-s" onClick={() => irA("piso")}>
            Nunca salió al piso <Icono nombre="sigue" />
          </button>
        </div>
      )}

      {sinComparar > 0 && (
        <div className="tarjeta q-pie entra" style={{ ["--i" as string]: 1 }}>
          <span className="b-nota">
            <b>{nf(sinComparar)}</b> {plural(sinComparar, "modelo quieto es de un tipo que todavía no vendió nada: no hay con qué compararlo, así que no se juzga.", "modelos quietos son de tipos que todavía no vendieron nada: no hay con qué compararlos, así que no se juzgan.")}
          </span>
        </div>
      )}

      {vacio === "todo-se-mueve" || vacio === "todavia-no" ? (
        <section className="tarjeta carril entra" style={{ ["--i" as string]: 2 }}>
          <div className="c-cab">
            <div>
              <h3 className="b-tit">Días en el piso sin venderse</h3>
              <span className="c-sub">{notaUmbral}</span>
            </div>
          </div>
          <SinCarril tipo={vacio} dentro linea={vacio === "todavia-no" ? lineaTodaviaNoQuietas(datos.prendas, datos.frescura) : undefined} />
        </section>
      ) : (
        <Carril
          titulo="Días en el piso sin venderse"
          nota={notaUmbral}
          franja={sinQueLiquidar ? <Vacio tamano="chico" icono={<Hourglass />} titulo="Todavía no se puede saber qué liquidar">{lineaTodaviaNoQuietas(datos.prendas, datos.frescura)}</Vacio> : undefined}
          eje={[
            { texto: "0", left: "0%" },
            ...(comun !== null
              ? [
                  {
                    texto: (
                      <span className="zona" style={{ color: "var(--color-ambar)" }}>
                        Liquidar
                      </span>
                    ),
                    left: `${pistaQuieta(0, fin, comun).liquidar}%`,
                  },
                ]
              : []),
            ...(etiquetas.tresMeses
              ? [
                  {
                    texto: (
                      <span className="zona" style={{ color: "var(--color-rojo-profundo)" }}>
                        3 meses
                      </span>
                    ),
                    left: `${tresMeses}%`,
                  },
                ]
              : []),
            { texto: etiquetas.fin, left: "100%" },
          ]}
          grupos={grupos}
          pista={pista}
          pildoras={pildoras}
          accion={accion}
          notaDeFila={(p, g) => {
            if (g.clave === "sin_ritmo") return razonSinRitmo(p, "fila");
            if (g.clave === "duda") return razonDuda(p);
            if (g.clave !== "enviar") return null;
            const vende = destinoParaEnviar(p.otras);
            const l = vende ? loQueLlevaElEnvio([p], vende.sedeId) : null;
            return l ? textoPuedesMandar(l.movibles, l.deLoVendido) || null : null;
          }}
        />
      )}

      {acceso.frescura && (
        <div className="tarjeta q-pie entra" style={{ ["--i" as string]: 3 }}>
          <span className="b-nota">¿Cambiar de lugar lo colgado sin rebajar?</span>
          <Link href="/gestion/frescura" className="btn-cayla btn-sutil btn-s">
            Frescura del piso <Icono nombre="sigue" />
          </Link>
        </div>
      )}
    </>
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
          Lo que salió al piso, por tiempo sin venderse
        </h3>
      </div>
      <div className="edad">
        {total === 0 ? (
          <i className="q-sin">Sin prendas</i>
        ) : (
          // Un tramo sin unidades no se dibuja: una franja roja de «Más de 3 meses» diría que hay ropa vieja donde no hay.
          tramos.filter((t) => t.unidades > 0).map((t, k) => (
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
function SinCarril({
  tipo,
  dentro = false,
  linea,
}: {
  tipo: VacioQuietas;
  /** Dentro de la tarjeta del carril, sin tarjeta propia. */
  dentro?: boolean;
  /** La línea en vez de la de siempre («Todavía no se puede saber» dice con qué umbral). */
  linea?: string;
}) {
  const texto = { ...TEXTO_VACIO_QUIETAS[tipo], ...(linea ? { linea } : {}) };
  // «No pude ver tus prendas» no es un vacío sino una lectura que falló: va como aviso de error (Felipe 2026-10-08).
  if (tipo === "sin-datos")
    return (
      <Aviso tono="error" titulo={texto.titulo}>
        {texto.linea}
      </Aviso>
    );
  // La pieza única de vacío (ADR-0358, ronda 5): el título ya dice el estado, así que el chip «bien / sin datos» ya no se repite.
  // «Todavía no se puede saber» no es un «todo bien»: el reloj de arena, no el visto (tarea #2, 2026-10-14).
  const vacio = (
    <Vacio icono={tipo === "todavia-no" ? <Hourglass /> : <Check />} titulo={texto.titulo}>
      {texto.linea}
    </Vacio>
  );
  if (dentro) return vacio;
  return (
    <section className="tarjeta entra" style={{ ["--i" as string]: 0 }}>
      {vacio}
    </section>
  );
}
