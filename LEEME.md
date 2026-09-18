# FerroSync: versión corregida y verificada

## Abrir la aplicación y los viajes creados

Ejecutá `Abrir-FerroSync.cmd`. Abre Edge con el perfil `perfil-demo`, que contiene los usuarios y viajes creados mediante la interfaz. Si el servidor local no está activo, el lanzador lo inicia en `http://127.0.0.1:8765/`.

Seleccioná **Grupo RAS** e ingresá con una de estas cuentas de demostración:

| Usuario | Rol | Contraseña de prueba |
|---|---|---|
| Demo Logística | Logística | FerroDemo2026! |
| Demo Maquinista Uno | Maquinista | FerroDemo2026! |
| Demo Maquinista Dos | Maquinista | FerroDemo2026! |

Estas contraseñas son de demostración. En la base del navegador se guardan mediante PBKDF2 y sal aleatoria.

| Viaje | Fecha y horario de Uruguay | Recorrido | Locomotora | Conductor | Carga remolcada |
|---|---|---|---|---|---|
| RAS-DEMO-001 | 18/09/2026, 09:00–12:00 | Puerto → Florida | RAS-01 | Demo Maquinista Uno | 400 t |
| RAS-DEMO-002 | 18/09/2026, 13:00–16:00 | Florida → Durazno | RAS-02 | Demo Maquinista Dos | 500 t |

Ambos quedaron **Programados**, con tramos pendientes. Se comprobó que cada maquinista puede ingresar y ver su viaje. `viajes-creados.json` documenta el resultado, sin incluir las contraseñas derivadas ni las sales. Los datos activos están en IndexedDB, dentro del perfil de Edge.

Abrir la dirección en otro navegador o perfil muestra otra base local. Abrir directamente `index.html` mediante `file://` no es el flujo verificado; usá el lanzador para disponer de service worker y almacenamiento en el mismo origen.

## Correcciones

- Fechas y horas obligatorias, persistidas y visibles; llegada posterior a salida y salida futura al programar.
- Control de superposición horaria de locomotora y todos los roles de tripulación; una persona no puede ocupar dos roles del mismo viaje.
- Personal asignable vinculado a usuarios maquinistas de la misma operadora; filtros por empresa y cierre de viajes sin afectar planes con el mismo número en otra operadora.
- Tramos con distancia positiva y continuidad entre origen y destino. Distancias conservadas con tres decimales. Máquina sola admite carga remolcada cero; el máximo de arrastre configurado es un límite obligatorio.
- Edición conserva recursos, recorrido y horario. Solo se editan o cancelan viajes programados. Se puede cancelar la edición y comenzar otra planificación.
- Taller bloqueado para locomotoras con viajes asignados. Medidas de nuevas unidades obligatorias y positivas.
- Escritura de las colecciones en una transacción atómica, revisión para rechazar escrituras obsoletas y propagación de fallos; ya no se borran colecciones en transacciones separadas antes de reescribirlas.
- Carga de colecciones vacías, sincronización entre pestañas y conservación de formularios frente a actualizaciones.
- Contraseñas derivadas mediante PBKDF2 con sal individual y migración al ingresar de las antiguas claves en texto. Nombres duplicados comprobados sin distinguir mayúsculas.
- Escape del texto del usuario, eliminación de interpolaciones de identificadores en eventos, CSV con comillas y protección de fórmulas.
- Inicio y cierre de tramo reservados al conductor; cronómetro calculado desde la fecha de inicio, recuperable al recargar, combustible final cero válido e incremento de kilometraje.
- GPS con estados de espera, permiso denegado y error; seguimiento cancelado al cerrar sesión. El mapa distingue el origen planificado de una posición GPS recibida.
- Contador de viajes completados basado en viajes terminados, en lugar de contar todos los tramos del historial.
- Manifest y service worker presentes y coherentes. Núcleo disponible sin conexión después de la primera carga correcta.
- Pantalla de operadora oculta correctamente después del ingreso y la recarga; controles de teclado, etiquetas, foco visible, zoom permitido y adaptación móvil del panel.

## Verificación

`test.cjs` automatiza Edge en una base temporal distinta de la demostración. `qa-results.json` registra los resultados; `qa-export.csv` es el archivo descargado durante la prueba. Se probaron registro, ingreso, validaciones, edición, cancelación, varios tramos, recarga, vista de 390 px, cierre de viaje, kilometraje, exportación, dos pestañas, conflicto de escritura y funcionamiento sin conexión.

`demo.cjs` creó las cuentas y los dos viajes mediante los formularios, comprobó persistencia al recargar y el acceso de ambos maquinistas. Las capturas `viajes-programados.png` y `viajes-celular.png` muestran el estado conservado.

## Límites del alcance

Es una aplicación **local de demostración**, sin servidor de identidad ni sincronización entre dispositivos. La selección de roles en el registro no acredita permisos de una operadora real. El aislamiento de la interfaz y las claves derivadas no sustituyen autorización y control de acceso en un servidor.

Las estaciones, progresivas, reglamentos y capacidades provienen del archivo original y se mantienen como datos de ejemplo, sin certificación operativa. Los recorridos del mapa son segmentos entre estaciones y no geometría ferroviaria verificada. No se verificó un GPS físico ni operación ferroviaria real. Los mapas, fuentes e iconos externos pueden requerir conexión; el flujo central sigue funcionando sin ellos. La prueba móvil fue en navegador con viewport de 390 px, no en un teléfono físico.

## Archivos de trabajo

- `index.html`, `app.js`, `correcciones.css`: versión ejecutable.
- `manifest.json`, `sw.js`, `icon.svg`: recursos PWA locales.
- `original.html`: copia sin modificar del archivo encontrado en la carpeta superior.
- `build.cjs`, `fixes.js`, `helpers.js`: transformación reproducible del original. Regenerar con `node build.cjs` si se modifican estas fuentes; esto reemplaza `app.js` e `index.html`.
- `server.cjs`: servidor limitado a la interfaz local de la computadora.
- `perfil-demo`: datos persistentes del navegador. No lo borres si querés conservar estas cuentas y viajes.

El lanzador utiliza las rutas de Node y Edge verificadas en esta computadora; al trasladar el proyecto a otra máquina hay que ajustarlas.
