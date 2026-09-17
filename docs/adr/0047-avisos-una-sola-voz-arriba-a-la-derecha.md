# ADR-0047 — Avisos: una sola voz arriba a la derecha, y el cursor va al campo

**Fecha:** 2026-09-14
**Estado:** Implementado en `apps/web` (22 pantallas cableadas), sin cambios de base

## Contexto

Cada pantalla avisaba a su manera: 13 componentes tenían su propio `const [error,
setError]` y pintaban un `<p>` rojo debajo del botón; tres más (comprobantes,
colaboradores, proveedores) tenían errores "por fila"; el éxito de un registro no se
avisaba nunca — solo cambiaba la página o se cerraba el modal — y los procesos largos
(transmitir a SUNAT, subir adjuntos) o no se veían o se veían distinto en cada sitio.
Felipe pidió que **toda validación, error, confirmación o proceso** se vea en el mismo
lugar, arriba a la derecha, y que cuando la validación es de un campo, el cursor vaya a
ese campo.

## Decisión

1. **Un solo canal:** `components/ui/Avisos.tsx`. Se monta una vez en el layout raíz
   (vale también en `/login`) y sobrevive a la navegación: el estado vive fuera de React
   (`useSyncExternalStore`), así "Factura registrada" sigue visible después del
   `router.push` al detalle.
2. **Cuatro tonos, todos con reloj a la vista:** éxito (verde, 4 s), advertencia (ámbar,
   6 s), error (rojo, 8 s; `Escape` lo cierra antes), proceso (hilo barriendo, sin reloj:
   se cierra cuando el código termina). Una barra al pie se encoge hacia la izquierda y
   muestra cuánto falta; **pasar el mouse la pausa**, así un error se lee con calma. El
   cierre lo dispara el fin de esa animación, no un temporizador aparte — una sola fuente
   de tiempo, y la pausa vale para las dos cosas.
3. **El aviso dice QUÉ, el cursor dice DÓNDE:** `avisar.error(texto, { enfocar: id })`
   lleva el foco al campo y lo trae a la vista. Para eso `CampoTexto`, `CampoSelectNativo`,
   `CampoFecha`, `ComboBuscable` y `LineasPago` aceptan un `id` propio; las filas de
   líneas llevan `id` por índice (`compra-linea-3-costo`, `venta-pago-0`).
4. **Solo arriba a la derecha (opción A, elegida por Felipe):** se quitaron todos los
   `<p>` de error inline. **Excepción:** lo que es del campo y ya vive pegado a él
   ("Supera el saldo" bajo el monto, "Se pasa por S/ 50" en LineasPago, "no tiene stock"
   junto al buscador del POS) se queda — eso es el campo hablando, no una notificación.
5. **Dedupe:** el mismo texto con el mismo tono no se apila (doble clic en Registrar).

## Consecuencias

- Ganas: una sola convención para 22 pantallas; el éxito por fin se confirma; los
  procesos se ven; accesible (`aria-live`, `role=alert` en errores).
- Pagas: en un formulario largo el ojo está abajo y el aviso aparece arriba — lo
  compensa el foco automático al campo. Una pantalla nueva que olvide `enfocar` avisa
  pero no lleva el cursor: es una omisión visible, no un fallo silencioso.
- Convención para código nuevo: nunca `useState` de error en un componente; siempre
  `avisar.*`. Si el mensaje es de un campo, lleva `enfocar`.
