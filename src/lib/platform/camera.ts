import { Capacitor } from '@capacitor/core'

const NATIVE = Capacitor.isNativePlatform()

type Source = 'camera' | 'library' | 'prompt'

/**
 * Native capture via `@capacitor/camera` (Phase 14). `source` maps to the
 * Capacitor CameraSource: live camera, the photo library, or the OS prompt that
 * lets the user choose between the two (Instagram-style).
 */
async function pickNative(source: Source): Promise<string | null> {
  try {
    const mod = '@capacitor/camera'
    const { Camera, CameraResultType, CameraSource } = (await import(
      /* @vite-ignore */ mod
    )) as {
      Camera: { getPhoto: (o: unknown) => Promise<{ dataUrl?: string }> }
      CameraResultType: { DataUrl: string }
      CameraSource: { Camera: string; Photos: string; Prompt: string }
    }
    const nativeSource =
      source === 'camera'
        ? CameraSource.Camera
        : source === 'library'
          ? CameraSource.Photos
          : CameraSource.Prompt
    const photo = await Camera.getPhoto({
      quality: 80,
      resultType: CameraResultType.DataUrl,
      source: nativeSource,
    })
    return photo.dataUrl ?? null
  } catch {
    return null
  }
}

/**
 * Web fallback via `<input type=file accept=image/*>`. With `useCamera` we add
 * the `capture` hint so mobile browsers open the camera; without it the browser
 * opens the photo library / file picker.
 */
function pickWeb(useCamera: boolean): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const input = document.createElement('input')
    let settled = false
    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(value)
    }

    input.type = 'file'
    // `image/*` lets mobile browsers expose all installed photo providers,
    // including Google Fotos, instead of restricting the chooser to a custom
    // file extension.
    input.accept = 'image/*'
    if (useCamera) input.setAttribute('capture', 'environment')
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        finish(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () =>
        finish(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => finish(null)
      reader.readAsDataURL(file)
    }
    input.oncancel = () => finish(null)
    try {
      input.click()
    } catch {
      finish(null)
    }
  })
}

/** Take a brand-new photo with the camera. Returns a data URL, or null if cancelled. */
export function takePhoto(): Promise<string | null> {
  return NATIVE ? pickNative('camera') : pickWeb(true)
}

/** Pick an existing photo from the device's gallery. Returns a data URL, or null if cancelled. */
export function pickFromLibrary(): Promise<string | null> {
  return NATIVE ? pickNative('library') : pickWeb(false)
}

/**
 * Prompt-style picker (camera OR library), Instagram-style. Kept as the default
 * single-entry picker for callers that don't offer two buttons.
 */
export function pickPhoto(): Promise<string | null> {
  return NATIVE ? pickNative('prompt') : pickWeb(false)
}
