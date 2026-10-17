"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, Sparkles } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Globito } from "@/components/ui/Globito";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import {
  FILTROS,
  cifrasDeCampanas,
  conteoPorFiltro,
  cruceDeHoy,
  hastaEl,
  ordenarYFiltrar,
  rangoDeLaLinea,
  textoPct,
  type Campana,
  type DiaPortada,
  type Filtro,
} from "@/lib/campanas-reglas";
import { fechaCorta } from "@/lib/etiqueta-vigencia";
import { LineaPortada } from "./LineaPortada";
import { TarjetaCampana } from "./TarjetaCampana";

/** Cierra una frase con punto, sin duplicarlo si ya termina en uno («hasta el 30 oct.»). */
const conPunto = (frase: string) => (frase.endsWith(".") ? frase : `${frase}.`);

/**
 * Tienda web ▸ Campañas (ADR-0436; maqueta, pantalla 1): las cifras (qué anuncia la portada hoy, cuántas corren, cuál viene), «La portada,
 * día a día» y todas las campañas con su filtro. `dias` es lo que contestó la base para la línea (null si no respondió: la línea lo dice y
 * lo demás se ve igual).
 */
export function CampanasPantalla({ campanas, dias, hoy }: { campanas: Campana[]; dias: DiaPortada[] | null; hoy: string }) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const rango = rangoDeLaLinea(hoy);
  const cifras = cifrasDeCampanas(campanas, dias, hoy);
  const cruce = cruceDeHoy(campanas, dias, hoy);
  const conteo = conteoPorFiltro(campanas, hoy);
  const visibles = ordenarYFiltrar(campanas, filtro, hoy);

  if (campanas.length === 0) {
    return (
      <Vacio icono={<Sparkles />} titulo="Todavía no hay campañas" guia="campanas.vacio">
        Cuando se cree una campaña, aparece aquí con sus fechas, su descuento y el día en que sale en la portada.
      </Vacio>
    );
  }

  const { enPortada, vigentes, proxima } = cifras;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3" data-guia="campanas.cifras">
        <TarjetaCifra
          etiqueta="En la portada hoy"
          punto={enPortada ? "verde" : "neutro"}
          vivo={!!enPortada}
          className="tw-entra"
          style={{ ["--i" as string]: 0 }}
          valor={enPortada?.nombre ?? "Lo nuevo"}
        >
          {enPortada
            ? [enPortada.pct ? `−${textoPct(enPortada.pct)} %` : null, enPortada.hasta ? hastaEl(enPortada.hasta) : null].filter(Boolean).join(" · ")
            : dias === null
              ? "No se pudo leer qué sale hoy"
              : "Hoy no corre ninguna campaña que salga en la portada"}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Vigentes hoy" className="tw-entra" style={{ ["--i" as string]: 1 }} valor={vigentes.length}>
          {vigentes.length === 0 ? "Ninguna corre hoy" : vigentes.map((c) => c.nombre).join(" y ")}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="La próxima" className="tw-entra" style={{ ["--i" as string]: 2 }} valor={proxima?.campana.nombre ?? "Ninguna"}>
          {proxima ? `${proxima.enDias === 1 ? "Mañana" : `En ${proxima.enDias} días`} · desde el ${fechaCorta(proxima.campana.desde!)}` : "No hay otra campaña con fecha"}
        </TarjetaCifra>
      </div>

      <section className="card-cayla tw-entra" style={{ ["--i" as string]: 3 }} data-guia="campanas.linea">
        <div className="border-b border-sand px-4 py-3.5 sm:px-5">
          <TituloSeccion dato="La que dice la regla de la tienda, día por día">La portada, día a día</TituloSeccion>
        </div>
        {dias === null ? (
          <div className="p-4 sm:p-5">
            <Aviso tono="atencion" titulo="No se pudo leer qué campaña sale cada día">
              La lista de campañas de abajo está al día. Recarga la página para volver a intentarlo.
            </Aviso>
          </div>
        ) : (
          <LineaPortada campanas={campanas} dias={dias} rango={rango} hoy={hoy} />
        )}
        <div className="space-y-3 px-4 pb-4 sm:px-5 sm:pb-5">
          <p className="nota-cayla">
            Cada barra lleva los colores de la portada de su campaña. La rayada es «Lo nuevo»: lo que la tienda muestra cuando no corre ninguna
            campaña con descuento.
          </p>
          {cruce && (
            <p className="nota-cayla" data-guia="campanas.cruce">
              <b>{conPunto(`${cruce.nombres.join(" y ")} corren a la vez${cruce.hasta ? ` ${hastaEl(cruce.hasta)}` : ""}`)}</b>{" "}
              La portada muestra una sola campaña:{" "}
              {cruce.enPortada ? `hoy sale «${cruce.enPortada.nombre}», la que termina primero entre las que tienen descuento.` : "hoy ninguna de ellas, porque no tienen descuento."}
            </p>
          )}
        </div>
      </section>

      <section className="card-cayla tw-entra" style={{ ["--i" as string]: 4 }} data-guia="campanas.lista">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand px-4 py-3.5 sm:px-5">
          <TituloSeccion cuenta={campanas.length}>Todas las campañas</TituloSeccion>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar las campañas" data-guia="campanas.filtros">
            {FILTROS.map((f) => (
              <button key={f.clave} type="button" className="pildora-cayla" aria-pressed={filtro === f.clave} onClick={() => setFiltro(f.clave)}>
                {f.etiqueta} <Globito n={conteo[f.clave]} sobreOscuro={filtro === f.clave} />
              </button>
            ))}
          </div>
        </div>
        {visibles.length === 0 ? (
          <div className="p-4 sm:p-5">
            <Vacio tamano="chico" icono={<CalendarDays />}>
              Ninguna campaña en «{FILTROS.find((f) => f.clave === filtro)!.etiqueta}».
            </Vacio>
          </div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
            {visibles.map((c, i) => (
              <TarjetaCampana key={c.id} c={c} enPortada={enPortada} hoy={hoy} i={i} />
            ))}
          </div>
        )}
      </section>

      <p className="nota-cayla">
        Toca una campaña para cambiar su descuento, sus fechas y sus prendas. Las etiquetas que no son campaña (Para liquidar, Estreno…)
        siguen en{" "}
        <Link href="/productos/atributos?tipo=etiquetas" className="btn-enlace">
          Catálogo ▸ Atributos
        </Link>
        .
      </p>
    </div>
  );
}
