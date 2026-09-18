# FerroSync

Aplicación de demostración para planificar viajes por operadora, asignar locomotoras y tripulantes, y registrar el inicio y fin de los tramos.

**Aplicación publicada:** https://aquiguedes1985-creator.github.io/ferrosync/

**Vercel (producción):** https://ferrosync.vercel.app/

Cada dirección tiene su propia base local de navegador. Los usuarios y viajes de GitHub Pages no aparecen automáticamente en Vercel. El despliegue inicial de Vercel se realizó mediante la integración de Codex; no se configuró un despliegue automático desde GitHub hacia Vercel.

## PDF y observaciones

En viajes activos e historial, **Detalle / PDF** permite consultar la carga declarada y guardar el informe mediante la impresión del navegador. Las observaciones se registran al iniciar o cerrar cada tramo y durante el viaje por la tripulación asignada o Logística. **Observado** es independiente de **En Tránsito**. Consultar `CAMBIOS-VIAJES.md`.

## Ejecutar localmente

Requiere Node.js 20 o posterior. No necesita dependencias para servir la aplicación:

```bash
npm start
```

Abrí `http://127.0.0.1:8765/`. En Windows también se puede usar `Abrir-FerroSync.cmd` si Node.js y Edge están instalados. Para abrir la página publicada con el perfil de la nueva demostración, usá `Abrir-FerroSync-GitHub.cmd`.

## Pruebas

```bash
npm ci
npx playwright install chromium
npm run check
npm test
npm run test:viajes
```

En Windows las pruebas usan Edge; en Linux usan Chromium. La suite inicia su propio servidor local en un puerto libre y lo cierra al terminar. Los resultados, CSV y capturas se guardan en `artifacts/local/`.

Para probar la página publicada, establecer `BASE_URL=https://aquiguedes1985-creator.github.io/ferrosync/` y ejecutar `npm test`. La suite usa un contexto temporal y no modifica los datos del perfil de demostración.

Ambas suites aceptan `BASE_URL` (también `https://ferrosync.vercel.app/`) y `ARTIFACT_DIR`. `test:viajes` comprueba observaciones antes, durante y al finalizar, permisos del ayudante, persistencia, informe PDF y aislamiento entre empresas. Sus datos iniciales son una configuración de prueba; las acciones operativas se realizan por interfaz. La impresión nativa se intercepta y se verifica el PDF mediante el motor de Chromium.

Para Vercel, `vercel.json` ejecuta `node build.cjs` y publica solamente `dist/`. Las fuentes y los perfiles locales quedan fuera de esa salida.

GitHub Actions ejecuta las pruebas ante cambios en `main` y en solicitudes de cambios. Comprueba la regeneración de la aplicación, sintaxis, registros, planificación, edición, cancelación, recursos y rutas, persistencia, cierre de tramos, aislamiento por operadora, CSV, sincronización entre pestañas, conflictos de escritura, vista móvil y funcionamiento sin conexión.

## Demostración: dos viajes y una locomotora iniciada

Con el servidor iniciado, ejecutar:

```bash
npm run demo:operacion
```

Para hacerlo en la versión publicada, establecer `BASE_URL` como se indica arriba. El script usa los formularios para crear tres cuentas y dos planes en **Grupo RAS**, ingresa con ambos maquinistas e inicia el tramo del primer viaje:

| Usuario de demostración | Rol |
|---|---|
| GitHub Logística | Logística |
| GitHub Maquinista Uno | Maquinista |
| GitHub Maquinista Dos | Maquinista |

Contraseña de demostración para las tres cuentas: `FerroGitHub2026!`. Son cuentas locales ficticias; no otorgan acceso a servicios externos.

| Viaje | Recorrido | Máquina | Resultado esperado |
|---|---|---|---|
| GH-001 | Puerto → Florida | RAS-01 | En Tránsito, tramo En Curso |
| GH-002 | Florida → Durazno | RAS-02 | Programado |

El inicio registra **1800 litros de ejemplo**. Los horarios se calculan al ejecutar el script, en la zona horaria de Uruguay. Se comprueba la persistencia después de recargar y que Logística muestre un viaje en tránsito y uno programado. Los resultados quedan en `artifacts/operacion/`; el estado del navegador, en `perfil-github-demo/`. Ambos directorios están excluidos de Git.

## Almacenamiento y alcance

Los datos viven en IndexedDB del navegador, separados por origen y perfil. Publicar en GitHub Pages **no sincroniza cuentas ni viajes entre dispositivos**. Abrir la URL en otro navegador comienza con otra base. Para revisar los datos de la demostración en esta computadora hay que usar el mismo perfil.

Es un prototipo local: los permisos se controlan en el cliente, el rol se elige al registrarse y no existe un servidor de identidad. El GPS registra la ubicación del dispositivo si recibe permiso; no controla una locomotora real. No se simulan coordenadas para presentarlas como una posición real.

Las estaciones, progresivas, reglamentos y capacidades son datos de ejemplo heredados del archivo de referencia, sin validación operativa. El núcleo puede usarse sin conexión después de una primera carga completa; los mapas y recursos gráficos externos pueden requerir Internet.

## Fuentes

- `original.html`: referencia conservada para la transformación reproducible.
- `build.cjs`, `fixes.js`, `helpers.js`, `viajes.js`: fuentes de las correcciones. `npm run build` genera `index.html`, `app.js` y la salida pública `dist/`.
- `correcciones.css`: ajustes visuales y de accesibilidad.
- `sw.js`, `manifest.json`, `icon.svg`: recursos PWA.
- `server.cjs`: servidor local que sólo entrega recursos públicos.
- `test.cjs`, `demo-operacion.cjs`: pruebas y demostración reproducibles.

`LEEME.md` documenta la primera verificación local; los resultados de ejecuciones nuevas se consultan en sus carpetas de artefactos y en GitHub Actions.
