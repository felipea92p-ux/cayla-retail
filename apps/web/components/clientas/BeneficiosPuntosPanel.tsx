"use client";

import { useState, type ChangeEvent, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { TituloGrupo, TituloSeccion } from "@/components/ui/TituloSeccion";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip } from "@/components/ui/Chip";
import { ConMarca } from "@/components/ficha-producto/TiraFicha";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { traducirError } from "@/lib/error-escritura";
import { guardarBeneficiosPuntos } from "@/lib/club-puntos-acciones";
import { camposDeConfig } from "@/lib/club-puntos-config-guia";
import {
  borradorDeConfig,
  cambioDelHistorial,
  cambiosDeConfig,
  configDelBorrador,
  configEnPalabras,
  COMPRA_DE_EJEMPLO,
  DIAS_DE_AVISO,
  ejemploDelPrograma,
  fechaCorta,
  lecturaDelRetorno,
  problemasDeConfig,
  sumarDias,
  vigenciaDelCambio,
  type BorradorConfig,
  type ConfigDelClub,
  type EjemploDelPrograma,
  type CampoConfig,
  type ResumenDeBeneficios,
} from "@/lib/club-puntos-config-reglas";

// «Beneficios del club» (programa de puntos, actividad 8; diseño A elegido por Felipe el 2026-10-20, `docs/maquetas/beneficios-club-2026-10/`:
// cada número dice qué significa con su valor de hoy y, al lado, «Así lo vive un cliente» muestra el camino completo): solo el LÍDER cambia lo que se le ofrece al cliente, sin deploy. Se ve lo
// que cuesta (puntos en circulación, lo que se debe en soles, cupones vivos, lo canjeado del mes), el formulario con lo VIGENTE (o lo
// ya programado: lo último que se guardó), cuánto devuelve el programa de cada compra y qué cambió la última vez. Un cambio de lo que
// valen los puntos o del canje rige 15 días después (Términos 5.9): la pantalla lo dice ANTES de guardar y la base lo hace cumplir.
// NO toca `club_textos`: los Términos los publica el abogado. Si la base no dio lo vigente no hay formulario (se guardaría encima de
// valores que no se ven). Guía de foco con la misma regla que apaga «Guardar» (`lib/club-puntos-config-guia.ts`, probada contra
// `problemasDeConfig`).

const ID: Record<CampoConfig, string> = {
  puntosPorSol: "beneficios-puntos-por-sol",
  solesPor100: "beneficios-soles-por-100",
  canjeMinimo: "beneficios-canje-minimo",
  compraMinimaX: "beneficios-compra-minima",
  vigenciaDias: "beneficios-vigencia",
  regaloCumple: "beneficios-regalo",
  topeCostoPct: "beneficios-tope",
};

