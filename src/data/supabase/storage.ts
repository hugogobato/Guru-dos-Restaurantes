import { supabase, isSupabaseConfigured } from './client'

const BUCKET = 'media'

/**
 * Uploads a data-URL (or blob: URL) image to Supabase Storage and returns its
 * public URL. Pass-throughs anything that's already an http(s) URL.
 *
 * Throws on a real upload error so callers can decide whether to fall back to
 * storing the data URL inline.
 */
export async function uploadImage(dataUrl: string, folder: string): Promise<string> {
  if (dataUrl.startsWith('http')) return dataUrl
  if (!isSupabaseConfigured) return dataUrl

  const blob = await (await fetch(dataUrl)).blob()
  // e.g. "image/jpeg" → "jpeg"; strip "+xml" etc.
  const ext = (blob.type.split('/')[1] || 'jpg').split('+')[0]
  const path = `${folder}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false })
  if (error) throw error

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * Uploads a batch of images. Each one that fails to upload falls back to its
 * original (inline) value so a missing Storage bucket never blocks a post.
 */
export async function uploadImages(
  dataUrls: string[],
  folder: string
): Promise<string[]> {
  return Promise.all(
    dataUrls.map(async (url) => {
      try {
        return await uploadImage(url, folder)
      } catch (e) {
        console.warn('Image upload failed, storing inline as fallback:', e)
        return url
      }
    })
  )
}
