// Briše lokalnu bazu — pri sljedećem pokretanju servera kreira se nova (sa demo podacima ako je DEMO_MODE uključen).
import fs from 'node:fs';
import path from 'node:path';
const dir = process.env.DATA_DIR ?? path.resolve(import.meta.dirname, '..', 'server', 'data');
for (const f of ['falijedan.db', 'falijedan.db-wal', 'falijedan.db-shm']) fs.rmSync(path.join(dir, f), { force: true });
console.log('Baza obrisana:', dir);
