## Recibir ▸ Contar al volver con «atrás» (2026-11-11, ADR-0393 act. 2026-11-11) — solo web, sin migración; rama `claude/quizzical-sanderson-0e3403`, commits locales, sin PR

- [x] Reproducido en local (ENV-001244, «Gabardina» 30 → 31): tras «atrás» la pantalla dice 30 con 31 en la base, y el servidor no recibe ninguna petición. Igual a los 40 s; por un enlace, solo antes de 30 s (`staleTimes`).
- [x] Causa: Next dibuja la página guardada en «atrás» sin preguntar; `RecibirContando` guarda sin `router.refresh()` y recordaba lo guardado solo mientras estaba montado; `guardar_conteo_envio` recibe el número entero y gana el último (si lo que mandas es igual a lo que hay, no avisa).
- [x] Arreglo de pantalla, pieza 1: la pestaña recuerda la versión más alta de cada línea (`apps/web/lib/recepcion-conteo-memoria.ts`) y Contar arranca de ahí. Verificado con clics reales en escritorio y a 375 px.
- [x] Arreglo de pantalla, pieza 2: si lo que se dibuja es una copia guardada por el router, la pantalla pide la página de nuevo sin loader (la convención del Conteo de inventario). Verificado con dos pestañas: lo que contó la otra llega en menos de 250 ms.
- [ ] **Decisión de Felipe: qué pasa cuando alguien guarda sobre un número que ya cambió.** Hoy gana el último (decisión 9 de ADR-0393). Con lo de arriba, volver a la pantalla ya no trae números viejos; queda el caso de dos personas en la misma línea a la vez, o una pantalla abierta mucho rato mientras otra persona cuenta. Tres caminos:
  - **A. Dejarlo así.** Ganas: nada más que construir. Pagas: en ese caso se puede perder una prenda sin aviso cuando los dos números coinciden (los dos tocan «Una más» sobre 30: queda 31, no 32).
  - **B. La pantalla también relee al despertar el celular o volver a la pestaña, y no deja tocar hasta que llegue lo nuevo.** Ganas: achica más la ventana sin tocar la base. Pagas: un instante sin responder en cada vuelta (más largo en el almacén con mala señal; hay que decidir qué se ve si la lectura no llega), y dos personas tocando a la vez siguen igual.
  - **C. La base no acepta un guardado hecho sobre una versión vieja** cuando el número cambió: devuelve lo que hay y la pantalla pregunta («Lucía puso 38 mientras tanto: ¿dejas 38 o pones tu 40?»). Ganas: el número mal guardado deja de poder ocurrir, venga de donde venga (principio 2). Pagas: cambia la decisión 9, lleva migración (`guardar_conteo_envio`) y una hoja nueva con su guía; cuando dos personas cuentan la misma línea, la segunda tiene un toque más. Recomendada si en una sede cuentan de a dos.
  - Descartada: mandar la diferencia (+1) en vez del número entero. Sirve para «Una más», pero no para un número escrito a mano, «Poner en cero» ni las tallas (`separado` es una lista entera).
- [ ] `/chaos` sobre Recibir ▸ Contar con la familia «navegación torcida» (atrás, adelante, dos pestañas): este caso no estaba en el catálogo.
- [ ] El identificador de carga (`idDeCarga`) y «si ya se dibujó, relee» están copiados en tres pantallas (Contar y Revisar del Conteo de inventario, y Recibir). Vale una pieza común cuando se arregle la siguiente.
- [ ] De paso (no es de esta tarea): en la base local falta `retail.fn_invariantes_estado`; el Inicio lo dice en la consola del servidor en cada carga.

### Otras pantallas con el mismo patrón (buscadas leyendo el código; ninguna medida en el navegador ni arreglada)

Mismo riesgo (guardan desde el navegador, no refrescan el router después, y lo que mandan sale de lo que leyó la página al entrar):

- [ ] **Recibir un traslado** (`/inventario/traslados/[id]`): la más seria. `components/traslados-pases/useRecepcion.ts:129` guarda sola cada prenda contada (`registrar_recepcion_traslado`, con `x-espera: no`) y manda el número ENTERO; sin estado propio, el número sale de `cantidadRecibida`, que trajo la página (`lib/traslados-recepcion-reglas.ts:42`). No hay versión: gana el último. Al volver con «atrás», el siguiente «+» o el siguiente pistoletazo guarda viejo + 1. Lo recibido en un traslado entra al stock de la sede.
- [ ] **Probador de la vitrina** (`/tienda-web/vitrina/probador`): `components/vitrina/ProbadorPrendaHoja.tsx:68` (largo en centímetros) y `LargosTipicosHoja.tsx:54`. Al volver, la hoja arranca con el largo viejo. No toca stock ni dinero.
- [ ] **Mensaje predeterminado de pedidos web** (`/tienda-web/pedidos`): `EditarMensajePredeterminadoHoja.tsx:85`. Al volver, el editor arranca con el texto viejo.
- [ ] **Cómo lo llama el proveedor** (`/productos/[id]/editar`): `components/ficha-producto/NombreDelProveedor.tsx:49`. Igual: texto viejo al volver.
- [ ] **Activar o desactivar en Marcas y Familias** (`components/MarcasLista.tsx:242`, `components/FamiliasLista.tsx:106`): al volver, el interruptor dice lo contrario de lo real y el primer toque no cambia nada. Confunde más de lo que daña.

Por mirar (no se leyó cada camino):

- [ ] **Avisos del club** (`/clientas/avisos`, `AvisosClubPanel.tsx:146`): lo enviado se marca solo en la pantalla. Al volver, el aviso reaparece pendiente: ver si la base impide mandarlo dos veces.
- [ ] **Categorías y Atributos** (colores, tallas, tejidos, patrones): la lista sale de lo que leyó la página y el archivo no refresca; escriben por `/api/productos/*`, sin versión.
- [ ] Hojas que avisan a su pantalla al guardar (`CorregirPagoModal`, `RegistrarPagoHoja`, `EnviarPedidoWebHoja`, `ProveedorModal`, las de `orden-pagina/` e `insumos-taller/`): confirmar que cada pantalla refresca.

Ya protegidas (no hay nada que hacer): Conteo de inventario (relee si dibuja una copia), Configuración y Tienda web ▸ Ajustes (refrescan), Roles, Plan de compra, Plan del piso, Órdenes de compra, Clientas y Campañas (la base rechaza una versión vieja), Ajustar inventario (manda la diferencia y lo que había), Caja y Vender (leen al abrir; el ticket vive en el navegador).
