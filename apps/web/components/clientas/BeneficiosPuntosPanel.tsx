"use client";

import { useState, type ChangeEvent, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
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
  fechaCorta,
  lecturaDelRetorno,
  problemasDeConfig,
  vigenciaDelCambio,
  type BorradorConfig,
  type CampoConfig,
  type ResumenDeBeneficios,
} from "@/lib/club-puntos-config-reglas";

// «Beneficios del club» (programa de puntos, actividad 8): solo el LÍDER cambia lo que se le ofrece al cliente, sin deploy. Se ve lo
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
      <EncabezadoPagina sede={sede} titulo="Beneficios del club" subtitulo="Cuánto valen los puntos, desde cuándo se canjean y cuánto dura un cupón, para las 3 tiendas." />
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
  const responsable = useResponsable();
  const guia = useGuiaCampos(camposDeConfig(borrador, responsable.listo));
  const problemas = problemasDeConfig(borrador);
  const nueva = configDelBorrador(borrador);
  const cambios = nueva ? cambiosDeConfig(base, nueva) : [];
  const sinCambios = nueva !== null && cambios.length === 0;
  const vigencia = nueva && cambios.length > 0 ? vigenciaDelCambio(base, nueva, hoy) : null;
  const retorno = lecturaDelRetorno(nueva ?? base);

  const poner = (campo: CampoConfig) => (e: ChangeEvent<HTMLInputElement>) => setBorrador((b) => ({ ...b, [campo]: e.target.value }));

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
    const conAviso = desde !== null && desde > hoy;
    avisar.exito("Beneficios del club guardados", {
      detalle: conAviso ? `Rigen desde el ${fechaCorta(desde)}: hasta entonces todo sigue igual. Los Términos los publica el abogado.` : "Ya rigen. Los Términos los publica el abogado.",
    });
    router.refresh();
  }

  return (
    <form onSubmit={guardar} className="anim-sube space-y-6 rounded-xl border border-sand bg-papel p-5" style={{ "--i": 3 } as CSSProperties} data-guia="beneficios.formulario">
      <p className="nota-cayla">
        <b>Cambiar lo que valen los puntos o desde cuántos se canjea rige 15 días después de guardar</b>, para avisarlo a los clientes. Lo demás rige desde hoy.
        Los cupones que ya se crearon no cambian.
      </p>

      <Grupo titulo="Cómo se ganan y cuánto valen">
        <Campo campo="puntosPorSol" titulo="Puntos por cada S/ 1" ayuda="Lo que paga el cliente" guia={guia} borrador={borrador} poner={poner} guardando={guardando} fin="puntos" decimal />
        <Campo campo="solesPor100" titulo="Lo que valen 100 puntos" ayuda="En soles de descuento" guia={guia} borrador={borrador} poner={poner} guardando={guardando} inicio="S/" decimal />
      </Grupo>

      <Grupo titulo="Cómo se canjean">
        <Campo campo="canjeMinimo" titulo="Canje mínimo" ayuda="De 100 en 100" guia={guia} borrador={borrador} poner={poner} guardando={guardando} fin="puntos" />
        <Campo campo="compraMinimaX" titulo="Compra mínima del cupón" ayuda="Veces el valor del cupón" guia={guia} borrador={borrador} poner={poner} guardando={guardando} fin="veces" decimal />
        <Campo campo="vigenciaDias" titulo="Duración del cupón" ayuda="Si no se usa, los puntos vuelven" guia={guia} borrador={borrador} poner={poner} guardando={guardando} fin="días" />
      </Grupo>

      <Grupo titulo="Regalo y costo">
        <Campo campo="regaloCumple" titulo="Regalo de cumpleaños" ayuda="Con su primera compra del mes" guia={guia} borrador={borrador} poner={poner} guardando={guardando} fin="puntos" />
        <Campo campo="topeCostoPct" titulo="Tope de costo" ayuda="Lo máximo que aceptas devolver" guia={guia} borrador={borrador} poner={poner} guardando={guardando} fin="%" decimal />
      </Grupo>

      <div data-guia="beneficios.retorno">
        <Aviso tono={retorno.superaElTope ? "atencion" : "info"} chico>
          {retorno.texto}
        </Aviso>
      </div>

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
    </form>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-1 text-[13px] font-semibold text-tinta">{titulo}</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

function Campo({
  campo,
  titulo,
  ayuda,
  guia,
  borrador,
  poner,
  guardando,
  inicio,
  fin,
  decimal = false,
}: {
  campo: CampoConfig;
  titulo: string;
  ayuda: string;
  guia: ReturnType<typeof useGuiaCampos>;
  borrador: BorradorConfig;
  poner: (c: CampoConfig) => (e: ChangeEvent<HTMLInputElement>) => void;
  guardando: boolean;
  inicio?: ReactNode;
  fin?: ReactNode;
  decimal?: boolean;
}) {
  return (
    <CampoGuiado id={campo} guia={guia} titulo={titulo} ayuda={ayuda}>
      <span className="caja-cayla caja-campo gap-1.5">
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
          className="self-stretch py-0 text-sm tabular-nums"
        />
        {fin && (
          <span className="shrink-0 text-xs text-taupe" aria-hidden>
            {fin}
          </span>
        )}
      </span>
    </CampoGuiado>
  );
}
