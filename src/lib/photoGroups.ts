import type { PhotoMeta } from '../../lib/shared/types.js'

/** Front+back photos from the same alert (same device and t), shown as one marker. */
export interface PhotoGroup {
  key: string // `${device}|${t}`
  device: string
  t: string
  trigger: string
  lat: number | null
  lon: number | null
  front: PhotoMeta | null
  back: PhotoMeta | null
}

export function groupPhotos(photos: PhotoMeta[]): PhotoGroup[] {
  const groups = new Map<string, PhotoGroup>()
  for (const photo of photos) {
    const key = `${photo.device}|${photo.t}`
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        device: photo.device,
        t: photo.t,
        trigger: photo.trigger,
        lat: photo.lat,
        lon: photo.lon,
        front: null,
        back: null,
      }
      groups.set(key, group)
    }
    if (photo.lat !== null && photo.lon !== null) {
      group.lat = photo.lat
      group.lon = photo.lon
    }
    if (photo.camera === 'front') group.front = photo
    else group.back = photo
  }
  return [...groups.values()]
}
