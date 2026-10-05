import Link from "next/link";
import { exigirModulo } from "@/lib/persona-actual";
import { getGruposDelMix } from "@/lib/plan-piso-servidor";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { GruposDelMix } from "@/components/plan-piso/GruposDelMix";

// Plan del piso (ADR-0329 + ADR-0328, actividad 12), primera entrega: los GRUPOS del mix. El piso no se reparte entre las 42
// categorías sueltas sino entre 8 grupos con un rol (destino, rutina…); aquí el líder revisa a qué grupo va cada categoría. La
// propuesta de cuánto lugar tiene cada grupo viene en la actividad siguiente, sobre estos mismos grupos.
// Esta página solo trae los datos (`getGruposDelMix`, que nunca lanza) y dice si quien mira es líder (la base lo decide de verdad);
// todo lo demás —filas, cambios preparados, guardado— vive en `lib/plan-piso-grupos.ts` y en el panel.
export default async function PlanDelPisoPage() {
  // La repite aquí además del layout: un layout no vuelve a correr al navegar entre sus hijas (lo mismo que exigirLider).
  const persona = await exigirModulo("plan_piso");
  const lectura = await getGruposDelMix();

  return (
    <div className="space-y-6 pb-24">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Plan del piso"
        subtitulo="Cuánto lugar tiene cada grupo de prendas en el riel. Primero, a qué grupo pertenece cada categoría."
      />
      {lectura.ok ? (
        <GruposDelMix grupos={lectura.grupos} categorias={lectura.categorias} esLider={persona.rol === "lider"} />
      ) : (
        // Se degrada así: la pantalla dice que no pudo leer y no se pierde nada (no hay nada a medias que guardar).
        <div className="card-cayla p-5" role="alert">
          <p className="text-sm font-semibold text-tinta">No se pudieron leer los grupos del plan del piso.</p>
          <p className="mt-1 text-[13px] text-tinta/70">
            {lectura.motivo} No se perdió nada. Vuelve a intentarlo en un momento; si sigue igual, avisa a quien administra el sistema.
          </p>
          <Link href="/inventario/plan-del-piso" className="btn-cayla btn-secundario mt-4 inline-flex">
            Reintentar
          </Link>
        </div>
      )}
    </div>
  );
}
