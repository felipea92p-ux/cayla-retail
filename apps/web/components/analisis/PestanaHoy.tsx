"use client";

import "@/app/estilos/por-pantalla/analisis-pestanas.css";
import type { ReactNode } from "react";
import { useAnalisis } from "@/components/analisis/contexto";
import { ChipEstado, COLOR_ESTADO, soles, TilePrenda, type Estado } from "@/components/analisis/piezas";
import { LenteTipo } from "@/components/analisis/PestanaPedir";
import { BotonVer } from "@/components/ui/BotonDescargar";
import type { VistaAnalisis } from "@/lib/analisis-tipos";
import type { ModeloAnalisis } from "@/lib/analisis-modelo";
import { plural } from "@/lib/analisis-reglas";
import { prendasSinSalir } from "@/lib/analisis-piso";
import { fraseAcaba } from "@/lib/analisis-acaba";
import { plataParada } from "@/lib/analisis-quietas";
import { alcanceConFiltros, diasANavidad, fraseAlcance, type AlcanceTipo } from "@/lib/analisis-pedir";
import { conLoRegistrado, estadoSinNada, quietasHoy, seAcabanHoy, vacioQuietasHoy } from "@/lib/analisis-hoy";

// Análisis, cara B «Una respuesta por pregunta» (ADR-0357, act. 2026-11-21): «Hoy». Cuatro tarjetas, una por pregunta de la tienda —¿qué
// se acaba?, ¿qué no se vende?, ¿qué no salió al piso?, ¿qué pedir?—, cada una con su respuesta en grande, las prendas que la forman y el
// botón que lleva a su pestaña. Reemplaza al flujo de cintas «Qué hacer hoy» (Felipe eligió la B mirando, 2026-11-21). Todo es de la
// tienda elegida arriba y de lo que dejan ver los filtros. Ninguna tarjeta dice «Va bien» cuando no puede saberlo: con datos
// incompletos, «Para saber» (tarea #2, 2026-10-14). Las cuentas viven en `lib/analisis-hoy.ts` y en las de cada pestaña.

/** Cuántas miniaturas lleva la pila de una tarjeta; las demás se cuentan («y 3 más»). */
const EN_LA_PILA = 5;

export function PestanaHoy() {
  const { datos, prendas, filtros, liquidarDesde, diasDeVentas } = useAnalisis();
  const confiable = datos.puedeHablar;
  const sinNada = estadoSinNada(confiable);

  const acaba = seAcabanHoy(prendas, liquidarDesde);
  const quietas = quietasHoy(prendas, liquidarDesde);
  const parada = quietas.reduce((t, m) => t + (plataParada(m) ?? 0), 0);
  const vacioQuietas = vacioQuietasHoy(datos.prendas, liquidarDesde, datos.hoy, confiable);
  // Sin saber cuándo salió al piso cada prenda (la base sin 20261007120000), la tarjeta lo dice con «Todavía no».
  const sinSalir = datos.sabePiso ? prendasSinSalir(prendas, datos.hoy) : [];
  const hastaNavidad = diasANavidad(datos.hoy);
  const piden = alcanceConFiltros(prendas, datos.tallas, filtros, diasDeVentas, hastaNavidad, datos.sabePiso, datos.sinPrendaPorTipo).filter((t) => t.pide);

  return (
    <div className="an-resp4" data-guia="analisis.preguntas">
      <Pregunta
        i={3}
        vista="acaba"
        pregunta="¿Qué se acaba?"
        est={acaba.length ? "urg" : sinNada}
        cifra={acaba.length ? `${acaba.length} ${plural(acaba.length, "modelo", "modelos")}` : "Nada"}
        frase={acaba.length ? fraseAcaba(acaba.length) : conLoRegistrado("Nada se está acabando.", confiable)}
        pila={<PilaPrendas lista={acaba} />}
        boton="Comprar ya"
      />
      <Pregunta
        i={4}
        vista="nose"
        pregunta="¿Qué no se vende?"
        est={quietas.length ? "ate" : vacioQuietas.est}
        cifra={quietas.length ? (parada > 0 ? soles(parada) : `${quietas.length} ${plural(quietas.length, "modelo", "modelos")}`) : "Nada"}
        frase={
          quietas.length
            ? parada > 0
              ? `parados en ${quietas.length} ${plural(quietas.length, "modelo que no se vende", "modelos que no se venden")}`
              : plural(quietas.length, "no se vende", "no se venden")
            : vacioQuietas.texto
        }
        pila={<PilaPrendas lista={quietas} />}
        boton="Ver y decidir"
      />
      <Pregunta
        i={5}
        vista="piso"
        pregunta="¿Qué no salió al piso?"
        est={!datos.sabePiso ? "nd" : sinSalir.length ? "info" : sinNada}
        // Lo guardado pide atención aunque su color sea el de su pestaña (pizarra).
        chip={sinSalir.length ? "ate" : undefined}
        cifra={!datos.sabePiso ? "—" : sinSalir.length ? `${sinSalir.length} ${plural(sinSalir.length, "modelo", "modelos")}` : "Nada"}
        frase={
          !datos.sabePiso
            ? "Todavía no se puede saber."
            : sinSalir.length
              ? plural(sinSalir.length, "está guardado y nadie lo vio", "están guardados y nadie los vio")
              : conLoRegistrado("Todo salió al piso.", confiable)
        }
        pila={<PilaPrendas lista={sinSalir} />}
        boton="Ver y bajar"
      />
      <Pregunta
        i={6}
        vista="pedir"
        pregunta="¿Qué pedir?"
        est={piden.length ? "ate" : sinNada}
        cifra={piden.length ? `${piden.length} ${plural(piden.length, "tipo", "tipos")}` : "Ninguno"}
        frase={piden.length ? fraseAlcance(piden.length, hastaNavidad) : `se acaba antes de Navidad, en ${hastaNavidad} ${plural(hastaNavidad, "día", "días")}`}
        pila={<PilaTipos lista={piden} />}
        boton="Preparar el pedido"
      />
    </div>
  );
}

