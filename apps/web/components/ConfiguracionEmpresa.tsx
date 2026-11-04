import { ListaDatos, Superficie, TituloDeTarjeta } from "@/components/finanzas/kit";
import type { DatosEmpresa } from "@/lib/configuracion-reglas";

// Configuración ▸ Empresa y tiendas, su primera mitad (spike `cfgEmpresa`). DE SOLO LECTURA a propósito: el RUC, la razón social y las series son los
// que Facturación manda a SUNAT; uno mal escrito hace que se rechace cada comprobante. Se cambian con el contador y el proveedor de facturación,
// no desde aquí (decisión pendiente de Felipe: ADR-0195, «Ajuste de diseño al spike»). Por eso van en una lista y no en campos: en el vidrio, «lo
// hundido espera tu dato» (ADR-0596), y aquí no se espera ninguno.

export function ConfiguracionEmpresa({ datos }: { datos: DatosEmpresa }) {
  const fila = (dato: string, valor: string | null) => ({ dato, valor: valor ?? "—" });
  return (
    <>
      <section className="fin-dos-col">
        <Superficie className="anim-sube" guia="config.empresa-datos">
          <TituloDeTarjeta titulo="Datos de la empresa" bajada="Salen en boletas, facturas y reportes para el contador." />
          <div className="px-3.5 pb-1">
          <ListaDatos
            filas={[
              fila("RUC", datos.ruc),
              fila("Razón social", datos.razonSocial),
              fila("Nombre comercial", datos.nombreComercial),
              fila("Correo", datos.email),
              fila("Teléfono", datos.telefono),
            ]}
          />
          </div>
        </Superficie>
        <Superficie className="anim-sube" guia="config.empresa-tiendas">
          <TituloDeTarjeta titulo="Datos fiscales por tienda" bajada="Dirección y series de cada punto de emisión." />
          <div className="px-3.5 pb-1">
          <ListaDatos
            filas={datos.tiendas.map((t) => ({
              dato: (
                <>
                  <span className="block text-tinta">{t.nombre}</span>
                  <span className="block text-sm">{[t.direccion, t.distrito].filter(Boolean).join(", ") || "Sin dirección fiscal"}</span>
                </>
              ),
              valor: t.series.length ? `Serie ${t.series.map((s) => s.serie).join(" · ")}` : "Sin series",
              tenue: true,
            }))}
          />
          </div>
        </Superficie>
      </section>
      <p className="nota-cayla">
        Estos datos <b>no se cambian aquí</b>: son los que Facturación manda a SUNAT, y un RUC o una serie mal escritos hacen que se rechace cada comprobante. Se corrigen con el contador y el proveedor de facturación.
      </p>
    </>
  );
}
