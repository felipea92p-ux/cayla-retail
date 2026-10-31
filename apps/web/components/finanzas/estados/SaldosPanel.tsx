import { Chip } from "@/components/ui/Chip";
import { Superficie } from "@/components/finanzas/kit";
import { soles } from "@/lib/flujo-caja-reglas";
import { balanzaCuadra, gruposDeSaldos, type SaldoCuenta } from "@/lib/contador-reglas";
import { mesNombre } from "@/lib/resultados-reglas";

// «Ver ▸ Saldos por cuenta» (ADR-0585): la balanza de comprobación del mes en pantalla, la misma de `fn_saldos_por_cuenta` que se descarga.
// Cada cuenta con su saldo al empezar, el debe y el haber del mes y su saldo al cerrar, agrupadas por tipo con su total; al pie, si cuadra.
// Aquí sí van las cuentas: es el cuadro del contador.

const cifra = (v: number) => (Math.round(v) === 0 ? "—" : soles(v));

export function SaldosPanel({ saldos, mes }: { saldos: SaldoCuenta[]; mes: string }) {
  const grupos = gruposDeSaldos(saldos);
  const cuadra = balanzaCuadra(saldos);
  const total = (k: "debe" | "haber") => saldos.reduce((a, s) => a + s[k], 0);
  return (
    <Superficie pad guia="fin-contador.saldos">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-taupe">
          Saldos por cuenta de {mesNombre(mes)}, en el signo del debe: un pasivo, el patrimonio y un ingreso salen negativos.
        </p>
        <Chip tono={cuadra ? "verde" : "rojo"}>{cuadra ? "Cuadra" : "No cuadra"}</Chip>
      </div>
      <div className="fin-tabla-wrap">
        <table className="fin-tabla fin-tabla-flujo">
          <caption className="sr-only">Saldos por cuenta de {mesNombre(mes)}</caption>
          <thead>
            <tr>
              <th>Cuenta</th>
              <th className="fin-num">Al empezar</th>
              <th className="fin-num">Debe</th>
              <th className="fin-num">Haber</th>
              <th className="fin-num">Al cerrar</th>
            </tr>
          </thead>
          <tbody>
            {grupos.flatMap((g) => [
              ...g.filas.map((s) => (
                <tr key={s.cuenta}>
                  <td data-l="Cuenta">
                    <span className="num text-taupe">{s.cuenta}</span> {s.nombre}
                  </td>
                  <td className="fin-num" data-l="Al empezar">
                    {cifra(s.saldoInicial)}
                  </td>
                  <td className="fin-num" data-l="Debe">
                    {cifra(s.debe)}
                  </td>
                  <td className="fin-num" data-l="Haber">
                    {cifra(s.haber)}
                  </td>
                  <td className="fin-num" data-l="Al cerrar">
                    {cifra(s.saldoFinal)}
                  </td>
                </tr>
              )),
              <tr key={`${g.tipo}-total`} className="fin-suave">
                <td data-l="Cuenta">
                  <b>{g.nombre}</b>
                </td>
                <td className="fin-num" data-l="Al empezar">
                  <b>{cifra(g.saldoInicial)}</b>
                </td>
                <td className="fin-num" data-l="Debe">
                  <b>{cifra(g.debe)}</b>
                </td>
                <td className="fin-num" data-l="Haber">
                  <b>{cifra(g.haber)}</b>
                </td>
                <td className="fin-num" data-l="Al cerrar">
                  <b>{cifra(g.saldoFinal)}</b>
                </td>
              </tr>,
            ])}
            <tr>
              <td data-l="Cuenta">
                <b>Total del mes</b>
              </td>
              <td className="fin-num" data-l="Al empezar" />
              <td className="fin-num" data-l="Debe">
                <b>{soles(total("debe"))}</b>
              </td>
              <td className="fin-num" data-l="Haber">
                <b>{soles(total("haber"))}</b>
              </td>
              <td className="fin-num" data-l="Al cerrar" />
            </tr>
          </tbody>
        </table>
      </div>
    </Superficie>
  );
}
