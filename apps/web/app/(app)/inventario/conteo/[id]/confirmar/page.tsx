import { notFound, redirect } from "next/navigation";
import { exigirModulo, puede } from "@/lib/persona-actual";
import { getCatalogoConteo, getDetalleConteo } from "@/lib/conteos";
import { bloqueoDeCierre, textoLugar, yaAjustadaSinTocar } from "@/lib/conteo-reglas";
import { diferenciasEnOrden, unirLineasConPrendas } from "@/lib/conteo-revision";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { PasosConteo } from "@/components/conteo/PasosConteo";
import { ConfirmarConteo } from "@/components/conteo/ConfirmarConteo";

// Confirmar conteo (rediseño 2026-09-29): la tercera y última pantalla del conteo. Esta página LEE, decide si la persona
// puede estar aquí y le pasa a `ConfirmarConteo` (ahí vive el porqué de cada pieza) lo que va a cambiar.
//
// A Confirmar solo se llega con TODO resuelto: sin pendientes —salvo un cierre parcial pedido a propósito, `?parcial=1`— y
// sin diferencias por confirmar. Es exactamente la regla de `cerrar_conteo` (`bloqueoDeCierre`), y no se copia: se llama.
// Quien llega sin cumplirla (un enlace viejo, otro celular que volvió a contar) va a Revisar, donde se resuelve; y a un
// conteo que ya no está abierto, a su resultado.
export default async function ConfirmarConteoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ parcial?: string | string[] }> }) {
  const [{ id }, { parcial: pedidoParcial }] = await Promise.all([params, searchParams]);
  const persona = await exigirModulo("conteos");
  const [detalle, prendas] = await Promise.all([getDetalleConteo(id), getCatalogoConteo()]);
  if (!detalle) notFound();
  const c = detalle.conteo;
  if (c.estado !== "abierto") redirect(`/inventario/conteo/${c.id}`);

  const r = detalle.resumen;
  // «Parcial» solo tiene sentido si de verdad quedan variantes sin verificar: `?parcial=1` sobre un conteo completo es un cierre normal.
  const parcial = (Array.isArray(pedidoParcial) ? pedidoParcial[0] : pedidoParcial) === "1" && r.pendientes > 0;
  if (bloqueoDeCierre(r, parcial) !== null) redirect(`/inventario/conteo/${c.id}/revisar`);

  // Al navegador solo viajan las variantes que cambian: son las que esta pantalla lista. Una línea que el cierre anterior ya ajustó
  // y nadie volvió a contar (conteo reabierto para corregir) NO cambia: cerrar no la toca, y anunciarla con «quedará en N» era falso.
  const conDiferencia = diferenciasEnOrden(unirLineasConPrendas(detalle.lineas, prendas));
  const aActualizar = conDiferencia.filter((f) => !yaAjustadaSinTocar(f));
  const yaAjustadas = conDiferencia.length - aActualizar.length;

  return (
    <div className="space-y-6 pb-56 sm:pb-28">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Confirmar conteo"
        subtitulo={`Conteo ${c.numero} · ${textoLugar(c)}`}
        pie={<Volver forma="boton" href={`/inventario/conteo/${c.id}/revisar`} a="Revisar" />}
      />
      <PasosConteo actual="confirmar" />
      <ConfirmarConteo
        conteoId={c.id}
        filas={aActualizar}
        correctas={r.correctas}
        yaAjustadas={yaAjustadas}
        pendientes={r.pendientes}
        parcial={parcial}
        puedeCerrar={puede(persona, "ajustarInventario")}
      />
    </div>
  );
}
