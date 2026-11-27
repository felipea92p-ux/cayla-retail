import { Pestanas } from "@/components/ui/Pestanas";
import { BotonEnlace } from "@/components/ui/campos";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { ID_LO_DEMAS, asuntosPorTipo, type Decision, type DecisionesOcultas, type FilaModelo, type FilaTela, type PagosDelTaller } from "@/lib/produccion-decisiones";
import { recuadrosDeLoDemas, tituloDeLoDemas, type OrdenEnCurso } from "@/lib/produccion-en-orden";
import type { HojaDeModelo } from "@/lib/produccion-hoja-modelo";
import type { PresentacionDeModelo } from "@/lib/produccion-presentacion";
import { TEXTO_PARA_VIGILAR, queFabricarPrimero } from "@/lib/produccion-primero";
import { ListaParaVigilar, ListaQueFabricarPrimero } from "@/components/produccion-resumen/ListaQueFabricarPrimero";
import { LoDemasEnOrden } from "@/components/produccion-resumen/LoDemasEnOrden";
import { PorResolver } from "@/components/produccion-resumen/PorResolver";
import { TablaDeModelos } from "@/components/produccion-resumen/TablaDeModelos";
import { TelasDelTaller } from "@/components/produccion-resumen/TelasDelTaller";

// Resumen de Producción (ADR-0133, F6): «¿qué necesita mi decisión hoy?». Desde el 2026-11-26 («Producción más clara», versión C de la maqueta
// `docs/maquetas/produccion-resumen-2026-11/`) la pantalla tiene TRES bloques y nada más: «Qué fabricar primero», «Por resolver» y «Lo demás está en orden». Las cuatro cifras de dinero
// de arriba salieron, y lo que eran secciones enteras para consultar (las órdenes por fase, «¿Alcanza la tela?», la tabla de los demás modelos, los modelos para vigilar) se resume en un
// recuadro cada una, que lleva a su pantalla o despliega su detalle en el lugar. Es un componente de servidor: solo las piezas que guardan un estado son del navegador.

