# Fernanda — Reglas transversales de pantalla y sistema de diseño — UI/UX de todo el sistema (no es un pájaro de datos, cruza los 14 módulos: Modal/cajones, Espera, tokens de diseño, moldes de pantalla, pruebas de calidad visual en CI)

> Extraído del plano maestro (143 decisiones, `docs/plano/00-ACTA-24-DECISIONES.md` y
> `02` a `05-ACTA-SESION-*.md`). Cada línea es una decisión ya tomada por Felipe — no es
> una propuesta, es lo que hay que construir o ya está construido.

## Decisiones

**PL-97** — Todo cajón/panel fuera de <Modal> (7-8 componentes) se migra al <Modal> existente — nadie reimplementa el overlay por su cuenta.
  *Pendiente:* Migrar los 7-8 componentes sueltos al <Modal> existente.

**PL-98** — El rojo por pantalla tiene un tope máximo, verificado por una prueba automática de CI que lo cuenta y falla si se pasa.
  *Pendiente:* Construir esa prueba de CI.

**PL-99** — El contraste de texto (ADR-0012) se verifica con una prueba automática de CI contra los tokens reales de globals.css.
  *Pendiente:* Construir esa prueba de CI.

**PL-100** — La cabecera común (EncabezadoPagina) pasa a obligatoria en toda pantalla — hoy solo la usan 4 de 52.
  *Pendiente:* Migrar las 48 pantallas que no la usan y construir la prueba de CI que falla si falta.

**PL-101** — Sigue sin modo oscuro por ahora; el «sí» que Felipe dio en otro momento no se descarta, queda como fase futura sin fecha, después del lanzamiento.
  *Pendiente:* Renumerar el ADR de modo oscuro (numeración duplicada) y archivar su rama.

**PL-102** — globals.css gana sobre design-tokens.ts como fuente real de esquinas y paleta.
  *Pendiente:* Borrar o corregir design-tokens.ts para que no compita.

**PL-103** — Se escribe un manual corto de moldes de pantalla, a mano, con un ejemplo real por tipo: listado, formulario, modal, cajón.
  *Pendiente:* Escribir ese manual.

**PL-104** — La prueba «persona sin contexto» sigue siendo revisión posterior, no bloquea la fusión del PR — Danixa es la probadora natural, tiene menos contexto del equipo.

**PL-105** — La prueba en ancho de celular por PR es obligatoria solo para Vender/Cambios/Devoluciones — Caja y Almacén son de escritorio en la práctica.

**PL-106** — Regla general para estados vacíos: si hay una acción posible (ej. «sin productos»), la pantalla la ofrece directo, nunca se queda muda.

**PL-107** — Subir o bajar a alguien de Líder se construye directo en la pantalla de Colaboradores — visible solo para Felipe, con confirmación, y queda en el historial de accesos.
  *Pendiente:* Construir la parte de UI (confirmación, visibilidad exclusiva Felipe); la función security definer que hace el cambio real la construye otro, no es tu pieza.

**PL-108** — Regla fija para elegir entre detalle con URL propia (@modal) y modal simple: URL propia cuando el detalle se comparte o se recarga, modal simple cuando solo tiene sentido dentro del flujo.

**PL-109** — El orden de auditoría de pantallas va por relevancia de dinero/stock: empieza por Vender, Caja y Compras.

**PL-110** — Los 3 análisis de pantalla que quedaron en ramas sin fusionar (Caja, historial de ventas, uno más) se rescatan, pero se re-verifican a fondo contra el código de hoy antes de fusionarlos — ningún hallazgo vencido se arrastra.
  *Pendiente:* Rescatar y re-verificar esos 3 análisis antes de fusionarlos.

**PL-111** — Estándar de tono fijo para mensajes de error: siempre neutro en género, siempre dice qué hacer ahora, nunca nombra algo técnico.

**PL-112** — El ícono de ayuda y el de alerta se separan: signo de pregunta/info para ayuda, el símbolo de alerta queda exclusivo para alertas reales.


## Tus pendientes, en orden

1. Construir la parte de UI de subir/bajar de rol en Colaboradores — confirmación, solo visible para Felipe, queda en historial (PL-107).
2. Rescatar y re-verificar los 3 análisis de pantalla en ramas sin fusionar antes de que se venzan (PL-110).
3. Migrar las 48 pantallas sin EncabezadoPagina y montar la prueba de CI que lo exige (PL-100).
4. Migrar los 7-8 cajones/paneles sueltos al <Modal> existente (PL-97).
5. Montar la prueba de CI del tope de rojo por pantalla (PL-98).
6. Montar la prueba de CI de contraste contra los tokens de globals.css (PL-99).
7. Escribir el manual corto de moldes de pantalla — listado, formulario, modal, cajón (PL-103).
8. Borrar o corregir design-tokens.ts para que no compita con globals.css (PL-102).
9. Renumerar el ADR de modo oscuro y archivar su rama (PL-101).
