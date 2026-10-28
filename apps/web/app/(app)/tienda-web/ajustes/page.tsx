import { exigirModulo } from "@/lib/persona-actual";
import { getConfiguracionTiendaWeb } from "@/lib/configuracion";
import { Aviso } from "@/components/ui/Aviso";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { ConfiguracionTiendaWeb } from "@/components/ConfiguracionTiendaWeb";

// Tienda web ▸ Conf. Tienda (antes «Datos y plazos»; ADR-0430; módulo `ajustes_web`, 20261016223000; la ruta sigue siendo /ajustes; antes Configuración ▸ Tienda web, ADR-0408 act. 6): lo que la tienda online le muestra al cliente de
// cada tienda —nombre, WhatsApp, dirección y horario, y si se muestra— y los plazos de los pedidos web. Es de CAYLA entera (la web es una
// sola), así que también se abre en CAYLA Global, como Configuración.
export default async function AjustesTiendaWebPage() {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("ajustes_web");
  const datos = await getConfiguracionTiendaWeb();

  return (
    <div className="tw space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        detalle="Tienda web"
        titulo="Conf. Tienda"
        subtitulo="Lo que la tienda online le muestra al cliente de cada tienda, y cuánto espera un pedido en cada paso."
      />
      {datos ? (
        <ConfiguracionTiendaWeb datos={datos} />
      ) : (
        <Aviso tono="error" titulo="No se pudieron leer los ajustes de la tienda web">
          Recarga la página; si sigue, avísale al líder.
        </Aviso>
      )}
    </div>
  );
}