/** Una pregunta: la pregunta en versalitas y su insignia, la respuesta en grande, su frase, las prendas que la forman y su botón. */
function Pregunta({
  i,
  vista,
  pregunta,
  est,
  cifra,
  frase,
  pila,
  boton,
  chip,
}: {
  i: number;
  vista: VistaAnalisis;
  pregunta: string;
  est: Estado;
  cifra: string;
  frase: string;
  pila: ReactNode;
  boton: string;
  /** La insignia, si no es la del color de la cifra. */
  chip?: Estado;
}) {
  const { irA } = useAnalisis();
  return (
    <section className="an-preg entra" style={{ ["--i" as string]: i, ["--c" as string]: COLOR_ESTADO[est] }}>
      <div className="an-preg-cab">
        <span className="label-cayla">{pregunta}</span>
        <ChipEstado est={chip ?? est} />
      </div>
      <p className="an-resp-txt">
        <b className="an-resp-cifra">{cifra}</b>
        <span className="texto-bajada">{frase}</span>
      </p>
      {pila}
      <div className="an-preg-pie">
        <BotonVer onClick={() => irA(vista)} chico>
          {boton}
        </BotonVer>
      </div>
    </section>
  );
}

/** Las primeras prendas de una respuesta, superpuestas, y cuántas más hay. */
function PilaPrendas({ lista }: { lista: readonly ModeloAnalisis[] }) {
  if (lista.length === 0) return null;
  return (
    <span className="an-pila" aria-hidden>
      {lista.slice(0, EN_LA_PILA).map((m) => (
        <span key={m.varianteId} className="an-pila-uno">
          <TilePrenda prenda={m} tamano={44} />
        </span>
      ))}
      {lista.length > EN_LA_PILA && <span className="texto-detalle ml-4">y {lista.length - EN_LA_PILA} más</span>}
    </span>
  );
}

/** Los tipos que no llegan a Navidad, con su lente. */
function PilaTipos({ lista }: { lista: readonly AlcanceTipo[] }) {
  if (lista.length === 0) return null;
  return (
    <span className="an-pila" aria-hidden>
      {lista.slice(0, EN_LA_PILA).map((t) => (
        <span key={t.categoria} className="an-pila-uno an-pila-tipo">
          <LenteTipo t={t} tamano={44} />
        </span>
      ))}
      {lista.length > EN_LA_PILA && <span className="texto-detalle ml-4">y {lista.length - EN_LA_PILA} más</span>}
    </span>
  );
}
