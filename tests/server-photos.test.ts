import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { processImage, sniffImage } from '../lib/server/photos.js'

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 50, b: 50 } } })
    .jpeg()
    .toBuffer()
}

async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 50, g: 200, b: 50 } } })
    .png()
    .toBuffer()
}

describe('sniffImage', () => {
  it('recognizes JPEG magic bytes', () => {
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg')
  })

  it('recognizes PNG magic bytes', () => {
    expect(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe('png')
  })

  it('recognizes HEIC (ftyp box)', () => {
    const buf = new Uint8Array(12)
    buf.set([0, 0, 0, 0x18], 0)
    buf.set(new TextEncoder().encode('ftyp'), 4)
    expect(sniffImage(buf)).toBe('heic')
  })

  it('rejects plain text', () => {
    expect(sniffImage(new TextEncoder().encode('not an image'))).toBeNull()
  })
})

describe('processImage', () => {
  it('produces a thumbnail no larger than 160x160 and a full image no larger than 1600x1600', async () => {
    const jpeg = await makeJpeg(2000, 1500)
    const result = await processImage(jpeg)
    expect(result.width).toBeLessThanOrEqual(1600)
    expect(result.height).toBeLessThanOrEqual(1600)

    const thumbMeta = await sharp(result.thumb).metadata()
    expect(thumbMeta.width).toBeLessThanOrEqual(160)
    expect(thumbMeta.height).toBeLessThanOrEqual(160)
  })

  it('outputs JPEG bytes for both full and thumb', async () => {
    const jpeg = await makeJpeg(400, 300)
    const result = await processImage(jpeg)
    expect(result.full.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
    expect(result.thumb.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
  })

  it('normalises a PNG input to JPEG output', async () => {
    const png = await makePng(400, 300)
    const result = await processImage(png)
    expect(result.full.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
  })

  it('rejects an undecodable buffer', async () => {
    await expect(processImage(new TextEncoder().encode('garbage'))).rejects.toBeTruthy()
  })
})
