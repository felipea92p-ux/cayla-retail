import Link from "next/link";
import { FRASE_SIN_ELLA, type GrupoVista } from "@/lib/frescura-pantalla";
import type { NivelConfianza } from "@/lib/frescura-reglas";
import { NivelChip } from "./piezas";

// «¿Cómo se lee esto?» (Formidable, ADR-0350, ley 6): TODA la metodología de Frescura del piso en un solo lugar, a un toque. Antes
// iba siempre abierta —la frase de la comparación tres veces, la escala y la referencia de CAYLA en la cabecera de cada
// categoría, el registro al colgar bajo el título y una nota de cinco párrafos al pie—: la persona tenía que leerla toda para
// llegar a lo que le tocaba. El detalle existe y está completo; ya no compite con la decisión.
// Desde la act. 2026-10-07 también viven aquí la vara de CAYLA de respaldo (de cuándo es y qué categorías juzga) y las prendas sin
// temporada (antes un cartel sobre la tabla y un chip por fila: es una tarea de Catálogo, no de Frescura). Desde la act. 2026-10-10 (c),
// las cuatro palabras definidas y la vara del mes de cada categoría; sin escala propia (la de cada prenda vive en su hoja).

type Registro = { texto: string; nivel: NivelConfianza | null };

export function FrescuraComoSeLee({
  id,
  grupos,
  esLider,
  registro,
  registroFallo,
  notasDelMes,
  respaldo,
  sinTemporada,
}: {
  id: string;
  grupos: readonly GrupoVista[];
  esLider: boolean;
  registro: Registro | null;
  registroFallo: boolean;
  notasDelMes: readonly string[];
  /** De cuándo es la vara de CAYLA que respalda, o por qué no hay (`textoRespaldoCayla`). */
  respaldo: string;
  /** Cuántas prendas no tienen temporada (`textoSinTemporada`) y a dónde ir a completarlas (null si quien mira no ve Catálogo). */
  sinTemporada: { texto: string; href: string | null } | null;
}) {
  return (
    <div id={id} className="nota-cayla mx-4 mb-3.5 space-y-2 sm:mx-5">
      {/* Las cuatro palabras, definidas una vez (la prueba de palabras de Formidable 2026-10-10 (c): «Aún no se sabe» se entendía a medias). */}
      <p>
        <b>Fresca</b>: su modelo todavía no llega a lo que tarda en venderse la mitad de su categoría. <b>Vigente</b>: ya pasó la mitad, pero no lo que
        tardan 3 de cada 4. <b>Envejeciendo</b>: ya pasó lo que tardan 3 de cada 4. <b>Aún no se sabe</b>: llegó sin fecha, su categoría todavía no tiene
        ritmo aquí, su stock no cuadra (cuéntala) o puede ser una que se vendió sin registrar. Cuando una categoría ya tiene sus ventas, su vara
        queda fija el día 1 de cada mes; la línea de cada una dice con qué se juzga.
      </p>
      <p>
        <b>Cómo se lee.</b> {FRASE_SIN_ELLA} Los días cuentan solo el tiempo con alguna talla libre colgada. La comparación es con lo vendido en esta tienda; cuando una
        categoría tiene menos de 10 ventas aquí y CAYLA (las tres tiendas juntas) tiene 10 o más, se juzga contra CAYLA y la fila lo dice. «Aproximado» quiere decir que
        la comparación sale de menos de 10 ventas: tómala con cuidado. «Trasladar» solo aparece con una comparación sólida y algo en el almacén.
      </p>
      <p>
        <b>Vara de CAYLA.</b> {respaldo}
      </p>
      {grupos.map((g) => (
        <p key={g.categoriaId}>
          {/* La base va dentro de la misma frase: «…casi todas (con 24 ventas de los últimos 90 días).» */}
          <b>{g.nombre}.</b> {g.base ? `${g.comparacion.replace(/\.$/, "")} (${g.base}).` : g.comparacion}
          {g.mes && <> {g.mes}</>}{" "}
          {g.nivel && g.nivel !== "solido" && <NivelChip nivel={g.nivel} />}
          {g.respaldo !== null && <> {g.respaldo}</>}
          {g.cayla !== null && (
            <>
              {" "}
              <b>Referencia de CAYLA:</b> {g.cayla}
            </>
          )}
        </p>
      ))}
      <p>
        <b>«Por decidir»</b> son las que llevan tiempo sin venderse o ya pasó su temporada, y nadie anotó todavía qué hizo con ellas. Cuando decides, lo anotas con «Anotar
        lo que hice» o con el botón de la fila: la prenda sale de esta lista los días que dice su fecha y vuelve si para entonces sigue sin venderse, con cómo le fue. Otras
        pueden tener una pregunta más chica en «Qué hacer».
      </p>
      {notasDelMes.map((n) => (
        <p key={n}>
          <b>Lo que ya decidiste.</b> {n} Comparadas con las demás de su categoría, en esos mismos días.
        </p>
      ))}
      {sinTemporada && (
        <p>
          <b>Sin temporada.</b> {sinTemporada.texto}{" "}
          {sinTemporada.href && (
            <Link href={sinTemporada.href} className="btn-cayla btn-enlace text-[13px]">
              Complétalas en Catálogo
            </Link>
          )}
        </p>
      )}
      <p>
        <b>Lo apartado para un cliente no está colgado:</b> no envejece ni recibe sugerencias, y cuenta como vendido. Lo que llegó sin fecha (carga inicial, un ajuste) nunca
        es «Fresca»: no se sabe cuándo llegó. Aquí no se rebaja: la rebaja se decide aparte.
      </p>
      {esLider ? (
        <p>
          <b>Registro al colgar.</b> {registroFallo ? "No se pudo cargar." : (registro?.texto ?? "Todavía no hay registro al colgar de esta sede.")}{" "}
          {registro?.nivel && registro.nivel !== "solido" && <NivelChip nivel={registro.nivel} />} El registro al colgar, las otras tiendas y la referencia de CAYLA los ve solo
          el líder.
        </p>
      ) : (
        <p>El registro al colgar y la comparación con las otras tiendas los ve el líder: aquí se mide solo esta tienda.</p>
      )}
    </div>
  );
}
