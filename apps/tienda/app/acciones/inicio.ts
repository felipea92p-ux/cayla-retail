"use server";

import { cookies } from "next/headers";
import { hoyLima } from "@/lib/cuentas";
import { clavesDelNavegador, cookiesQueSobran, nombreCookieAviso, vidaDeLaCookie } from "@/lib/inicio-aviso";

// «Entendido» del aviso al entrar (ADR-0408; Felipe, 2026-10-14). Lo único que hace es recordar, en ESTE aparato, que la persona ya vio
// esos avisos: una cookie por aviso, que dura lo que dura el beneficio (`vidaDeLaCookie`). No escribe nada en la base: lo que alguien
// leyó no se guarda. Next vuelve a dibujar el Inicio con las cookies nuevas, y el aviso ya no sale. En «Mi cuenta» todo sigue a la vista.

/**
 * `vistas`: los avisos que se cerraron (los que estaban a la vista). `activas`: todos los que hoy están a favor de la persona (los ya
 * cerrados también). La cookie de un aviso SUYO que ya no está en esa lista (una talla que se volvió a acabar) se borra: así las cookies
 * no se juntan y, si esa talla vuelve a llegar, el aviso vuelve a salir. Las de otra persona del mismo aparato no se tocan. Lo que no
 * tiene forma de aviso no escribe nada.
 */
export async function entendiElAviso(vistas: unknown, activas: unknown): Promise<void> {
  const cerradas = clavesDelNavegador(vistas);
  if (!cerradas) return;
  const almacen = await cookies();
  const hoy = hoyLima();
  for (const clave of cerradas) {
    almacen.set(nombreCookieAviso(clave), "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: vidaDeLaCookie(clave, hoy),
    });
  }
  // Sin la lista de lo vigente (o rara) no se borra nada: borrar de más haría volver a salir avisos ya cerrados.
  const todas = clavesDelNavegador(activas);
  if (!todas) return;
  for (const nombre of cookiesQueSobran(almacen.getAll().map((c) => c.name), cerradas, todas)) almacen.delete(nombre);
}
