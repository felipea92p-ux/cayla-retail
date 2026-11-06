import { LineaDeMeses } from "@/components/finanzas/estados/LineaDeMeses";
import { getPatrimonioCambios } from "@/lib/estados-financieros";
import { franjaDelPeriodo } from "@/lib/estados-linea";
import { nombreDelMes, type Periodo } from "@/lib/estados-periodo";
import { soles } from "@/lib/flujo-caja-reglas";
import { mesNombre } from "@/lib/resultados-reglas";

/** Lo tuyo al cierre de cada uno de los últimos meses, sea cual sea la fecha que se mira. Si no se puede leer, la pantalla sigue sin ella: es de apoyo. */
export async function LineaDePatrimonio({ hoy, periodo, final }: { hoy: string; periodo: Periodo; /** Lo tuyo al terminar las fechas que se miran: lo dice la franja. */ final: number }) {
  const { datos } = await getPatrimonioCambios(hoy.slice(0, 7), 13);
  const serie = (datos?.serie ?? []).map((s) => {
    const nombre = mesNombre(s.mes).slice(0, 3);
    return { mes: s.mes, etiqueta: nombre.charAt(0).toUpperCase() + nombre.slice(1), nombre: nombreDelMes(s.mes), valor: s.total };
  });
  const lista = serie.map((s) => s.mes);
  const i = lista.indexOf(periodo.mes);
  const franja = periodo.unMes ? null : franjaDelPeriodo(lista, periodo.desde, periodo.hasta);
  return <LineaDeMeses serie={serie} activo={i < 0 ? null : i} franja={franja ? { ...franja, valor: soles(final), titulo: periodo.titulo } : null} etiqueta="Tu parte en CAYLA al cierre de cada mes" />;
}
