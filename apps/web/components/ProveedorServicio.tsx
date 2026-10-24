import { Receipt } from "lucide-react";
import type { ResumenServicio } from "@/lib/proveedores";
import { fechaCorta, soles } from "@/lib/compras";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { BarrasTiempo } from "@/components/ui/BarrasTiempo";
import { Chip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";

// «Lo que le pago» de la ficha de un proveedor de SERVICIOS (Entel, luz, agua, alquiler; 20261024222000). A ellos no se les compra ropa:
// no hay prendas, entregas ni devoluciones. Lo que importa es cuánto cuesta al año, cuánto al mes, si hay algo por pagar y si el
// gasto sube. Sale de los comprobantes de gasto (`fn_proveedor_servicio_resumen`).

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etiquetaMes = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1] ?? mes;

export function ProveedorServicio({ resumen }: { resumen: ResumenServicio }) {
  if (resumen.comprobantes === 0) {
    return (
      <section className="space-y-3" data-guia="proveedor-ficha.servicio">
        <TituloSeccion>Lo que le pago</TituloSeccion>
        <div className="card-cayla">
          <Vacio icono={<Receipt />} titulo="Todavía no hay pagos a este proveedor">
            Cuando registres un gasto con su comprobante, aquí verás cuánto te cuesta al mes, cuánto al año y si va subiendo.
          </Vacio>
        </div>
      </section>
    );
  }

  const promedio = resumen.mesesConPago12m > 0 ? resumen.total12m / resumen.mesesConPago12m : null;
  const mesActual = resumen.meses[resumen.meses.length - 1]?.mes ?? null;

  return (
    <section className="space-y-3" data-guia="proveedor-ficha.servicio">
      <TituloSeccion cuenta={resumen.comprobantes}>Lo que le pago · últimos 12 meses</TituloSeccion>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TarjetaCifra punto="neutro" etiqueta="Pagado en 12 meses" valor={<CifraQueCuenta valor={resumen.total12m} formato="soles" alMontar />}>
          {resumen.comprobantes === 1 ? "1 comprobante en total" : `${resumen.comprobantes} comprobantes en total`}
        </TarjetaCifra>
        <TarjetaCifra punto="neutro" etiqueta="Al mes, en promedio" valor={promedio != null ? <CifraQueCuenta valor={promedio} formato="soles" alMontar /> : null}>
          {resumen.mesesConPago12m === 1 ? "con 1 mes de pago: todavía no es una tendencia" : `sobre ${resumen.mesesConPago12m} meses con pago`}
        </TarjetaCifra>
        <TarjetaCifra
          punto={resumen.saldo > 0 ? "ambar" : "verde"}
          detalleTono={resumen.vencido > 0 ? "text-rojo" : undefined}
          etiqueta="Por pagar"
          valor={<CifraQueCuenta valor={resumen.saldo} formato="soles" alMontar />}
        >
          {resumen.vencido > 0 ? `Vencido: ${soles(resumen.vencido)}` : resumen.saldo > 0 ? "Nada vencido" : "Al día"}
        </TarjetaCifra>
        <TarjetaCifra punto="neutro" etiqueta="Último pago" valor={resumen.ultimaFecha ? fechaCorta(resumen.ultimaFecha) : null}>
          {resumen.ultimaFecha ? "fecha del último comprobante" : "Aún sin comprobantes"}
        </TarjetaCifra>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="card-cayla p-5">
          <p className="label-cayla pb-3 text-[11px] text-tinta/65">Mes a mes</p>
          <BarrasTiempo
            etiqueta="Lo pagado a este proveedor en cada uno de los últimos 12 meses"
            destacada={mesActual}
            cifras="destacada"
            barras={resumen.meses.map((m) => ({
              clave: m.mes,
              valor: m.monto,
              etiqueta: etiquetaMes(m.mes),
              tip: `${etiquetaMes(m.mes)} · ${soles(m.monto)}`,
            }))}
            referencia={promedio != null ? { valor: promedio, texto: "promedio" } : null}
          />
        </div>

        <div className="card-cayla overflow-hidden">
          <p className="label-cayla px-5 pb-2 pt-4 text-[11px] text-tinta/65">Últimos comprobantes</p>
          <div className="divide-y divide-tinta/10">
            {resumen.ultimos.map((u) => (
              <div key={u.id} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-x-4 px-5 py-3">
                <span>
                  <span className="block text-sm tabular-nums text-tinta">{u.documento ?? "Sin número"}</span>
                  <span className="block text-xs text-taupe">{fechaCorta(u.fecha)}</span>
                </span>
                <span>{u.saldo > 0 ? <Chip tono="ambar">Debe {soles(u.saldo)}</Chip> : <Chip tono="verde">Pagado</Chip>}</span>
                <span className="text-right text-sm tabular-nums text-tinta">{soles(u.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
