// Una barra apilada: la proporción de cada parte sobre un total, sin JavaScript (sirve en Server Components). Es la misma forma
// que ya dibuja «Deuda por vencimiento» (Compras, ADR-0128: tramos de un solo color de token, en una pista de arena) llevada a una
// pieza (ADR-0358: una función, una pieza). Todo color es un token: quien la usa pasa la clase (`bg-verde`, `bg-tinta/25`…), nunca
// un hex. Para el lector de pantalla es una imagen con su resumen; los números van al lado, en texto.

export type SegmentoBarra = {
  clave: string;
  /** Para el resumen del lector de pantalla y el título al pasar el mouse. */
  nombre: string;
  valor: number;
  /** La clase del color del token (`bg-verde`, `bg-ambar`, `bg-tinta`, `bg-tinta/25`…). */
  clase: string;
};

export function BarraApilada({
  segmentos,
  unidad = "unidades",
  className = "",
}: {
  segmentos: readonly SegmentoBarra[];
  /** Lo que se cuenta, para el resumen: «unidades», «prendas», «soles». */
  unidad?: string;
  className?: string;
}) {
  const total = segmentos.reduce((s, x) => s + Math.max(0, x.valor), 0);
  const conValor = segmentos.filter((s) => s.valor > 0);
  const resumen = total > 0 ? conValor.map((s) => `${s.nombre}: ${s.valor}`).join(" · ") : `sin ${unidad}`;
  return (
    <div role="img" aria-label={`${total} ${unidad}. ${resumen}`} className={`flex h-3 w-full gap-px overflow-hidden rounded-full bg-sand ${className}`}>
      {total > 0 &&
        conValor.map((s) => (
          <span key={s.clave} title={`${s.nombre}: ${s.valor}`} className={`block h-full min-w-[2px] ${s.clase}`} style={{ width: `${(s.valor / total) * 100}%` }} />
        ))}
    </div>
  );
}
