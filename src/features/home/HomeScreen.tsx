import { Link } from 'react-router-dom'
import { Sparkles, Trophy, Plus, MapPin } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import {
  useRestaurants,
  useReviews,
  useStories,
  useSessionUser,
} from '../../lib/query/hooks'
import { ReviewCard } from '../../components/shared/ReviewCard'
import { LazyImage } from '../../components/shared/LazyImage'
import {
  ReviewCardSkeleton,
  RestaurantCardSkeleton,
} from '../../components/shared/Skeletons'
import { copy } from '../../copy/pt-BR'

export function HomeScreen() {
  const { data: restaurants, isLoading: isRestaurantsLoading } =
    useRestaurants()
  const { data: reviews, isLoading: isReviewsLoading } = useReviews()
  const { data: stories } = useStories()
  const { data: sessionUser } = useSessionUser()

  return (
    <div className="space-y-6">
      {/* Stories Horizontal Rail */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#808080]">
          Stories da Galera
        </h3>
        <div className="scrollbar-none flex gap-3 overflow-x-auto pb-2">
          {/* Post Story Add button → opens the composer directly (compose=1) */}
          <Link
            to="/stories?compose=1"
            className="flex flex-shrink-0 flex-col items-center gap-1.5"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-[#2D2D2D] bg-[#1A1A1A] transition-all hover:bg-[#252525]">
              <Plus size={20} className="text-primary" />
            </div>
            <span className="text-[10px] font-medium text-[#A0A0A0]">
              Postar
            </span>
          </Link>

          {/* Stories list (gradient ring = unseen, muted ring = already seen) */}
          {stories && stories.length > 0 ? (
            stories.map((story) => {
              const seen =
                !!sessionUser && story.viewers.includes(sessionUser.id)
              const storyUsername = (
                story.user?.username ?? story.userId.replace('u_', '')
              ).replace(/^@/, '')
              return (
                <Link
                  key={story.id}
                  to="/stories"
                  className="flex flex-shrink-0 flex-col items-center gap-1.5"
                >
                  <div
                    className={`relative rounded-full p-0.5 ${
                      seen
                        ? 'bg-[#3A3A3A]'
                        : 'bg-gradient-to-tr from-primary to-[#FF8C61] shadow-[0_0_10px_rgba(255,107,53,0.2)]'
                    }`}
                  >
                    <div className="h-14 w-14 overflow-hidden rounded-full border-2 border-[#0F0F0F] bg-[#242424]">
                      <LazyImage
                        src={story.photoUrl}
                        alt={`Story de ${storyUsername}`}
                        fallback="📸"
                      />
                    </div>
                  </div>
                  <span className="max-w-[60px] truncate text-[10px] font-medium text-white">
                    {storyUsername}
                  </span>
                </Link>
              )
            })
          ) : (
            <div className="flex items-center pl-2 text-xs italic text-[#666]">
              Nenhum story ativo
            </div>
          )}
        </div>
      </section>

      {/* Vibe Checks Horizontal Rail */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#808080]">
          Como tá o rolê? (Vibe Check)
        </h3>
        <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
          {['🤠 Vazio', '🔥 Bombando', '⏳ Fila Gigante', '🎵 Som Alto'].map(
            (vibe, idx) => (
              <Badge
                key={idx}
                variant="outline"
                className="flex-shrink-0 cursor-pointer border-[#2D2D2D] bg-[#1A1A1A] px-3 py-2 text-xs hover:bg-[#252525]"
              >
                {vibe}
              </Badge>
            )
          )}
        </div>
      </section>

      {/* Top CTA Banner */}
      <Card className="from-secondary/25 relative overflow-hidden border-none bg-gradient-to-r to-[#7B61FF]/10 text-white shadow-lg">
        <div className="absolute right-0 top-0 -translate-y-4 translate-x-4 text-secondary opacity-15">
          <Sparkles size={120} />
        </div>
        <CardContent className="relative z-10 flex flex-col gap-3 p-5">
          <div className="flex items-center gap-1 text-xs font-extrabold uppercase tracking-widest text-secondary">
            <Sparkles size={12} className="animate-pulse" />
            <span>Indicação da IA</span>
          </div>
          <div>
            <h4 className="text-base font-extrabold">
              Sem criatividade pro rango de hoje?
            </h4>
            <p className="mt-1 text-xs text-[#C5B8FF]">
              Nossa IA vasculha os gostos do seu bonde e decide o melhor lugar
              pra vcs.
            </p>
          </div>
          <Link to="/ai">
            <Button
              size="sm"
              className="hover:bg-secondary/90 w-max rounded-full bg-secondary text-xs font-bold text-white"
            >
              {copy.roulette.cta}
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Recommended Restaurants / Feed Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-white">
            <Trophy size={16} className="text-primary" />
            <span>Melhores Próximos</span>
          </h3>
          <Link
            to="/search"
            className="text-xs font-bold text-primary hover:underline"
          >
            Ver tudo
          </Link>
        </div>

        {isRestaurantsLoading ? (
          <div className="grid gap-4">
            <RestaurantCardSkeleton />
            <RestaurantCardSkeleton />
            <RestaurantCardSkeleton />
          </div>
        ) : (
          <div className="grid gap-4">
            {restaurants?.slice(0, 3).map((restaurant) => (
              <Card
                key={restaurant.id}
                className="overflow-hidden border-[#2D2D2D] bg-[#1A1A1A] transition-all hover:border-[#444]"
              >
                <Link to={`/restaurant/${restaurant.id}`}>
                  <div className="relative h-32 overflow-hidden bg-[#2D2D2D]">
                    <LazyImage
                      src={restaurant.photos?.[0]}
                      alt={restaurant.name}
                    />
                    <div className="absolute right-2 top-2">
                      <Badge className="border-none bg-[#0F0F0F]/80 px-2 py-0.5 font-bold text-white">
                        {restaurant.priceRange}
                      </Badge>
                    </div>
                  </div>
                  <CardHeader className="p-4 pb-0">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base font-bold text-white">
                        {restaurant.name}
                      </CardTitle>
                      {restaurant.averageOverallScore && (
                        <div className="bg-primary/15 flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-bold text-primary">
                          🌶️ {restaurant.averageOverallScore.toFixed(1)}
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 p-4 pt-1">
                    <p className="line-clamp-1 flex items-center gap-1 text-xs text-[#A0A0A0]">
                      <MapPin size={11} /> {restaurant.address.neighborhood},{' '}
                      {restaurant.address.city}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {restaurant.categories.map((cat, idx) => (
                        <span
                          key={idx}
                          className="rounded bg-[#2A2A2A] px-2 py-0.5 text-[10px] font-medium text-white"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Feed of Reviews */}
      <section className="space-y-4">
        <h3 className="text-sm font-extrabold text-white">Últimas do Bonde</h3>
        {isReviewsLoading ? (
          <div className="space-y-4">
            <ReviewCardSkeleton />
            <ReviewCardSkeleton />
          </div>
        ) : reviews && reviews.length > 0 ? (
          <div className="space-y-4">
            {reviews.slice(0, 3).map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-xs italic text-[#808080]">
            Nenhum review por aqui ainda. Bora postar um!
          </div>
        )}
      </section>
    </div>
  )
}
