import sharp from 'sharp'
import iconGen from 'icon-gen'
import { mkdtempSync, copyFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const svg = 'build/icon.svg'
const buildDir = 'build'
const resDir = 'resources'

const png1024 = join(buildDir, 'icon.png')
await sharp(svg, { density: 384 }).resize(1024, 1024).png().toFile(png1024)
copyFileSync(png1024, join(resDir, 'icon.png'))
console.log('icon.png 1024 -> build + resources')

const tmp = mkdtempSync(join(tmpdir(), 'krust-icon-'))
const src = join(tmp, 'src.png')
await sharp(svg, { density: 384 }).resize(1024, 1024).png().toFile(src)
await iconGen(src, buildDir, {
  report: false,
  ico: { name: 'icon', sizes: [16, 24, 32, 48, 64, 128, 256] },
  icns: { name: 'icon', sizes: [16, 32, 64, 128, 256, 512, 1024] }
})
console.log('icon.ico + icon.icns written')
