import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getProveedores, getProveedoresResumen } from "@/lib/proveedores";
import { soles } from "@/lib/compras-reglas";
import { ProveedoresPanel } from "@/components/ProveedoresPanel";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";

// Directorio de proveedores (20260914150000_proveedores_administrables.sql).
// Cualquiera con acceso ve el directorio (a quién se le compra); lo
// financiero (cuánto se le debe, recepción) y el detalle son solo de líder
// — corrección de D-27, 2026-09-17
// (20260917240000_proveedores_lista_indicadores_y_candado_sede.sql). La
// pantalla lo esconde y `fn_proveedores()` lo vuelve a exigir (manda esos
// campos en NULL si no sos líder): dos capas, como siempre.
//
// ADR-0106: las cuatro cifras de arriba (a quién se le debe, cuánta deuda concentra un solo
// proveedor, quiénes llevan más de 90 días sin comprar) salen de `fn_proveedores_resumen()`, que
// se calcula sobre la misma lectura que la tabla: una sola fuente de verdad.
export default async function ProveedoresPage() {
  const persona = await requirePersonaActualV2();
  const esLider = persona.rol === "lider";
  const [proveedores, resumen] = await Promise.all([getProveedores(), esLider ? getProveedoresResumen() : null]);

  const indicadores =
    esLider && resumen ? (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TarjetaCifra compacta punto="neutro" etiqueta="Proveedores activos" valor={resumen.activos.toLocaleString("es-PE")}>
          {resumen.desactivados === 0 ? "Ninguno desactivado" : `${resumen.desactivados.toLocaleString("es-PE")} ${resumen.desactivados === 1 ? "desactivado" : "desactivados"}`}
        </TarjetaCifra>
        <TarjetaCifra
          compacta
          punto={(resumen.deudaTotal ?? 0) > 0 ? "ambar" : "verde"}
          detalleTono={(resumen.conVencidas ?? 0) > 0 ? "text-rojo" : undefined}
          etiqueta="Deuda con proveedores"
          valor={soles(resumen.deudaTotal ?? 0)}
        >
          {(resumen.deudaTotal ?? 0) > 0
            ? `${resumen.conSaldo} con saldo${(resumen.conVencidas ?? 0) > 0 ? ` · ${resumen.conVencidas} con comprobantes vencidos` : ""}`
            : "Nada por pagar"}
        </TarjetaCifra>
        {resumen.topProveedorNombre && resumen.topPct != null ? (
          <TarjetaCifra compacta punto="neutro" etiqueta="Concentración" valor={`${Math.round(resumen.topPct)} %`} href={`/compras/por-pagar?prov=${resumen.topProveedorId}`}>
            {(resumen.conSaldo ?? 0) > 3 && resumen.top3Pct != null
              ? `${resumen.topProveedorNombre} · los 3 mayores suman el ${Math.round(resumen.top3Pct)} %`
              : `${resumen.topProveedorNombre} concentra la deuda`}
          </TarjetaCifra>
        ) : (
          <TarjetaCifra compacta vacia etiqueta="Concentración" valor="—">
            Aparece cuando haya deuda
          </TarjetaCifra>
        )}
        <TarjetaCifra
          compacta
          punto={(resumen.sinCompras90d ?? 0) > 0 ? "ambar" : "verde"}
          detalleTono={(resumen.sinCompras90d ?? 0) > 0 ? "text-ambar-profundo" : "text-verde-profundo"}
          etiqueta="Sin compras en 90 días"
          valor={(resumen.sinCompras90d ?? 0).toLocaleString("es-PE")}
        >
          {(resumen.sinCompras90d ?? 0) > 0 ? "Revisa si siguen siendo proveedores" : "Nadie inactivo por revisar"}
        </TarjetaCifra>
      </div>
    ) : undefined;

  return <ProveedoresPanel proveedores={proveedores} esLider={esLider} indicadores={indicadores} />;
}
