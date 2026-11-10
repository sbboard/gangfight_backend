// Uploads the built API (dist/) to the server over SFTP, installs its
// dependencies there if they changed, and restarts it with pm2.
//
//   npm run deploy               dry run: says what it would do
//   npm run deploy -- --apply    does it (uploads whatever's in dist/ now)
//   npm run buildanddeploy       a clean build, then deploys for real
//
// Settings come from .env.deploy (gitignored) - see .env.deploy.example:
//   SFTP_HOST=example.com
//   SFTP_PORT=22                   optional
//   SFTP_USER=...
//   SFTP_KEY=C:/Users/you/.ssh/id_ed25519   the private key file
//   SFTP_PASSPHRASE=...            only if the key has one
//   SFTP_ROOT=/path/to/api         the folder on the server app.js runs from
//                                  (dist's contents, with its .env and
//                                  node_modules)
//   PM2_NAME=...                   the pm2 process to restart
//
// The server folder holds what dist/ does - app.js and the rest - plus its
// own .env and node_modules, which a deploy never touches: dist/.env (the
// build copies your local .env there) is never uploaded. package.json and
// package-lock.json go up from the repo; if the lockfile differs from the
// server's, `npm ci --omit=dev` runs there before the restart.
//
// The upload is listed in a manifest on the server; next time, anything in
// the last manifest that isn't being uploaded again (a file removed from
// src/) is deleted there too. Nothing outside the manifest is ever deleted.
import { Buffer } from 'node:buffer';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import process from 'node:process';
import SftpClient from 'ssh2-sftp-client';

const DIST = 'dist';
const MANIFEST = '.deploy-manifest.json';
// the server's own: never uploaded, never deleted
const SERVER_ONLY = [/^\.env$/, /^node_modules\//, /^\.deploy-manifest\.json$/];
// from the repo rather than dist/ (the build copies package.json into dist/
// too, but the lockfile only lives at the top)
const PACKAGE_FILES = ['package.json', 'package-lock.json'];
// what's always there in the API's folder - so a wrong SFTP_ROOT is caught
// before anything changes
const SIGNATURE = 'app.js';

const apply = process.argv.includes('--apply');

function readEnv(file) {
    if (!existsSync(file)) {
        console.error(`Missing ${file} - copy .env.deploy.example and fill it in`);
        process.exit(1);
    }
    const env = {};
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (match) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
    return env;
}

// every file under dir, as posix paths relative to it
function walk(dir) {
    return readdirSync(dir).flatMap(name => {
        const full = join(dir, name);
        return statSync(full).isDirectory()
            ? walk(full).map(f => posix.join(name, f))
            : [name];
    });
}

// for a shell command: one argument, whatever's in it
const quote = text => `'${String(text).replace(/'/g, `'\\''`)}'`;

const env = readEnv('.env.deploy');
for (const key of ['SFTP_HOST', 'SFTP_USER', 'SFTP_KEY', 'SFTP_ROOT', 'PM2_NAME']) {
    if (!env[key]) {
        console.error(`.env.deploy is missing ${key}`);
        process.exit(1);
    }
}
if (!existsSync(env.SFTP_KEY)) {
    console.error(`No key file at SFTP_KEY (${env.SFTP_KEY})`);
    process.exit(1);
}
if (!existsSync(join(DIST, SIGNATURE))) {
    console.error(`No ${DIST}/${SIGNATURE} - run npm run gcp-build first`);
    process.exit(1);
}

const root = posix.normalize(env.SFTP_ROOT.replace(/\\/g, '/'));
const remote = path => posix.join(root, path);
const distFiles = walk(DIST)
    .filter(f => !SERVER_ONLY.some(re => re.test(f)))
    .filter(f => !PACKAGE_FILES.includes(f))
    .sort();
const uploads = [
    ...distFiles.map(f => ({ from: join(DIST, ...f.split('/')), to: f })),
    ...PACKAGE_FILES.map(f => ({ from: f, to: f })),
];

// commands run in a login shell, so pm2 and npm are on its PATH as they
// are when you SSH in yourself (nvm and the like)
const pm2Restart = `pm2 restart ${quote(env.PM2_NAME)} --update-env`;
const install = `cd ${quote(root)} && npm ci --omit=dev`;

const client = new SftpClient();

// runs a command on the server, its output shown here as it comes
function run(command) {
    return new Promise((resolve, reject) => {
        client.client.exec(`bash -lc ${quote(command)}`, (err, stream) => {
            if (err) return reject(err);
            stream.on('data', d => process.stdout.write(d));
            stream.stderr.on('data', d => process.stderr.write(d));
            stream.on('close', code =>
                code === 0
                    ? resolve()
                    : reject(new Error(`"${command}" failed (exit ${code})`))
            );
        });
    });
}

async function readRemote(path) {
    try {
        return (await client.get(path)).toString('utf8');
    } catch {
        return null;
    }
}

try {
    await client.connect({
        host: env.SFTP_HOST,
        port: Number(env.SFTP_PORT || 22),
        username: env.SFTP_USER,
        privateKey: readFileSync(env.SFTP_KEY),
        passphrase: env.SFTP_PASSPHRASE || undefined,
        readyTimeout: 60_000,
    });
    if (!(await client.exists(remote(SIGNATURE)))) {
        throw new Error(
            `${root} has no ${SIGNATURE} - is SFTP_ROOT the folder the API runs from?`
        );
    }
    console.log(
        `${apply ? 'Deploying' : 'Dry run'}: dist/ -> ${env.SFTP_HOST}:${root}\n`
    );

    const previous = JSON.parse((await readRemote(remote(MANIFEST))) ?? '[]');
    const uploading = new Set(uploads.map(u => u.to));
    const toDelete = previous.filter(
        f => !uploading.has(f) && !SERVER_ONLY.some(re => re.test(f))
    );
    const lockChanged =
        (await readRemote(remote('package-lock.json'))) !==
        readFileSync('package-lock.json', 'utf8');

    console.log(`to upload (overwriting): ${uploads.length}`);
    uploads.forEach(u => console.log(`    ${u.to}`));
    console.log(`to delete (gone from the build): ${toDelete.length}`);
    toDelete.forEach(f => console.log(`    ${f}`));
    console.log(
        lockChanged
            ? `dependencies changed: will run \`${install}\``
            : 'dependencies unchanged: no install'
    );
    console.log(`then: \`${pm2Restart}\``);

    if (!apply) {
        console.log('\nNothing changed. Run with --apply to deploy.');
    } else {
        const madeDirs = new Set();
        for (const { from, to } of uploads) {
            const dir = remote(posix.dirname(to));
            if (!madeDirs.has(dir)) {
                if (!(await client.exists(dir))) await client.mkdir(dir, true);
                madeDirs.add(dir);
            }
            await client.put(from, remote(to));
        }
        for (const f of toDelete) {
            if (await client.exists(remote(f))) await client.delete(remote(f));
        }
        await client.put(
            Buffer.from(JSON.stringify([...uploading])),
            remote(MANIFEST)
        );
        console.log(`Uploaded ${uploads.length}, deleted ${toDelete.length}.\n`);

        if (lockChanged) {
            console.log(`$ ${install}`);
            await run(install);
        }
        console.log(`$ ${pm2Restart}`);
        await run(pm2Restart);
        console.log('\nDone.');
    }
} catch (err) {
    console.error(err.message ?? err);
    process.exitCode = 1;
} finally {
    await client.end().catch(() => {});
}
