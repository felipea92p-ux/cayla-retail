"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, CalendarX2 } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { LapizEditar } from "@/components/ui/BotonEditar";
import { Encabezado, Tabla, celda, fila, type Columna } from "@/components/ui/Tabla";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { RangoDeVentas } from "@/components/plan-compra/RangoDeVentas";
import { createClient } from "@/lib/supabase/client";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { RPC_RESTAURAR_CALENDARIO, RPC_USO_CALENDARIO, argsInterruptor, argsRestaurar } from "@/lib/plan-compra-calendario";
import { pocaHistoria, textoDeAnios, veredictoDe, type EvidenciaDeCampana } from "@/lib/plan-compra-calendario-evidencia";
import { chipsDeLaFila, rotuloDeFechas, sePuedeArmar, type CampanaDelCalendario, type GruposDelCalendario } from "@/lib/plan-compra-calendario-vista";

// La lista del Calendario del Plan (ADR-0525, spike ①): las campañas en cuatro grupos —en mi plan, pausadas, las que no compro y las quitadas—, cada una con su interruptor, lo
// que dijo su historia y lo que dice de sí misma. El interruptor entra o saca la campaña de mi plan en un toque; una pausada, o una sin fechas, abre su hoja (ahí se
// reactiva o se le ponen las fechas). Quitar y restaurar nunca borran. La lógica (qué grupo, qué chips) es de `lib/plan-compra-calendario-vista.ts`; esto solo la dibuja y
// habla con la base: cada cambio firma el responsable, con el mismo candado de asistencia que las demás hojas del Plan (ADR-0161).

const COLUMNAS = (tienda: string | null): Columna[] => [
  { titulo: <span className="sr-only">Entra a mi plan</span> },
  { titulo: "Campaña" },
  { titulo: "Qué dice tu historia" },
  { titulo: tienda ? `Cuánto sube la venta de ${tienda}` : "Cuánto sube la venta", subtitulo: "×1 = un día normal" },
  { titulo: <span className="sr-only">Detalle y acciones</span> },
];
// La tabla se adapta al ancho de SU tarjeta (`@container`), no al de la pantalla: con la tarjeta ancha, los chips de la campaña tienen su propia columna; con una más angosta (un
// laptop de 1024 px con el lateral abierto) van bajo el nombre; y bajo 640 px, todo se apila (el celular). La última columna es de ancho fijo: con `auto` cada fila calcularía el
// suyo y las columnas se descuadrarían entre filas (ver `Tabla`).
const PLANTILLA =
  "grid-cols-[2.75rem_minmax(0,1fr)] @min-[640px]:grid-cols-[2.75rem_minmax(8rem,1.2fr)_minmax(7rem,.8fr)_minmax(9rem,1.2fr)_9rem] @min-[920px]:grid-cols-[2.75rem_minmax(11rem,1.2fr)_minmax(8rem,.8fr)_minmax(12rem,1.3fr)_17.5rem]";
const ENCABEZADO_VISIBLE = "hidden @min-[640px]:grid";

