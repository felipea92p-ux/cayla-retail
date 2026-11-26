import { EntregarFondo } from "@/components/fondos/AccionesFondos";
import { PorDefinir } from "@/components/mi-plata/PorDefinir";
import { CompradoresVista } from "@/components/compras/CompradoresVista";
import { getCompradores } from "@/lib/compradores";
import { getDatosFondos } from "@/lib/fondos";
import { getPorDefinir } from "@/lib/por-definir";
import { hoyLima } from "@/lib/fechas-lima";

// Compras ▸ Compradores (ADR-0704, maqueta docs/maquetas/compras-reestructura-2026-11/, Felipe 2026-11-26): la portada de Compras. Responde una
// pregunta: quién está comprando con plata de CAYLA y en qué la gastó. Arriba, tres cifras (quién compra ahora, lo gastado en el mes y lo que
// espera revisión); debajo, una tarjeta por persona con su ronda abierta (le diste · gastó · le queda, el aviso si algo pide atención y sus
// últimas compras), y las rondas que cerraron, una línea cada una. Cada tarjeta lleva al detalle de la persona, donde se revisa su papel.
// Reemplaza a «Revisar compras» y a las hojas «Quién tiene plata» y «Entregas y devoluciones».

export default async function CompradoresPage() {
  const hoy = hoyLima();
  const [rondas, datos, porDefinir] = await Promise.all([getCompradores(), getDatosFondos(), getPorDefinir()]);
  const tienePorPersona = Object.fromEntries(datos.fondos.map((f) => [f.personaId, Math.max(f.saldo, 0)]));
  const entregar = datos.falla ? undefined : <EntregarFondo opciones={datos.opciones} tiene={tienePorPersona} />;

  return (
    <CompradoresVista
      rondas={rondas}
      hoy={hoy}
      entregar={entregar}
      porDefinir={porDefinir && <PorDefinir modelos={porDefinir.modelos} categorias={porDefinir.categorias} guia="compradores.por-definir" />}
    />
  );
}
