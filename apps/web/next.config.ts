import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Raíz del workspace para Turbopack. Sin esto Next la infiere buscando lockfiles hacia
  // arriba, encuentra un `package-lock.json` suelto en el home del desarrollador (quedó de
  // una instalación del CLI de supabase) y toma `C:\Users\<usuario>` como raíz del proyecto.
  // Es un problema SOLO local —el contenedor de build de Vercel no tiene ese home— pero
  // ensucia cada arranque con un aviso y desalinea el rastreo de archivos entre local y
  // producción, que es justo la clase de diferencia que después cuesta horas entender.
  turbopack: { root: path.join(__dirname, "..", "..") },

  experimental: {
    // Caché del router del cliente: cuántos segundos puede reusarse una pantalla ya
    // visitada al volver a ella, sin repetir el viaje al servidor.
    //
    // El default de Next es 0 — volver atrás siempre re-renderiza en el servidor. Desde
    // Perú eso son ~400ms para volver a ver algo que se acaba de mirar, y en el mostrador
    // se navega de ida y vuelta todo el tiempo (Vender → Inventario → Vender).
    //
    // 30s es seguro acá por una disciplina que el repo ya tenía antes de este cambio: los
    // 22 componentes que mutan algo —venta, recepción de lote, gasto, movimiento de stock,
    // abrir/cerrar caja— llaman `router.refresh()` al terminar, y eso invalida esta caché
    // entera. Nadie ve su propio cambio desactualizado. Lo único que puede quedar viejo,
    // y como mucho 30s, es un cambio hecho por OTRA persona en OTRA sede — y cada Encargada
    // opera la suya. Si algún día se agrega una mutación sin `router.refresh()`, ESTA es la
    // línea que la vuelve un bug visible. — ADR-0013, Fase 1.
    staleTimes: { dynamic: 30 },
  },

  async redirects() {
    // Alias de enlaces guardados tras el rediseño UX 2026-07-18: `/almacen` y
    // `/almacen/recibir` viven en Inventario. Antes eran páginas de React que solo
    // llamaban a `redirect()` — pagaban sesión + persona/ubicación + AppShell completo
    // en el servidor para terminar igual acá. Un alias de ruta pertenece a la config,
    // no al árbol de páginas: así resuelve en el edge, sin tocar Supabase (confirmado
    // en dev: cero líneas de `proxy.ts` en el log para estas dos rutas).
    //
    // `permanent: false` (307 temporal) a propósito, no `true` (308 permanente): un
    // redirect permanente queda cacheado en el navegador de cada quien, y si algún día
    // hiciera falta recuperar estas rutas no hay forma de limpiar ese caché del lado
    // del cliente.
    //
    // OJO: `/almacen` NO apunta a `/inventario/almacen` — esa ruta ya no existe desde
    // que ADR-0071 (2026-09-16, commit 52882ff) unificó piso+almacén en una sola vista
    // dentro de `/inventario`. El stub viejo (`redirect("/inventario/almacen")`)
    // quedó apuntando a un 404 desde ese día sin que nadie lo notara — verificado en
    // este dev server antes de corregirlo. `/inventario` solo (sin sub-ruta) es hoy el
    // destino correcto.
    return [
      { source: "/almacen", destination: "/inventario", permanent: false },
      { source: "/almacen/recibir", destination: "/inventario/recibir", permanent: false },
    ];
  },
};

export default nextConfig;
