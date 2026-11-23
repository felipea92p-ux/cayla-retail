import type { Metadata } from "next";
import { EncabezadoAyuda } from "@/components/ayuda/EncabezadoAyuda";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { FormularioHoja } from "@/components/libro/FormularioHoja";
import { leerDatosDelLibro } from "@/lib/libro-reclamaciones-servidor";
import { leerSedes } from "@/lib/tiendas-servidor";
import "../estilos/ayuda.css";
import "../estilos/recomendaciones.css";
import "../estilos/libro.css";

export const metadata: Metadata = {
  alternates: { canonical: "/libro-de-reclamaciones" },
  title: "Libro de Reclamaciones",
  description: "Deja tu reclamo o queja en el Libro de Reclamaciones virtual de CAYLA. No necesitas una cuenta.",
};

/**
 * El Libro de Reclamaciones virtual (Ley 29571 art. 150, DS 011-2011-PCM; ADR-0679, Felipe 2026-11-18). Pública: la ley no deja pedir
 * cuenta ni compra. Arriba, los datos de CAYLA que van en la hoja (razón social, RUC y domicilio); al lado en la computadora (debajo en
 * el celular), la hoja; abajo, lo que dice la ley del plazo y de Indecopi. Al enviar, la constancia con su número.
 */
export default async function LibroDeReclamaciones() {
  const [proveedor, sedes] = await Promise.all([leerDatosDelLibro(), leerSedes()]);
  return (
    <MarcoCuenta segunSesion conPie>
      <div className="t-ancho">
        <div className="lr-pag">
          <EncabezadoAyuda
            ceja="Ayuda"
            titulo={
              <>
                Libro de <em>Reclamaciones</em>
              </>
            }
            bajada="Conforme al Código de Protección y Defensa del Consumidor, CAYLA cuenta con un Libro de Reclamaciones virtual. Deja aquí tu reclamo o queja: no necesitas una cuenta."
          />
          <div className="lr-cuerpo">
            <aside className="lr-lado">
              <section className="lr-proveedor" aria-labelledby="lr-proveedor-t">
                <h2 id="lr-proveedor-t" className="lr-lado-t">
                  Esta hoja es de
                </h2>
                <dl>
                  <div>
                    <dt>Razón social</dt>
                    <dd>{proveedor.razonSocial}</dd>
                  </div>
                  <div>
                    <dt>RUC</dt>
                    <dd className="num">{proveedor.ruc}</dd>
                  </div>
                  <div>
                    <dt>Domicilio</dt>
                    <dd>{proveedor.domicilio}</dd>
                  </div>
                </dl>
              </section>
              <section className="lr-ley" aria-labelledby="lr-ley-t">
                <h2 id="lr-ley-t" className="lr-lado-t">
                  Lo que debes saber
                </h2>
                <ul>
                  <li>Al enviarla, ves tu hoja con su número y la puedes imprimir o guardar.</li>
                  <li>CAYLA te responde por correo en un plazo máximo de 15 días hábiles.</li>
                  <li>
                    Dejar tu reclamo aquí no te impide acudir a otras vías de solución ni es un requisito previo para presentar una denuncia ante
                    el Indecopi.
                  </li>
                </ul>
              </section>
            </aside>
            <FormularioHoja sedes={sedes.map((s) => ({ id: s.id, nombre: s.nombre }))} />
          </div>
        </div>
      </div>
    </MarcoCuenta>
  );
}
