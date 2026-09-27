import { memo, useEffect, useRef } from 'react'
import { photoUrl } from '../lib/api.js'
import { formatAbsolute } from '../lib/format.js'
import type { PhotoGroup } from '../lib/photoGroups.js'

interface PhotoViewerProps {
  photo: PhotoGroup | null
  onClose: () => void
  triggerRef: React.RefObject<HTMLElement | null>
}

function PhotoViewerImpl({ photo, onClose, triggerRef }: PhotoViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (photo && !dialog.open) dialog.showModal()
    if (!photo && dialog.open) dialog.close()
  }, [photo])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const onCancel = (e: Event) => {
      e.preventDefault()
      onClose()
    }
    const onClose_ = () => {
      onClose()
      triggerRef.current?.focus()
    }
    dialog.addEventListener('cancel', onCancel)
    dialog.addEventListener('close', onClose_)
    return () => {
      dialog.removeEventListener('cancel', onCancel)
      dialog.removeEventListener('close', onClose_)
    }
  }, [onClose, triggerRef])

  return (
    <dialog ref={dialogRef} className="photo-viewer-dialog" aria-label="Photo">
      {photo && (
        <>
          <div className="photo-viewer-header">
            <h2>Photo</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
            >
              ✕
            </button>
          </div>
          <div className="photo-viewer-images">
            {photo.front && (
              <img
                className="photo-viewer-image"
                src={photoUrl(photo.front.id, 'full')}
                alt={`Front camera photo at ${formatAbsolute(photo.t)}`}
              />
            )}
            {photo.back && (
              <img
                className="photo-viewer-image"
                src={photoUrl(photo.back.id, 'full')}
                alt={`Back camera photo at ${formatAbsolute(photo.t)}`}
              />
            )}
          </div>
          <p className="photo-viewer-caption">
            {formatAbsolute(photo.t)} · {photo.trigger}
            {photo.front && photo.back ? ' · front & back' : photo.front ? ' · front' : ' · back'}
          </p>
        </>
      )}
    </dialog>
  )
}

export const PhotoViewer = memo(PhotoViewerImpl)
