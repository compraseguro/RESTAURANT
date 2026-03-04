const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const roots = [
  path.join(__dirname, '..', 'server'),
  path.join(__dirname, '..', 'scripts'),
];

function collectJsFiles(dir, list = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(full, list);
      return;
    }
    if (entry.isFile() && full.endsWith('.js')) list.push(full);
  });
  return list;
}

function main() {
  const files = roots.flatMap((r) => collectJsFiles(r));
  files.forEach((file) => {
    execSync(`node --check "${file}"`, { stdio: 'pipe' });
  });
  console.log(`Lint check OK (${files.length} archivos JS)`);
}

try {
  main();
} catch (err) {
  console.error('Lint check failed');
  console.error(err.stderr ? err.stderr.toString() : err.message);
  process.exit(1);
}
