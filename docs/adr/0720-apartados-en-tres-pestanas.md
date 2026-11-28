# ADR-0720 — Apartados en tres pestañas: Apartar, Pendientes e Historial (la «Mínima»)

**Fecha:** 2026-11-28. **Estado:** aceptado. Felipe aprobó la maqueta «Mínima» el 2026-11-28 («Sí, a construir»), eligió el nombre de
las pestañas el 2026-11-27 y dejó los dos puentes el 2026-11-28 («Sí, se quedan»). Solo web: sin migración, sin RPC nueva y sin cambiar
permisos, dinero, stock ni comprobantes. Se construye en doce actividades (`/construir`) y tres PR.

## Contexto

Apartados tenía tres pestañas: **Apartar**, **Entregar** e **Historial**. Lo que se veía al usarlas (tres rondas de pruebas a ciegas, en
escritorio y en el celular, y un QA independiente; el detalle en `docs/formidable/vender-apartados.md`):

- **El mismo cliente salía dos veces.** Rosa, Carmen y Lucía estaban en «Entregar» («Por recoger») y otra vez en «Historial».
- **Lo urgente vivía en el Historial**, bajo cuatro cifras, una franja de avisos y dos filas de filtros: devolverle el adelanto a quien se
  le canceló el apartado o decidir un vencido. Las ciegas llegaban ahí solo porque un aviso rojo, arriba, lo decía.
- **El número de la pestaña (4) no coincidía con ninguna lista**, y lo que falta pagar tenía seis nombres (Resta, saldo, Falta pagar,
  Falta, Queda, Saldo al recoger).
- **El paso del cliente de Apartar fue el más pesado** en las tres rondas («me sobra todo ese bloque»), y en un panel de 1024 × 768 el
  botón principal y la casilla de las condiciones quedaban bajo el borde.

Felipe, al verlo: «quiero que todo sea intuitivo y minimalista, un usuario se asusta cuando ve muchas cosas» (2026-11-26); «¿Pendientes no
vendría a ser lo mismo?», «evitar la redundancia» (2026-11-27). La maqueta con las tres versiones (Hoy, Propuesta y Mínima, en escritorio
y en el celular) es `docs/maquetas/apartados-claro-2026-11/`; la «Mínima» (`?v=min`) es la que vale. Se revisó entera con
`herramientas/revisar-todo.mjs` (45 pantallas a 1024, 1440, 1920, 375 y 360 px, en claro y oscuro) y `herramientas/recorrer-flujos.mjs`
(24 flujos de punta a punta).

## Decisión

1. **Tres pestañas, y cada apartado en un solo lugar.** **Apartar** hace uno nuevo. **Pendientes** es todo lo que sigue vivo (por
   recoger, vencido, por devolver), cada apartado una vez. **Historial** es lo terminado: entregado o devuelto, de los últimos 30 días
   (ADR-0367 sigue: el nombre lo pidió Felipe el 2026-10-09). **«Entregar» deja de ser pestaña:** abrir una fila de Pendientes es cobrar y
   entregar ese apartado, y «← Volver a la lista» regresa. El número de Pendientes es el de sus filas.
2. **Pendientes y el Historial, como lista de una tarjeta** (el patrón que Felipe eligió en Recibir, ADR-0676, con `TablaViva`, `<Chip>` y
   la miniatura de la prenda): lo urgente primero (por devolver, vencido, vence hoy, vence mañana, a tiempo); cada fila con la prenda, el
   nombre, el código, el estado, lo que le falta y el estante; **un solo botón por fila**, y solo donde hay algo que hacer (Devolver,
   Escribirle o «Avisado hoy»; en el Historial, Reimprimir). «Escribirles a los N» es la cola del ERP (`colaPorAvisar`), sin quien ya tiene
   su aviso de hoy. Los pedidos entre tiendas van en la misma forma. El buscador busca mientras se escribe y, si no encuentra a nadie,
   ofrece buscar en la otra lista.
