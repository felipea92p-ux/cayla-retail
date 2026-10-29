// El número que rueda (rediseño «B» de Recibir, Felipe 2026-10-29): cada cifra es una tira de 0 a 9 que sube o baja hasta la suya, una
// vez por cambio y sin rebote (ADR-0136). Las columnas se cuentan desde la derecha para que las unidades sigan siendo las mismas al pasar de
// 9 a 10. El lector de pantalla lee el número entero; las tiras son solo dibujo.

const DIGITOS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** `entra`: al aparecer, cada cifra rueda desde el 0 hasta la suya (una vez); sin él, se dibuja quieta y solo rueda al cambiar. */
export function Odometro({ valor, entra = false, className }: { valor: number; entra?: boolean; className?: string }) {
  const cifras = String(Math.max(0, Math.round(valor))).split("");
  return (
    <span className={`rc-odo ${entra ? "rc-odo--entra" : ""} ${className ?? ""}`}>
      <span className="sr-only">{valor.toLocaleString("es-PE")}</span>
      <span aria-hidden className="rc-odo-cifras">
        {cifras.map((c, i) => (
          <span key={cifras.length - i} className="rc-odo-cifra">
            <span className="rc-odo-tira" style={{ transform: `translateY(-${Number(c) * 10}%)` }}>
              {DIGITOS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}
