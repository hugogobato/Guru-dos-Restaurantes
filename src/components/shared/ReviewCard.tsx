import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Heart,
  MessageSquare,
  Bookmark,
  Share2,
  Send,
  Trash2,
} from 'lucide-react'
import { Card, CardContent, CardHeader } from '../ui/Card'
import { Avatar } from '../ui/Avatar'
import { Sheet } from '../ui/Sheet'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { toast } from '../ui/Toast'
import {
  useSessionUser,
  useToggleLike,
  useAddComment,
  useDeleteReview,
} from '../../lib/query/hooks'
import { type Review } from '../../domain/models'
import { copy } from '../../copy/pt-BR'
import { shareContent } from '../../lib/platform'
import { LazyImage } from './LazyImage'

interface ReviewCardProps {
  review: Review
}

export function ReviewCard({ review }: ReviewCardProps) {
  const { data: sessionUser } = useSessionUser()
  const toggleLikeMutation = useToggleLike()
  const addCommentMutation = useAddComment()
  const deleteReviewMutation = useDeleteReview()

  const [isCommentSheetOpen, setIsCommentSheetOpen] = useState(false)
  const [newCommentText, setNewCommentText] = useState('')
  const [lastTap, setLastTap] = useState(0)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const reviewUsername = (
    review.user?.username ?? review.userId.replace('u_', '')
  ).replace(/^@/, '')

  const handleLike = () => {
    if (!sessionUser) {
      toast('Faça login ou complete o onboarding primeiro!', 'error')
      return
    }
    toggleLikeMutation.mutate({ reviewId: review.id, userId: sessionUser.id })
  }

  // Double tap to like gesture simulation
  const handlePhotoClick = () => {
    const now = Date.now()
    if (now - lastTap < 300) {
      if (!review.isLikedByMe) {
        handleLike()
        toast('Amassei! ❤️', 'success')
      }
    }
    setLastTap(now)
  }

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sessionUser || !newCommentText.trim()) return

    try {
      await addCommentMutation.mutateAsync({
        reviewId: review.id,
        userId: sessionUser.id,
        text: newCommentText.trim(),
      })
      setNewCommentText('')
      toast('Comentário enviado!', 'success')
    } catch {
      toast('Falha ao comentar', 'error')
    }
  }

  const handleShare = async () => {
    const result = await shareContent({
      title: `Review de ${review.restaurant?.name ?? 'um pico'}`,
      text: review.comment || 'Olha esse review no Rango Social!',
      url: window.location.href,
    })
    if (result === 'copied') {
      toast('Link copiado pro clipboard, cria! 📋', 'success')
    } else if (result === 'failed') {
      toast('Não rolou compartilhar', 'error')
    }
  }

  const perPersonCost =
    review.totalSpent && review.partySize && review.partySize > 0
      ? (review.totalSpent / review.partySize).toFixed(0)
      : null

  return (
    <>
      <Card className="overflow-hidden border-[#2D2D2D] bg-[#1A1A1A] transition-all duration-200 hover:border-[#444]">
        {/* Card Header (User profile, handle & tier) */}
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4">
          <div className="flex items-center gap-2.5">
            <Avatar
              src={review.user?.avatarUrl || undefined}
              fallback={review.userId
                .replace('u_', '')
                .slice(0, 2)
                .toUpperCase()}
              size="sm"
            />
            <div>
              <div className="flex items-center gap-1">
                <Link
                  to={`/profile/${review.userId}`}
                  className="text-xs font-black text-white hover:underline"
                >
                  @{reviewUsername}
                </Link>
                {review.user?.isVerified && (
                  <span className="text-[10px] text-primary" title="Verificado">
                    ✔️
                  </span>
                )}
                {review.user?.influencerTier && (
                  <span className="bg-secondary/15 border-secondary/20 py-0.2 rounded-full border px-1.5 text-[9px] font-extrabold uppercase text-secondary">
                    {review.user.influencerTier}
                  </span>
                )}
              </div>
              <p className="text-[9px] text-[#808080]">
                {new Date(review.createdAt).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>

          {review.overallScore && (
            <div className="flex gap-0.5">
              {Array.from({ length: review.overallScore }).map((_, i) => (
                <span key={i} className="text-xs">
                  🌶️
                </span>
              ))}
            </div>
          )}

          {review.userId === sessionUser?.id && (
            <button
              type="button"
              onClick={() => setIsDeleteDialogOpen(true)}
              aria-label="Excluir review"
              className="rounded-full p-2 text-[#808080] transition-colors hover:bg-[#2A2A2A] hover:text-red-400"
            >
              <Trash2 size={14} />
            </button>
          )}
        </CardHeader>

        {/* Card Main Photo Area with Double-tap gesture */}
        {review.photos && review.photos[0] && (
          <div
            onClick={handlePhotoClick}
            className="group relative aspect-video cursor-pointer overflow-hidden bg-[#242424]"
          >
            <LazyImage
              src={review.photos[0]}
              alt={`Foto de ${review.restaurant?.name ?? 'um rango'}`}
              className="transition-transform duration-300 group-hover:scale-[1.02]"
            />
            {perPersonCost && (
              <div className="border-primary/20 absolute bottom-3 right-3 rounded-full border bg-black/80 px-2.5 py-1 text-[10px] font-black text-primary shadow-md backdrop-blur-md">
                💸 R$ {perPersonCost}/pessoa
              </div>
            )}
          </div>
        )}

        {/* Review Comments & Restaurant details */}
        <CardContent className="space-y-2.5 p-4">
          <div className="space-y-1">
            <Link
              to={`/restaurant/${review.restaurantId}`}
              className="flex items-center gap-1 text-xs font-extrabold text-primary hover:underline"
            >
              📍 {review.restaurant?.name || 'Ver Restaurante'}
            </Link>
            {review.comment && (
              <p className="text-xs leading-relaxed text-[#E0E0E0]">
                "{review.comment}"
              </p>
            )}
          </div>

          {/* Render individual metrics briefly if present */}
          {review.metrics && Object.keys(review.metrics).length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {Object.entries(review.metrics)
                .slice(0, 3)
                .map(([key, val]) => (
                  <span
                    key={key}
                    className="rounded bg-[#2A2A2A] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#A0A0A0]"
                  >
                    {key}: {val}/5
                  </span>
                ))}
            </div>
          )}

          {/* Action Footer Bar */}
          <div className="flex items-center gap-4 border-t border-[#2A2A2A] pt-3 text-[#808080]">
            <button
              onClick={handleLike}
              className={`flex items-center gap-1.5 text-[11px] font-semibold transition-colors hover:text-white ${
                review.isLikedByMe ? 'text-primary' : ''
              }`}
            >
              <Heart
                size={14}
                className={
                  review.isLikedByMe ? 'fill-current text-primary' : ''
                }
              />
              <span>{review.likes}</span>
            </button>

            <button
              onClick={() => setIsCommentSheetOpen(true)}
              className="flex items-center gap-1.5 text-[11px] font-semibold transition-colors hover:text-white"
            >
              <MessageSquare size={14} />
              <span>{review.comments?.length || 0}</span>
            </button>

            <button
              onClick={handleShare}
              aria-label="Compartilhar review"
              className="flex items-center gap-1.5 text-[11px] font-semibold transition-colors hover:text-white"
            >
              <Share2 size={14} />
            </button>

            <button
              aria-label="Salvar review"
              className="ml-auto transition-colors hover:text-white"
            >
              <Bookmark size={14} />
            </button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          if (!deleteReviewMutation.isPending) setIsDeleteDialogOpen(false)
        }}
        title="Excluir review?"
      >
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-[#C0C0C0]">
            Essa ação remove sua avaliação, fotos e comentários associados. Não
            dá para desfazer.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={deleteReviewMutation.isPending}
              className="flex-1 border-[#2D2D2D]"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                if (!sessionUser) return
                try {
                  await deleteReviewMutation.mutateAsync({
                    reviewId: review.id,
                    userId: sessionUser.id,
                  })
                  setIsDeleteDialogOpen(false)
                  toast('Review excluído.', 'success')
                } catch {
                  toast('Não foi possível excluir o review.', 'error')
                }
              }}
              disabled={deleteReviewMutation.isPending}
              className="flex-1"
            >
              {deleteReviewMutation.isPending ? 'Excluindo…' : 'Excluir'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Review Comments Bottom Sheet */}
      <Sheet
        isOpen={isCommentSheetOpen}
        onClose={() => setIsCommentSheetOpen(false)}
        title={copy.comments.title}
      >
        <div className="flex h-[50vh] flex-col space-y-4 pb-10">
          {/* Comments List */}
          <div className="scrollbar-none flex-1 space-y-3 overflow-y-auto pr-1">
            {review.comments && review.comments.length > 0 ? (
              review.comments.map((comment) => (
                <div
                  key={comment.id}
                  className="flex items-start gap-2.5 text-xs"
                >
                  <Avatar
                    src={comment.user?.avatarUrl || undefined}
                    fallback={comment.userId
                      .replace('u_', '')
                      .slice(0, 2)
                      .toUpperCase()}
                    size="sm"
                  />
                  <div className="flex-1 rounded-2xl border border-[#2D2D2D] bg-[#242424] p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-bold text-white">
                        @{comment.userId.replace('u_', '')}
                      </span>
                      <span className="text-[9px] text-[#808080]">
                        {new Date(comment.createdAt).toLocaleDateString(
                          'pt-BR'
                        )}
                      </span>
                    </div>
                    <p className="leading-relaxed text-[#C0C0C0]">
                      {comment.text}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-xs italic text-[#808080]">
                Nenhum comentário por aqui ainda. Lança o papo! 🗣️
              </div>
            )}
          </div>

          {/* Add Comment Input Form */}
          <form
            onSubmit={handleAddComment}
            className="mt-auto flex gap-2 border-t border-[#2D2D2D] pt-3"
          >
            <input
              type="text"
              placeholder="Comente o que achou..."
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              className="flex-1 rounded-full border border-[#2D2D2D] bg-[#242424] px-4 py-3 text-xs text-white outline-none transition-all focus:border-primary"
            />
            <Button
              type="submit"
              disabled={!newCommentText.trim()}
              className="hover:bg-primary/90 flex h-10 w-10 items-center justify-center rounded-full bg-primary p-0 text-white shadow-lg"
            >
              <Send size={15} />
            </Button>
          </form>
        </div>
      </Sheet>
    </>
  )
}
