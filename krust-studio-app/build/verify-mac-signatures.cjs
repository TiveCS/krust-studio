const { execFileSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function codesignDetails(targetPath) {
  const result = spawnSync('codesign', ['-dv', '--verbose=4', targetPath], {
    encoding: 'utf8'
  })

  return `${result.stdout ?? ''}${result.stderr ?? ''}`
}

function teamIdFor(targetPath) {
  const output = codesignDetails(targetPath)
  const match = output.match(/^TeamIdentifier=(.+)$/m)
  return match?.[1]?.trim() ?? ''
}

exports.default = async function verifyMacSignatures(context) {
  if (context.electronPlatformName !== 'darwin') {
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  const frameworkPath = path.join(
    appPath,
    'Contents',
    'Frameworks',
    'Electron Framework.framework',
    'Versions',
    'A',
    'Electron Framework'
  )

  if (!fs.existsSync(appPath)) {
    throw new Error(`macOS app was not produced at ${appPath}`)
  }

  if (!fs.existsSync(frameworkPath)) {
    throw new Error(`Electron Framework was not bundled at ${frameworkPath}`)
  }

  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], {
    stdio: 'inherit'
  })

  const appTeamId = teamIdFor(appPath)
  const frameworkTeamId = teamIdFor(frameworkPath)

  console.log(`App Team ID: ${appTeamId || '<empty>'}`)
  console.log(`Electron Framework Team ID: ${frameworkTeamId || '<empty>'}`)

  if (appTeamId !== frameworkTeamId) {
    throw new Error('macOS app and Electron Framework have different Team IDs')
  }
}
