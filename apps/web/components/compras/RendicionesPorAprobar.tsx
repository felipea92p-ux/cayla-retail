import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { RevisarRendicion } from "@/components/fondos/RevisarRendicion";
import { soles } from "@/lib/compras-reglas";
import { diaYHoraLima } from "@/lib/fechas-lima";
import type { Rendicion } from "@/lib/rendicion-reglas";

// «Rendiciones por aprobar» (ADR-0362, fase 6 · actividad 5), sacada tal cual de `compras/fondos` (ADR-0704): ahora sale en la portada de
// Compradores, y solo cuando hay alguna (el 2026-11-26 no había ninguna).

// La tabla de las rendiciones decide su forma por el ancho de SU tarjeta (`@container` en <Tabla>, como Órdenes de compra y Clientes), no
// por el de la ventana: con el lateral abierto la tarjeta mide ~370 px menos que la ventana (2026-10-14). Cambia en dos cortes:
//   · desde 60 rem de tarjeta, todas las columnas;
//   · desde 36 rem, lo que explica la cifra baja a la segunda línea de la persona (debería tener · dice que tiene) y quedan la persona,
//     cómo quedó y la acción;
//   · más angosta (celular, o una ventana chica con el lateral), cada fila apila sus datos.
// Las dos hojas de fondos ya no son tablas (diseño A, 2026-10-23): sus listas deciden su forma por el ancho de la hoja, también con @container.
const PLANTILLA_RENDICIONES =
  "@min-[36rem]:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_7rem] @min-[60rem]:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_minmax(0,0.8fr)_7rem]";
// Los títulos, solo con la tabla en columnas (desde 36 rem): apilada, cada dato lleva su propio rótulo.
const TITULOS_DESDE = "hidden @min-[36rem]:grid";
// Una celda que solo es columna propia en la tabla ancha.
const SOLO_ANCHA = "hidden @min-[60rem]:block";
// Lo que en una tabla menos ancha va en la segunda línea de la primera celda (que puede partirse).
const SEGUNDA_LINEA = "block whitespace-normal text-sm text-taupe @min-[60rem]:hidden";
// La acción de la fila: al borde derecho cuando hay columnas; apilada, bajo lo demás.
const ACCION = "flex min-w-0 justify-start @min-[36rem]:justify-end";

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? uno : varios}`;
// Un monto dentro de una frase que se parte (la segunda línea): «S/» y el número nunca quedan en líneas distintas, o se leen como dos cifras.
const montoEnFrase = (n: number) => <span className="whitespace-nowrap">{soles(n)}</span>;

export function RendicionesPorAprobar({ porAprobar, debe }: { porAprobar: readonly Rendicion[]; debe: (personaId: string) => number }) {
  if (porAprobar.length === 0) return null;
  return (
            <section className="space-y-3">
              <TituloSeccion cuenta={porAprobar.length}>Rendiciones por aprobar</TituloSeccion>
              {/* `overflow-y-hidden`: la entrada de las filas (suben 8 px) no le pone a la tarjeta una barra vertical de paso. */}
              <Tabla guia="fondos.rendiciones" className="@container overflow-y-hidden">
                <Encabezado
                  visible={TITULOS_DESDE}
                  plantilla={PLANTILLA_RENDICIONES}
                  columnas={[
                    { titulo: "Persona" },
                    { titulo: "Debería tener", alinear: "der", clase: SOLO_ANCHA },
                    { titulo: "Dice que tiene", alinear: "der", clase: SOLO_ANCHA },
                    { titulo: "Cómo quedó" },
                    { titulo: "" },
                  ]}
                />
                {porAprobar.map((r) => (
                  <div key={r.id} className={fila(PLANTILLA_RENDICIONES)}>
                    <span className={celda("izq", "text-tinta")}>
                      <span className="block truncate font-medium">{r.persona}</span>
                      {/* Se parte en vez de cortarse: «papeles sin foto» es justo lo que quien aprueba tiene que ver. */}
                      <span className="block whitespace-normal text-sm text-taupe">
                        La rindió el {r.rendidaEn ? diaYHoraLima(r.rendidaEn).dia : "—"}
                        {r.sinFoto > 0 ? ` · ${plural(r.sinFoto, "papel sin foto", "papeles sin foto")}` : ""}
                      </span>
                      <span className={SEGUNDA_LINEA}>
                        Debería tener {montoEnFrase(Math.max(r.saldo, 0))} · dice que tiene {montoEnFrase(r.efectivo)}
                      </span>
                    </span>
                    <span className={celda("der", `${SOLO_ANCHA} text-tinta/80`)}>{soles(Math.max(r.saldo, 0))}</span>
                    <span className={celda("der", `${SOLO_ANCHA} text-tinta/80`)}>{soles(r.efectivo)}</span>
                    <span className="min-w-0">
                      {r.faltante > 0.005 ? <Chip tono="ambar">Faltan {soles(r.faltante)}</Chip> : <Chip tono="verde">Cuadra</Chip>}
                    </span>
                    <span className={ACCION}>
                      <RevisarRendicion rendicion={r} deuda={debe(r.personaId)} />
                    </span>
                  </div>
                ))}
              </Tabla>
            </section>
  );
}
