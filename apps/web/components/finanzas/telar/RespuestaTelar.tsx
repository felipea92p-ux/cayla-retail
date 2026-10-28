import { Chip, type TonoChip } from "@/components/ui/Chip";
import { CifraAnimada } from "@/components/ui/CifraAnimada";

export type ChipRespuesta = { texto: string; tono: TonoChip };

/**
 * La respuesta del telar: lo que va a la derecha de la cabecera de cada submódulo de Finanzas (dentro de `<EncabezadoPagina>`,
 * en su lugar de las cifras). La pregunta del submódulo en versalitas, el hilo rojo y la cifra grande que la responde, con sus
 * chips debajo («+8 % que setiembre»). La cifra cuenta una vez al llegar (`CifraAnimada`, ADR-0136), en soles enteros como las frases
 * y los chips de al lado (`soles-redondo`: nunca «S/ 3,850.00» junto a «S/ 3,850»). `valor={null}`: no se pudo
 * leer, y se dice, nunca un cero que parezca un dato (principio 9).
 */
export function RespuestaTelar({ pregunta, valor, chips = [], motivo }: { pregunta: string; valor: number | null; chips?: ChipRespuesta[]; motivo?: string }) {
  return (
    <div className="respuesta-telar anim-sube" style={{ ["--i" as string]: 1 }} data-guia="telar.respuesta">
      <p className="respuesta-telar-pregunta">{pregunta}</p>
      <span aria-hidden className="respuesta-telar-hilo hilo-dibuja" />
      {valor === null ? (
        <p className="respuesta-telar-motivo">{motivo ?? "No se pudo leer ahora. Vuelve a intentarlo en un rato."}</p>
      ) : (
        <p className="respuesta-telar-cifra">
          <CifraAnimada valor={Math.round(valor)} formato="soles-redondo" />
        </p>
      )}
      {chips.length > 0 && (
        <div className="respuesta-telar-chips">
          {chips.map((c) => (
            <Chip key={c.texto} tono={c.tono} versalitas={false}>
              {c.texto}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
