## 2026-09-29 (Clientas: aviso al inicio del acta — el módulo ya está planificado y Dany lo instanció así)

Qué hice: puse un aviso al inicio de `docs/datos/DECISIONES-2026-09-26-clientas.md`. Dice que Clientas ya está
planificado (el acta y los cuatro pasos de la sección H), que Dany lo instanció así junto con las sesiones que
construyen Clientas y Rendimiento, y que quien lo toque desde otra sesión no lo rediseña: si su cambio contradice o
duplica el acta, se lo dice al usuario antes de seguir. También deja el estado a hoy: pasos 1 y 2 en `main`
(ADR-0249), pasos 3 y 4 sin construir. Solo documentación: no hay código, migración ni prueba.

Por qué así: varias sesiones corren en paralelo y algunas tocan archivos de Clientas por reglas transversales. La
guía de foco (ADR-0284) envolvió `NuevaClientaModal.tsx` y rozaba D-108 (el permiso de WhatsApp solo cuenta cuando la
clienta responde «SÍ»). El acta es el archivo que cualquier sesión abre antes de tocar el módulo, así que el aviso va
ahí y no en una conversación de chat (principio 8). Un cambio transversal que no toca reglas (visual, guía de foco)
sigue siendo válido. El mismo aviso quedó además en la memoria de proyecto de Claude, que no vive en el repo.
