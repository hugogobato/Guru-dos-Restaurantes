import { useParams, Link } from 'react-router-dom'
import { Settings, Trophy, UserCheck, UserPlus } from 'lucide-react'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '../../components/ui/Tabs'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { toast } from '../../components/ui/Toast'
import { ReviewCard } from '../../components/shared/ReviewCard'
import {
  useUser,
  useSessionUser,
  useReviews,
  useFollowingIds,
  useToggleFollow,
} from '../../lib/query/hooks'

export function ProfileScreen() {
  const { userId } = useParams<{ userId?: string }>()
  const { data: sessionUser } = useSessionUser()

  const targetId = userId || sessionUser?.id || 'u_me'
  const isMe = targetId === sessionUser?.id

  const { data: user, isLoading: isUserLoading } = useUser(targetId)
  const { data: reviews, isLoading: isReviewsLoading } = useReviews({
    userId: targetId,
  })
  const { data: followingIds } = useFollowingIds(sessionUser?.id ?? '')
  const toggleFollow = useToggleFollow()

  const isFollowing = !!followingIds?.includes(targetId)

  const handleToggleFollow = () => {
    if (!sessionUser) return
    toggleFollow.mutate(
      {
        followerId: sessionUser.id,
        followingId: targetId,
        follow: !isFollowing,
      },
      {
        onError: () => toast('Deu ruim, tenta de novo.', 'error'),
      }
    )
  }

  if (isUserLoading) {
    return (
      <div className="py-10 text-center text-xs text-[#808080]">
        Carregando perfil…
      </div>
    )
  }

  if (!user) {
    return (
      <div className="py-10 text-center text-xs text-[#808080]">
        Perfil não encontrado
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-6 pb-10">
      {/* Profile Header Details */}
      <div className="flex flex-col items-center space-y-3 text-center">
        <div className="relative">
          <Avatar
            src={user.avatarUrl || undefined}
            fallback={user.displayName.slice(0, 2).toUpperCase()}
            size="lg"
            className="border-2 border-primary"
          />
          {user.currentStreak > 0 && (
            <div className="absolute -bottom-1 -right-1 flex items-center gap-0.5 rounded-full bg-gradient-to-tr from-primary to-[#FF8C61] px-2 py-0.5 text-[10px] font-black text-white shadow-md">
              🔥 {user.currentStreak}
            </div>
          )}
        </div>

        <div>
          <h2 className="flex items-center justify-center gap-1 text-xl font-black text-white">
            {user.displayName}
            {user.isVerified && <span className="text-xs">✔️</span>}
          </h2>
          <p className="text-xs text-[#808080]">@{user.username}</p>
        </div>

        {user.bio && (
          <p className="max-w-sm text-xs text-[#C0C0C0]">"{user.bio}"</p>
        )}

        <div className="flex gap-4 pt-1 text-xs font-bold text-white">
          <div>
            <span className="font-black text-primary">
              {user.followerCount}
            </span>{' '}
            seguidores
          </div>
          <div>
            <span className="font-black text-primary">
              {user.followingCount}
            </span>{' '}
            seguindo
          </div>
          <div>
            <span className="font-black text-primary">
              {reviews?.length || 0}
            </span>{' '}
            reviews
          </div>
        </div>

        <div className="flex w-full gap-2 pt-2">
          {isMe ? (
            <>
              <Link to="/settings" className="flex-1">
                <Button
                  variant="outline"
                  className="h-9 w-full rounded-full border-[#2D2D2D] text-xs hover:bg-[#1A1A1A]"
                >
                  <Settings size={13} className="mr-1.5" /> Ajustes
                </Button>
              </Link>
              <Link to={`/badges/${user.id}`} className="flex-1">
                <Button
                  variant="outline"
                  className="h-9 w-full rounded-full border-[#2D2D2D] text-xs hover:bg-[#1A1A1A]"
                >
                  <Trophy size={13} className="mr-1.5" /> Conquistas
                </Button>
              </Link>
            </>
          ) : (
            <Button
              onClick={handleToggleFollow}
              disabled={toggleFollow.isPending}
              variant={isFollowing ? 'outline' : 'primary'}
              className={
                isFollowing
                  ? 'h-9 w-full rounded-full border-[#2D2D2D] text-xs text-[#A0A0A0] hover:bg-transparent'
                  : 'h-9 w-full rounded-full text-xs'
              }
            >
              {isFollowing ? (
                <>
                  <UserCheck size={13} className="mr-1.5" /> Seguindo
                </>
              ) : (
                <>
                  <UserPlus size={13} className="mr-1.5" /> Seguir
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Grid of Profile Actions / Links */}
      {isMe && (
        <div className="grid grid-cols-2 gap-2 text-xs font-bold">
          <Link
            to="/find-friends"
            className="flex items-center gap-2 rounded-xl border border-[#2D2D2D] bg-[#1A1A1A] p-3 transition-all hover:border-[#444]"
          >
            🔎 Achar amigos
          </Link>
          <Link
            to="/groups"
            className="flex items-center gap-2 rounded-xl border border-[#2D2D2D] bg-[#1A1A1A] p-3 transition-all hover:border-[#444]"
          >
            👥 Minhas Tropas
          </Link>
          <Link
            to="/lists"
            className="flex items-center gap-2 rounded-xl border border-[#2D2D2D] bg-[#1A1A1A] p-3 transition-all hover:border-[#444]"
          >
            📝 Listas Salvas
          </Link>
        </div>
      )}

      {/* Contribution Tabs */}
      <Tabs defaultValue="reviews">
        <TabsList className="grid w-full grid-cols-3 bg-[#1A1A1A]">
          <TabsTrigger value="reviews" className="text-xs">
            Reviews
          </TabsTrigger>
          <TabsTrigger value="photos" className="text-xs">
            Fotos
          </TabsTrigger>
          <TabsTrigger value="badges" className="text-xs">
            Badges
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reviews" className="mt-4 space-y-3">
          {isReviewsLoading ? (
            <div className="py-6 text-center text-xs text-[#808080]">
              Carregando papos...
            </div>
          ) : reviews && reviews.length > 0 ? (
            reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))
          ) : (
            <div className="py-10 text-center text-xs italic text-[#808080]">
              Nenhum review publicado
            </div>
          )}
        </TabsContent>

        <TabsContent value="photos" className="mt-4">
          <div className="grid grid-cols-3 gap-2">
            {reviews
              ?.flatMap((r) => r.photos)
              .map((url, idx) => (
                <div
                  key={idx}
                  className="aspect-square overflow-hidden rounded-lg border border-[#2D2D2D] bg-[#1A1A1A]"
                >
                  <img
                    src={url}
                    alt="Rango"
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            {(!reviews || reviews.flatMap((r) => r.photos).length === 0) && (
              <div className="col-span-3 py-10 text-center text-xs italic text-[#808080]">
                Nenhuma foto enviada ainda.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="badges" className="mt-4 space-y-3">
          {user.badges && user.badges.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {user.badges.map((badge) => (
                <div
                  key={badge.id}
                  className="flex items-center gap-2 rounded-lg border border-[#2D2D2D] bg-[#1A1A1A] p-2"
                >
                  <span className="text-xl">🏆</span>
                  <div>
                    <p className="text-xs font-bold text-white">{badge.name}</p>
                    <p className="text-[9px] text-[#808080]">
                      {badge.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-xs italic text-[#808080]">
              Nenhuma conquista desbloqueada ainda.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
