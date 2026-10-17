import { fechaCorta, fechaLarga } from "@/lib/portada";

/** La ceja del héroe de una campaña, igual en la portada y en el Inicio: hasta cuándo rige o, sin fecha de fin, «Campaña vigente». */
export function CejaDeCampana({ hasta }: { hasta: string | null }) {
  if (!hasta) return "Campaña vigente";
  // En el celular, la fecha corta: la larga llega hasta el colibrí.
  return (
    <span>
      Campaña · hasta el <span className="t-fecha-larga">{fechaLarga(hasta)}</span>
      <span className="t-fecha-corta">{fechaCorta(hasta)}</span>
    </span>
  );
}
