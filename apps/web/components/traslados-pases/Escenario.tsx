import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { codigosParaPedido, getCodigosDeSede, getEnviosDeLaSede } from "@/lib/traslados-billetera";
import { claseDelId, vistaDelPedido, vistaParaEnviar } from "@/lib/traslados-pedidos-pases-reglas";
import { EscenarioPase } from "@/components/traslados-pases/EscenarioPase";
import { PasePedido, PaseParaEnviar } from "@/components/traslados-pases/PasePedido";

// Qué pase abre una dirección de Traslados (ADR-0355): una caja (`<uuid>`), un pedido entre sedes (`pedido-<uuid>`) o lo que hay
// para enviar a una sede (`enviar-<uuid de la sede>`). Un pedido que ya salió deja de ser pedido (es una caja en camino): su
// dirección vuelve a la billetera en vez de un 404.
export async function Escenario({ id, volverA }: { id: string; volverA?: { href: string; a: string } | null }) {
  const { clase, ref } = claseDelId(id);
  if (clase === "traslado") return <EscenarioPase id={ref} volverA={volverA} />;

  const persona = await requirePersonaActualV2();
  const [envios, codigo] = await Promise.all([getEnviosDeLaSede(persona.ubicacionId), getCodigosDeSede()]);
  const ahoraIso = new Date().toISOString();
  const sede = { ubicacionId: persona.ubicacionId, etiqueta: persona.ubicacionEtiqueta };

  if (clase === "pedido") {
    const pedido = envios.pedidos.find((p) => p.grupoId === ref);
    if (!pedido) redirect("/inventario/traslados");
    const cods = codigosParaPedido(codigo, persona.ubicacionId, { id: pedido.otraSedeId, nombre: pedido.otraSede });
    const vista = vistaDelPedido(pedido, { miUbicacionId: persona.ubicacionId, ahoraIso }, cods);
    return <PasePedido pedido={pedido} vista={vista} sede={sede} ahoraIso={ahoraIso} />;
  }

  const grupo = envios.paraEnviar.find((g) => g.destinoId === ref);
  if (!grupo) redirect("/inventario/traslados");
  const cods = codigosParaPedido(codigo, persona.ubicacionId, { id: grupo.destinoId, nombre: grupo.destino });
  return <PaseParaEnviar grupo={grupo} vista={vistaParaEnviar(grupo, { ahoraIso }, cods)} sede={sede} ahoraIso={ahoraIso} />;
}