export function ResumenProduccionPanel({
  sede,
  presentaciones,
  decisiones,
  ocultas,
  totalAsuntos,
  modelos,
  hojas,
  telas,
  ordenesEnCurso,
  pagos,
  falloRed,
  notaDeHistoria,
}: {
  /** Cómo se dibuja cada modelo (foto, o color y categoría): por `productoId`. Vacío si el catálogo no se pudo leer: se dibuja la percha. */
  presentaciones: Record<string, PresentacionDeModelo>;
  decisiones: Decision[];
  /** Los asuntos que no cupieron, por clase: nunca se cortan en silencio. */
  ocultas: DecisionesOcultas[];
  /** Todos los asuntos que hay (los que se ven y los que no). */
  totalAsuntos: number;
  modelos: FilaModelo[];
  /** La hoja «Ver el modelo» de cada modelo (por `productoId`): lo vendido por color y talla y los enlaces a la orden y al traslado. Se arma en el servidor con lo que ya se leyó. */
  hojas: Record<string, HojaDeModelo>;
  telas: FilaTela[];
  /** Las órdenes de la lista de Órdenes (dónde está cada una y si pide algo). `null`: la lectura falló (el recuadro lo dice y manda a Órdenes). */
  ordenesEnCurso: OrdenEnCurso[] | null;
  /** Lo que se debe a los proveedores del Taller: lo vencido, lo que vence esta semana y el total. */
  pagos: PagosDelTaller;
  falloRed: string | null;
  /** «El sistema lleva 4 semanas de ventas…»: avisa que las cantidades son una guía mientras haya poca historia. `null` cuando ya hay suficiente. */
  notaDeHistoria: string | null;
  /** La sede de la línea de arriba de la cabecera (el Taller). */
  sede: string;
}) {
  const primero = queFabricarPrimero(modelos);
  // ¿Los dos bloques de acción tienen algo que mostrar? Solo entonces (o si ninguno tiene) comparten la fila.
  const hayQueFabricar = primero.firmes.length > 0 || Boolean(falloRed);
  const ladoALado = hayQueFabricar === decisiones.length > 0;
  // Los de «Producir ya» ya están en «Qué fabricar primero»: la tabla que se despliega es el resto del catálogo (llevar a tienda, vigilar, alcanza, hay de sobra, sin ventas).
  const resto = modelos.filter((m) => m.estado !== "producir_ya");
  const recuadros = recuadrosDeLoDemas({
    ordenes: ordenesEnCurso,
    telas,
    modelos,
    falloRed: falloRed !== null,
    pagos,
    paraVigilar: primero.vigilar.length,
    avisados: asuntosPorTipo({ decisiones, ocultas }),
  });

  return (
    <div className="space-y-6">
      {/* La cabecera de todo el ERP menos Finanzas (ADR-0358, Felipe 2026-10-14): el título es el del menú («Resumen») y la pregunta
          que responde pasa a la frase. */}
      <EncabezadoPagina
        sede={sede}
        titulo="Resumen"
        subtitulo="¿Qué necesita tu decisión hoy? Lo que pide acción en el Taller, del más urgente al menos."
        acciones={
          <div data-guia="prod-resumen.acciones" className="flex items-center gap-2">
            <BotonEnlace href="/produccion/ordenes">Ver órdenes</BotonEnlace>
            <BotonEnlace href="/produccion/ordenes?nueva=auto" peso="primario">
              + Nueva orden
            </BotonEnlace>
          </div>
        }
      />
      {/* «Hoy | Eficiencia»: las dos miradas del líder sobre el Taller (ADR-0133, F6 y F7), con la pestaña de vista del sistema
          (ADR-0358). Eficiencia NO es una fila del lateral (el menú de Producción está en su tope de hijas): se llega desde aquí. */}
      <Pestanas
        etiquetaAccesible="Miradas del Taller"
        idIndicador="produccion-miradas"
        guia="produccion.miradas"
        activa="hoy"
        items={[
          { clave: "hoy", etiqueta: "Hoy", href: "/produccion", ayuda: "Qué necesita mi decisión" },
          { clave: "eficiencia", etiqueta: "Eficiencia", href: "/produccion/eficiencia", ayuda: "Cuánto cuesta cada prenda" },
        ]}
      />

      {/* El cuerpo mira SU ancho (`@container`), no el de la ventana: con el menú abierto o plegado decide solo si los dos bloques de acción van lado a lado. */}
      <div className="@container space-y-8">
        {/* Lado a lado solo si los dos bloques tienen algo (o ninguno): con uno vacío, su aviso de una línea dejaba un hueco del alto del otro (Felipe 2026-11-26). Entonces van uno bajo el otro y el que tiene contenido usa todo el ancho. */}
        <div className={`grid grid-cols-1 items-start gap-x-7 gap-y-8 ${ladoALado ? "@min-[56rem]:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)]" : ""}`}>
          <ListaQueFabricarPrimero datos={primero} falloRed={falloRed} nota={notaDeHistoria} presentaciones={presentaciones} hojas={hojas} />
          <PorResolver decisiones={decisiones} ocultas={ocultas} totalAsuntos={totalAsuntos} hojas={hojas} presentaciones={presentaciones} aLoAncho={!ladoALado} />
        </div>

        <LoDemasEnOrden
          id={ID_LO_DEMAS}
          titulo={tituloDeLoDemas(recuadros)}
          recuadros={recuadros}
          paneles={{
            telas: telas.length > 0 ? <TelasDelTaller telas={telas} /> : undefined,
            modelos: resto.length > 0 ? <TablaDeModelos modelos={resto} hojas={hojas} presentaciones={presentaciones} /> : undefined,
            vigilar:
              primero.vigilar.length > 0 ? (
                <div className="space-y-2.5">
                  <TituloSeccion nivel={3} cuenta={primero.vigilar.length} ayuda={TEXTO_PARA_VIGILAR}>
                    Modelos para vigilar
                  </TituloSeccion>
                  <ListaParaVigilar filas={primero.vigilar} presentaciones={presentaciones} hojas={hojas} />
                </div>
              ) : undefined,
          }}
        />
      </div>
    </div>
  );
}
