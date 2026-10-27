import { CircleCheck } from "lucide-react";
import { BotonEnlace } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { hrefNuevaOrden } from "@/lib/produccion-decisiones";
import type { HojaDeModelo } from "@/lib/produccion-hoja-modelo";
import type { PresentacionDeModelo } from "@/lib/produccion-presentacion";
import { PRIMEROS_QUE_SE_VEN, type FilaPrimero, type QueFabricarPrimero } from "@/lib/produccion-primero";
import { FilaQueAbreLaHoja } from "./FilaQueAbreLaHoja";
import { FilasQuePlegan } from "./FilasQuePlegan";
import { FotoModelo } from "./FotoModelo";
import { PorQue } from "./PorQue";

// «¿Qué fabrico primero?» (Formidable, 2026-10-27): UNA pregunta, UNA lista. Reemplaza al aviso de «N modelos por producir» y a la parte de la tabla que decía lo mismo. Cada
// modelo trae su foto, una frase y UNA cantidad; el ritmo y la barra quedan bajo «¿Por qué?» y en la hoja «Ver el modelo». Componente de servidor: las filas llegan hechas y solo
// las piezas que guardan un estado (`FilaQueAbreLaHoja`, `PorQue`, `FilasQuePlegan`) son del navegador.

type Comunes = { presentaciones: Record<string, PresentacionDeModelo>; hojas: Record<string, HojaDeModelo> };

function FilaFirme({ f, primera, presentaciones, hojas }: { f: FilaPrimero; primera: boolean } & Comunes) {
  return (
    <li className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 border-b border-tinta/10 px-4 py-3.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] ${primera ? "bg-ambar/5" : ""}`}>
      <div className="min-w-0 sm:col-span-1">
        <FilaQueAbreLaHoja
          hoja={hojas[f.productoId]}
          presentacion={presentaciones[f.productoId]}
          guia={primera ? "prod-resumen.modelo" : undefined}
          className="flex w-full min-w-0 cursor-pointer items-center gap-3.5 rounded-lg text-left"
        >
          <FotoModelo productoId={f.productoId} presentaciones={presentaciones} ancho={56} className="w-14" />
          <span className="min-w-0">
            {primera && <Chip tono="ambar">Empieza por aquí</Chip>}
            <span className="line-clamp-2 break-words text-[15px] font-medium leading-snug text-tinta">{f.referencia}</span>
            <span className="block text-[13px] text-tinta/70">{f.frase}</span>
          </span>
        </FilaQueAbreLaHoja>
        {/* Bajo el nombre, no bajo la foto: 56 px de foto + 14 de hueco. */}
        <div className="ml-[4.375rem]">
          <PorQue texto={f.porque} guia={primera ? "prod-resumen.porque" : undefined} />
        </div>
      </div>
      <div className="text-right">
        <span className="block text-xs text-tinta/65">Fabricar</span>
        <span className="block font-serif text-[26px] leading-none tabular-nums text-tinta">{f.cantidad === null ? "—" : `unas ${f.cantidad}`}</span>
        <span className="block text-xs text-tinta/65">prendas</span>
      </div>
      <BotonEnlace href={hrefNuevaOrden(f.productoId, true)} peso={primera ? "primario" : "fantasma"} className="col-span-2 sm:col-span-1">
        Preparar orden
      </BotonEnlace>
    </li>
  );
}

function FilaVigilar({ f, presentaciones, hojas }: { f: FilaPrimero } & Comunes) {
  return (
    <li className="border-b border-tinta/10 last:border-b-0">
      <FilaQueAbreLaHoja hoja={hojas[f.productoId]} presentacion={presentaciones[f.productoId]} className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-sand/40 focus-visible:-outline-offset-2">
        <FotoModelo productoId={f.productoId} presentaciones={presentaciones} ancho={32} className="w-8" />
        <span className="min-w-0 flex-1 truncate text-[14px] text-tinta">{f.referencia}</span>
        <span className="hidden text-xs text-tinta/65 sm:block">{f.frase}</span>
      </FilaQueAbreLaHoja>
    </li>
  );
}

export function ListaQueFabricarPrimero({ datos, falloRed, presentaciones, hojas }: { datos: QueFabricarPrimero; falloRed: string | null } & Comunes) {
  const { firmes, vigilar, presentacion } = datos;
  // Si la red no se pudo leer, «nada se está agotando» sería falso: se dice lo que pasó (principio 9) y la pantalla sigue.
  if (falloRed)
    return (
      <section data-guia="prod-resumen.que-producir" aria-label="Qué fabricar primero" className="space-y-3">
        <TituloSeccion>¿Qué fabrico primero?</TituloSeccion>
        <p className="rounded-md bg-sand/60 px-3 py-2 text-xs text-tinta/75">{falloRed}</p>
      </section>
    );
  const visibles = firmes.slice(0, PRIMEROS_QUE_SE_VEN).map((f, i) => <FilaFirme key={f.productoId} f={f} primera={i === 0} presentaciones={presentaciones} hojas={hojas} />);
  const guardadas = firmes.slice(PRIMEROS_QUE_SE_VEN).map((f) => <FilaFirme key={f.productoId} f={f} primera={false} presentaciones={presentaciones} hojas={hojas} />);

  return (
    <section data-guia="prod-resumen.que-producir" id="primero" aria-label="Qué fabricar primero" className="space-y-3">
      <TituloSeccion cuenta={firmes.length > 0 ? firmes.length : undefined}>¿Qué fabrico primero?</TituloSeccion>
      {firmes.length + vigilar.length > 0 && <p className="-mt-1 px-1 text-[13px] text-tinta/70">{presentacion}</p>}
      {firmes.length === 0 ? (
        <div className="card-cayla">
          <Vacio tamano="chico" icono={<CircleCheck />}>
            <b className="font-semibold text-tinta">{vigilar.length > 0 ? "Ningún modelo con ventas firmes se está agotando." : "Nada se está agotando."}</b>{" "}
            {vigilar.length > 0 ? "Abajo hay unos pocos para vigilar." : "Ningún modelo pide fabricar ahora."}
          </Vacio>
        </div>
      ) : (
        <div className="card-cayla overflow-hidden">
          {guardadas.length > 0 ? <FilasQuePlegan visibles={visibles} resto={guardadas} textoMas={`Ver ${guardadas.length} más`} /> : <ul>{visibles}</ul>}
        </div>
      )}
      {vigilar.length > 0 && (
        <div className="card-cayla overflow-hidden">
          <FilasQuePlegan
            cabecera={
              <div className="px-4 py-3.5">
                <p className="text-[15px] font-medium text-tinta">{vigilar.length === 1 ? "1 modelo para vigilar" : `${vigilar.length} modelos para vigilar`}</p>
                <p className="mt-0.5 text-[13px] text-tinta/70">Vendieron 1 o 2 prendas en el mes: todavía no sabemos si se venden de verdad. Míralos, pero no cortes tela por ellos todavía.</p>
              </div>
            }
            resto={vigilar.map((f) => (
              <FilaVigilar key={f.productoId} f={f} presentaciones={presentaciones} hojas={hojas} />
            ))}
            textoMas={vigilar.length === 1 ? "Verlo" : `Ver los ${vigilar.length}`}
          />
        </div>
      )}
    </section>
  );
}