const soles = (n: number) => `S/\u00a0${n.toLocaleString("es-PE", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const miles = (n: number) => n.toLocaleString("es-PE");

export function BeneficiosPuntosPanel({ sede, resumen, falla, hoy }: { sede: string; resumen: ResumenDeBeneficios | null; falla: string | null; hoy: string }) {
  return (
    <div className="space-y-8">
      <EncabezadoPagina sede={sede} titulo="Beneficios del club" subtitulo="Lo que el club le da a tus clientes y lo que te cuesta. Vale para las 3 tiendas." />
      {resumen ? (
        <Contenido resumen={resumen} hoy={hoy} />
      ) : (
        <div className="space-y-3">
          <Aviso tono="error">{falla ?? "No se pudieron leer los beneficios vigentes del club."}</Aviso>
          <p className="text-sm text-tinta/70">Sin lo vigente no se puede editar: se guardaría encima de valores que no se ven.</p>
        </div>
      )}
    </div>
  );
}

function Contenido({ resumen, hoy }: { resumen: ResumenDeBeneficios; hoy: string }) {
  const { cifras, programada, vigente, historial } = resumen;
  return (
    <>
      <div className="anim-sube grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ "--i": 1 } as CSSProperties} data-guia="beneficios.cifras">
        <TarjetaCifra etiqueta="Puntos en circulación" valor={miles(cifras.puntosEnCirculacion)}>
          {cifras.miembrosConPuntos === 1 ? "De 1 miembro con puntos" : `De ${miles(cifras.miembrosConPuntos)} miembros con puntos`}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Lo que debes en puntos" valor={soles(cifras.deudaSoles)}>
          Si todos los canjearan hoy
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Cupones vivos" valor={cifras.cuponesVivos} punto={cifras.cuponesVivos ? "verde" : undefined}>
          {cifras.cuponesVivos ? `${soles(cifras.cuponesVivosSoles)} por usar` : "Ninguno por usar"}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Canjeado este mes" valor={soles(cifras.canjeadoMesSoles)}>
          {cifras.canjeadoMesCupones === 1 ? "En 1 cupón usado" : `En ${cifras.canjeadoMesCupones} cupones usados`}
        </TarjetaCifra>
      </div>

      {programada && (
        <div className="anim-sube" style={{ "--i": 2 } as CSSProperties} data-guia="beneficios.programada">
          <Aviso tono="atencion" titulo={`Hay un cambio programado: rige desde el ${fechaCorta(programada.desde)}`}>
            {configEnPalabras(programada)}. Hasta entonces sigue rigiendo lo de hoy.
          </Aviso>
        </div>
      )}

      {/* La versión de la que parte el formulario: lo último que se guardó (la programada, si hay una). La `key` lo reinicia al cambiar. */}
      <Formulario key={JSON.stringify(programada ?? vigente)} base={programada ?? vigente} hoy={hoy} />

      <section className="anim-sube space-y-3" style={{ "--i": 4 } as CSSProperties} data-guia="beneficios.historial">
        <TituloSeccion>Últimos cambios</TituloSeccion>
        {historial.length === 0 ? (
          <p className="nota-cayla">Todavía nadie cambió los beneficios: rigen los del arranque del programa.</p>
        ) : (
          <ul className="divide-y divide-sand rounded-xl border border-sand bg-papel">
            {historial.map((h) => {
              const lineas = cambioDelHistorial(h);
              return (
                <li key={h.cuando} className="px-4 py-3 text-[13px]">
                  <p className="font-semibold text-tinta">
                    {h.quien ?? "Alguien del equipo"} <span className="font-normal text-tinta/60">· {h.desde ? `rige desde el ${fechaCorta(h.desde)}` : "cambió los beneficios"}</span>
                  </p>
                  {lineas.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-tinta/75">
                      {lineas.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function Formulario({ base, hoy }: { base: ResumenDeBeneficios["vigente"]; hoy: string }) {
  const router = useRouter();
  const [borrador, setBorrador] = useState<BorradorConfig>(() => borradorDeConfig(base));
  const [guardando, setGuardando] = useState(false);
  const [compra, setCompra] = useState<number>(COMPRA_DE_EJEMPLO.inicial);
  const responsable = useResponsable();
  const guia = useGuiaCampos(camposDeConfig(borrador, responsable.listo));
  const problemas = problemasDeConfig(borrador);
  const nueva = configDelBorrador(borrador);
  const cambios = nueva ? cambiosDeConfig(base, nueva) : [];
  const sinCambios = nueva !== null && cambios.length === 0;
  const vigencia = nueva && cambios.length > 0 ? vigenciaDelCambio(base, nueva, hoy) : null;
  // Lo que se ve al lado de cada número sale de lo escrito si está bien; si no, de lo que rige (nunca de un número a medio escribir).
  const actual = nueva ?? base;
  const retorno = lecturaDelRetorno(actual);
  const ejemplo = ejemploDelPrograma(actual, compra);
  // Lo que valen los puntos y el canje mínimo rigen con aviso (Términos 5.9): su campo lo dice apenas se cambia.
  const conAviso = (campo: "solesPor100" | "canjeMinimo") =>
    nueva && nueva[campo] !== base[campo] ? `Rige el ${fechaCorta(sumarDias(hoy, DIAS_DE_AVISO))}` : null;

  const poner = (campo: CampoConfig) => (e: ChangeEvent<HTMLInputElement>) => setBorrador((b) => ({ ...b, [campo]: e.target.value }));
  const fila = { guia, borrador, poner, guardando };

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!nueva) {
      const primero = (Object.keys(ID) as CampoConfig[]).find((k) => problemas[k] !== null);
      if (primero) avisar.error(problemas[primero]!, { enfocar: ID[primero] });
      return;
    }
    if (sinCambios) {
      avisar.aviso("No cambiaste ningún beneficio.");
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { desde, error } = await guardarBeneficiosPuntos(nueva, responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "guardar los beneficios del club"));
      return;
    }
    const rigeDespues = desde !== null && desde > hoy;
    avisar.exito("Beneficios del club guardados", {
      detalle: rigeDespues ? `Rigen desde el ${fechaCorta(desde)}: hasta entonces todo sigue igual. Los Términos los publica el abogado.` : "Ya rigen. Los Términos los publica el abogado.",
    });
    router.refresh();
  }

  return (
    <form onSubmit={guardar} className="anim-sube grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]" style={{ "--i": 3 } as CSSProperties}>
      <div className="space-y-6 rounded-xl border border-sand bg-papel p-5" data-guia="beneficios.formulario">
        <section className="space-y-3">
          <TituloGrupo>Lo que gana</TituloGrupo>
          <Fila campo="puntosPorSol" titulo={"Puntos por cada S/\u00a01 que paga"} fin="puntos" decimal {...fila}>
            Una compra de {soles(150)} le da <b className="font-medium text-tinta">{puntos(ejemploDelPrograma(actual, 150).puntosDeLaCompra)}</b>.
          </Fila>
          <Fila campo="regaloCumple" titulo="Regalo de cumpleaños" fin="puntos" {...fila}>
            {actual.regaloCumple > 0 ? (
              <>
                Con su primera compra de su mes. Equivalen a <b className="font-medium text-tinta">{soles(ejemplo.valorDelRegalo)}</b>.
              </>
            ) : (
              "Con 0, el cumpleaños no regala puntos."
            )}
          </Fila>
        </section>

        <section className="space-y-3">
          <TituloGrupo>Cuánto valen y cuándo se canjean</TituloGrupo>
          <Fila campo="solesPor100" titulo="100 puntos valen" inicio="S/" decimal aviso={conAviso("solesPor100")} {...fila}>
            Es el descuento que recibe al canjear. Si lo cambias, rige en {DIAS_DE_AVISO} días para avisarlo a los clientes.
          </Fila>
          <Fila campo="canjeMinimo" titulo="Puede canjear desde" fin="puntos" aviso={conAviso("canjeMinimo")} {...fila}>
            Su primer cupón, de <b className="font-medium text-tinta">{soles(ejemplo.valorDelPrimerCupon)}</b>, lo consigue cuando sus compras suman{" "}
            <b className="font-medium text-tinta">{soles(ejemplo.comprasParaElPrimerCupon)}</b> (en una o varias visitas).
          </Fila>
          <Fila campo="compraMinimaX" titulo="El cupón se usa en compras de al menos" fin="veces su valor" decimal {...fila}>
            Un cupón de <b className="font-medium text-tinta">{soles(ejemplo.valorDelPrimerCupon)}</b> se usa en compras desde{" "}
            <b className="font-medium text-tinta">{soles(ejemplo.compraMinimaDelCupon)}</b>. Así nunca paga la compra entera.
          </Fila>
          <Fila campo="vigenciaDias" titulo="El cupón dura" fin="días" {...fila}>
            Si no lo usa en ese tiempo, sus puntos vuelven a su saldo.
          </Fila>
        </section>

        <section className="space-y-3">
          <TituloGrupo>Lo que te cuesta</TituloGrupo>
          <CampoGuiado id="topeCostoPct" guia={guia} className="rounded-xl border border-sand px-4 py-4">
            <div data-guia="beneficios.retorno" className="space-y-3">
              <p className="text-[15px] text-tinta">{retorno.frase}</p>
              <div>
                <BarraAvance
                  pct={(retorno.pct / ESCALA_DEL_COSTO) * 100}
                  alto="gruesa"
                  tono={retorno.superaElTope ? "rojo" : "tinta"}
                  marca={(actual.topeCostoPct / ESCALA_DEL_COSTO) * 100}
                  decorativa
                />
                <div className="mt-1 flex justify-between text-[11px] text-taupe">
                  <span>0 %</span>
                  <span>La rayita es tu tope</span>
                  <span>{ESCALA_DEL_COSTO} %</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <label htmlFor={ID.topeCostoPct} className="text-[13.5px] text-tinta">
                  <ConMarca estado={guia.estado("topeCostoPct")}>No quiero devolver más de</ConMarca>
                </label>
                <Caja campo="topeCostoPct" titulo="Tope de costo" fin="%" decimal {...fila} />
                <span className={`text-[13px] font-medium ${retorno.superaElTope ? "text-rojo-profundo" : "text-verde"}`}>{retorno.veredicto}</span>
              </div>
            </div>
          </CampoGuiado>
        </section>

        <CampoGuiado id="responsable" guia={guia}>
          <div data-guia="beneficios.responsable">
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </div>
        </CampoGuiado>

        {cambios.length > 0 && (
          <div className="rounded-lg border border-sand px-4 py-3">
            <p className="text-[13px] font-semibold text-tinta">Cambias</p>
            <ul className="mt-1 space-y-0.5 text-[13px] text-tinta/75">
              {cambios.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            {vigencia && <p className="mt-2 text-[13px] font-medium text-tinta">{vigencia.texto}</p>}
          </div>
        )}

        <PieGuia guia={guia} listo={sinCambios ? "Todo en orden. Cambia un valor para guardar." : "Todo listo para guardar."} />

        <PieAcciones guia="beneficios.guardar">
          <Boton
            type="submit"
            peso="primario"
            cargando={guardando}
            disabled={!guia.puedeConfirmar || sinCambios}
            title={responsable.motivo ?? guia.frase ?? (sinCambios ? "No cambiaste ningún beneficio." : undefined)}
            className={sinCambios ? "" : guia.claseConfirmar}
          >
            Guardar
          </Boton>
        </PieAcciones>
      </div>

      <Ejemplo config={actual} ejemplo={ejemplo} compra={compra} onCompra={setCompra} />
    </form>
  );
}

/** El tope de la barra de «Lo que te cuesta»: del 0 al 10 % (más que eso ya no es un club, es una liquidación). */
const ESCALA_DEL_COSTO = 10;

const puntos = (n: number) => `${miles(n)} ${n === 1 ? "punto" : "puntos"}`;

/** «Así lo vive un cliente» (diseño A, Felipe 2026-10-20): el camino completo con los números de la izquierda. Solo se lee. */
function Ejemplo({
  config,
  ejemplo,
  compra,
  onCompra,
}: {
  config: ConfigDelClub;
  ejemplo: EjemploDelPrograma;
  compra: number;
  onCompra: (n: number) => void;
}) {
  return (
    <aside className="rounded-xl border border-sand bg-papel p-5 lg:sticky lg:top-24" data-guia="beneficios.ejemplo">
      <TituloGrupo>Así lo vive un cliente</TituloGrupo>
      <p className="mt-1 text-[13px] text-taupe">Con los números de la izquierda. Mueve la compra para probar.</p>
      <ol className="mt-3 divide-y divide-sand">
        <PasoEjemplo n={1}>
          <label htmlFor="beneficios-compra-ejemplo" className="text-[13.5px] text-tinta">
            Compra <b className="font-semibold tabular-nums">{soles(compra)}</b>
          </label>
          <input
            id="beneficios-compra-ejemplo"
            type="range"
            min={COMPRA_DE_EJEMPLO.min}
            max={COMPRA_DE_EJEMPLO.max}
            step={COMPRA_DE_EJEMPLO.paso}
            value={compra}
            onChange={(e) => onCompra(Number(e.target.value))}
            className="mt-1 block w-full accent-tinta"
          />
          <p className="font-display text-[20px] leading-tight text-tinta">Gana {puntos(ejemplo.puntosDeLaCompra)}</p>
        </PasoEjemplo>
        <PasoEjemplo n={2}>
          <p className="text-[13.5px] text-tinta">
            Junta <b className="font-semibold">{puntos(config.canjeMinimo)}</b> y canjea
          </p>
          <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-dashed border-taupe px-3 py-2.5">
            <div>
              <p className="label-cayla text-[10.5px] text-taupe">Cupón del club</p>
              <p className="font-display text-[26px] leading-none text-tinta">{soles(ejemplo.valorDelPrimerCupon)}</p>
            </div>
            <p className="text-right text-[12.5px] text-tinta/75">
              en compras desde
              <br />
              <b className="font-semibold text-tinta">{soles(ejemplo.compraMinimaDelCupon)}</b>
            </p>
          </div>
          <p className="mt-1.5 text-[12.5px] text-taupe">
            Lo usa dentro de <b className="font-medium text-tinta">{config.vigenciaDias === 1 ? "1 día" : `${config.vigenciaDias} días`}</b>. Si no, sus puntos vuelven.
          </p>
        </PasoEjemplo>
        <PasoEjemplo n={3}>
          <p className="text-[13.5px] text-tinta">En su mes de cumpleaños</p>
          {config.regaloCumple > 0 ? (
            <>
              <p className="font-display text-[20px] leading-tight text-tinta">+{puntos(config.regaloCumple)}</p>
              <p className="text-[12.5px] text-taupe">con su primera compra del mes ({soles(ejemplo.valorDelRegalo)})</p>
            </>
          ) : (
            <p className="text-[12.5px] text-taupe">{/* unificar-fijo: dice cómo quedó el regalo con 0 puntos, no es un vacío */}Sin regalo de cumpleaños.</p>
          )}
        </PasoEjemplo>
      </ol>
    </aside>
  );
}

function PasoEjemplo({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-2.5 py-3 first:pt-1">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-hueso text-[12px] font-semibold text-tinta" aria-hidden>
        {n}
      </span>
      <div>{children}</div>
    </li>
  );
}

type PropsDeFila = {
  campo: CampoConfig;
  titulo: string;
  guia: ReturnType<typeof useGuiaCampos>;
  borrador: BorradorConfig;
  poner: (c: CampoConfig) => (e: ChangeEvent<HTMLInputElement>) => void;
  guardando: boolean;
  inicio?: ReactNode;
  fin?: ReactNode;
  decimal?: boolean;
};

/** Un número del programa: su título (con la marca de la guía), su caja a la derecha y, debajo, lo que significa con el número de hoy. */
function Fila({ aviso, children, ...props }: PropsDeFila & { aviso?: string | null; children: ReactNode }) {
  const { campo, titulo, guia } = props;
  return (
    <CampoGuiado id={campo} guia={guia} className="rounded-xl border border-sand px-4 py-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5">
        <label htmlFor={ID[campo]} className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-tinta" /* unificar-fijo: diseño A elegido por Felipe (2026-10-20): el título es una frase que se lee junto a su número, no la versalita de Campo */>
          <ConMarca estado={guia.estado(campo)}>{titulo}</ConMarca>
          {aviso && <Chip tono="ambar">{aviso}</Chip>}
        </label>
        <Caja {...props} />
        <p className="col-span-2 text-[12.5px] text-taupe">{children}</p>
      </div>
    </CampoGuiado>
  );
}

function Caja({ campo, titulo, borrador, poner, guardando, inicio, fin, decimal = false }: PropsDeFila) {
  return (
    <span className="caja-cayla caja-campo w-40 gap-1.5">
      {inicio && (
        <span className="text-xs text-taupe" aria-hidden>
          {inicio}
        </span>
      )}
      <input
        id={ID[campo]}
        aria-label={titulo}
        inputMode={decimal ? "decimal" : "numeric"}
        autoComplete="off"
        value={borrador[campo]}
        onChange={poner(campo)}
        disabled={guardando}
        className="min-w-0 flex-1 self-stretch py-0 text-sm tabular-nums"
      />
      {fin && (
        <span className="shrink-0 text-xs text-taupe" aria-hidden>
          {fin}
        </span>
      )}
    </span>
  );
}