export function ListaDelCalendario({
  grupos,
  anio,
  hoy,
  evidencias,
  tienda,
  alEditar,
  alArmar,
}: {
  grupos: GruposDelCalendario;
  anio: number;
  hoy: string;
  evidencias: Readonly<Record<string, EvidenciaDeCampana | null>>;
  /** La tienda con la que se midió la historia; null si ninguna tiene. */
  tienda: { id: string; nombre: string } | null;
  alEditar: (c: CampanaDelCalendario) => void;
  alArmar: (c: CampanaDelCalendario) => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  // Mientras un cambio viaja, ese interruptor no vuelve a salir (doble clic, Enter repetido: chaos 2026-10-10).
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const enVuelo = useRef(false);

  /** Entra o sale de mi plan. Una pausada o una sin fechas abre su hoja: ahí se reactiva o se le ponen las fechas, con su responsable. */
  async function alternar(c: CampanaDelCalendario) {
    if (c.uso === "pausada" || c.fechas === null) return alEditar(c);
    if (enVuelo.current) return;
    if (!responsable.listo) return void avisar.error(responsable.motivo ?? "Elige quién hace el cambio: abre la hoja de la campaña.");
    const uso = c.uso === "activa" ? "no" : "activa";
    enVuelo.current = true;
    setTrabajando(c.clave);
    const { error } = await firmar(createClient().rpc(RPC_USO_CALENDARIO as never, argsInterruptor(c, uso) as never), responsable.firma());
    responsable.despues(error);
    setTrabajando(null);
    enVuelo.current = false;
    // Puede que SÍ se haya guardado (se cortó la red después): se relee para que la lista diga la verdad.
    if (error) {
      router.refresh();
      if (esFalloDeRed(error)) return void avisar.error("Se cortó la conexión mientras guardabas: mira cómo quedó la lista antes de volver a intentarlo.");
      return void avisar.error(traducirError(error, "cambiar la campaña"));
    }
    avisar.exito(uso === "activa" ? `«${c.nombre}» entra a tu plan` : `«${c.nombre}» sale de tu plan`, {
      detalle: uso === "activa" ? "Te ofrece armar su plan cuando falten 90 días." : "No se ofrece, y lo que ya armaste se conserva.",
    });
    router.refresh();
  }

  async function restaurar(c: CampanaDelCalendario) {
    if (c.decisionId === null || enVuelo.current) return;
    if (!responsable.listo) return void avisar.error(responsable.motivo ?? "Elige quién hace el cambio.");
    enVuelo.current = true;
    setTrabajando(c.clave);
    const { error } = await firmar(createClient().rpc(RPC_RESTAURAR_CALENDARIO as never, argsRestaurar(c.decisionId) as never), responsable.firma());
    responsable.despues(error);
    setTrabajando(null);
    enVuelo.current = false;
    if (error) {
      router.refresh();
      if (esFalloDeRed(error)) return void avisar.error("Se cortó la conexión mientras guardabas: mira cómo quedó la lista antes de volver a intentarlo.");
      return void avisar.error(traducirError(error, "restaurar la campaña"));
    }
    avisar.exito(`«${c.nombre}» vuelve al calendario`, { detalle: "Quedó como estaba cuando la quitaste." });
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <GrupoDeCampanas guia="calendario.en-mi-plan" titulo="En mi plan" nota="Aquí te ofrece armar el plan cuando faltan 90 días" vacio="Todavía no elegiste ninguna: prende el interruptor de las que sí compras." lista={grupos.enMiPlan} tienda={tienda}>
        {grupos.enMiPlan.map((c) => (
          <FilaDeCampana key={c.clave} c={c} anio={anio} hoy={hoy} evidencia={evidencias[c.clave] ?? null} ocupada={trabajando === c.clave} alAlternar={alternar} alEditar={alEditar} alArmar={alArmar} />
        ))}
      </GrupoDeCampanas>
      {grupos.pausadas.length > 0 && (
        <GrupoDeCampanas guia="calendario.pausadas" titulo="Pausadas" nota="No se ofrecen hasta su fecha de regreso" vacio="" lista={grupos.pausadas} tienda={tienda}>
          {grupos.pausadas.map((c) => (
            <FilaDeCampana key={c.clave} c={c} anio={anio} hoy={hoy} evidencia={evidencias[c.clave] ?? null} ocupada={trabajando === c.clave} alAlternar={alternar} alEditar={alEditar} alArmar={alArmar} />
          ))}
        </GrupoDeCampanas>
      )}
      <GrupoDeCampanas guia="calendario.no-las-compro" titulo="Otras fechas — no las compro" nota="Las del sistema vienen de Catálogo ▸ Insignias; prende una para sumarla" vacio="Todas entran a tu plan." lista={grupos.noLasCompro} tienda={tienda}>
        {grupos.noLasCompro.map((c) => (
          <FilaDeCampana key={c.clave} c={c} anio={anio} hoy={hoy} evidencia={evidencias[c.clave] ?? null} ocupada={trabajando === c.clave} alAlternar={alternar} alEditar={alEditar} alArmar={alArmar} />
        ))}
      </GrupoDeCampanas>
      {grupos.quitadas.length > 0 && (
        <section className="space-y-3" data-guia="calendario.quitadas">
          <TituloSeccion cuenta={grupos.quitadas.length} dato="Se pueden restaurar">
            Quitadas
          </TituloSeccion>
          <Tabla>
            {grupos.quitadas.map((c) => (
              <div key={c.clave} className={fila("grid-cols-[minmax(0,1fr)_auto]", "sm:items-center!")}>
                <span className={celda("izq", "cal-nombre text-taupe")}>
                  {c.nombre}
                  <small>{rotuloDeFechas(c.fechas)} · quitada</small>
                </span>
                <Boton peso="fantasma" className="btn-chico" disabled={trabajando === c.clave} onClick={() => void restaurar(c)}>
                  Restaurar
                </Boton>
              </div>
            ))}
          </Tabla>
        </section>
      )}
    </div>
  );
}

/** Un grupo de la lista: su título con cuántas hay, y su tabla (o, si no hay ninguna, una línea que dice qué hacer). */
function GrupoDeCampanas({
  guia,
  titulo,
  nota,
  vacio,
  lista,
  tienda,
  children,
}: {
  guia: string;
  titulo: string;
  nota: ReactNode;
  vacio: string;
  lista: readonly CampanaDelCalendario[];
  tienda: { id: string; nombre: string } | null;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3" data-guia={guia}>
      <TituloSeccion cuenta={lista.length} dato={nota}>
        {titulo}
      </TituloSeccion>
      {lista.length === 0 ? (
        <div className="card-cayla px-5 py-4">
          <Vacio tamano="chico" icono={<CalendarX2 />}>
            {vacio}
          </Vacio>
        </div>
      ) : (
        <Tabla className="@container">
          <Encabezado columnas={COLUMNAS(tienda?.nombre ?? null)} plantilla={PLANTILLA} visible={ENCABEZADO_VISIBLE} />
          {children}
        </Tabla>
      )}
    </section>
  );
}

function FilaDeCampana({
  c,
  anio,
  hoy,
  evidencia,
  ocupada,
  alAlternar,
  alEditar,
  alArmar,
}: {
  c: CampanaDelCalendario;
  anio: number;
  hoy: string;
  evidencia: EvidenciaDeCampana | null;
  ocupada: boolean;
  alAlternar: (c: CampanaDelCalendario) => void;
  alEditar: (c: CampanaDelCalendario) => void;
  alArmar: (c: CampanaDelCalendario) => void;
}) {
  const v = veredictoDe(evidencia);
  const chips = chipsDeLaFila(c, anio).map((x) => (
    <Chip key={x.texto} tono={x.tono} versalitas={false}>
      {x.texto}
    </Chip>
  ));
  return (
    <div className={fila(PLANTILLA, "cal-fila sm:items-center! @min-[640px]:items-center!")} data-uso={c.uso}>
      <span className="flex items-center">
        <button
          type="button"
          role="switch" // unificar-fijo: la cara del interruptor del sistema en una fila de tabla; su título es la columna «Entra a mi plan»
          aria-checked={c.uso === "activa"}
          aria-label={`${c.nombre}: entra a mi plan`}
          title={c.uso === "pausada" ? "Está pausada: reactívala en su hoja" : c.fechas === null ? "Ponle fechas para sumarla a tu plan" : undefined}
          disabled={ocupada}
          onClick={() => alAlternar(c)}
          className="interruptor disabled:opacity-50"
        >
          <span aria-hidden className="interruptor-perilla" />
        </button>
      </span>
      <span className="min-w-0">
        <span className="cal-nombre block truncate font-semibold">
          {c.nombre}
          <small>{rotuloDeFechas(c.fechas)}</small>
        </span>
        {/* Con la tarjeta no tan ancha, los chips van bajo el nombre (en la ancha tienen su columna). */}
        <span className="mt-1 flex flex-wrap gap-1.5 @min-[920px]:hidden">{chips}</span>
      </span>
      <span className="min-w-0 @max-[639px]:col-span-2">
        <Chip tono={v.tono} versalitas={false}>
          {v.texto}
        </Chip>
        {evidencia && pocaHistoria(evidencia) && <span className="mt-0.5 block text-xs text-taupe">{textoDeAnios(evidencia.porAnio.length)}: poca historia</span>}
      </span>
      <span className="min-w-0 @max-[639px]:col-span-2" data-guia="calendario.rango">
        <RangoDeVentas evidencia={evidencia} />
      </span>
      <span className="flex flex-wrap items-center justify-end gap-1.5 @max-[639px]:col-span-2 @max-[639px]:justify-start">
        <span className="hidden flex-wrap items-center justify-end gap-1.5 @min-[920px]:flex">{chips}</span>
        {sePuedeArmar(c, hoy) && (
          <Boton peso="fantasma" className="btn-chico" onClick={() => alArmar(c)}>
            <span className="inline-flex items-center gap-1.5">
              <CalendarCheck aria-hidden className="h-3.5 w-3.5" />
              Armar plan
            </span>
          </Boton>
        )}
        <LapizEditar que={c.nombre} onClick={() => alEditar(c)} />
      </span>
    </div>
  );
}
