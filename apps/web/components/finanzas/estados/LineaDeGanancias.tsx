import { LineaDeMeses } from "@/components/finanzas/estados/LineaDeMeses";
import { getResultadoPorMes } from "@/lib/estados-serie";
import { franjaDelPeriodo } from "@/lib/estados-linea";
import { mesesDelHilo, type Periodo } from "@/lib/estados-periodo";
import { solesCentimos } from "@/lib/flujo-caja-reglas";
import type { ClaveSede } from "@/lib/finanzas-telar-reglas";

/**
 * La línea de lo ganado mes a mes. Se lee aparte de la pantalla, dentro de su `Suspense`: son trece lecturas de la base y la cifra de arriba no tiene por qué esperarlas. Un
 * mes que no se pudo leer no se dibuja: no es un cero. Sin el IGV cae al libro junto con la cabecera, y el aviso de la cabecera lo dice por las dos (ADR-0620).
 */
export async function LineaDeGanancias({ hoy, minimo, sede, periodo, resultado, enLibro }: { hoy: string; minimo: string | null; sede: ClaveSede; periodo: Periodo; /** Lo de las fechas que se miran: lo dice la franja. */ resultado: number; /** La cabecera cayó al libro: la línea también. */ enLibro: boolean }) {
  const meses = mesesDelHilo(hoy, minimo);
  const { meses: resultados } = await getResultadoPorMes(meses, sede, enLibro);
  const serie = meses.flatMap((m) => {
    const r = resultados.find((x) => x.mes === m.mes);
    return r?.resultado === null || r?.resultado === undefined ? [] : [{ mes: m.mes, etiqueta: m.etiqueta, nombre: m.nombre, valor: r.resultado, estimado: r.estimado }];
  });
  const lista = serie.map((m) => m.mes);
  const i = lista.indexOf(periodo.mes);
  const franja = periodo.unMes ? null : franjaDelPeriodo(lista, periodo.desde, periodo.hasta);
  return (
    <LineaDeMeses
      serie={serie}
      activo={i < 0 ? null : i}
      franja={franja ? { ...franja, valor: solesCentimos(resultado), titulo: periodo.titulo } : null}
      etiqueta="Lo ganado o perdido mes a mes"
    />
  );
}

/** Mientras llegan los meses: el lugar de la línea ya guardado, para que nada salte. */
export function LineaEsperando() {
  return <div className="estados-linea-espera" aria-hidden />;
}
