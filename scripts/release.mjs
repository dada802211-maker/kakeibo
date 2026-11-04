import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 実行場所に依存せずプロジェクトを特定し、日本時間の日付ごとに配布物を作成します。
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const front = join(root, 'front')
execFileSync(process.execPath, [join(front, 'node_modules/typescript/bin/tsc'), '-b'], { cwd: front, stdio: 'inherit' })
execFileSync(process.execPath, [join(front, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: front, stdio: 'inherit' })
const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
let target = join(root, 'release', date)
// 同日に再実行しても既存の配布物は上書きしません。
for (let n = 2; existsSync(target); n++) target = join(root, 'release', `${date}-${n}`)
mkdirSync(join(target, 'php'), { recursive: true })
// Laragonの公開ディレクトリ内にある配布物一覧をHTTPで閲覧させないようにします。
writeFileSync(join(root, 'release', '.htaccess'), 'Require all denied\n')
cpSync(join(front, 'dist'), target, { recursive: true })
cpSync(join(root, '.htaccess'), join(target, '.htaccess'))
for (const name of ['api.php','bootstrap.php','billing.php','config.example.php','schema.sql','install.php','migrate.php','migration-billing.sql','.htaccess']) {
  cpSync(join(root, 'php', name), join(target, 'php', name))
}
cpSync(join(root, 'README.md'), join(target, 'README.md'))
writeFileSync(join(target, 'BUILD.txt'), `Built: ${new Date().toISOString()}\nDatabase config and passwords are intentionally excluded.\n`)
console.log(`Release created: ${target}`)
