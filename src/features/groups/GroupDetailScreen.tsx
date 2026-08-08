import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Users, Plus, Check, Vote } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Sheet } from '../../components/ui/Sheet'
import { ReviewCard } from '../../components/shared/ReviewCard'
import {
  useGroup,
  useReviews,
  useSessionUser,
  useJoinGroup,
  useLeaveGroup,
  useRestaurants,
} from '../../lib/query/hooks'
import { calculateRestaurantRanking } from '../../domain/logic/ranking'
import { type Poll } from '../../domain/models'

export function GroupDetailScreen() {
  const { groupId } = useParams<{ groupId: string }>()
  const { data: group, isLoading: loadingGroup } = useGroup(groupId || '')
  const { data: reviews, isLoading: loadingReviews } = useReviews()
  const { data: restaurants } = useRestaurants()
  const { data: currentUser } = useSessionUser()

  const joinGroupMutation = useJoinGroup()
  const leaveGroupMutation = useLeaveGroup()

  // Tab State: 'FEED' | 'RANKING' | 'MEMBERS' | 'POLLS'
  const [activeTab, setActiveTab] = useState<
    'FEED' | 'RANKING' | 'MEMBERS' | 'POLLS'
  >('FEED')

  // Interactive Polls State
  const [polls, setPolls] = useState<Poll[]>([])

  // Poll Sheet Controls
  const [isPollSheetOpen, setIsPollSheetOpen] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptionsText, setPollOptionsText] = useState<string[]>(['', ''])

  // Initialize mock polls once group is loaded
  useEffect(() => {
    if (group) {
      setPolls([
        {
          id: `poll_${group.id}_1`,
          groupId: group.id,
          createdBy: group.adminId,
          question: 'Qual o pico do rolê de sexta à noite? 🍔',
          options: [
            {
              id: 'opt_1',
              restaurantId: null,
              text: 'Amasse o Burger (Pinheiros)',
              votes: ['u_dudacomida', 'u_guilherme'],
              voteCount: 2,
            },
            {
              id: 'opt_2',
              restaurantId: null,
              text: 'Beco do Chope (Consolação)',
              votes: ['u_carla'],
              voteCount: 1,
            },
            {
              id: 'opt_3',
              restaurantId: null,
              text: 'Sushi Vibe (Liberdade)',
              votes: [],
              voteCount: 0,
            },
          ],
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          isMultipleChoice: false,
          createdAt: new Date().toISOString(),
        },
      ])
    }
  }, [group])

  if (loadingGroup) {
    return (
      <div className="py-10 text-center text-xs text-[#808080]">
        Carregando tropa…
      </div>
    )
  }

  if (!group) {
    return (
      <div className="py-10 text-center text-xs font-bold text-red-400">
        Tropa não encontrada.
      </div>
    )
  }

  const isUserMember = group.members.some((m) => m.userId === currentUser?.id)

  // 1. Group reviews
  const groupReviews =
    reviews?.filter((r) =>
      r.targetDestinations.some(
        (dest) => dest.type === 'group' && dest.id === group.id
      )
    ) || []

  // 2. Group internal ranking calculation
  const ranked = restaurants
    ? calculateRestaurantRanking(
        restaurants,
        groupReviews,
        null,
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      )
    : []

  // Handle Joining
  const handleJoin = () => {
    if (!currentUser) return
    joinGroupMutation.mutate({ groupId: group.id, userId: currentUser.id })
  }

  // Handle Leaving
  const handleLeave = () => {
    if (!currentUser) return
    leaveGroupMutation.mutate({ groupId: group.id, userId: currentUser.id })
  }

  // Handle Poll voting
  const handleVote = (pollId: string, optionId: string) => {
    if (!currentUser) return
    setPolls((prevPolls) =>
      prevPolls.map((poll) => {
        if (poll.id !== pollId) return poll

        // Remove vote if already voted for this option, otherwise add vote
        const updatedOptions = poll.options.map((opt) => {
          const hasVoted = opt.votes.includes(currentUser.id)
          let newVotes = [...opt.votes]

          if (hasVoted) {
            newVotes = newVotes.filter((id) => id !== currentUser.id)
          } else {
            newVotes.push(currentUser.id)
          }

          // If not multiple choice, remove current user vote from all other options
          if (!hasVoted && !poll.isMultipleChoice) {
            return opt.id === optionId
              ? { ...opt, votes: newVotes, voteCount: newVotes.length }
              : {
                  ...opt,
                  votes: opt.votes.filter((id) => id !== currentUser.id),
                  voteCount: Math.max(
                    0,
                    opt.voteCount - (opt.votes.includes(currentUser.id) ? 1 : 0)
                  ),
                }
          }

          return { ...opt, votes: newVotes, voteCount: newVotes.length }
        })

        return { ...poll, options: updatedOptions }
      })
    )
  }

  // Create new poll option fields
  const handleAddOptionField = () => {
    if (pollOptionsText.length >= 6) return
    setPollOptionsText([...pollOptionsText, ''])
  }

  const handleCreatePoll = () => {
    if (!pollQuestion.trim() || !currentUser) return
    const validOptions = pollOptionsText.filter((opt) => opt.trim() !== '')
    if (validOptions.length < 2) return

    const newPoll: Poll = {
      id: `poll_${group.id}_${Date.now()}`,
      groupId: group.id,
      createdBy: currentUser.id,
      question: pollQuestion.trim(),
      options: validOptions.map((text, idx) => ({
        id: `opt_${idx}`,
        restaurantId: null,
        text: text.trim(),
        votes: [],
        voteCount: 0,
      })),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      isMultipleChoice: false,
      createdAt: new Date().toISOString(),
    }

    setPolls([newPoll, ...polls])
    setIsPollSheetOpen(false)
    setPollQuestion('')
    setPollOptionsText(['', ''])
  }

  return (
    <div className="mx-auto max-w-md space-y-5 pb-10">
      {/* Cover Image Header */}
      <div className="relative h-36 w-full overflow-hidden rounded-2xl border border-[#2D2D2D]">
        {group.coverUrl ? (
          <img
            src={group.coverUrl}
            alt={group.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="from-primary/20 to-secondary/20 flex h-full w-full items-center justify-center bg-gradient-to-tr">
            <Users size={36} className="text-primary/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
          <div>
            <h1 className="flex items-center gap-1.5 text-xl font-extrabold text-white">
              <span>👥 {group.name}</span>
            </h1>
            <p className="mt-0.5 text-[10px] text-[#A0A0A0]">
              {group.description}
            </p>
          </div>
          {isUserMember ? (
            <Button
              size="xs"
              variant="outline"
              onClick={handleLeave}
              className="h-auto rounded-full border-red-500/20 py-1 text-[9px] font-bold text-red-500 hover:bg-red-500/10"
            >
              Sair da Tropa
            </Button>
          ) : (
            <Button
              size="xs"
              onClick={handleJoin}
              className="h-auto rounded-full py-1 text-[9px] font-bold"
            >
              Participar
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <div className="rounded-xl border border-[#2D2D2D] bg-[#1A1A1A] p-2">
          <p className="text-base font-black text-primary">
            {group.memberCount}
          </p>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-[#808080]">
            Crias
          </p>
        </div>
        <div className="rounded-xl border border-[#2D2D2D] bg-[#1A1A1A] p-2">
          <p className="text-base font-black text-primary">
            {groupReviews.length}
          </p>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-[#808080]">
            Reviews
          </p>
        </div>
        <div className="rounded-xl border border-[#2D2D2D] bg-[#1A1A1A] p-2">
          <p className="text-base font-black text-primary">{polls.length}</p>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-[#808080]">
            Enquetes
          </p>
        </div>
        <div className="rounded-xl border border-[#2D2D2D] bg-[#1A1A1A] p-2">
          <p className="text-base font-black text-primary">
            {group.mandatoryMetrics.length}
          </p>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-[#808080]">
            Métricas
          </p>
        </div>
      </div>

      {/* Mandatory Metrics Badges */}
      <div className="space-y-1.5 rounded-xl border border-[#2D2D2D] bg-[#1A1A1A] p-3">
        <h4 className="text-[9px] font-bold uppercase tracking-wider text-[#808080]">
          Métricas Obrigatórias da Tropa
        </h4>
        <div className="flex flex-wrap gap-1">
          {group.mandatoryMetrics.map((m) => (
            <span
              key={m}
              className="bg-primary/10 border-primary/20 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary"
            >
              🎯 {m.toLowerCase().replace('_', ' ')}
            </span>
          ))}
        </div>
      </div>

      {/* Detail Tabs Bar */}
      <div className="flex rounded-xl border border-[#2D2D2D] bg-[#1A1A1A] p-1">
        <button
          onClick={() => setActiveTab('FEED')}
          className={`flex-1 rounded-lg py-2 text-[10px] font-extrabold uppercase tracking-wider transition-all ${
            activeTab === 'FEED'
              ? 'border border-[#2D2D2D] bg-[#242424] text-white'
              : 'text-[#808080] hover:text-white'
          }`}
        >
          Feed
        </button>
        <button
          onClick={() => setActiveTab('RANKING')}
          className={`flex-1 rounded-lg py-2 text-[10px] font-extrabold uppercase tracking-wider transition-all ${
            activeTab === 'RANKING'
              ? 'border border-[#2D2D2D] bg-[#242424] text-white'
              : 'text-[#808080] hover:text-white'
          }`}
        >
          Ranking
        </button>
        <button
          onClick={() => setActiveTab('MEMBERS')}
          className={`flex-1 rounded-lg py-2 text-[10px] font-extrabold uppercase tracking-wider transition-all ${
            activeTab === 'MEMBERS'
              ? 'border border-[#2D2D2D] bg-[#242424] text-white'
              : 'text-[#808080] hover:text-white'
          }`}
        >
          Crias
        </button>
        <button
          onClick={() => setActiveTab('POLLS')}
          className={`flex-1 rounded-lg py-2 text-[10px] font-extrabold uppercase tracking-wider transition-all ${
            activeTab === 'POLLS'
              ? 'border border-[#2D2D2D] bg-[#242424] text-white'
              : 'text-[#808080] hover:text-white'
          }`}
        >
          Enquetes
        </button>
      </div>

      {/* Tabs Content */}
      <div className="space-y-4">
        {/* -------------------- FEED TAB -------------------- */}
        {activeTab === 'FEED' && (
          <div className="space-y-4">
            {loadingReviews ? (
              <div className="py-10 text-center text-xs text-[#808080]">
                Carregando fofocas…
              </div>
            ) : groupReviews.length > 0 ? (
              groupReviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))
            ) : (
              <div className="rounded-2xl border border-[#2D2D2D] bg-[#1A1A1A] py-12 text-center">
                <p className="text-xs italic text-[#808080]">
                  Nenhum post na tropa ainda
                </p>
                {isUserMember && (
                  <Link to="/review" className="mt-2 block">
                    <Button size="xs" className="rounded-full text-[10px]">
                      Ser o primeiro a mandar a real 🚀
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* -------------------- RANKING TAB -------------------- */}
        {activeTab === 'RANKING' && (
          <div className="space-y-3">
            {ranked.length > 0 ? (
              ranked.slice(0, 10).map((item, idx) => {
                const r = item.restaurant
                return (
                  <Link key={r.id} to={`/restaurant/${r.id}`}>
                    <Card className="flex items-center justify-between gap-3 border-[#2D2D2D] bg-[#1A1A1A] p-3 transition-all hover:border-[#444]">
                      <div className="flex items-center gap-3">
                        <div className="flex w-8 flex-shrink-0 items-center justify-center">
                          {idx === 0 ? (
                            <span className="text-2xl">🥇</span>
                          ) : idx === 1 ? (
                            <span className="text-2xl">🥈</span>
                          ) : idx === 2 ? (
                            <span className="text-2xl">🥉</span>
                          ) : (
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#242424] text-sm font-black text-[#808080]">
                              {idx + 1}
                            </span>
                          )}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white">
                            {r.name}
                          </h4>
                          <p className="text-[10px] text-[#808080]">
                            {r.address.neighborhood} • {r.categories[0]}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-primary">
                          🌶️ {item.score.toFixed(1)}
                        </span>
                        <p className="text-[8px] font-bold uppercase tracking-wider text-[#808080]">
                          Nota Tropa
                        </p>
                      </div>
                    </Card>
                  </Link>
                )
              })
            ) : (
              <div className="rounded-2xl border border-[#2D2D2D] bg-[#1A1A1A] py-12 text-center">
                <p className="text-xs italic text-[#808080]">
                  Sem notas suficientes para ranking
                </p>
              </div>
            )}
          </div>
        )}

        {/* -------------------- MEMBERS TAB -------------------- */}
        {activeTab === 'MEMBERS' && (
          <Card className="space-y-3 border-[#2D2D2D] bg-[#1A1A1A] p-4 shadow-md">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Crias Participantes
            </h3>
            <div className="space-y-2">
              {group.members.map((member, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg border border-[#2D2D2D] bg-[#242424] px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full border border-[#2D2D2D] bg-[#1A1A1A] text-[10px] font-bold text-white">
                      👤
                    </div>
                    <span className="text-xs font-bold text-white">
                      {member.userId === currentUser?.id
                        ? 'Você'
                        : `@user_${member.userId.slice(2, 6)}`}
                    </span>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#808080]">
                    {group.adminId === member.userId ? 'Líder 👑' : 'Cria 🤝'}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* -------------------- POLLS TAB -------------------- */}
        {activeTab === 'POLLS' && (
          <div className="space-y-4">
            {/* Create Poll CTA */}
            {isUserMember && (
              <Button
                onClick={() => setIsPollSheetOpen(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#2D2D2D] bg-gradient-to-tr from-[#242424] to-[#2D2D2D] py-3 text-xs font-bold text-white transition-all duration-300 hover:from-primary hover:to-[#FF8C61]"
              >
                <Plus size={14} />
                <span>Nova Enquete da Tropa</span>
              </Button>
            )}

            {/* Polls list */}
            {polls.length > 0 ? (
              polls.map((poll) => {
                const totalVotes = poll.options.reduce(
                  (sum, opt) => sum + opt.voteCount,
                  0
                )
                const hasVotedAny = poll.options.some((opt) =>
                  currentUser ? opt.votes.includes(currentUser.id) : false
                )

                return (
                  <Card
                    key={poll.id}
                    className="space-y-3 border-[#2D2D2D] bg-[#1A1A1A] p-4"
                  >
                    <div>
                      <span className="bg-secondary/10 border-secondary/20 flex w-max items-center gap-0.5 rounded border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-secondary">
                        <Vote size={9} /> Votação Ativa
                      </span>
                      <h4 className="mt-1.5 text-xs font-bold text-white">
                        {poll.question}
                      </h4>
                    </div>

                    <div className="space-y-2">
                      {poll.options.map((opt) => {
                        const isSelected = currentUser
                          ? opt.votes.includes(currentUser.id)
                          : false
                        const pct =
                          totalVotes > 0
                            ? Math.round((opt.voteCount / totalVotes) * 100)
                            : 0

                        return (
                          <button
                            key={opt.id}
                            disabled={!isUserMember}
                            onClick={() => handleVote(poll.id, opt.id)}
                            className={`relative flex w-full items-center justify-between overflow-hidden rounded-lg border p-2.5 text-left text-xs font-bold transition-all duration-300 ${
                              isSelected
                                ? 'border-primary text-white'
                                : 'border-[#2D2D2D] text-[#A0A0A0] hover:text-white'
                            }`}
                          >
                            {/* Vote Percentage Visual Fill */}
                            {hasVotedAny && (
                              <div
                                className="bg-primary/5 absolute inset-y-0 left-0 transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            )}

                            <span className="relative z-10 flex items-center gap-2">
                              {isSelected && (
                                <Check
                                  size={12}
                                  className="shrink-0 text-primary"
                                />
                              )}
                              <span className="truncate">{opt.text}</span>
                            </span>

                            {hasVotedAny && (
                              <span className="relative z-10 text-[10px] font-black text-[#808080]">
                                {pct}% ({opt.voteCount})
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[9px] text-[#808080]">
                      <span>Total de votos: {totalVotes}</span>
                      <span>Encerra em breve</span>
                    </div>
                  </Card>
                )
              })
            ) : (
              <div className="rounded-2xl border border-[#2D2D2D] bg-[#1A1A1A] py-12 text-center">
                <p className="text-xs italic text-[#808080]">
                  Nenhuma enquete ativa na tropa
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* New Poll Drawer */}
      <Sheet
        isOpen={isPollSheetOpen}
        onClose={() => setIsPollSheetOpen(false)}
        title="Nova Enquete"
      >
        <div className="space-y-4 pb-8">
          {/* Question */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#A0A0A0]">
              Qual a pergunta do bonde?
            </label>
            <input
              type="text"
              placeholder="Ex: Onde vamos amassar hoje?"
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              className="w-full rounded-xl border border-[#2D2D2D] bg-[#242424] px-3 py-2 text-xs font-bold text-white outline-none focus:border-primary"
            />
          </div>

          {/* Options */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#A0A0A0]">
                Opções da Votação
              </label>
              {pollOptionsText.length < 6 && (
                <button
                  type="button"
                  onClick={handleAddOptionField}
                  className="text-[10px] font-bold text-primary hover:underline"
                >
                  + Add Opção
                </button>
              )}
            </div>
            <div className="space-y-2">
              {pollOptionsText.map((text, idx) => (
                <input
                  key={idx}
                  type="text"
                  placeholder={`Opção ${idx + 1}`}
                  value={text}
                  onChange={(e) => {
                    const nextOpts = [...pollOptionsText]
                    nextOpts[idx] = e.target.value
                    setPollOptionsText(nextOpts)
                  }}
                  className="w-full rounded-xl border border-[#2D2D2D] bg-[#242424] px-3 py-2 text-xs text-white outline-none focus:border-primary"
                />
              ))}
            </div>
          </div>

          {/* Create CTA */}
          <Button
            onClick={handleCreatePoll}
            disabled={
              !pollQuestion.trim() ||
              pollOptionsText.filter((t) => t.trim() !== '').length < 2
            }
            className="mt-2 w-full rounded-full py-3 font-bold"
          >
            Lançar Enquete 🚀
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
