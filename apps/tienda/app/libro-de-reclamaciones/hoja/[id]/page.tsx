import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { EncabezadoAyuda } from "@/components/ayuda/EncabezadoAyuda";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { BotonImprimirHoja } from "@/components/libro/BotonImprimirHoja";
import { fechaDeLaHoja, filasDelApoderado, montoEnSoles, NOMBRE_DOCUMENTO, NOTA_LEGAL, tipoConSuSentido, type Hoja } from "@/lib/libro-reclamaciones";
import { leerHojaEnBase } from "@/lib/libro-reclamaciones-servidor";
import { nombreTienda } from "@/lib/pedidos";
import "../../../estilos/ayuda.css";
import "../../../estilos/libro.css";

// Una constancia con los datos de una persona: no se indexa ni se guarda en el caché de nadie.
export const metadata: Metadata = { title: "Tu hoja de reclamación", robots: { index: false, follow: false } };

/**
 * La constancia de una hoja del Libro de Reclamaciones (ADR-0679): lo que la persona envió, con su número, la fecha y la hora, tal como
 * quedó guardado. Se abre con el id Y la marca del borrador (`?m=`): el id solo no basta para ver los datos de otra persona. Se imprime
 * o se guarda en PDF con el botón (la cabecera y el pie de la tienda no salen al imprimir).
 */
export default async function ConstanciaDeHoja({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const [{ id }, { m }] = await Promise.all([params, searchParams]);
  const uuid = z.string().uuid();
  const lectura = uuid.safeParse(id).success && uuid.safeParse(m).success ? await leerHojaEnBase(id, m as string) : { estado: "no_esta" as const };

  if (lectura.estado !== "ok") {
    return (
      <MarcoCuenta segunSesion conPie>
        <div className="t-ancho t-angosto w-pagina-form">
          <div className="w-ficha">
            <div>
              <span className="t-ceja">Libro de Reclamaciones</span>
              <h1 className="w-titulo">{lectura.estado === "no_esta" ? "No encontramos esta hoja" : "Un momento"}</h1>
              <p className="w-texto-sec">
                {lectura.estado === "no_esta"
                  ? "El enlace no está completo. Abre el que te llegó al enviarla, o deja una hoja nueva."
                  : "No pudimos mostrar tu hoja ahora. Ya está guardada: vuelve a abrir este enlace en unos minutos."}
              </p>
            </div>
            <Link className="t-btn t-btn-ancho t-btn-sec" href="/libro-de-reclamaciones">
              Ir al Libro de Reclamaciones
            </Link>
          </div>
        </div>
      </MarcoCuenta>
    );
  }

  const h = lectura.hoja;
  return (
    <MarcoCuenta segunSesion conPie>
      <div className="t-ancho">
        <div className="lr-pag lr-constancia">
          <div className="lr-recibida" role="status">
            <EncabezadoAyuda
              ceja="Libro de Reclamaciones"
              titulo={
                <>
                  Recibimos tu <em>{h.tipo}</em>
                </>
              }
              bajada={`Tu hoja es la N.° ${h.codigo}. ${
                h.copia_enviada ? `Te enviamos una copia a ${h.consumidor.correo}.` : `Te enviaremos una copia a ${h.consumidor.correo} en unos minutos.`
              } ${h.respuesta ? "CAYLA ya te respondió: la respuesta está aquí abajo y en tu correo." : "CAYLA te responde a ese correo en un plazo máximo de 15 días hábiles."}`}
            />
            <div className="lr-acciones">
              <BotonImprimirHoja />
              <Link className="t-btn t-btn-sec" href="/inicio">
                Volver a la tienda
              </Link>
            </div>
          </div>
          {h.respuesta && (
            <section className="lr-respuesta" aria-labelledby="lr-respuesta-t">
              <h2 id="lr-respuesta-t">Respuesta de CAYLA</h2>
              {h.respondida_en && <p className="lr-hoja-fecha">{fechaDeLaHoja(h.respondida_en)}</p>}
              <p className="lr-respuesta-texto">{h.respuesta}</p>
            </section>
          )}
          <HojaImpresa h={h} />
        </div>
      </div>
    </MarcoCuenta>
  );
}

function HojaImpresa({ h }: { h: Hoja }) {
  const monto = montoEnSoles(h.bien.monto);
  return (
    <article className="lr-hoja" aria-label={`Hoja de reclamación N.° ${h.codigo}`}>
      <header className="lr-hoja-cab">
        <div>
          <p className="lr-hoja-t">Hoja de reclamación · Libro {h.libro_codigo}</p>
          <p className="lr-hoja-n num">N.° {h.codigo}</p>
        </div>
        <p className="lr-hoja-fecha">{fechaDeLaHoja(h.creada_en)}</p>
      </header>
      <Bloque titulo="Proveedor">
        <Dato t="Razón social" v={h.proveedor.razon_social} />
        <Dato t="RUC" v={h.proveedor.ruc} />
        <Dato t="Domicilio" v={h.proveedor.domicilio} />
        <Dato t="Tienda" v={h.tienda ? `${nombreTienda(h.tienda.nombre)}${h.tienda.direccion ? ` · ${h.tienda.direccion}` : ""}` : "Tienda online"} />
      </Bloque>
      <Bloque titulo="1. Identificación del consumidor">
        <Dato t="Nombre" v={h.consumidor.nombre} />
        <Dato t={NOMBRE_DOCUMENTO[h.consumidor.tipo_documento]} v={h.consumidor.documento} />
        <Dato t="Domicilio" v={h.consumidor.domicilio} />
        <Dato t="Teléfono" v={h.consumidor.telefono} />
        <Dato t="Correo" v={h.consumidor.correo} />
        {filasDelApoderado(h).map(([t, v]) => (
          <Dato key={t} t={t} v={v} />
        ))}
      </Bloque>
      <Bloque titulo="2. Identificación del bien contratado">
        <Dato t="Tipo" v={h.bien.tipo === "producto" ? "Producto" : "Servicio"} />
        <Dato t="Monto reclamado" v={monto ?? "—"} />
        <Dato t="Descripción" v={h.bien.descripcion} />
      </Bloque>
      <Bloque titulo="3. Detalle de la reclamación">
        <Dato t="Tipo" v={tipoConSuSentido(h.tipo)} />
        <Dato t="Detalle" v={h.detalle} largo />
        <Dato t="Pedido" v={h.pedido} largo />
      </Bloque>
      {h.respuesta && (
        <Bloque titulo="4. Observaciones y acciones adoptadas por el proveedor">
          <Dato t="Fecha" v={h.respondida_en ? fechaDeLaHoja(h.respondida_en) : "—"} />
          <Dato t="Respuesta" v={h.respuesta} largo />
        </Bloque>
      )}
      <footer className="lr-hoja-pie">
        El consumidor declaró que lo escrito en esta hoja es correcto. {NOTA_LEGAL}
      </footer>
    </article>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="lr-hoja-bloque">
      <h2>{titulo}</h2>
      <dl>{children}</dl>
    </section>
  );
}

function Dato({ t, v, largo = false }: { t: string; v: string; largo?: boolean }) {
  return (
    <div data-largo={largo ? "" : undefined}>
      <dt>{t}</dt>
      <dd>{v}</dd>
    </div>
  );
}
