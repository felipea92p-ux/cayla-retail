import { CabeceraBloque, CampoFin, ListaDatos, SalidaFin, Superficie } from "@/components/finanzas/kit";
import type { DatosEmpresa } from "@/lib/configuracion-reglas";

// Configuración ▸ Empresa (spike `cfgEmpresa`). DE SOLO LECTURA a propósito: el RUC, la razón social y las series son los que
// Facturación manda a SUNAT; uno mal escrito hace que se rechace cada comprobante. Se cambian con el contador y el
// proveedor de facturación, no desde aquí (decisión pendiente de Felipe: ADR-0195, «Ajuste de diseño al spike»).

export function ConfiguracionEmpresa({ datos }: { datos: DatosEmpresa }) {
  const campo = (etiqueta: string, valor: string | null) => (
    <CampoFin etiqueta={etiqueta}>
      <SalidaFin>{valor ?? <span className="text-taupe">—</span>}</SalidaFin>
    </CampoFin>
  );
  return (
    <>
      <section className="fin-dos-col">
        <Superficie pad className="anim-sube">
          <CabeceraBloque titulo="Datos de la empresa" bajada="Salen en boletas, facturas y reportes para el contador." />
          {campo("RUC", datos.ruc)}
          {campo("Razón social", datos.razonSocial)}
          {campo("Nombre comercial", datos.nombreComercial)}
          <div className="fin-dos-campos">
            {campo("Correo", datos.email)}
            {campo("Teléfono", datos.telefono)}
          </div>
        </Superficie>
        <Superficie pad className="anim-sube">
          <CabeceraBloque titulo="Datos fiscales por tienda" bajada="Dirección y series de cada punto de emisión." />
          <ListaDatos
            filas={datos.tiendas.map((t) => ({
              dato: (
                <>
                  <span className="block text-tinta">{t.nombre}</span>
                  <span className="block text-[12px]">{[t.direccion, t.distrito].filter(Boolean).join(", ") || "Sin dirección fiscal"}</span>
                </>
              ),
              valor: t.series.length ? `Serie ${t.series.map((s) => s.serie).join(" · ")}` : "Sin series",
              tenue: true,
            }))}
          />
        </Superficie>
      </section>
      <p className="nota-cayla">
        Estos datos <b>no se cambian aquí</b>: son los que Facturación manda a SUNAT, y un RUC o una serie mal escritos hacen que se rechace cada comprobante. Se corrigen con el contador y el proveedor de facturación.
      </p>
    </>
  );
}
