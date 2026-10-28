import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

// El optimizador de imágenes solo acepta fotos del Storage PÚBLICO de nuestro Supabase (las de prendas,
// `retail-productos-fotos`), nada de otro host: sin lista cerrada, `/_next/image?url=…` serviría de proxy a
// cualquier URL. Se arma desde `NEXT_PUBLIC_SUPABASE_URL` porque producción y local apuntan a hosts distintos.
// Quien lo usa hoy: `ImagenDePrenda` (ADR-0168), que dibujan `FotoPrenda` de Apartados, `MiniaturaPrenda` y `TilePrenda` de Análisis.
// Las demás imágenes de Storage siguen `unoptimized`.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;

// La versión de ESTA compilación: el commit que Vercel construye (su `VERCEL_GIT_COMMIT_SHA`; si faltara, el id del despliegue).
// Queda grabada en el JavaScript de cada pestaña y en la ruta `/api/version`; cuando difieren, la pestaña avisa «hay una versión
// nueva» (ADR-0422, `lib/version-nueva-reglas.ts`). Fuera de Vercel (`next dev`) vale «desarrollo» y no se compara con nada.
const versionDeEstaCompilacion = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "desarrollo";

const nextConfig: NextConfig = {
  // En qué entorno corre esta versión (ADR-0424), escrito dentro del código al armarla: Sentry solo avisa en `production`. Vercel da
  // `VERCEL_ENV` al armar (production, preview); en local no existe y queda «local». Se escribe aquí y no se lee de
  // `NEXT_PUBLIC_VERCEL_ENV` porque esa depende de una casilla del panel de Vercel.
  env: { NEXT_PUBLIC_BUILD_ID: versionDeEstaCompilacion, NEXT_PUBLIC_ENTORNO: process.env.VERCEL_ENV ?? "local" },

  images: {
    remotePatterns: supabaseUrl
      ? [
          {
            protocol: supabaseUrl.protocol === "http:" ? "http" : "https",
            hostname: supabaseUrl.hostname,
            port: supabaseUrl.port,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
    // Cuánto vive en la caché de Vercel una foto ya optimizada: 31 días (el default de Next 16 son 4 horas). El nombre de cada foto lleva un
    // uuid y una foto nueva es un archivo nuevo, así que lo cacheado nunca queda viejo; con 4 horas se volvían a procesar cada pocas
    // horas las ~900 fotos × sus anchos (ADR-0168, act. 2026-10-14 b). Si algún día se REEMPLAZA una foto bajo el mismo nombre, hay que
    // invalidarla (`vercel cache invalidate --srcimg <url>`): hasta entonces se vería la vieja.
    minimumCacheTTL: 60 * 60 * 24 * 31,
    // Los únicos anchos que el optimizador genera: 4 en vez de los 16 por defecto. Cada ancho distinto de una foto es una transformación y una
    // entrada de caché más (~900 fotos × anchos); con estos, cada foto se procesa a lo sumo 4 veces. Cubren lo que la app dibuja
    // (`lib/fotos-tamanos.ts`): miniaturas de 32–64 px → 48 / 96 (retina); de 100 a 260 px → 96 / 256; de 240 px a una tarjeta de 480 px
    // en retina → 640 / 1080. Una foto se sirve algo más grande que su caja, nunca más chica. `imageSizes` va por debajo del menor `deviceSizes`.
    imageSizes: [48, 96, 256],
    deviceSizes: [640, 1080],
    // Solo en `next dev`: el Supabase local vive en localhost, que Next 16 bloquea por defecto (protección SSRF).
    // Nunca en producción: allá el host es público y esta puerta queda cerrada.
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
  },

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
      { source: "/almacen/recibir", destination: "/recibir", permanent: false },
      // ADR-0330: «Ingreso sin comprobante» se fundió en la puerta «Llegó mercadería»; los marcadores y enlaces viejos llegan ahí.
      { source: "/inventario/recibir", destination: "/recibir", permanent: false },
      // ADR-0113: Recibir mercadería salió de Compras (solo líder) para que cuente cualquier colaborador de la sede.
      { source: "/compras/recibir", destination: "/recibir", permanent: false },
      // ADR-0392 (2026-10-13): Análisis, Frescura del piso y Plan del piso salieron de Inventario al grupo «Gestión»; los marcadores
      // y enlaces viejos siguen llegando, con su query (`?vista=`, `?cat=`) intacta. `permanent: false` por la misma razón que arriba.
      { source: "/inventario/resumen", destination: "/gestion/analisis", permanent: false },
      { source: "/inventario/frescura", destination: "/gestion/frescura", permanent: false },
      { source: "/inventario/frescura/tienda", destination: "/gestion/frescura/tienda", permanent: false },
      { source: "/inventario/plan-del-piso", destination: "/gestion/plan-del-piso", permanent: false },
      // ADR-0430 (2026-10-16): todo lo de la tienda online se juntó en el grupo «Tienda web». Los enlaces viejos siguen llegando, con su
      // query intacta (`?pedido=`, `?pestana=`, `?r=`): un pedido compartido por WhatsApp antes del cambio abre igual. La pestaña
      // «Tienda web» de Configuración es ahora Tienda web ▸ Ajustes; solo se desvía esa pestaña, el resto de Configuración no se toca.
      { source: "/vender/pedidos-web", destination: "/tienda-web/pedidos", permanent: false },
      { source: "/productos/vitrina", destination: "/tienda-web/vitrina", permanent: false },
      { source: "/productos/vitrina/:resto*", destination: "/tienda-web/vitrina/:resto*", permanent: false },
      { source: "/clientas/recomendaciones", destination: "/tienda-web/recomendaciones", permanent: false },
      { source: "/configuracion", has: [{ type: "query", key: "tab", value: "tienda-web" }], destination: "/tienda-web/ajustes", permanent: false },
      // Consolidación de Catálogo (2026-09-17, pedido de Felipe): Colores/
      // Tallas/Tejidos/Patrones/Etiquetas eran 5 pantallas y 5 filas de menú
      // separadas para lo que en el fondo es un solo tipo de pantalla
      // (vocabulario cerrado, propone/aprueba/rechaza) — se unieron en una
      // sola, "Atributos", con una pestaña por tipo. `permanent: false` por
      // la misma razón que arriba: un bookmark o un enlace interno viejo a
      // cualquiera de las 5 sigue llegando al lugar correcto.
      { source: "/productos/colores", destination: "/productos/atributos?tipo=colores", permanent: false },
      { source: "/productos/tallas", destination: "/productos/atributos?tipo=tallas", permanent: false },
      { source: "/productos/tejidos", destination: "/productos/atributos?tipo=tejidos", permanent: false },
      { source: "/productos/patrones", destination: "/productos/atributos?tipo=patrones", permanent: false },
      // Los sellos dejaron de ser una pestaña de Atributos y Campañas dejó de ser una fila aparte (Felipe 2026-10-22): las dos viven en
      // Catálogo ▸ Insignias, con las campañas como primera vista. Los enlaces guardados a cualquiera de las tres siguen llegando.
      { source: "/productos/etiquetas", destination: "/productos/insignias?vista=rotacion", permanent: false },
      { source: "/productos/atributos", has: [{ type: "query", key: "tipo", value: "etiquetas" }], destination: "/productos/insignias?vista=rotacion", permanent: false },
      { source: "/productos/campanas", destination: "/productos/insignias", permanent: false },
      // Facturación pasó a llamarse Comprobantes (2026-09-22, D-60): el envío a SUNAT es automático y
      // la pantalla es de series. Los enlaces viejos siguen llegando: la lista del mes es «Emitidos»,
      // y el Resumen y los códigos de descuento (que ya no se muestran) caen en Series.
      // `permanent: false` por la misma razón que los otros alias: un redirect permanente queda
      // cacheado en cada navegador y no hay forma de limpiarlo del lado del cliente.
      { source: "/vender/facturacion/comprobantes", destination: "/vender/comprobantes/emitidos", permanent: false },
      { source: "/vender/facturacion/proformas", destination: "/vender/comprobantes/proformas", permanent: false },
      { source: "/vender/facturacion/:resto*", destination: "/vender/comprobantes", permanent: false },
      { source: "/vender/descuentos", destination: "/vender/comprobantes", permanent: false },
    ];
  },
};

// Sentry (ADR-0424): al terminar el armado sube los mapas del código a Sentry (así un aviso dice la línea exacta, no la del código
// comprimido) y después los borra, para no publicarlos. Necesita `SENTRY_AUTH_TOKEN`, que Felipe pone en Vercel: sin esa llave
// (en local, en el CI) no genera ni sube mapas y el armado sigue igual. Lo que hace Sentry en ejecución está en `instrumentation*.ts`.
export default withSentryConfig(nextConfig, {
  org: "cayla",
  project: "cayla-retail",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN, deleteSourcemapsAfterUpload: true },
  widenClientFileUpload: true,
  silent: !process.env.CI,
  telemetry: false,
});
