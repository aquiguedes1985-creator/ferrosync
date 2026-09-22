// Optional one-time initialization inside Vercel's trusted build environment.
// Remove ADMIN_* variables after the first successful initialization.
if (process.env.ADMIN_NAME || process.env.ADMIN_PASSWORD) {
  if (!process.env.DATABASE_URL || !process.env.ADMIN_NAME || !process.env.ADMIN_PASSWORD) {
    throw new Error('El alta inicial requiere DATABASE_URL, ADMIN_NAME y ADMIN_PASSWORD.');
  }
  require('./bootstrap.cjs');
}
