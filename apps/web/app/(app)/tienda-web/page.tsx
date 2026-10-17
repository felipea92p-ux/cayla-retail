import { redirect } from "next/navigation";
import { exigirModulo, veModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { getConfiguracionTiendaWeb } from "@/lib/configuracion";
import { hoyLima } from "@/lib/fechas-lima";
import { nombreCorto } from "@/lib/precio-sede-reglas";
import { cifrasDe as cifrasDePedidos, leerTablero } from "@/lib/pedidos-web-reglas";
import { cifrasDe as cifrasDeRecomendaciones, leerRecomendaciones } from "@/lib/recomendaciones-reglas";
import { borradorDe, estadoSedeWeb, limpiarTexto } from "@/lib/tienda-web-reglas";
import { encendidosSinPrecio, teselasDe, type EntradaResumen, type TeselaWeb } from "@/lib/tienda-web-resumen";
import { cifrasEsperan, leerEsperan } from "@/lib/vitrina-esperan-reglas";
import { cifrasLooks, leerLooks } from "@/lib/vitrina-looks-reglas";
import { cifrasDe as cifrasDeVitrina, leerVitrina } from "@/lib/vitrina-reglas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { ResumenTiendaWeb } from "@/components/tienda-web/ResumenTiendaWeb";

// Tienda web ▸ Resumen (ADR-0430, Felipe 2026-10-16): «¿Qué te pide hoy la tienda web?». Es también la puerta del grupo: quien no tiene
// el módulo del Resumen cae en la primera pantalla de Tienda web que ve, en el orden del menú. Sin funciones propias: lee con las
// mismas lecturas de Pedidos, Vitrina, Recomendaciones y Datos y plazos, y SOLO las de los módulos que la cuenta ve (lo demás ni se pide).
export default async function TiendaWebPage() {
  const persona = await exigirModulo("tienda_web", "pedidos_web", "vitrina_web", "recomendaciones", "ajustes_web");
  if (!veModulo(persona, "tienda_web")) {
    if (veModulo(persona, "pedidos_web")) redirect("/tienda-web/pedidos");
    if (veModulo(persona, "vitrina_web")) redirect("/tienda-web/vitrina");
    if (veModulo(persona, "recomendaciones")) redirect("/tienda-web/recomendaciones");
    redirect("/tienda-web/ajustes");
  }

  const { entrada, teselas } = await leerResumen(persona);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        detalle="Tienda web"
        titulo="Resumen"
        subtitulo="Lo que la tienda online te pide hoy, de un vistazo: qué ve el cliente, qué espera respuesta y cómo van los pedidos."
      />
      <ResumenTiendaWeb entrada={entrada} teselas={teselas} tienda={persona.ubicacionEtiqueta} />
    </div>
  );
}

/** Lo que el Resumen lee de cada pantalla del grupo, ya convertido en lo que dibuja. Fuera del componente: «ahora» es la hora de esta
 *  lectura (el plazo del próximo pedido se cuenta desde aquí), no algo que cambie al volver a dibujar. */
async function leerResumen(persona: Awaited<ReturnType<typeof exigirModulo>>): Promise<{ entrada: EntradaResumen; teselas: TeselaWeb[] | null }> {
  const supabase = await createClient();
  const ve = (c: Parameters<typeof veModulo>[1]) => veModulo(persona, c);
  const enTienda = persona.ubicacionTipo === "tienda";
  const nada = Promise.resolve(null);
  // Todo a la vez: cada lectura es independiente y una que se cae no frena a las demás (principio 9).
  const [tablero, vitrina, looks, esperan, recomendaciones, ajustes] = await Promise.all([
    ve("pedidos_web") && enTienda ? supabase.rpc("fn_pedidos_web_tablero", { p_ubicacion_id: persona.ubicacionId }) : nada,
    ve("vitrina_web") ? supabase.rpc("fn_vitrina_modelos") : nada,
    ve("vitrina_web") ? supabase.rpc("fn_vitrina_looks") : nada,
    ve("vitrina_web") ? supabase.rpc("fn_vitrina_esperan") : nada,
    ve("recomendaciones") ? supabase.rpc("fn_recomendaciones") : nada,
    ve("ajustes_web") ? getConfiguracionTiendaWeb() : nada,
  ]);

  const ahora = Date.now();
  const lecturaVitrina = vitrina && !vitrina.error ? leerVitrina(vitrina.data) : null;
  const listaRecomendaciones = recomendaciones && !recomendaciones.error ? leerRecomendaciones(recomendaciones.data) : null;

  const entrada: EntradaResumen = {
    pedidos: !ve("pedidos_web")
      ? { estado: "sin_modulo" }
      : !enTienda
        ? { estado: "no_tienda" }
        : tablero && !tablero.error
          ? (() => {
              const t = leerTablero(tablero.data);
              return { estado: "ok" as const, dato: { cifras: cifrasDePedidos(t, ahora), plazos: t.plazos } };
            })()
          : { estado: "fallo" },
    vitrina: !ve("vitrina_web")
      ? { estado: "sin_modulo" }
      : lecturaVitrina
        ? {
            estado: "ok",
            dato: {
              cifras: cifrasDeVitrina(lecturaVitrina.modelos),
              encendidosSinPrecio: encendidosSinPrecio(lecturaVitrina.modelos),
              looks: looks && !looks.error ? cifrasLooks(leerLooks(looks.data).looks) : null,
              esperan: esperan && !esperan.error ? cifrasEsperan(leerEsperan(esperan.data)) : null,
            },
          }
        : { estado: "fallo" },
    recomendaciones: !ve("recomendaciones")
      ? { estado: "sin_modulo" }
      : listaRecomendaciones
        ? { estado: "ok", dato: cifrasDeRecomendaciones(listaRecomendaciones.recomendaciones, hoyLima()) }
        : { estado: "fallo" },
    ajustes: !ve("ajustes_web")
      ? { estado: "sin_modulo" }
      : ajustes
        ? {
            estado: "ok",
            dato: ajustes.sedes.map((s) => {
              const b = borradorDe(s);
              return { id: s.id, nombre: limpiarTexto(b.nombreWeb) ?? nombreCorto(s.nombre), ...estadoSedeWeb({ mostrar: s.mostrar, ...b }) };
            }),
          }
        : { estado: "fallo" },
  };
  const teselas: TeselaWeb[] | null = lecturaVitrina ? teselasDe(lecturaVitrina.modelos) : null;
  return { entrada, teselas };

}