3. **Cobrar y entregar:** la tarjeta del apartado con su código al lado del nombre; «Reimprimir constancia» a la vista y lo demás en «Más
   acciones» (Escribirle, Aplazar, Editar prendas y, aparte y en rojo, Cancelar apartado); el panel «Cobrar» con «Le falta» grande y «Ya
   pagó … de …»; «Solo abona una parte» como enlace a Abonar.
4. **Apartar:** la prenda escaneada con lo que sirve para decidir; «Recoge hasta el …»; «Seguir: datos del cliente» (el botón no aparta).
   El cliente se busca primero: con ficha queda en una línea con su «Editar»; sin ficha, recién se abren los campos. Un paso a la vez, y
   cada paso hecho se pliega a una línea; «Mínimo S/66» (el 30 % de ADR-0166); lo que se le lee al cliente, con su Yape adentro, sobre la
   casilla «Se lo leí»; «Confirmar y cobrar».
5. **Una palabra para cada cosa:** «Le falta» y «Ya pagó»; «Cancelar apartado» (no «Liberar»: es la palabra del mensaje al cliente);
   «Mejor no» para salir de una hoja sin hacer nada (no «Cancelar», que se confundía con «Cancelar apartado»); «Reimprimir constancia»;
   «Escribirles a los N». El pie de cada hoja se queda a la vista. Devolver dice qué hacer («Mándaselo por Yape … y anota aquí el número de
   operación»).
6. **Dos puentes** para quien viene con la costumbre de hoy, con las palabras de hoy: en Apartar, sin prendas, «¿Viene a recoger, a pagar
   o por su adelanto? Está en Pendientes»; arriba de la lista del Historial, «Lo que falta hacer (entregar, devolver, escribir) está en
   Pendientes». No cambian botones ni pasos.
7. **Sin «·» (ADR-0716):** cada dato dice qué es, y Apartados entra a la lista de módulos limpios de `lib/sin-punto-medio.test.ts`.

## Lo que no cambia

Las funciones de la base y lo que exigen: separar, abonar, aplazar, liberar, entregar y cobrar, devolver el adelanto y anotar un aviso.
El adelanto mínimo (ADR-0166), el redondeo del efectivo (ADR-0311), el comprobante al entregar, quién puede gestionar (`puedeGestionar`),
lo que una tienda apaga en «Opciones» y el `?abrir=<id>` que llega desde Movimientos (ADR-0241): abierto, abre su cobro; cerrado, lo busca
en el Historial.

## Alternativas descartadas

- **La «Propuesta»: cuatro pestañas** (Apartar, Entregar, Pendientes, Historial). Arreglaba el orden de cada pantalla, pero el mismo
  cliente seguía en dos listas.
- **Dos pestañas, «Apartar» y «Apartados»,** con lo terminado como un filtro de la misma lista. Felipe pidió verlo en su propia pestaña:
  dentro de un filtro «no es visible a simple vista».
- **Dejar «Entregar» como pestaña.** Es otra lista donde buscar al mismo cliente; abrir su fila en Pendientes cuesta un toque y deja una
  sola lista.

## Cómo se construye y cómo se verifica

Doce actividades, cada una un corte que se ve funcionando y su propio commit: (0) este ADR; (1) las tres pestañas; (2) Pendientes; (3) el
Historial y su puente; (4) cobrar y entregar; (5–7) Apartar: las prendas, el cliente, el adelanto y las condiciones; (8) las hojas finales;
(9) las hojas de un apartado; (10) sin «·»; (11) el cierre de cada pantalla (`/guia`, `/focus`, `/sugerir`, `/milimetro`, `/formidable`,
`/chaos`, el celular a 375 px y una prueba a ciegas sobre lo construido). Tres PR: 0–3; 4, 8 y 9; 5–7 (con la 10). Cada actividad se mira
en el navegador con la página de prueba de la maqueta (datos inventados, sin base ni sesión) a 1024, 1440 y 375 px, y corre las pruebas
del repo que toca.
