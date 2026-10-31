import Link from "next/link";
import { Landmark } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Vacio } from "@/components/ui/Vacio";
import { CabeceraReportes } from "@/components/finanzas/CabeceraReportes";
import { soles, solesConSigno } from "@/lib/flujo-caja-reglas";
import { mesNombre } from "@/lib/resultados-reglas";
import type { PatrimonioCambios } from "@/lib/estados-financieros-reglas";

// ¿Lo tuyo creció? · el estado de cambios en el patrimonio (ADR-0585, actividad 3). Lo tuyo al empezar el mes, lo que lo movió y cómo
// cerró, con las cifras de `fn_patrimonio_cambios` (el mismo diario que el Balance). Lo tuyo es de CAYLA entera: no se reparte por sede.
export function PatrimonioPanel({ datos, falla, mes }: { datos: PatrimonioCambios | null; falla: string | null; mes: string }) {
  const titulo = <CabeceraReportes titulo={`Lo tuyo en ${mesNombre(mes)}`} bajada="Lo que es tuyo al empezar el mes, lo que lo movió y cómo cerró. Es de CAYLA entera: no se reparte por sede." />;
  if (falla)
    return (
      <section className="space-y-4">
        {titulo}
        <Aviso tono="error" titulo="No se pudo leer lo tuyo">
          {falla}
        </Aviso>
      </section>
    );
  if (!datos || datos.sinArranque || !datos.inicio || !datos.fin)
    return (
      <section className="space-y-4">
        {titulo}
        <Vacio icono={<Landmark />} titulo="Faltan los saldos de arranque" guia="fin-patrimonio.vacio">
          Lo tuyo se cuenta desde el día en que CAYLA empezó a usar el sistema. El líder los registra en{" "}
          <Link href="/finanzas/reportes/balance" className="btn-enlace">
            ¿Cuánto vale CAYLA?
          </Link>
          .
        </Vacio>
      </section>
    );
  const { inicio, fin } = datos;
  return (
    <section className="space-y-4" data-guia="fin-patrimonio.cifras">
      {titulo}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <TarjetaCifra etiqueta="Al empezar el mes" valor={soles(inicio.total)}>
          Lo tuyo al {inicio.fecha.split("-").reverse().slice(0, 2).join("/")}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Ganancia del mes" valor={solesConSigno(datos.ganancia)} punto={datos.ganancia >= 0 ? "verde" : "rojo"}>
          Viene de ¿Ganamos?
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Lo que pusiste" valor={solesConSigno(datos.aportes)}>
          Aportes del dueño
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Lo que retiraste" valor={solesConSigno(-datos.retiros)}>
          Retiros de utilidades
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Al cerrar el mes" valor={soles(fin.total)} punto={fin.total >= inicio.total ? "verde" : "rojo"}>
          {`${fin.total >= inicio.total ? "Creció" : "Bajó"} ${soles(Math.abs(fin.total - inicio.total))}`}
        </TarjetaCifra>
      </div>
      {Math.round(datos.otros) !== 0 && (
        <Aviso tono="atencion" titulo={`${soles(Math.abs(datos.otros))} que no explican la ganancia, los aportes ni los retiros`}>
          Es un movimiento de lo tuyo hecho a mano, sin pasar por una venta, un gasto, un aporte ni un retiro. El Balance dice de dónde sale.
        </Aviso>
      )}
    </section>
  );
}
