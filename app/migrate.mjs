// Applies db/schema.sql, then exits. Runs before the server starts on every boot
// (see the CMD in app/Dockerfile), so upgrading an instance is just a restart.
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });

try {
	await sql.file('./schema.sql');
	console.log('schema up to date');
} finally {
	await sql.end();
}
