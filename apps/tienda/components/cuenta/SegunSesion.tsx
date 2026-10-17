import { Suspense } from "react";
import { haySesion } from "@/lib/sesion-servidor";
import { ElegirPorCookie } from "./ElegirPorCookie";

/**
 * Una pieza que cambia según haya o no una cuenta abierta, sin volver dinámica la página entera (ADR-0432). Next arma por adelantado
 * todo lo que es igual para todos; saber si hay sesión es leer las cookies de la visita, y eso solo se puede al llegar la visita. Por
 * eso la pieza va en su propio `<Suspense>`: mientras tanto se ve lo que `mientras` diga (por omisión, la pieza que corresponde según
 * la cookie que el navegador ya tiene, `ElegirPorCookie`), y apenas el servidor lee las cookies queda la que corresponde. Para quien
 * no tiene cuenta la hora de verdad no cambia nada: lo que ve al principio es lo que se queda.
 *
 * Solo pregunta si hay una cookie de sesión, sin llamar a nadie (`haySesion`): la cuenta de verdad se valida donde se muestran sus datos.
 * `conCuenta` puede leer datos de la persona (es lo que llega por detrás); si lo hace, pasa `mientras` con una versión sin datos, porque
 * `ElegirPorCookie` los pondría en la página guardada.
 */
export function SegunSesion({
  visitante,
  conCuenta,
  mientras,
}: {
  visitante: React.ReactNode;
  conCuenta: React.ReactNode;
  mientras?: React.ReactNode;
}) {
  return (
    <Suspense fallback={mientras ?? <ElegirPorCookie visitante={visitante} conCuenta={conCuenta} />}>
      <Elegir visitante={visitante} conCuenta={conCuenta} />
    </Suspense>
  );
}

async function Elegir({ visitante, conCuenta }: { visitante: React.ReactNode; conCuenta: React.ReactNode }) {
  return (await haySesion()) ? conCuenta : visitante;
}
