import { notFound, redirect } from "next/navigation";
import { exigirModulo } from "@/lib/persona-actual";
import { getCatalogoConteo, getDetalleConteo } from "@/lib/conteos";
import { textoLugar } from "@/lib/conteo-reglas";
import { unirLineasConPrendas } from "@/lib/conteo-revision";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { PasosConteo } from "@/components/conteo/PasosConteo";
import { RevisarConteo } from "@/components/conteo/RevisarConteo";

// Revisar conteo (rediseño 2026-09-29): la segunda de las tres pantallas del conteo. Esta página LEE el conteo y decide si se
// puede estar aquí; `RevisarConteo` dibuja y hace las acciones (ahí vive el porqué de cada pieza).
//
// Solo un conteo ABIERTO se revisa: uno cerrado o cancelado ya no tiene nada que decidir, y quien llegó por un enlace viejo
// aterriza en su resultado (`/inventario/conteo/[id]`). Aquí NO se redirige a Confirmar nunca: pasar a Confirmar es un gesto
// de la persona («Continuar»), y un redireccionamiento automático de ida y otro de vuelta dejaría un conteo vacío girando
// entre las dos pantallas.
export default async function RevisarConteoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Un layout no vuelve a ejecutarse al navegar entre hijas: cada página repite la puerta del módulo.
  const persona = await exigirModulo("conteos");
  const [detalle, prendas] = await Promise.all([getDetalleConteo(id), getCatalogoConteo()]);
  if (!detalle) notFound();
  const c = detalle.conteo;
  if (c.estado !== "abierto") redirect(`/inventario/conteo/${c.id}`);

  // Al navegador solo viajan las prendas de ESTE conteo, no el catálogo entero.
  const filas = unirLineasConPrendas(detalle.lineas, prendas);

  return (
    <div className="space-y-6 pb-56 sm:pb-28">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Revisar conteo"
        subtitulo={`Conteo ${c.numero} · ${textoLugar(c)}`}
        pie={<Volver forma="boton" href={`/inventario/conteo/${c.id}`} a={`Conteo ${c.numero}`} />}
      />
      <PasosConteo actual="revisar" />
      <RevisarConteo conteoId={c.id} filas={filas} />
    </div>
  );
}
