import { exigirModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/fechas-lima";
import { leerCampanas, leerDiasPortada, rangoDeLaLinea } from "@/lib/campanas-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { CampanasPantalla } from "@/components/campanas/CampanasPantalla";
import { NuevaCampana } from "@/components/campanas/NuevaCampana";

// Tienda web ▸ Campañas (ADR-0436, Felipe 2026-10-16/17; maqueta docs/maquetas/campanas-diseno-2026-10, pantalla 1): las campañas y qué
// campaña anuncia la portada de la tienda online cada día. Es de CAYLA entera, no de una sede: la web es una sola, y una campaña rige en
// las tres tiendas. Cuál sale cada día lo dice la base (`campanas_portada_dias`, la misma regla que lee la tienda): la pantalla no la
// adivina. Si los días no se pueden leer, la lista se ve igual y la línea lo dice.
export default async function CampanasPage() {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("campanas");
  const supabase = await createClient();
  const hoy = hoyLima();
  const rango = rangoDeLaLinea(hoy);
  // Las dos funciones son nuevas (20261017144000): aún no están en los tipos generados.
  const [lista, dias, nombres] = await Promise.all([
    supabase.rpc("campanas_lista" as never),
    supabase.rpc("campanas_portada_dias" as never, { p_desde: rango.desde, p_hasta: rango.hasta } as never),
    // Todos los nombres de etiquetas: el ejemplo del nombre de una campaña nueva nunca propone uno que ya existe.
    supabase.from("etiquetas").select("nombre"),
  ]);
  const campanas = lista.error ? null : leerCampanas(lista.data);
  // La hora del contador de las portadas en chico, la de esta carga (`getTime()`: ver la página de una campaña).
  const ahora = new Date().getTime();

  return (
    <div className="tw space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        detalle="Tienda web"
        titulo="Campañas"
        subtitulo="Lo que celebras, cuándo, con qué descuento y cómo se ve en la web. Cada campaña puede tener su propio diseño; la que no lo tiene sale con el rojo de siempre."
        acciones={<NuevaCampana nombresUsados={(nombres.data ?? []).map((e) => e.nombre)} hoy={hoy} />}
      />
      {campanas === null ? (
        <Aviso tono="error" titulo="No se pudieron leer las campañas">
          Recarga la página; si sigue, avísale al líder.
        </Aviso>
      ) : (
        <CampanasPantalla campanas={campanas} dias={dias.error ? null : leerDiasPortada(dias.data)} hoy={hoy} ahora={ahora} />
      )}
    </div>
  );
}
