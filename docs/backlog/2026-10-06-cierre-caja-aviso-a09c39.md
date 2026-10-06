## ⏰ El aviso de cierre de caja en la barra superior — el «Marcador» (2026-10-06, ADR-0357) — solo web, sin migración; rama `claude/cierre-caja-aviso-a09c39`

- [x] Cápsula en el centro de la cabecera, pestaña colgante, resplandor del nivel (más largo e intenso en rojo), sin el nombre de la sede en la cápsula.
- [x] Preaviso de 15 min (`estadoAviso`) y despliegue de la pestaña cada 5 min desde la hora de cierre (`cicloDeDespliegue`); pruebas en `lib/recordatorio-cierre-reglas.test.ts`.
- [x] Verificado en el navegador contra la base local: preaviso, niveles 1 a 3, despliegue automático, oscuro y 375 px.
- [x] Responsive medido (`medirHueco`, `data-cabecera-app` en `AppShell`) y ondas continuas desde la hora; verificado a 1440, 1100, 768 y 320 px.
- [ ] **Sin probar:** la despedida («Caja cerrada» + ✓) con una caja cerrada de verdad; correr `pnpm --filter web tema:auditar` con el escenario `estructura.recordatorio` (ya apunta a las clases nuevas); Caja, Cambios y Devoluciones a 375 px.
- [ ] **Decisión de Felipe:** los dos bucles decorativos (resplandor que deriva, destello cada 6 s en «sin cerrar») quedaron admitidos por haber elegido la maqueta 3; si prefiere «Sobrio», se quitan en `recordatorio-cierre.css` (`.rcc-aurora` animation y `.rcc-caps::before`).
- [ ] La hora de cierre de Tienda Trujillo (7:45 p. m.) se carga en producción desde Configuración ▸ Tiendas y caja; en la base local quedó la que se usó para probar.
