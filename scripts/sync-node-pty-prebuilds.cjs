/**
 * Why this script exists
 * ----------------------
 * On macOS, `node-pty` uses a native addon (`pty.node`) plus a helper binary
 * (`spawn-helper`). In this repo, installs can end up with the wrong-arch
 * binaries in `node_modules/node-pty/build/Release` (e.g. x86_64 on an arm64
 * machine) or with non-executable permissions on `spawn-helper`.
 *
 * Symptoms:
 * - Terminal creation fails with: `Error: posix_spawnp failed.`
 *
 * What it does
 * ------------
 * After dependencies are installed, we copy the correct prebuilt binaries from:
 *   `node_modules/node-pty/prebuilds/darwin-{arch}/`
 * into:
 *   `node_modules/node-pty/build/Release/`
 * and ensure they are executable (`chmod 755`).
 *
 * Why `build/Release`?
 * --------------------
 * `node-pty`'s loader checks `build/Release` first, then prebuilds. Ensuring
 * the correct binaries exist there avoids arch/permission issues.
 *
 * Impact on production builds
 * ---------------------------
 * This runs only as an install-time hook (`postinstall`). It does not run
 * inside a packaged app at runtime; packaged apps should already ship the
 * correct `node-pty` binaries in their bundle.
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

function copyFileSyncEnsureDir(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

function detectElectronArch() {
  const electronBin = path.join(
    __dirname,
    '..',
    'node_modules',
    'electron',
    'dist',
    'Electron.app',
    'Contents',
    'MacOS',
    'Electron'
  )

  if (!fs.existsSync(electronBin)) return null

  try {
    const out = execFileSync('file', [electronBin], { encoding: 'utf8' })
    // Examples:
    // - "Mach-O 64-bit executable arm64"
    // - "Mach-O 64-bit executable x86_64"
    // - "Mach-O universal binary with 2 architectures: [x86_64:...] [arm64:...]"
    if (out.includes('arm64') && !out.includes('x86_64')) return 'arm64'
    if (out.includes('x86_64') && !out.includes('arm64')) return 'x64'
    if (out.includes('arm64') && out.includes('x86_64')) {
      // universal: prefer native host arch when possible
      return process.arch === 'arm64' ? 'arm64' : 'x64'
    }
  } catch {
    // ignore
  }

  return null
}

function main() {
  if (process.platform !== 'darwin') return

  const arch = (
    detectElectronArch() ||
    process.env.npm_config_arch ||
    process.env.npm_config_target_arch ||
    process.arch
  ).trim()

  if (arch !== 'arm64' && arch !== 'x64') {
    console.log(`[node-pty] SKIP: unsupported arch '${arch}'`)
    return
  }

  const nodePtyRoot = path.join(__dirname, '..', 'node_modules', 'node-pty')
  const prebuildDir = path.join(nodePtyRoot, 'prebuilds', `${process.platform}-${arch}`)
  const releaseDir = path.join(nodePtyRoot, 'build', 'Release')

  if (!fs.existsSync(prebuildDir)) {
    console.log(`[node-pty] SKIP: missing prebuilds dir ${prebuildDir}`)
    return
  }

  const files = ['pty.node', 'spawn-helper']
  for (const file of files) {
    const src = path.join(prebuildDir, file)
    const dest = path.join(releaseDir, file)
    if (!fs.existsSync(src)) {
      console.log(`[node-pty] SKIP: missing ${src}`)
      continue
    }
    copyFileSyncEnsureDir(src, dest)
    try {
      fs.chmodSync(dest, 0o755)
    } catch {
      // ignore
    }
  }

  console.log(`[node-pty] Synced prebuilds for ${process.platform}-${arch} -> build/Release`)
}

main()
