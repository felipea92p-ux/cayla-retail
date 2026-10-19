import Link from "next/link";
import { cuantasEnLaBolsa } from "@/lib/bolsa-servidor";
import { Icono } from "../Icono";
import { RecordarBolsa } from "./BolsaRecordada";
import "@/app/estilos/bolsa.css";

/**
 * El ícono de la bolsa de la cabecera, con cuántas prendas lleva (maqueta v4, `cabT`: `data-bolsa` y su globo rojo). Lo pone la
 * integración de la tienda en `components/Cabecera.tsx`, solo con cuenta (lee la cookie de la bolsa: la portada sin cuenta se
 * guarda en caché y no la lee). Al agregar o quitar, la acción escribe la cookie y Next vuelve a dibujar la página: el número se
 * pone al día solo.
 */
export async function BotonBolsa() {
  const n = await cuantasEnLaBolsa();
  return (
    <Link className="t-ico t-ico-txt" href="/bolsa" data-bolsa aria-label={n > 0 ? `Tu bolsa: ${n} ${n === 1 ? "prenda" : "prendas"}` : "Tu bolsa"}>
      <Icono nombre="bolsa" />
      {/* «Bolsa (2)»: entre paréntesis se lee como una cantidad, no como parte del nombre («Bolsa 2» parecía un nombre). */}
      <span className="t-txt">Bolsa{n > 0 && <i className="t-txt-n"> ({n})</i>}</span>
      {n > 0 && <span className="t-globo">{n}</span>}
      {/* Para el esqueleto de la bolsa: cuántas filas dibujar mientras llega (`BolsaRecordada`). */}
      <RecordarBolsa cuantas={n} />
    </Link>
  );
}
