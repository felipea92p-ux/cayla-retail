# ADR-0462 — Toda pantalla ocupa todo el ancho

**Estado:** aceptada · **Fecha:** 2026-10-20 · **Decidió:** Felipe

## Contexto

El marco del ERP (`components/AppShell.tsx`) centraba el contenido en una columna de 64 rem (`max-w-5xl`), y cada módulo que necesitaba
más espacio entraba a una lista, `SIN_TOPE_DE_ANCHO`: Vender (2026-09-12), Compras, Inventario, Caja, Cambios y Devoluciones,
Producción («los módulos no ocupan todo el espacio», 2026-09-22), Colaboradores, Gestión, Etiquetas, Rótulos. El 2026-10-20 Felipe volvió a
pedirlo para Clientes (Fichas, Avisos y Beneficios del club tenían ~300 px vacíos a cada lado en su pantalla) y pidió la regla: «toda
pantalla nueva ocupe todo el espacio de la pantalla».

## Decisión

- **El ancho completo es el de fábrica.** La lista se invierte: `CON_TOPE_DE_ANCHO` guarda las rutas que todavía llevan el tope porque
  nacieron antes de la regla (Actividad, Buscar, Comercial, Configuración, Finanzas, Global, Movimientos, Pedidos no atendidos,
  Rendimiento, Sin acceso, Tienda web) y el Inicio («/», exacto). Ninguna pantalla cambió de ancho ese día salvo Clientes.
- **Es deuda que solo baja.** `lib/ancho-completo.test.ts` falla si una ruta nueva entra a `CON_TOPE_DE_ANCHO` (`CON_TOPE_HOY` es la foto del
  2026-10-20), si una ruta de la lista ya no existe, o si una ruta del menú fuera de la deuda quedó con el tope.
- **Llenar el ancho es parte de la pantalla.** No basta con estirar: cifras en fila, la tabla a lo ancho, una columna al costado, campos de a
  dos en pantallas muy anchas (Beneficios del club, desde 1760 px). Un párrafo o un formulario corto se topan por su cuenta.
- **El Inicio sigue con tope**: es de todas las cuentas; el de almacén, el Observatorio y Aventurero lo quitan con `data-ancho-completo`
  (ADR-0292), como antes.

## Alternativas descartadas

- **Sumar Clientes a la lista y seguir igual:** la sexta vez que se pedía lo mismo; cada pantalla nueva nacía angosta y había que volver.
- **Quitar el tope a todas de un golpe:** las once que lo llevan no se diseñaron a lo ancho (Finanzas sigue su spike, ADR-0195); se revisan
  una por una y salen de la lista.

## Cómo se verifica

`lib/ancho-completo.test.ts` (vitest). Y en el navegador, cada pantalla nueva a 1440 y 1920 px, además de 375.
