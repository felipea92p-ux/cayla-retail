# Maqueta · Abrir caja, v2 (2026-11-03)

Idea: el total del cajón SIEMPRE se escribe; contar billetes y monedas es opcional y queda oculto tras un enlace («Usar este total» lo escribe).
Tres propuestas en `index.html` (1 Teclado · 2 Hoja con resumen · 3 Pantalla central), tres escenarios (cuadró · faltante · primera vez), claro y oscuro.

## Elegida por Felipe (2026-11-03): **2 · Hoja con resumen**
- Izquierda: «¿Cuánto hay en el cajón?» con el campo grande del total, «Igual al cierre», diferencia, motivo si no coincide, enlace «Contar billetes y monedas» y los últimos 7 cierres.
- Derecha: resumen vivo (debería haber, contaste, diferencia, responsable, hora), ayer / meta / hora de cierre, responsable y «Abrir caja».
- Sin caja abierta la pantalla ocupa todo el ancho (sale del tope `max-w-5xl` de `caja/page.tsx`).

## Para construirla
Piezas: `AbrirCajaFormV2.tsx` y `UltimoCierreCaja.tsx` (se rehacen), `caja/page.tsx` (leer ayer, meta y hora de cierre con la caja cerrada: lectura, sin migración).
Sin cambios en `abrir_caja`: sigue `p_monto_apertura` + `p_motivo_diferencia`. Guía de foco, guía interactiva (`caja.abrir`, `caja.ultimo-cierre`) y escenario de tema se ponen al día.
