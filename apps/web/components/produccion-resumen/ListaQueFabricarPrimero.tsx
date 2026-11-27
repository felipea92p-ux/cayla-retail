import { CircleCheck } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BotonEnlace } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { ParDato, Pares } from "@/components/ui/ParDato";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { ID_FABRICAR, hrefNuevaOrden } from "@/lib/produccion-decisiones";
import type { HojaDeModelo } from "@/lib/produccion-hoja-modelo";
import type { PresentacionDeModelo } from "@/lib/produccion-presentacion";
import { PRIMEROS_QUE_SE_VEN, ayudaDeQueFabricar, type FilaPrimero, type QueFabricarPrimero } from "@/lib/produccion-primero";
import { FilaQueAbreLaHoja } from "./FilaQueAbreLaHoja";
import { FilasQuePlegan } from "./FilasQuePlegan";
import { FotoModelo } from "./FotoModelo";
import { PorQue } from "./PorQue";

// «Qué fabricar primero» (Formidable, 2026-10-27; «Producción más clara», 2026-11-26): UNA pregunta, UNA lista. Cada modelo trae su foto, su nombre, dos datos en piezas («En tiendas»
// y «Venta por semana»), UNA cantidad y su botón; la cuenta queda bajo «¿Por qué?» y en la hoja «Ver el modelo». Lo que explica la lista (cómo están esos modelos, qué hace
// «Preparar orden», la edad de los datos) va detrás del «?» del título. Componente de servidor: las filas llegan hechas y solo las piezas que guardan un estado
// (`FilaQueAbreLaHoja`, `PorQue`, `FilasQuePlegan`) son del navegador. Los modelos «para vigilar» ya no van aquí: son un recuadro de «Lo demás está en orden».

type Comunes = { presentaciones: Record<string, PresentacionDeModelo>; hojas: Record<string, HojaDeModelo> };

/** «En tiendas»: el número, o «Agotado» en ámbar (nunca «0»). */
function EnTiendas({ n }: { n: number }) {
  return (
    <ParDato rotulo="En tiendas" tono={n <= 0 ? "ambar" : "tinta"}>
      {n <= 0 ? "Agotado" : n}
    </ParDato>
  );
}

function FilaFirme({ f, primera, presentaciones, hojas }: { f: FilaPrimero; primera: boolean } & Comunes) {
  return (
    // La fila mira el ancho de SU lista (`@container` en la tarjeta): con lugar, foto y datos, cantidad y botón van en una línea; angosta (la columna de dos, el celular), la cantidad
    // y el botón bajan y el botón ocupa todo el ancho.
    <li className={`grid grid-cols-1 items-center gap-x-4 gap-y-3 border-b border-sand px-4 py-4 last:border-b-0 @min-[34rem]:grid-cols-[minmax(0,1fr)_auto_auto] ${primera ? "bg-ambar/5" : ""}`}>
      <div className="min-w-0">
        <FilaQueAbreLaHoja
          hoja={hojas[f.productoId]}
          presentacion={presentaciones[f.productoId]}
          guia={primera ? "prod-resumen.modelo" : undefined}
          className="flex w-full min-w-0 cursor-pointer items-center gap-4 rounded-lg text-left"
        >
          <FotoModelo productoId={f.productoId} presentaciones={presentaciones} ancho={64} className="w-16" />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="line-clamp-2 break-words text-lg font-semibold leading-tight text-tinta">{f.referencia}</span>
              {primera && <Chip tono="ambar">Empieza por aquí</Chip>}
            </span>
            <Pares className="mt-2">
              <EnTiendas n={f.enTiendas} />
              {f.ventaPorSemana && <ParDato rotulo="Venta por semana">{f.ventaPorSemana}</ParDato>}
            </Pares>
          </span>
        </FilaQueAbreLaHoja>
        {/* Bajo el nombre, no bajo la foto: 64 px de foto + 16 de hueco. */}
        <div className="ml-20">
          <PorQue texto={f.porque} guia={primera ? "prod-resumen.porque" : undefined} />
        </div>
      </div>
      {f.cantidad !== null && (
        <p className="flex items-baseline gap-2 @min-[34rem]:block @min-[34rem]:pr-1 @min-[34rem]:text-right">
          <span className="text-xs text-tenue @min-[34rem]:block">{f.cantidad === 1 ? "Fabricar" : "Fabricar unas"}</span>
          <span className="font-serif text-3xl leading-none tabular-nums text-tinta @min-[34rem]:block">{f.cantidad}</span>
          <span className="text-xs text-tenue @min-[34rem]:block">{f.cantidad === 1 ? "prenda" : "prendas"}</span>
        </p>
      )}
      <BotonEnlace href={hrefNuevaOrden(f.productoId, true)} peso={primera ? "primario" : "fantasma"} className="w-full @min-[34rem]:w-auto">
        Preparar orden
      </BotonEnlace>
    </li>
  );
}

