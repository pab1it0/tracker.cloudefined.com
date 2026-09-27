import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

// Vite doesn't emit maplibre's runtime-computed worker file; bundle it explicitly and point maplibre at it.
setWorkerUrl(workerUrl)
