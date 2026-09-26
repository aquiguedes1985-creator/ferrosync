# Administración por operadora

En la selección de operadora, el enlace **Administrador** abre cinco accesos: DBCC, RAS, SELF, AFE y Administrador general. Requieren el servidor compartido; la versión local de GitHub Pages no administra cuentas del servidor.

La administración general crea o edita la cuenta administradora de cada operadora y puede gestionar sus usuarios. Cada operadora admite una cuenta administradora. Su administrador solo puede crear y gestionar cuentas de Logística o Maquinista de su propia empresa y actualizar su propia cuenta. La API comprueba empresa, identidad y rol en cada operación; los campos del navegador no otorgan permisos.

La primera cuenta administradora de las instalaciones anteriores conserva la administración general. Las demás quedan restringidas a su operadora. Las credenciales existentes se conservan. Las instalaciones nuevas crean la cuenta general con el procedimiento `npm run bootstrap`, que solo admite una inicialización.

La administración de empresas y la restauración de cuentas desde respaldos requieren administración general. Los respaldos importados no pueden conceder permisos generales.

No hay contraseñas predeterminadas en el código. Las cuentas `admin.ras`, `admin.self`, `admin.afe` y `admin.dbcc` se deben habilitar con contraseñas independientes mediante el administrador general o un proceso confiable conectado a la base de datos.

Verificación: `npm run test:admin` comprueba los cinco accesos móviles, altas de usuarios, ingreso posterior, aislamiento de las cuatro operadoras, rechazo de 12 cruces, manipulación de identidad, escalada de permisos y respaldos. Se ejecuta también en GitHub Actions.
