"use client";

import Link from "next/link";
import { AvisoInline } from "@/components/alta-producto/piezas";

// El aviso en vivo de "¿ya existe algo así?" (buscar_productos_parecidos,
// 20260918200000). Tres niveles con tres consecuencias distintas — y la
// consecuencia se ve, no solo se lee:
//   identico  → bloquea. No hay salida: un nombre identifica a un solo producto.
//   una_letra → bloquea SALVO que la Líder confirme que es otro ("Top Lily" /
//               "Top Lili"). La salida es un acto deliberado, no un clic de paso.
//   parecido  → solo informa. Nunca frena.

export type Parecido = { id: string; referencia: string; categoria: string; nivel: "identico" | "una_letra" | "parecido" };

export function AvisoParecidos({
  parecidos,
  confirmo,
  onConfirmo,
  noSePudoComprobar,
}: {
  parecidos: Parecido[];
  confirmo: boolean;
  onConfirmo: (v: boolean) => void;
  /** La comprobación falló (red, base): se dice, no se inventa "todo bien" (principio 9). */
  noSePudoComprobar: boolean;
}) {
  const identico = parecidos.find((p) => p.nivel === "identico");
  const unaLetra = parecidos.filter((p) => p.nivel === "una_letra");
  const parecidosSuaves = parecidos.filter((p) => p.nivel === "parecido");

  return (
    <div className="space-y-2">
      {noSePudoComprobar && (
        <AvisoInline tono="neutro">
          No pude comprobar si ya existe un producto con este nombre. Puedes seguir: la base lo verifica otra vez al guardar.
        </AvisoInline>
      )}

      {identico && (
        <AvisoInline tono="rojo" alerta>
          <p>
            Ya existe <strong>{identico.referencia}</strong> en {identico.categoria}. Un nombre identifica a un solo producto.
          </p>
          <Link href={`/productos/${identico.id}`} className="mt-1 inline-block underline underline-offset-4">
            Abrir {identico.referencia}
          </Link>
        </AvisoInline>
      )}

      {!identico && unaLetra.length > 0 && (
        <AvisoInline tono="ambar" alerta={!confirmo}>
          <p>
            Se escribe casi igual que{" "}
            {unaLetra.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ", "}
                <Link href={`/productos/${p.id}`} className="font-semibold underline underline-offset-4">
                  {p.referencia}
                </Link>
              </span>
            ))}{" "}
            (una letra de diferencia). Si es el mismo producto, ábrelo en vez de crearlo otra vez.
          </p>
          <label className="mt-2 flex items-start gap-2">
            <input type="checkbox" checked={confirmo} onChange={(e) => onConfirmo(e.target.checked)} className="mt-0.5 accent-tinta" />
            <span>Es otro producto distinto, créalo igual.</span>
          </label>
        </AvisoInline>
      )}

      {!identico && parecidosSuaves.length > 0 && (
        <AvisoInline tono="neutro">
          También existe algo parecido:{" "}
          {parecidosSuaves.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ", "}
              <Link href={`/productos/${p.id}`} className="underline underline-offset-4">
                {p.referencia}
              </Link>
            </span>
          ))}
          .
        </AvisoInline>
      )}
    </div>
  );
}