function FilaVigilar({ f, presentaciones, hojas }: { f: FilaPrimero } & Comunes) {
  return (
    <li className="border-b border-sand last:border-b-0">
      <FilaQueAbreLaHoja hoja={hojas[f.productoId]} presentacion={presentaciones[f.productoId]} className="flex w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left transition-colors vd-pasa focus-visible:-outline-offset-2">
        <FotoModelo productoId={f.productoId} presentaciones={presentaciones} ancho={40} className="w-10" />
        <span className="min-w-0 flex-1 basis-40 break-words text-sm font-medium leading-snug text-tinta">{f.referencia}</span>
        <Pares>
          <EnTiendas n={f.enTiendas} />
          <ParDato rotulo="Ventas del último mes">{f.ventasDelMes}</ParDato>
        </Pares>
      </FilaQueAbreLaHoja>
    </li>
  );
}

/** Los modelos «para vigilar» (se agotan, pero con 1 o 2 ventas en el mes): la lista que despliega su recuadro de «Lo demás está en orden». Cada fila abre la hoja de su modelo. */
export function ListaParaVigilar({ filas, presentaciones, hojas }: { filas: readonly FilaPrimero[] } & Comunes) {
  return (
    <ul className="card-cayla overflow-hidden">
      {filas.map((f) => (
        <FilaVigilar key={f.productoId} f={f} presentaciones={presentaciones} hojas={hojas} />
      ))}
    </ul>
  );
}

export function ListaQueFabricarPrimero({ datos, falloRed, nota, presentaciones, hojas }: { datos: QueFabricarPrimero; falloRed: string | null; nota: string | null } & Comunes) {
  const { firmes, vigilar } = datos;
  // Si la red no se pudo leer, «nada se está agotando» sería falso: se dice lo que pasó (principio 9) y la pantalla sigue.
  if (falloRed)
    return (
      <section data-guia="prod-resumen.que-producir" id={ID_FABRICAR} aria-label="Qué fabricar primero" className="min-w-0 space-y-3">
        <TituloSeccion>Qué fabricar primero</TituloSeccion>
        <Aviso tono="atencion">{falloRed}</Aviso>
      </section>
    );
  const visibles = firmes.slice(0, PRIMEROS_QUE_SE_VEN).map((f, i) => <FilaFirme key={f.productoId} f={f} primera={i === 0} presentaciones={presentaciones} hojas={hojas} />);
  const guardadas = firmes.slice(PRIMEROS_QUE_SE_VEN).map((f) => <FilaFirme key={f.productoId} f={f} primera={false} presentaciones={presentaciones} hojas={hojas} />);
  const ayuda = ayudaDeQueFabricar(datos, nota);

  return (
    <section data-guia="prod-resumen.que-producir" id={ID_FABRICAR} aria-label="Qué fabricar primero" className="min-w-0 space-y-3">
      <TituloSeccion
        cuenta={firmes.length > 0 ? firmes.length : undefined}
        ayuda={ayuda.map((parrafo, i) => (
          <span key={parrafo} className={i === 0 ? "block" : "mt-2 block"}>
            {parrafo}
          </span>
        ))}
      >
        Qué fabricar primero
      </TituloSeccion>
      {firmes.length === 0 ? (
        <div className="card-cayla">
          <Vacio tamano="chico" icono={<CircleCheck />}>
            <b className="font-semibold text-tinta">{vigilar.length > 0 ? "Ningún modelo con ventas firmes se está agotando." : "Nada se está agotando."}</b>{" "}
            {vigilar.length > 0 ? "Abajo hay unos pocos para vigilar." : "Ningún modelo pide fabricar ahora."}
          </Vacio>
        </div>
      ) : (
        <div className="card-cayla @container overflow-hidden">
          {guardadas.length > 0 ? <FilasQuePlegan visibles={visibles} resto={guardadas} textoMas={`Ver ${guardadas.length} más`} /> : <ul>{visibles}</ul>}
        </div>
      )}
    </section>
  );
}
