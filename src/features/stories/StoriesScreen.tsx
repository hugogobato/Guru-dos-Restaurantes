import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { X, Eye, Camera, MapPin, ImageIcon } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Sheet } from '../../components/ui/Sheet'
import { Avatar } from '../../components/ui/Avatar'
import { toast } from '../../components/ui/Toast'
import {
  useStories,
  usePostStory,
  useSessionUser,
  useMarkStoryViewed,
  useRestaurants,
} from '../../lib/query/hooks'
import { takePhoto, pickFromLibrary } from '../../lib/platform'
import { uploadImage } from '../../data/supabase/storage'
import { copy } from '../../copy/pt-BR'

export function StoriesScreen() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: stories, isLoading } = useStories()
  const { data: sessionUser } = useSessionUser()
  const { data: restaurants } = useRestaurants()
  const postStoryMutation = usePostStory()
  const { mutate: markStoryViewed } = useMarkStoryViewed()

  const [currentIndex, setCurrentIndex] = useState(0)
  // Open straight into the composer when arriving via the "Postar" button.
  const [isCreating, setIsCreating] = useState(
    () => searchParams.get('compose') === '1'
  )
  const [caption, setCaption] = useState('')
  const [taggedRestaurantId, setTaggedRestaurantId] = useState('')
  const [isViewersOpen, setIsViewersOpen] = useState(false)
  // null until the user actually captures/picks a photo — no fake placeholder.
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  // Mark the visible story as viewed (skip my own; idempotent in the repo).
  useEffect(() => {
    if (isCreating || !stories || stories.length === 0 || !sessionUser) return
    const story = stories[currentIndex]
    if (!story || story.userId === sessionUser.id) return
    if (story.viewers.includes(sessionUser.id)) return
    markStoryViewed({ storyId: story.id, userId: sessionUser.id })
  }, [currentIndex, stories, sessionUser, isCreating, markStoryViewed])

  const handleNext = () => {
    if (!stories) return
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      navigate('/')
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }

  const handleTakePhoto = async () => {
    const photo = await takePhoto()
    if (photo) setImageUrl(photo)
  }

  const handlePickFromLibrary = async () => {
    const photo = await pickFromLibrary()
    if (photo) setImageUrl(photo)
  }

  // Leave the composer and drop the ?compose=1 flag from the URL.
  const closeComposer = () => {
    setIsCreating(false)
    if (searchParams.has('compose')) {
      searchParams.delete('compose')
      setSearchParams(searchParams, { replace: true })
    }
  }

  const handleCreate = async () => {
    if (!sessionUser) return
    if (!imageUrl) {
      toast('Escolhe uma foto pra postar o story 📸', 'error')
      return
    }
    try {
      // Upload to Supabase Storage; fall back to the inline data URL on failure.
      let photoUrl = imageUrl
      try {
        photoUrl = await uploadImage(imageUrl, `stories/${sessionUser.id}`)
      } catch (e) {
        console.warn('Story photo upload failed, storing inline:', e)
      }
      await postStoryMutation.mutateAsync({
        userId: sessionUser.id,
        photoUrl,
        caption: caption || undefined,
        restaurantId: taggedRestaurantId || undefined,
      })
      toast('Story postado com sucesso! 📸', 'success')
      closeComposer()
      setCaption('')
      setTaggedRestaurantId('')
      setImageUrl(null)
      setCurrentIndex(0)
    } catch {
      toast('Falha ao postar story', 'error')
    }
  }

  if (isLoading) {
    return (
      <div className="py-10 text-center text-xs text-[#808080]">
        Carregando stories…
      </div>
    )
  }

  if (isCreating) {
    return (
      <div className="mx-auto max-w-md space-y-6 pb-10">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-1.5 text-xl font-extrabold text-white">
            <Camera className="text-primary" /> Novo Story
          </h1>
          <button
            onClick={closeComposer}
            className="text-white hover:opacity-85"
          >
            <X size={20} />
          </button>
        </div>

        <Card className="space-y-4 border-[#2D2D2D] bg-[#1A1A1A] p-4">
          {imageUrl ? (
            <div className="relative flex h-72 items-center justify-center overflow-hidden rounded-xl border border-[#2D2D2D] bg-[#242424]">
              <img
                src={imageUrl}
                alt="Preview"
                className="h-full w-full object-cover"
              />
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button
                  onClick={handleTakePhoto}
                  className="flex items-center gap-1 rounded-full bg-[#0F0F0F]/80 px-3 py-1.5 text-[10px] font-extrabold text-white hover:bg-black"
                >
                  <Camera size={12} /> Câmera
                </button>
                <button
                  onClick={handlePickFromLibrary}
                  className="flex items-center gap-1 rounded-full bg-[#0F0F0F]/80 px-3 py-1.5 text-[10px] font-extrabold text-white hover:bg-black"
                >
                  <ImageIcon size={12} /> Galeria / Google Fotos
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-72 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#3D3D3D] bg-[#242424] p-4">
              <p className="text-[11px] text-[#808080]">
                Bora postar um story? Escolhe a foto 👇
              </p>
              <div className="flex w-full gap-2">
                <Button
                  onClick={handleTakePhoto}
                  className="flex-1 rounded-full bg-gradient-to-tr from-primary to-[#FF8C61] text-xs"
                >
                  <Camera size={14} className="mr-1.5" /> Tirar foto
                </Button>
                <Button
                  onClick={handlePickFromLibrary}
                  variant="outline"
                  className="flex-1 rounded-full border-[#3D3D3D] text-xs hover:bg-[#242424]"
                >
                  <ImageIcon size={14} className="mr-1.5" /> Galeria / Google
                  Fotos
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#A0A0A0]">
              Legenda do Story (opcional)
            </label>
            <input
              type="text"
              placeholder="Amassando no rolê com a tropa... 🍔"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full rounded-xl border border-[#2D2D2D] bg-[#242424] px-3 py-3 text-xs text-white outline-none focus:border-primary"
            />
          </div>

          {/* Restaurant tag (optional) */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1 text-xs font-bold text-[#A0A0A0]">
              <MapPin size={12} /> {copy.stories.tagRestaurant}
            </label>
            <select
              value={taggedRestaurantId}
              onChange={(e) => setTaggedRestaurantId(e.target.value)}
              className="w-full rounded-xl border border-[#2D2D2D] bg-[#242424] px-3 py-3 text-xs text-white outline-none focus:border-primary"
            >
              <option value="">Sem marcação</option>
              {restaurants?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} • {r.address.neighborhood}
                </option>
              ))}
            </select>
          </div>

          <Button
            onClick={handleCreate}
            disabled={postStoryMutation.isPending || !imageUrl}
            className="w-full rounded-full bg-gradient-to-tr from-primary to-[#FF8C61] disabled:opacity-50"
          >
            {postStoryMutation.isPending ? 'Lançando…' : 'Lançar Story 🚀'}
          </Button>
        </Card>
      </div>
    )
  }

  if (!stories || stories.length === 0) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <p className="text-xs italic text-[#808080]">
          Nenhum story por aqui ainda.
        </p>
        <Button
          onClick={() => setIsCreating(true)}
          className="rounded-full text-xs"
        >
          <Camera size={13} className="mr-1.5" /> Lançar o Primeiro!
        </Button>
      </div>
    )
  }

  const currentStory = stories[currentIndex]
  const isMyStory = currentStory.userId === sessionUser?.id
  const storyUsername = (
    currentStory.user?.username ?? currentStory.userId.replace('u_', '')
  ).replace(/^@/, '')
  const taggedRestaurant =
    currentStory.restaurant ??
    restaurants?.find((r) => r.id === currentStory.restaurantId)

  return (
    <div className="relative mx-auto flex h-[calc(100vh-80px)] w-full max-w-md flex-col justify-between overflow-hidden rounded-3xl bg-[#000]">
      {/* Background Image */}
      <img
        src={currentStory.photoUrl}
        alt="Story"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/60" />

      {/* Top Bar with progress indicators and author */}
      <div className="relative z-10 space-y-3 p-4">
        {/* Progress bars */}
        <div className="flex gap-1.5">
          {stories.map((story, idx) => (
            <div
              key={idx}
              className="h-1 flex-1 overflow-hidden rounded-full bg-white/20"
            >
              <div
                key={story.id}
                onAnimationEnd={idx === currentIndex ? handleNext : undefined}
                className={`h-full bg-white ${idx === currentIndex ? 'story-progress' : ''}`}
                style={{
                  width:
                    idx < currentIndex
                      ? '100%'
                      : idx === currentIndex
                        ? undefined
                        : '0%',
                }}
              />
            </div>
          ))}
        </div>

        {/* User Info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary/20 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-primary text-xs font-bold uppercase text-white">
              {currentStory.user?.avatarUrl ? (
                <img
                  src={currentStory.user.avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                (currentStory.user?.displayName ?? 'U').slice(0, 2)
              )}
            </div>
            <div>
              <p className="text-xs font-black text-white">
                @{storyUsername || 'usuario'}
              </p>
              <p className="text-[9px] text-white/70">
                {new Date(currentStory.createdAt).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCreating(true)}
              className="rounded-full bg-white/10 p-2 text-white transition-all hover:bg-white/20"
            >
              <Camera size={16} />
            </button>
            <button
              onClick={() => navigate('/')}
              className="rounded-full bg-white/10 p-2 text-white transition-all hover:bg-white/20"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Navigation hotspots */}
      <div
        className="absolute inset-y-20 left-0 z-20 w-1/3 cursor-pointer"
        onClick={handlePrev}
      />
      <div
        className="absolute inset-y-20 right-0 z-20 w-1/3 cursor-pointer"
        onClick={handleNext}
      />

      {/* Bottom overlay with restaurant tag, caption & viewers (z-30 to beat the nav hotspots) */}
      <div className="relative z-30 space-y-3 p-4">
        {/* Tagged restaurant chip */}
        {taggedRestaurant && (
          <button
            onClick={() => navigate(`/restaurant/${taggedRestaurant.id}`)}
            className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur-md"
          >
            <MapPin size={12} className="text-primary" />
            <span>{taggedRestaurant.name}</span>
          </button>
        )}

        {currentStory.caption && (
          <p className="text-shadow text-sm font-bold leading-relaxed text-white">
            {currentStory.caption}
          </p>
        )}

        {/* Viewer list is visible to the author only (Instagram-style) */}
        {isMyStory && (
          <button
            onClick={() => setIsViewersOpen(true)}
            className="flex items-center gap-1.5 text-[11px] font-bold text-white/90"
          >
            <Eye size={13} />
            <span>
              {currentStory.viewers.length} {copy.stories.viewsLabel}
            </span>
          </button>
        )}
      </div>

      {/* Author viewer list */}
      <Sheet
        isOpen={isViewersOpen}
        onClose={() => setIsViewersOpen(false)}
        title={copy.stories.viewerTitle}
      >
        <div className="space-y-2 pb-6">
          {currentStory.viewers.length === 0 ? (
            <p className="py-8 text-center text-xs italic text-[#808080]">
              {copy.stories.noViewers}
            </p>
          ) : (
            currentStory.viewers.map((viewerId) => (
              <div
                key={viewerId}
                className="flex items-center gap-2.5 rounded-xl border border-[#2D2D2D] bg-[#242424] p-2.5"
              >
                <Avatar
                  fallback={viewerId
                    .replace('u_', '')
                    .slice(0, 2)
                    .toUpperCase()}
                  size="sm"
                />
                <span className="text-xs font-bold text-white">
                  @{viewerId.replace('u_', '')}
                </span>
              </div>
            ))
          )}
        </div>
      </Sheet>
    </div>
  )
}
