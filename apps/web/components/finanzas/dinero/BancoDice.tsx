// Finanzas ▸ Cuentas y dinero ▸ Cuadrar con el banco: «El banco dice» (ADR-0637, actividad 1). En el banco al que depositan las máquinas,
// lo que dicen las líneas de su extracto ya guardadas (`banco_lineas`), al lado de lo que suma el ERP en esa cuenta al mismo día. Los dos
// saldos y la diferencia los calcula la base (`fn_banco_cuadre`); aquí solo se dibujan y se dicen con palabras de tienda
// (`lib/banco-lineas.ts`). Solo lee: lo único que se toca es «Subir extracto», que llega armado desde la página y va siempre en el mismo
// lugar (el título), para que la hoja abierta no se cierre cuando el bloque pasa de «sin extracto» a tener datos.

import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { fechaCorta } from "@/lib/gastos-reglas";
import { solesDeCentimos } from "@/lib/extracto-interbank";
import {
  estadoDelCuadre,
  fraseDeCadenaCompleta,
  fraseDeHuecos,
  fraseDeLineas,
  fraseDePorConfirmar,
  fraseDeUltimaCarga,
  fraseDelAncla,
  gruposDelBanco,
  ladoDeLaDiferencia,
  type CuadreBanco,
} from "@/lib/banco-lineas";

type Props = {
  /** El nombre del banco elegido. */
  banco: string;
  /** Lo que respondió la base; nulo si no se pudo leer (se dice aquí mismo, una sola vez, y no se dibujan ceros). */
  cuadre: CuadreBanco | null;
  /** Por qué no se pudo leer, si la base lo dijo. */
  falla?: string | null;
  /** El botón «Subir extracto» con su hoja. */
  subir: ReactNode;
};

const cifra = (centimos: number | null) => (centimos === null ? "—" : solesDeCentimos(centimos));

export function BancoDice({ banco, cuadre, falla, subir }: Props) {
  return (
    <section className="card-cayla din-banco anim-sube" data-guia="fin-conciliacion.banco-dice" aria-label={`Lo que dice el banco de ${banco}`}>
      <TituloSeccion
        accion={subir}
        ayuda="Sale de las líneas del extracto que guardaste: el saldo del banco es el de su última línea. Al lado va lo que suma tu ERP en esta cuenta al mismo día. Nada de aquí mueve plata."
      >
        El banco dice
      </TituloSeccion>
      {cuadre ? (
        <Cuerpo banco={banco} cuadre={cuadre} />
      ) : (
        <Aviso tono="error" chico>
          {(falla ?? "No se pudo leer lo guardado del banco").replace(/[.\s]+$/, "")}. Actualiza la pantalla: lo guardado no se perdió.
        </Aviso>
      )}
    </section>
  );
}

function Cuerpo({ banco, cuadre }: { banco: string; cuadre: CuadreBanco }) {
  const estado = estadoDelCuadre(cuadre, banco);
  if (estado.clave === "sin_extracto" || !cuadre.banco) {
    return (
      <Vacio icono={<FileText />} titulo={estado.chip}>
        {estado.frase} Baja el .txt de la banca por internet, súbelo con «Subir extracto» y guárdalo: aquí vas a ver lo que dice el banco al lado de lo que dice tu ERP.
      </Vacio>
    );
  }
  const dia = fechaCorta(cuadre.banco.al);
  const ancla = fraseDelAncla(cuadre);
  const huecos = fraseDeHuecos(cuadre);
  const porConfirmar = fraseDePorConfirmar(cuadre.porConfirmar);
  const cadenaCompleta = fraseDeCadenaCompleta(cuadre);
  const grupos = gruposDelBanco(cuadre.porCodigo);
  const diferencia = cuadre.diferenciaCentimos;
  return (
    <>
      <div className="din-banco-cifras">
        <div className="din-banco-cifra">
          <span className="label-cayla">
            {banco} · al {dia}
          </span>
          <b className="din-cuad-cifra din-banco-num">{cifra(cuadre.banco.saldoCentimos)}</b>
          <span className="din-cuad-tenue">El saldo de la última línea guardada.</span>
        </div>
        <div className="din-banco-cifra">
          <span className="label-cayla">Tu ERP dice · al {dia}</span>
          <b className="din-cuad-cifra din-banco-num">{cifra(cuadre.erpCentimos)}</b>
          <span className="din-cuad-tenue">Lo que suma en esta cuenta hasta ese mismo día, no hasta hoy.</span>
        </div>
        <div className="din-banco-cifra">
          <span className="label-cayla">Diferencia</span>
          <b className="din-cuad-cifra din-banco-num">{cifra(diferencia === null ? null : Math.abs(diferencia))}</b>
          <span className="din-cuad-tenue">{ladoDeLaDiferencia(diferencia) ?? "Todavía no se puede comparar."}</span>
        </div>
      </div>

      <div className="din-banco-estado">
        <div className="din-banco-chips">
          <Chip tono={estado.tono}>{estado.chip}</Chip>
          {cuadre.porConfirmar > 0 && <Chip tono="ambar">{cuadre.porConfirmar.toLocaleString("en-US")} por confirmar</Chip>}
          {huecos && <Chip tono="ambar">Le faltan líneas</Chip>}
        </div>
        <p className="text-sm text-tinta">{estado.frase}</p>
        {ancla && <p className="din-cuad-tenue">{ancla}</p>}
        {huecos && (
          <Aviso tono="atencion" titulo="A la cadena le faltan líneas">
            {huecos}
          </Aviso>
        )}
      </div>

      <div className="din-banco-pie">
        <div className="din-banco-col">
          <span className="label-cayla">{cuadre.piso ? `Qué trajo desde el ${fechaCorta(cuadre.piso)}` : "Qué trajo"}</span>
          {grupos.length > 0 ? (
            <ul className="din-maq-dias" aria-label="Lo que trajo el banco, por tipo">
              {grupos.map((g) => (
                <li key={g.clave}>
                  <span className="text-sm text-tinta">
                    {g.nombre} · {g.n.toLocaleString("en-US")}
                  </span>
                  <b className="din-cuad-num">
                    {[g.entraCentimos > 0 ? `+${solesDeCentimos(g.entraCentimos)}` : null, g.saleCentimos > 0 ? solesDeCentimos(-g.saleCentimos) : null].filter(Boolean).join(" · ") || solesDeCentimos(0)}
                  </b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="din-cuad-tenue">Todo lo guardado es de antes de ese día.</p>
          )}
          <p className="din-cuad-tenue">
            Entró {solesDeCentimos(cuadre.entraCentimos)} y salió {solesDeCentimos(cuadre.saleCentimos)}.
          </p>
        </div>
        <div className="din-banco-col">
          <span className="label-cayla">Las líneas guardadas</span>
          <p className="text-sm text-tinta">{fraseDeLineas(cuadre)}.</p>
          {cadenaCompleta && <p className="din-cuad-tenue">{cadenaCompleta}</p>}
          {porConfirmar && <p className="din-cuad-tenue">{porConfirmar}</p>}
          {cuadre.ultimaCarga && <p className="din-cuad-tenue">{fraseDeUltimaCarga(cuadre.ultimaCarga)}</p>}
        </div>
      </div>
    </>
  );
}
