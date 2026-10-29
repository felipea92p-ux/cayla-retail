# Formidable · Inventario ▸ Movimientos ▸ pestaña «Ingresos»   (`/inventario/movimientos?vista=ingresos`)

- **Fecha / SHA:** 2026-10-28 · e10f079b1 · **Dispositivo que manda:** escritorio (Mac mini); 375 px se adapta
- **Pasada:** **rápida** (solo medido, sin agentes: sin prueba ciega, sin escéptico, sin colaboradora real). **Sin notas 0–10:** una nota sin
  evidencia no se pone (informe.md). Los 3 cambios de abajo esperan el OK de Felipe; ninguno se implementó.
- **Pregunta que debería resolver:** «¿Qué prendas entraron cuando llegó el fardo?» · **Protagonista:** la prenda (modelo + foto + cuántas).

## Medido (1440 × 900, cuenta admin, Tienda Lima, desde el 2 de octubre; 4 modelos)

| Comprobación | Resultado | De quién es |
|---|---|---|
| Contraste del texto contra su fondo | **0 fallos** | — |
| Espaciado vertical fuera de escala | **0** | — |
| Rojo en pantalla | **1** (el hilo de la fila abierta) | — |
| Sombras / acciones primarias | 0 / 0 | — |
| Blancos de puntero bajo 24 px | 1: «Salir» 37 × 16 | **marco** (barra lateral), no de la pantalla |
| Texto bajo 12 px | 10: «Retail», «Ctrl K», «Preguntar», «Actividad», «Líder · Tienda Lima»… | **marco** |
| Bordes casi alineados | 2: «Retail» y el nombre de la persona | **marco** |
| Radios distintos | 5 (4, 8, 12 px, píldora y círculo) | del sistema |
| **Alturas desiguales en una fila de controles** | **1** | **de la pantalla** |

El modo oscuro también se midió con el auditor del repo (`tema:auditar`, escenarios `movimientos.ingresos` y `movimientos.ingresos.detalle`, cuentas
admin e integrante): **0 hallazgos solo en oscuro**. La cuenta sin permiso de dinero se vio en captura **sin columna de costo**.

## Lo de la pantalla que sí sale de la medición

- **[Medido]** Tres alturas de control en la misma pantalla: la caja de búsqueda **38 px**, las píldoras **31,5 px** y los botones «Descargar Excel»,
  «Descargar Excel con tallas» e «Imprimir la lista» **44 px**, aunque se pidieron `chico`. La fila «buscador + píldoras» es la que el medidor marca como desigual.
- **[Observado, captura a 375 px]** Los tres botones se apilan uno por línea y empujan la tabla casi una pantalla hacia abajo, con el rango de fechas abierto.
- **[Observado]** El titular de arriba («186 prendas en 4 modelos, …») y la fila «Total · 4 modelos · 186» del pie dicen lo mismo con la tabla de testigo.

## Los 3 cambios propuestos (esperan el OK de Felipe; ninguno toca dinero, stock, permisos ni SUNAT)

1. **Una sola altura de control.** Los tres botones de la fila a la altura de las píldoras (≈ 32 px) y la caja de búsqueda a la misma, para que la fila
   «Descargar · Descargar con tallas · Imprimir» y la de «Buscar · Todos · Nuevos · Reingresos» se alineen. *Ley:* oficio visual. *Se verifica:* el medidor
   a 1440 y 1024 sin «alturas desiguales» en `main`.
2. **En el celular, los tres botones en un solo «Más».** Con `<MenuAcciones texto="Más">` bajo 640 px (Descargar Excel, con tallas, Imprimir); en
   escritorio siguen sueltos. *Ley:* 5 contenido primero (la tabla sube) y 9 de punta a punta. *Se verifica:* captura a 375 px con la tabla a la vista sin scroll.
3. **Un solo total.** Dejar el titular («186 prendas en 4 modelos») y que el pie diga solo «Total» con la cifra, o quitar el titular. *Ley:* 8 quitar antes de agregar.
   *Se verifica:* la persona de compras encuentra «cuántas entraron» sin leer dos veces.

**Lo que sobra (ley 8):** el titular o el pie, uno de los dos (cambio 3).
**Lo que Felipe no pidió y importa más:** la migración `20261029022000_ingresos_por_modelo.sql` **no está en producción**: sin ella la pestaña no carga allá. Va
con su OK (cambio de esquema en producción).

## Sin probar (dilo, no lo supongas)

- **Concurrencia:** es solo lectura (no escribe nada): sin riesgo de dos personas sobre el mismo registro.
- **Caída externa:** si la base no responde, la pestaña dice «No se pudieron leer los ingresos» y no dibuja ceros (probado en código y en la prueba de `leerResumenIngresos`; sin simular la caída en el navegador).
- **Persona sin contexto:** **sin probar** (ni agente ciego ni colaboradora). Es lo primero que conviene hacer con la colaboradora que pidió el reporte.
