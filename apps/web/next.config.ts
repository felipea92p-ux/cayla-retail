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
};

export default nextConfig;
