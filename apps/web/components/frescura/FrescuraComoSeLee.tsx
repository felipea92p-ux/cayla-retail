import { FRASE_SIN_ELLA, type GrupoVista } from "@/lib/frescura-pantalla";
import type { NivelConfianza } from "@/lib/frescura-reglas";
import { NivelChip } from "./piezas";

// «¿Cómo se lee esto?» (Formidable, ADR-0350, ley 6): TODA la metodología de Frescura del piso en un solo lugar, a un toque. Antes
// iba siempre abierta —la frase de la comparación tres veces, la escala y la referencia de CAYLA en la cabecera de cada
// categoría, el registro al colgar bajo el título y una nota de cinco párrafos al pie—: la persona tenía que leerla toda para
// llegar a lo que le tocaba. El detalle existe y está completo; ya no compite con la decisión.

type Registro = { texto: string; nivel: NivelConfianza | null };

export function FrescuraComoSeLee({
  id,
  grupos,
  esLider,
  registro,
  registroFallo,
  notasDelMes,
}: {
  id: string;
  grupos: readonly GrupoVista[];
  esLider: boolean;
  registro: Registro | null;
  registroFallo: boolean;
  notasDelMes: readonly string[];
}) {
  return (
    <div id={id} className="nota-cayla mx-4 mb-3.5 space-y-2 sm:mx-5">
      <p>
        <b>Cómo se lee.</b> {FRASE_SIN_ELLA} Los días cuentan solo el tiempo con alguna talla libre colgada. La comparación es con lo vendido en esta tienda
        {esLider ? "; la de CAYLA (todas las tiendas juntas) es solo de apoyo" : ""}. «Aproximado» quiere decir que la comparación sale de menos de 10 ventas: tómala
        con cuidado. «Trasladar» solo aparece con una comparación sólida y algo en el almacén.
      </p>
      {grupos.map((g) => (
        <p key={g.categoriaId}>
          <b>{g.nombre}.</b> {g.comparacion}
          {g.escala.length > 0 && (
            <>
              {" "}
              {g.escala.map((e) => `${e.nombre} ${e.rango}`).join(" · ")}
              {g.base ? ` · ${g.base}` : ""}.
            </>
          )}{" "}
          {g.nivel && g.nivel !== "solido" && <NivelChip nivel={g.nivel} />}
          {g.cayla !== null && (
            <>
              {" "}
              <b>Referencia de CAYLA:</b> {g.cayla}
            </>
          )}
        </p>
      ))}
      <p>
        <b>«Por decidir»</b> son las que llevan tiempo sin venderse o ya pasó su temporada, y nadie anotó todavía qué hizo con ellas. Cuando decides, lo anotas con «Ya
        decidí»: la prenda sale de esta lista los días que dice su fecha y vuelve si para entonces sigue sin venderse, con cómo le fue. Otras pueden tener una pregunta
        más chica en «Qué hacer».
      </p>
      {notasDelMes.map((n) => (
        <p key={n}>
          <b>Lo que ya decidiste.</b> {n} Comparadas con las demás de su categoría, en esos mismos días.
        </p>
      ))}
      <p>
        <b>Lo apartado para un cliente no está colgado:</b> no envejece ni recibe sugerencias, y cuenta como vendido. Lo que llegó sin fecha (carga inicial, un ajuste) nunca
        es «Recién llegada»: no se sabe cuándo llegó. Aquí no se rebaja: la rebaja se decide aparte.
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
