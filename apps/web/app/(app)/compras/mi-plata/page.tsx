import { HandCoins } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { getMiPlata } from "@/lib/mi-plata";
import { MEDIOS_PLATA, textoMontoAnotado, textoPorConfirmar } from "@/lib/mi-plata-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Chip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";
import { AnotarPlata } from "@/components/mi-plata/AnotarPlata";

// Compras ▸ Mi plata para compras (ADR-0480, Compras simple): la pantalla de quien compra, hecha para el celular. Maqueta aprobada:
// docs/maquetas/compras-simple-2026-10/.
//
// Actividad 2: arriba, cuánto tiene para comprar (su fondo más lo que Compras todavía revisa: ya lo puede usar); después «¿Qué hiciste?»
// con «Me dieron plata» (las otras respuestas —«Compré ropa», «Gasté en otra cosa»— llegan en las actividades 3 a 5); al lado (abajo en el
// celular), lo que anotó, con su estado. Si la lectura falla, lo dice (principio 9): nunca «tienes S/ 0» inventado. Una terminal no tiene
// «tu plata».
export default async function MiPlataPage() {
  const persona = await exigirModulo("ordenes_compra");
  const plata = await getMiPlata();
  const revisando = plata ? textoPorConfirmar(plata.porConfirmar) : null;

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Mi plata para compras"
        subtitulo="Lo que tienes para comprar, lo que compraste y lo que mandas a la tienda."
      />

      {plata === null ? (
        <Aviso tono="error" titulo="No se pudo leer tu plata">
          Vuelve a intentarlo en un momento; si sigue, avísale a tu líder.
        </Aviso>
      ) : !plata.persona ? (
        <Vacio icono={<HandCoins aria-hidden />} titulo="Entra con tu cuenta" guia="mi-plata.vacio">
          La plata para compras es de cada persona: desde una terminal no hay «tu plata». Entra con tu correo para anotarla.
        </Vacio>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <TarjetaCifra etiqueta="Tienes para comprar" valor={soles(plata.tiene)} guia="mi-plata.tienes">
              {plata.saldo < 0 && plata.porConfirmar <= 0 ? "Pusiste de tu bolsillo: CAYLA te debe esa plata." : "Tu plata de compras, lista para usar."}
            </TarjetaCifra>
            {revisando && (
              <p className="nota-cayla text-sm" data-guia="mi-plata.revisando">
                {revisando}
              </p>
            )}
            <section className="flex flex-col gap-3">
              <TituloSeccion>¿Qué hiciste?</TituloSeccion>
              <AnotarPlata puedeYaTenia={plata.puedeYaTenia} />
            </section>
          </div>

          <section className="flex min-w-0 flex-col gap-3" data-guia="mi-plata.lista">
            <TituloSeccion cuenta={plata.anotada.length}>Lo que anotaste</TituloSeccion>
            {plata.anotada.length === 0 ? (
              <Vacio icono={<HandCoins aria-hidden />} titulo="Todavía no anotas plata" tamano="chico">
                Cuando te den plata para comprar, tócala en «Me dieron plata».
              </Vacio>
            ) : (
              <ul className="card-cayla divide-y divide-sand">
                {plata.anotada.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-tinta">
                        {a.medio === "ya_tenia" ? "Plata que ya tenías" : "Te dieron plata"}
                      </span>
                      <span className="block text-xs text-taupe">
                        {MEDIOS_PLATA[a.medio].nombre}
                        {a.fecha ? ` · ${diaMes(a.fecha)}` : ""}
                        {a.conFoto ? " · con foto" : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="whitespace-nowrap text-sm tabular-nums text-tinta">+ {textoMontoAnotado(a)}</span>
                      <Chip tono={a.confirmada ? "verde" : "ambar"} title={a.confirmada ? "Compras ya la revisó" : "Ya la puedes usar; Compras la revisa"}>
                        {a.confirmada ? "Confirmada" : "Por confirmar"}
                      </Chip>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
