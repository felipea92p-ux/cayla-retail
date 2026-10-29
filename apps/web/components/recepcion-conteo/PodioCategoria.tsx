import { podioDeCategoria } from "@/lib/recepcion-podio-reglas";

// El Podio de una categoría en el cierre (rediseño «B», Felipe 2026-10-29): las columnas crecen una vez al llegar, en cascada, y la llave
// sobre «Dijeron» y «Contaste» dice si cuadra (verde) o cuánto falta o sobra (ámbar). Sin rebote ni bucle (ADR-0136).

export function PodioCategoria({ dijeron, contadas, alStock, paraDespues }: { dijeron: number | null; contadas: number; alStock: number; paraDespues: number }) {
  const { columnas, llave } = podioDeCategoria({ dijeron, contadas, alStock, paraDespues });
  const resumen = columnas.map((c) => `${c.titulo} ${c.n}`).join(", ") + (llave ? `: ${llave.texto}` : "");
  return (
    <div className="rc-podio" role="img" aria-label={resumen} style={{ "--cols": columnas.length } as React.CSSProperties}>
      {llave && (
        <span className="rc-podio-llave" data-cuadra={llave.cuadra ? "" : undefined}>
          <b>{llave.texto}</b>
        </span>
      )}
      {columnas.map((c, i) => (
        <span key={c.clave} className="rc-podio-col" data-clave={c.clave}>
          <b className="rc-podio-n">{c.n}</b>
          <span className="rc-podio-barra" style={{ height: `${Math.max(3, c.alto * 0.6)}px`, "--i": i } as React.CSSProperties} />
          <small>{c.titulo}</small>
        </span>
      ))}
    </div>
  );
}
