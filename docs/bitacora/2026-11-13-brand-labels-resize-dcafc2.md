# 2026-11-13 · Rótulos de marca

- **Qué:** Rótulos de anaquel (`/rotulos`) ahora imprime también rótulos de MARCA: el selector «Rótulos de · Prendas / Marcas» arriba del panel; en Marcas se buscan las marcas activas y cada una sale en su propio rótulo con solo su nombre (Felipe, «rápido y urgente»).
- **Cómo cabe:** el mismo cálculo del nombre de la prenda (`medidaNombre`), con el alto entero del papel (`ALTO_SOLO_NOMBRE_MM` 34,6 mm) y tope de 24 mm (`MAX_SOLO_NOMBRE_MM`); centrado. Pruebas en `lib/rotulos-reglas.test.ts`; guía «rotulos» con dos pasos nuevos y huella aceptada.
- **Pendiente:** las marcas elegidas viven solo en la pantalla (no van a la URL): recargar las pierde; no tienen «Deshacer» al quitarlas.
