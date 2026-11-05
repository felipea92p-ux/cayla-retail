# Cuentas y dinero en El telar · lista de actividades (`/construir`, 2026-10-23)

Felipe eligió «El telar de Finanzas» para todo Finanzas. La maqueta está en la rama `claude/finanzas-redesign-filters-d154a4`, en
`docs/maquetas/finanzas-telar-2026-10/`. Esta es la lista para construir Cuentas y dinero sobre ese diseño.

Aquí no se construye la barra común: la mesa de mando con los hilos de sede y el mes en la URL, el orillo, la cabecera con la
respuesta, el dock, ⌘K y «Te toca». La hace la sesión de Gastos en su propio PR, y esta lista empieza cuando esté en `main`.
Mientras tanto, solo se avanza en archivos propios: la lógica pura con su prueba y los componentes nuevos.

Nada de esta lista se empieza sin el OK de Felipe. Cada actividad termina con su propio commit y con evidencia: la prueba que
corre o la pantalla en el navegador a 1440 y a 375 px, en claro y en oscuro.

## Las actividades

**Las tres caras.** Las tres rutas de hoy quedan como las tres caras, así los enlaces de Resumen, Impuestos, Balance y Confianza
siguen funcionando:

| Ruta | Cara |
|---|---|
| `/finanzas/dinero` | Dónde está |
| `/finanzas/dinero/por-pagar` | Qué debes |
| `/finanzas/dinero/conciliacion` | Cuadrar con el banco |

`/finanzas/dinero/efectivo` pasa a redirigir a «Dónde está».

1. **«Dónde está»: los frascos por sede.**
   - Cada cuenta es un frasco, agrupado por sede, con el total de la sede. Lo que está «en camino» va aparte.
   - Sale de `fn_cuentas_dinero_saldos`, que ya trae la sede. La lógica pura (los grupos, el nivel de cada frasco, los totales que
     usa el orillo) va en `lib/dinero-telar-reglas.ts` con su prueba.
   - «¿Me alcanza?» lleva el chip «de CAYLA entera» cuando hay una sede elegida (corrige el hallazgo 1). No se toca `fn_flujo_*`.
   - Queda demostrable: la cara en el navegador, cambiando de sede con los hilos de la barra.
2. **El efectivo de hoy dentro de «Dónde está».**
   - El frasco del cajón muestra lo que debería haber ahora (`fn_efectivo_por_tienda`, la misma cuenta del cierre). La caja fuerte
     lleva su aviso «N días sin depositar», y abajo van los cierres con diferencia.
   - El Taller dice «fondo fijo», no «cerrada».
   - La pestaña Efectivo se retira y su ruta redirige aquí.
   - Queda demostrable: abrir y cerrar una caja en local y ver cómo se mueve el frasco.
3. **«Qué debes»: las burbujas en el calendario de 30 días y la lista que filtra.**
   - Cada factura es una burbuja del color de su sede y del tamaño de su monto. Las cifras de cada tramo (vencido, esta semana,
     más adelante) filtran la lista, y la lista tiene buscador y tipo (corrige el hallazgo 2).
   - Sale de `fn_por_pagar_consolidado`.
   - La burbuja abre el pago de su propio libro, Compras o Producción, con `?pagar=`, como hoy: no hay lógica de pago nueva.
   - Queda demostrable: pagar en local desde la burbuja. Lleva `/chaos`, porque mueve dinero.
4. **«Cuadrar con el banco»: los pares.**
   - A cada línea de la conciliación de hoy se le pone al lado lo que CAYLA anotó, unidas por un hilo. El hilo se vuelve verde al
     marcarla como revisada (`marcar_revisados_dinero`).
   - Se anota el saldo del banco y la cara dice la diferencia.
   - Para elegir el banco hay un segmento con la flecha de vuelta (corrige el hallazgo 6).
   - Queda demostrable: conciliar en local con un banco de prueba. Lleva `/chaos`.
5. **Lo que registra la hoja de gasto nueva se ve aquí.**
   - Un gasto «todavía no lo pagué» aparece como burbuja en «Qué debes». Un gasto pagado con plata de una caja baja su frasco.
   - Si la base ya lo hace, es solo verificarlo de punta a punta. Si no, se dice qué falta.
   - Depende de que la hoja de Gastos esté en `main`.
6. **Los pendientes de Dinero en «Te toca» y las acciones del dock.**
   - Pendientes: «pagar N facturas de esta semana», «Arequipa lleva N días sin depositar» y «N movimientos sin cuadrar».
   - Dock: Pagar factura, Mover plata, Registrar depósito y Cuadrar. Usa «Registrar movimiento», que ya existe.
   - Depende de cómo la barra común reciba los pendientes y las acciones de cada submódulo.
7. **Terminar las tres caras.**
   - Las verificaciones de siempre:
     - la guía de foco en las cuatro rutas (hoy están `pendiente`);
     - la guía interactiva al día, con sus huellas;
     - `/formidable`, `/sugerir` y `/unificar`;
     - `pnpm knip`;
     - el modo oscuro con `tema:auditar`, y la vista a 375 px.
   - Lo que queda escrito: la bitácora, el backlog y un ADR si hubo una decisión estructural.
   - Se abre el PR con `/abrir-pr`.

## Lo que decide Felipe antes o durante

- **D1 a D4**, en el README de esta carpeta:
  - D1: de qué sede es lo «en camino» de las máquinas.
  - D2: de qué sede es el efectivo que se entregó al líder.
  - D3: lo que debe cada sede.
  - D4: la conciliación por sede.
  - Sin respuesta, se construye lo que la base ya trae: lo en camino y lo entregado al líder quedan en CAYLA entera, la factura
    cuenta entera para la sede que la pidió y la conciliación es solo de CAYLA entera.
- **D5 · El extracto del banco (nueva).** En la maqueta, cada par une un movimiento del banco con lo que CAYLA cree que es. Hoy la
  base no tiene el extracto: solo el saldo anotado (`conciliaciones`) y las líneas de CAYLA marcadas como revisadas
  (`dinero_revisados`). Hay dos caminos:
  - **(a) Lo de hoy, con su dibujo.** Cada par es la línea de CAYLA y su «la vi en el extracto»; sin migración. Es lo que haría la
    actividad 4.
  - **(b) Subir el extracto** del BCP o de Interbank (un archivo CSV o Excel) para que el sistema sugiera los pares. Es una tabla
    nueva y la lectura del archivo: una actividad aparte, con su migración.
- **D6 · La hoja «Pagar facturas»**, con varias facturas a la vez y una sola cuenta de origen. Mueve dinero y hoy no existe: se paga
  de a una factura, o de a varias del mismo proveedor desde Compras. Hay que decidir si entra, y si es de esta sesión o de la barra
  común.
- **D7 · El movimiento de Finanzas.** Si Finanzas recibe la excepción de ADR-0136 que tienen Análisis y Tienda web: los frascos que
  se llenan y las burbujas que caen. Sin ella, se anima solo lo que ya permite la regla.
