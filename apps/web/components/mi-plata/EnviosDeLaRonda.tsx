import { PackageCheck } from "lucide-react";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import type { EnvioMio } from "@/lib/mis-envios-reglas";
import { FilaEnvio } from "./FilaEnvio";

// Mis compras ▸ «Envíos de esta ronda» (maqueta docs/maquetas/mis-compras-envios-2026-10/, Felipe 2026-10-26): los envíos que ya
// salieron en la ronda abierta, cada uno con su código y en qué va, para no ir a otra pantalla a buscar qué avisarle a la tienda. «Ver
// todos» lleva a Mis envíos (con las rondas anteriores y el buscador). Lo que todavía falta mandar sigue arriba, en la franja ámbar.
/** Cuántos se ven aquí: los más nuevos. El resto, en Mis envíos («Ver todos»): la lista de la ronda no se come la pantalla. */
const VISIBLES = 3;

export function EnviosDeLaRonda({ envios, texto, hoy }: { envios: EnvioMio[]; texto: string; hoy: string }) {
  return (
    <section className="flex min-w-0 flex-col gap-1" data-guia="mi-plata.envios">
      <TituloSeccion cuenta={envios.length} accion={<EnlaceVer href="/compras/mi-plata/envios">{envios.length > VISIBLES ? `Ver los ${envios.length}` : "Ver todos"}</EnlaceVer>}>
        Envíos de esta ronda
      </TituloSeccion>
      {envios.length === 0 ? (
        <Vacio icono={<PackageCheck aria-hidden />} titulo="Todavía no mandaste nada" tamano="chico">
          Todavía no mandaste nada en la ronda {texto}. Cuando mandes un envío, aparece aquí con su código.
        </Vacio>
      ) : (
        <ul className="divide-y divide-sand">
          {envios.slice(0, VISIBLES).map((e) => (
            <FilaEnvio key={e.id} e={e} hoy={hoy} />
          ))}
        </ul>
      )}
    </section>
  );
}
