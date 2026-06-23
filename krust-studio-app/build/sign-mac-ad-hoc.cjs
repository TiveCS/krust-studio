const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

exports.default = async function signMacAdHoc(context) {
  if (context.electronPlatformName !== 'darwin') {
    return
  }

  if (process.env.CSC_LINK || process.env.CSC_NAME) {
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)

  if (!fs.existsSync(appPath)) {
    throw new Error(`macOS app was not produced at ${appPath}`)
  }

  console.log(`Ad-hoc signing unsigned macOS app at ${appPath}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit'
  })
}
