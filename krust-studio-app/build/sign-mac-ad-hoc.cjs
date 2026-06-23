const fs = require('node:fs')
const path = require('node:path')
const { signAsync } = require('@electron/osx-sign')

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
  await signAsync({
    app: appPath,
    identity: '-',
    identityValidation: false,
    platform: 'darwin',
    hardenedRuntime: false,
    preAutoEntitlements: false,
    entitlements: path.join(context.packager.projectDir, 'build', 'entitlements.mac.plist'),
    entitlementsInherit: path.join(
      context.packager.projectDir,
      'build',
      'entitlements.mac.plist'
    )
  })
}
