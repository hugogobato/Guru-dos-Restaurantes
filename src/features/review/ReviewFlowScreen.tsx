import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Calendar,
  Users,
  DollarSign,
  Trophy,
  Check,
  AlertTriangle,
  Camera,
  Image as ImageIcon,
  X,
} from 'lucide-react'
import { Button } from '../../components/ui/Button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card'
import { Dialog } from '../../components/ui/Dialog'
import { toast } from '../../components/ui/Toast'
import {
  useRestaurants,
  usePostReview,
  useSessionUser,
  useGroups,
  useFollowing,
  useUpdateRestaurant,
} from '../../lib/query/hooks'
import { useReviewDraftStore } from '../../lib/store/reviewDraftStore'
import { MetricId, RestaurantCategory, PriceRange } from '../../domain/models'
import { getUnionOfMetrics } from '../../domain/logic/metrics-union'
import { copy } from '../../copy/pt-BR'
import { takePhoto, pickFromLibrary } from '../../lib/platform'
import { uploadImages } from '../../data/supabase/storage'
import confetti from 'canvas-confetti'

// pt-BR labels + the standard metrics every review can rate (optional), shown
// regardless of which tropas/groups the review is posted to.
const METRIC_LABELS: Partial<Record<MetricId, string>> = {
  [MetricId.TASTE]: 'Sabor',
  [MetricId.SERVICE]: 'Atendimento',
  [MetricId.WAIT_TIME]: 'Tempo de Espera',
  [MetricId.COST_BENEFIT]: 'Custo-benefício',
  [MetricId.PORTION]: 'Fartura',
  [MetricId.VIBE]: 'Ambiente / Vibe',
  [MetricId.CLEANLINESS]: 'Limpeza',
  [MetricId.DRINKS]: 'Bebidas',
}
const STANDARD_METRICS: MetricId[] = [
  MetricId.TASTE,
  MetricId.SERVICE,
  MetricId.WAIT_TIME,
  MetricId.COST_BENEFIT,
  MetricId.PORTION,
  MetricId.VIBE,
  MetricId.CLEANLINESS,
  MetricId.DRINKS,
]
const MAX_PHOTOS = 4

// Zod Validation Schema
const reviewSchema = z
  .object({
    isNewRestaurant: z.boolean(),
    restaurantId: z.string().optional(),
    // New restaurant fields
    newRestaurantName: z.string().optional(),
    newCuisine: z.nativeEnum(RestaurantCategory).optional(),
    newNeighborhood: z.string().optional(),
    newPriceRange: z.nativeEnum(PriceRange).optional(),
    // Other fields
    visitDate: z.string().min(1, 'Selecione a data, parça'),
    partySize: z.number().min(1, 'Deve ter pelo menos 1 pessoa'),
    totalSpent: z.number().positive('Gasto deve ser positivo, chef').optional(),
    comment: z
      .string()
      .max(200, 'Mural de no máximo 200 caracteres')
      .optional(),
    overallScore: z.number().min(1).max(5),
  })
  .superRefine((data, ctx) => {
    if (data.isNewRestaurant) {
      if (!data.newRestaurantName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Nome do pico é obrigatório',
          path: ['newRestaurantName'],
        })
      }
      if (!data.newCuisine) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Culinária é obrigatória',
          path: ['newCuisine'],
        })
      }
      if (!data.newNeighborhood) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Bairro é obrigatório',
          path: ['newNeighborhood'],
        })
      }
      if (!data.newPriceRange) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Preço é obrigatório',
          path: ['newPriceRange'],
        })
      }
    } else {
      if (!data.restaurantId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Selecione o pico, chef',
          path: ['restaurantId'],
        })
      }
    }
  })

type ReviewFormValues = z.infer<typeof reviewSchema>

const STEPS = {
  WHERE_WHEN: 1,
  PARTY_COST: 2,
  METRICS_COMMENT: 3,
  PREVIEW: 4,
}

export function ReviewFlowScreen() {
  const navigate = useNavigate()
  const [step, setStep] = useState(STEPS.WHERE_WHEN)

  // Queries & Mutations
  const { data: restaurants } = useRestaurants()
  const { data: sessionUser } = useSessionUser()
  const { data: groups } = useGroups()
  const { data: followingList } = useFollowing(sessionUser?.id || '')

  const createRestaurantMutation = useUpdateRestaurant()
  const postReviewMutation = usePostReview()

  // Zustand Store for persistence
  const draft = useReviewDraftStore()

  // React Hook Form Configuration
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      isNewRestaurant: false,
      restaurantId: draft.restaurantId,
      visitDate: draft.visitDate,
      partySize: draft.partySize,
      totalSpent: draft.totalSpent,
      overallScore: draft.overallScore,
      comment: draft.comment,
    },
  })

  // Watch fields for dynamic updates
  const isNewRestaurant = watch('isNewRestaurant')
  const formRestaurantId = watch('restaurantId')
  const formVisitDate = watch('visitDate')
  const formPartySize = watch('partySize')
  const formTotalSpent = watch('totalSpent')
  const formOverallScore = watch('overallScore')
  const formComment = watch('comment')

  // Companions and targets checklist state
  const [selectedCompanions, setSelectedCompanions] = useState<string[]>(
    draft.companions
  )
  const [selectedDestinations, setSelectedDestinations] = useState<
    { type: 'profile' | 'group'; id: string }[]
  >(draft.targetDestinations)
  const [metricRatings, setMetricRatings] = useState<Record<string, number>>(
    draft.metrics
  )
  // Real photos of the place (data URLs). Kept in local state only — base64 in the
  // persisted draft would blow the localStorage quota.
  const [photos, setPhotos] = useState<string[]>([])

  // Reviews can only be shared with groups where the current user is a member.
  // Keeping this list scoped also makes the destination picker much easier to
  // understand when there are many public groups in the app.
  const memberGroups = useMemo(
    () =>
      groups?.filter((group) =>
        group.members.some((member) => member.userId === sessionUser?.id)
      ) || [],
    [groups, sessionUser?.id]
  )
  const memberGroupIds = useMemo(
    () => new Set(memberGroups.map((group) => group.id)),
    [memberGroups]
  )
  const sessionUserId = sessionUser?.id
  // Older drafts used the mock-only `u_me` profile id. Rebind that mandatory
  // destination during render and discard stale group picks before publishing.
  const normalizedDestinations = useMemo(() => {
    if (!sessionUserId) return selectedDestinations
    return [
      { type: 'profile' as const, id: sessionUserId },
      ...selectedDestinations.filter(
        (destination) =>
          destination.type === 'group' && memberGroupIds.has(destination.id)
      ),
    ]
  }, [memberGroupIds, selectedDestinations, sessionUserId])

  // Duel trigger popup state
  const [showDuelDialog, setShowDuelDialog] = useState(false)
  const [duelDetails, setDuelDetails] = useState<{
    aId: string
    bId: string
    cuisine: RestaurantCategory
  } | null>(null)

  // Persist form state changes in Zustand
  useEffect(() => {
    draft.updateDraft({
      restaurantId: formRestaurantId,
      visitDate: formVisitDate,
      partySize: formPartySize,
      totalSpent: formTotalSpent,
      overallScore: formOverallScore,
      comment: formComment,
      companions: selectedCompanions,
      targetDestinations: normalizedDestinations,
      metrics: metricRatings,
    })
  }, [
    formRestaurantId,
    formVisitDate,
    formPartySize,
    formTotalSpent,
    formOverallScore,
    formComment,
    selectedCompanions,
    normalizedDestinations,
    metricRatings,
  ])

  // Compute union of mandatory metrics based on selected groups
  const activeGroups =
    groups?.filter((g) =>
      normalizedDestinations.some((d) => d.type === 'group' && d.id === g.id)
    ) || []
  const unionMetrics = getUnionOfMetrics(
    activeGroups.map((g) => g.mandatoryMetrics)
  )

  const handleNext = () => setStep(step + 1)
  const handleBack = () => setStep(step - 1)

  const toggleCompanion = (id: string) => {
    setSelectedCompanions((prev) => {
      const updated = prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id]
      // Sync partySize automatically with companions count + 1
      setValue('partySize', updated.length + 1)
      return updated
    })
  }

  const toggleDestination = (type: 'profile' | 'group', id: string) => {
    setSelectedDestinations((prev) => {
      if (type === 'profile') {
        return [
          { type, id },
          ...prev.filter((destination) => destination.type === 'group'),
        ]
      }
      const exists = prev.some((d) => d.type === type && d.id === id)
      if (exists) {
        return prev.filter((d) => !(d.type === type && d.id === id))
      }
      return [...prev, { type, id }]
    })
  }

  const handleMetricRate = (metric: string, rating: number) => {
    setMetricRatings((prev) => ({ ...prev, [metric]: rating }))
  }

  const handleAddPhoto = async (source: 'camera' | 'gallery') => {
    if (photos.length >= MAX_PHOTOS) {
      toast(`Máximo de ${MAX_PHOTOS} fotos, chef`, 'info')
      return
    }
    const photo =
      source === 'camera' ? await takePhoto() : await pickFromLibrary()
    if (photo) setPhotos((prev) => [...prev, photo])
  }

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx))
  }

  // Final Publish Handler
  const onSubmitForm = async (values: ReviewFormValues) => {
    if (!sessionUser) return

    let finalRestaurantId = values.restaurantId || ''
    let cuisineType = RestaurantCategory.PODRAO

    // Upload photos to Supabase Storage up front; reuse the public URLs for both
    // the new-restaurant record and the review (falls back to inline if Storage
    // is unreachable).
    const uploadedPhotos =
      photos.length > 0
        ? await uploadImages(photos, `reviews/${sessionUser.id}`)
        : []

    // 1. Register Lugar Novo if applicable
    if (values.isNewRestaurant) {
      const newId = `r_${Math.random().toString(36).substring(2, 9)}`
      cuisineType = values.newCuisine || RestaurantCategory.PODRAO
      const newRest = {
        id: newId,
        name: values.newRestaurantName || 'Pico Desconhecido',
        description: 'Lugar novo adicionado pela galera',
        categories: [cuisineType],
        priceRange: values.newPriceRange || PriceRange.MODERATE,
        address: {
          street: 'Rua Principal',
          number: 'S/N',
          complement: null,
          neighborhood: values.newNeighborhood || 'Centro',
          city: sessionUser.preferences.defaultCity || 'São Paulo',
          state: sessionUser.preferences.defaultState || 'SP',
          zipCode: null,
          fullFormatted: `${values.newNeighborhood || 'Centro'}, ${sessionUser.preferences.defaultCity || 'São Paulo'}`,
        },
        coordinates: null,
        phone: null,
        website: null,
        openingHours: null,
        photos: uploadedPhotos,
        menuPhotos: [],
        averageOverallScore: values.overallScore,
        averageMetrics: {
          [MetricId.TASTE]:
            metricRatings[MetricId.TASTE] || values.overallScore,
          [MetricId.COST_BENEFIT]:
            metricRatings[MetricId.COST_BENEFIT] || values.overallScore,
        } as Record<MetricId, number>,
        reviewCount: 1,
        vibeCheckCount: 0,
        isOpenNow: null,
        illnessReports90d: 0,
        illnessWarning: false,
        eloByCuisine: { [cuisineType]: 1000 },
        createdAt: new Date().toISOString(),
      }
      try {
        await createRestaurantMutation.mutateAsync(newRest)
        finalRestaurantId = newId
      } catch {
        toast('Erro ao cadastrar novo pico', 'error')
        return
      }
    } else {
      const r = restaurants?.find((x) => x.id === finalRestaurantId)
      if (r && r.categories[0]) {
        cuisineType = r.categories[0]
      }
    }

    // 2. Filter Destinations by Mandatory Metrics Rule
    const satisfiedDestinations: typeof selectedDestinations = []
    const unsatisfiedGroupNames: string[] = []

    normalizedDestinations.forEach((dest) => {
      if (dest.type === 'profile') {
        satisfiedDestinations.push(dest)
        return
      }
      // Check if group mandatory metrics are met
      const group = groups?.find((g) => g.id === dest.id)
      if (group) {
        const isSatisfied = group.mandatoryMetrics.every((m) => {
          const rating = metricRatings[m]
          return rating !== undefined && rating > 0
        })
        if (isSatisfied) {
          satisfiedDestinations.push(dest)
        } else {
          unsatisfiedGroupNames.push(group.name)
        }
      }
    })

    // 3. Post Review
    const reviewData = {
      userId: sessionUser.id,
      restaurantId: finalRestaurantId,
      overallScore: values.overallScore,
      visitDate: values.visitDate,
      comment: values.comment || null,
      photos: uploadedPhotos,
      companions: selectedCompanions,
      targetDestinations: satisfiedDestinations,
      receiptPhoto: null,
      totalSpent: values.totalSpent,
      partySize: values.partySize,
      metrics: metricRatings as Record<MetricId, number>,
    }

    try {
      await postReviewMutation.mutateAsync(reviewData)

      // Success triggers confetti
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.8 },
      })

      // Alert about unsatisfied group limits
      if (unsatisfiedGroupNames.length > 0) {
        toast(
          `Review postado, mas faltou métrica para: ${unsatisfiedGroupNames.join(', ')} ⚠️`,
          'info'
        )
      } else {
        toast('Mandou a real com sucesso! 🔥', 'success')
      }

      // Reset Zustand Draft store
      draft.resetDraft()

      // 4. ELO Duel Trigger logic (visited 2 of C in 30 days)

      // Check if user has reviewed another restaurant of same cuisine category in last 30 days
      const mockCuisineReviews =
        restaurants?.filter(
          (r) =>
            r.id !== finalRestaurantId && r.categories.includes(cuisineType)
        ) || []

      if (mockCuisineReviews.length > 0) {
        const previousId = mockCuisineReviews[0].id
        setDuelDetails({
          aId: finalRestaurantId,
          bId: previousId,
          cuisine: cuisineType,
        })
        setShowDuelDialog(true)
      } else {
        navigate('/')
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Deu ruim ao postar review!'
      toast(msg, 'error')
    }
  }

  const perPersonCost =
    formTotalSpent && formPartySize > 0
      ? (formTotalSpent / formPartySize).toFixed(0)
      : null

  return (
    <div className="mx-auto max-w-md space-y-6 pb-16">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-white">
          <span>{copy.cta.reviewPrimary}</span>
        </h1>
        <p className="mt-1 text-xs text-[#A0A0A0]">Sua resenha gastronômica</p>
      </div>

      <form onSubmit={handleSubmit(onSubmitForm)}>
        {/* Step 1: Onde e Quando */}
        {step === STEPS.WHERE_WHEN && (
          <Card className="space-y-4 border-[#2D2D2D] bg-[#1A1A1A] p-4">
            <CardHeader className="p-0">
              <CardTitle className="text-sm font-bold text-white">
                Passo 1: Onde e Quando?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-0 pt-2">
              {/* Lugar Novo toggle switch */}
              <div className="flex items-center justify-between rounded-xl border border-[#2D2D2D] bg-[#242424] p-3">
                <div>
                  <p className="text-xs font-bold text-white">
                    Pico não tá na lista?
                  </p>
                  <p className="text-[10px] text-[#808080]">
                    Cadastrar pico novo no radar
                  </p>
                </div>
                <input
                  type="checkbox"
                  {...register('isNewRestaurant')}
                  className="h-5 w-9 cursor-pointer accent-primary"
                />
              </div>

              {!isNewRestaurant ? (
                // Dropdown of existing restaurants
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#A0A0A0]">
                    Escolher Pico
                  </label>
                  <select
                    {...register('restaurantId')}
                    className="w-full rounded-xl border border-[#2D2D2D] bg-[#242424] px-3 py-3 text-xs text-white focus:border-primary focus:outline-none"
                  >
                    <option value="">Selecione o pico...</option>
                    {restaurants?.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.address.neighborhood})
                      </option>
                    ))}
                  </select>
                  {errors.restaurantId && (
                    <p className="text-[10px] font-semibold text-destructive">
                      {errors.restaurantId.message}
                    </p>
                  )}
                </div>
              ) : (
                // Add Lugar Novo detailed fields
                <div className="space-y-3 rounded-xl border border-dashed border-[#3D3D3D] bg-[#242424]/50 p-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-[#A0A0A0]">
                      Nome do Pico
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Podrão do Zé"
                      {...register('newRestaurantName')}
                      className="w-full rounded-lg border border-[#2D2D2D] bg-[#242424] px-3 py-2 text-xs text-white"
                    />
                    {errors.newRestaurantName && (
                      <p className="text-[9px] font-semibold text-destructive">
                        {errors.newRestaurantName.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-[#A0A0A0]">
                      Culinária
                    </label>
                    <select
                      {...register('newCuisine')}
                      className="w-full rounded-lg border border-[#2D2D2D] bg-[#242424] px-3 py-2 text-xs text-white"
                    >
                      <option value="">Selecione...</option>
                      {Object.values(RestaurantCategory).map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    {errors.newCuisine && (
                      <p className="text-[9px] font-semibold text-destructive">
                        {errors.newCuisine.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-[#A0A0A0]">
                      Bairro
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Pinheiros"
                      {...register('newNeighborhood')}
                      className="w-full rounded-lg border border-[#2D2D2D] bg-[#242424] px-3 py-2 text-xs text-white"
                    />
                    {errors.newNeighborhood && (
                      <p className="text-[9px] font-semibold text-destructive">
                        {errors.newNeighborhood.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-[#A0A0A0]">
                      Preço Estimado
                    </label>
                    <select
                      {...register('newPriceRange')}
                      className="w-full rounded-lg border border-[#2D2D2D] bg-[#242424] px-3 py-2 text-xs text-white"
                    >
                      <option value="">Selecione...</option>
                      {Object.values(PriceRange).map((price) => (
                        <option key={price} value={price}>
                          {price}
                        </option>
                      ))}
                    </select>
                    {errors.newPriceRange && (
                      <p className="text-[9px] font-semibold text-destructive">
                        {errors.newPriceRange.message}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="flex items-center gap-1 text-xs font-bold text-[#A0A0A0]">
                  <Calendar size={13} /> Data do Rolê
                </label>
                <input
                  type="date"
                  {...register('visitDate')}
                  className="w-full rounded-xl border border-[#2D2D2D] bg-[#242424] px-3 py-3 text-xs text-white"
                />
              </div>

              <Button
                type="button"
                onClick={handleNext}
                disabled={!isNewRestaurant ? !formRestaurantId : false}
                className="w-full rounded-full"
              >
                Próximo
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Galera e Grana */}
        {step === STEPS.PARTY_COST && (
          <Card className="space-y-4 border-[#2D2D2D] bg-[#1A1A1A] p-4">
            <CardHeader className="p-0">
              <CardTitle className="text-sm font-bold text-white">
                Passo 2: Galera e Grana
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-0 pt-2">
              {/* Companions Checkbox list */}
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-[#A0A0A0]">
                  <Users size={13} /> Quem colou junto? (Companions)
                </label>
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pr-1">
                  {followingList?.map((user) => {
                    const isSelected = selectedCompanions.includes(user.id)
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => toggleCompanion(user.id)}
                        className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all ${
                          isSelected
                            ? 'bg-primary/10 border-primary text-white'
                            : 'border-[#2D2D2D] bg-[#242424] text-[#808080]'
                        }`}
                      >
                        {isSelected && (
                          <Check size={10} className="text-primary" />
                        )}
                        <span>@{user.username}</span>
                      </button>
                    )
                  })}
                  {(!followingList || followingList.length === 0) && (
                    <p className="text-[10px] italic text-[#666]">
                      Siga crias para convidá-los
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1 text-xs font-bold text-[#A0A0A0]">
                    <DollarSign size={13} /> Valor Gasto
                  </label>
                  <input
                    type="number"
                    placeholder="Total R$"
                    {...register('totalSpent', { valueAsNumber: true })}
                    className="w-full rounded-xl border border-[#2D2D2D] bg-[#242424] px-3 py-3 text-xs text-white"
                  />
                  {errors.totalSpent && (
                    <p className="text-[9px] font-semibold text-destructive">
                      {errors.totalSpent.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#A0A0A0]">
                    Pessoas
                  </label>
                  <input
                    type="number"
                    min="1"
                    {...register('partySize', { valueAsNumber: true })}
                    className="w-full rounded-xl border border-[#2D2D2D] bg-[#242424] px-3 py-3 text-xs text-white"
                  />
                </div>
              </div>

              {perPersonCost && (
                <div className="bg-primary/10 border-primary/20 rounded-xl border p-3 text-center">
                  <p className="text-xs text-[#A0A0A0]">Gasto por cabeça</p>
                  <p className="text-lg font-black text-primary">
                    R$ {perPersonCost}/pessoa
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  className="flex-1 rounded-full border-[#2D2D2D]"
                >
                  Voltar
                </Button>
                <Button
                  type="button"
                  onClick={handleNext}
                  className="flex-1 rounded-full"
                >
                  Próximo
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Destinos e Regra */}
        {step === STEPS.METRICS_COMMENT && (
          <Card className="space-y-4 border-[#2D2D2D] bg-[#1A1A1A] p-4">
            <CardHeader className="p-0">
              <CardTitle className="text-sm font-bold text-white">
                Passo 3: Notas e Destinos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-0 pt-2">
              {/* Target Destinations */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#A0A0A0]">
                  Postar onde?
                </label>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      toggleDestination('profile', sessionUser?.id || '')
                    }
                    className="bg-primary/10 flex items-center justify-between rounded-xl border border-primary p-2.5 text-left text-xs font-bold text-white"
                  >
                    <span>👤 Meu Perfil (Obrigatório)</span>
                    <Check size={14} className="text-primary" />
                  </button>

                  {memberGroups.map((g) => {
                    const isSelected = normalizedDestinations.some(
                      (d) => d.type === 'group' && d.id === g.id
                    )
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => toggleDestination('group', g.id)}
                        className={`flex items-center justify-between rounded-xl border p-2.5 text-left text-xs font-bold ${
                          isSelected
                            ? 'bg-primary/10 border-primary text-white'
                            : 'border-[#2D2D2D] bg-[#242424] text-[#A0A0A0]'
                        }`}
                      >
                        <div>
                          <p>👥 Tropa: {g.name}</p>
                          <p className="mt-0.5 text-[9px] text-[#808080]">
                            Exige: {g.mandatoryMetrics.join(', ')}
                          </p>
                        </div>
                        {isSelected && (
                          <Check size={14} className="text-primary" />
                        )}
                      </button>
                    )
                  })}
                  {memberGroups.length === 0 && (
                    <p className="rounded-xl border border-dashed border-[#3D3D3D] p-3 text-[10px] text-[#808080]">
                      Você ainda não participa de nenhuma tropa. Entre em uma em
                      Minhas Tropas para publicar nela.
                    </p>
                  )}
                </div>
              </div>

              {/* Dynamic Union Metric Sliders */}
              {unionMetrics.length > 0 && (
                <div className="space-y-3.5 rounded-xl border border-[#2D2D2D] bg-[#242424]/40 p-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#808080]">
                    Métricas Obrigatórias das Tropas
                  </h4>
                  {unionMetrics.map((metric) => {
                    const val = metricRatings[metric] || 3
                    return (
                      <div key={metric} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-white">
                          <span>{metric}</span>
                          <span>{val}/5</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="5"
                          value={val}
                          onChange={(e) =>
                            handleMetricRate(metric, Number(e.target.value))
                          }
                          className="w-full bg-[#2D2D2D] accent-primary"
                        />
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Standard optional metrics — always available (Sabor, Atendimento, etc.) */}
              <div className="space-y-3 rounded-xl border border-[#2D2D2D] bg-[#242424]/40 p-3">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#808080]">
                  Notas detalhadas (opcional)
                </h4>
                {STANDARD_METRICS.map((metric) => {
                  const val = metricRatings[metric] ?? 0
                  return (
                    <div
                      key={metric}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-xs font-bold text-white">
                        {METRIC_LABELS[metric]}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => handleMetricRate(metric, n)}
                            className="text-base leading-none"
                            aria-label={`${METRIC_LABELS[metric]} ${n}`}
                          >
                            {n <= val ? '🌶️' : '⚪'}
                          </button>
                        ))}
                        {val > 0 && (
                          <button
                            type="button"
                            onClick={() => handleMetricRate(metric, 0)}
                            className="ml-0.5 text-[#666] hover:text-white"
                            aria-label="Limpar nota"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Photos of the place (camera or gallery) */}
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-[#A0A0A0]">
                  <ImageIcon size={13} /> Fotos do rolê (opcional)
                </label>
                {photos.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {photos.map((src, idx) => (
                      <div
                        key={idx}
                        className="relative aspect-square overflow-hidden rounded-lg border border-[#2D2D2D]"
                      >
                        <img
                          src={src}
                          alt={`Foto ${idx + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(idx)}
                          className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 text-white hover:bg-black"
                          aria-label="Remover foto"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {photos.length < MAX_PHOTOS && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleAddPhoto('camera')}
                      className="h-9 flex-1 rounded-full border-[#2D2D2D] text-xs"
                    >
                      <Camera size={13} className="mr-1.5" /> Tirar foto
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleAddPhoto('gallery')}
                      className="h-9 flex-1 rounded-full border-[#2D2D2D] text-xs"
                    >
                      <ImageIcon size={13} className="mr-1.5" /> Galeria /
                      Google Fotos
                    </Button>
                  </div>
                )}
              </div>

              {/* Overall Score */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#A0A0A0]">
                  Nota Geral
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setValue('overallScore', star)}
                      className="text-2xl"
                    >
                      {star <= formOverallScore ? '🌶️' : '⚪'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Comment text area */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#A0A0A0]">
                  Comentário
                </label>
                <textarea
                  placeholder="Comenta aí o que achou..."
                  rows={3}
                  {...register('comment')}
                  className="w-full rounded-xl border border-[#2D2D2D] bg-[#242424] p-3 text-xs text-white outline-none focus:border-primary"
                />
                {errors.comment && (
                  <p className="text-[9px] font-semibold text-destructive">
                    {errors.comment.message}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  className="flex-1 rounded-full border-[#2D2D2D]"
                >
                  Voltar
                </Button>
                <Button
                  type="button"
                  onClick={handleNext}
                  className="flex-1 rounded-full"
                >
                  Ver Resumo
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Preview / Resumo */}
        {step === STEPS.PREVIEW && (
          <Card className="space-y-4 border-[#2D2D2D] bg-[#1A1A1A] p-4">
            <CardHeader className="p-0">
              <CardTitle className="text-sm font-bold text-white">
                Resumo do Review
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-0 pt-2">
              <div className="space-y-2 rounded-xl bg-[#242424] p-3 text-xs text-[#E0E0E0]">
                <p>
                  <span className="font-bold text-white">📍 Pico:</span>{' '}
                  {isNewRestaurant
                    ? watch('newRestaurantName') || 'Novo Pico'
                    : restaurants?.find((r) => r.id === formRestaurantId)?.name}
                </p>
                <p>
                  <span className="font-bold text-white">📅 Data:</span>{' '}
                  {formVisitDate}
                </p>
                {perPersonCost && (
                  <p>
                    <span className="font-bold text-white">💸 Gasto:</span> R${' '}
                    {perPersonCost}/pessoa
                  </p>
                )}
                <p>
                  <span className="font-bold text-white">🌶️ Nota Geral:</span>{' '}
                  {formOverallScore}/5
                </p>
                {formComment && (
                  <p>
                    <span className="font-bold text-white">💬 Mural:</span> "
                    {formComment}"
                  </p>
                )}
                {photos.length > 0 && (
                  <p>
                    <span className="font-bold text-white">📸 Fotos:</span>{' '}
                    {photos.length}
                  </p>
                )}
              </div>

              {/* Group validation status list */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#808080]">
                  Tropas Destinatárias
                </h4>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between rounded-lg bg-[#242424] px-3 py-2 text-xs">
                    <span className="text-white">👤 Meu Perfil</span>
                    <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-500">
                      OK
                    </span>
                  </div>

                  {activeGroups.map((group) => {
                    const isSatisfied = group.mandatoryMetrics.every((m) => {
                      const rating = metricRatings[m]
                      return rating !== undefined && rating > 0
                    })
                    return (
                      <div
                        key={group.id}
                        className="flex items-center justify-between rounded-lg bg-[#242424] px-3 py-2 text-xs"
                      >
                        <span className="text-white">👥 {group.name}</span>
                        {isSatisfied ? (
                          <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-500">
                            OK
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 rounded border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[9px] font-black uppercase text-red-500">
                            <AlertTriangle size={8} /> Sem Métricas
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  className="flex-1 rounded-full border-[#2D2D2D]"
                >
                  Voltar
                </Button>
                <Button
                  type="submit"
                  className="flex-1 rounded-full bg-gradient-to-tr from-primary to-[#FF8C61] font-bold"
                >
                  {copy.cta.publish}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </form>

      {/* ELO Duel Trigger Modal */}
      <Dialog
        isOpen={showDuelDialog}
        onClose={() => navigate('/')}
        title="Bora um Duelo? 🥊"
      >
        <div className="space-y-4 p-2 text-center">
          <div className="bg-primary/10 border-primary/20 mx-auto flex h-12 w-12 items-center justify-center rounded-full border text-primary">
            <Trophy size={22} />
          </div>
          <p className="text-xs leading-relaxed text-[#A0A0A0]">
            Você avaliou dois picos da culinária{' '}
            <span className="font-bold text-primary">
              {duelDetails?.cuisine}
            </span>{' '}
            recentemente. Decida quem é o verdadeiro campeão agora mesmo!
          </p>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              type="button"
              onClick={() => navigate('/duel')}
              className="w-full rounded-full bg-gradient-to-tr from-primary to-[#FF8C61] text-xs font-bold"
            >
              🥊 Entrar no Duelo
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate('/')}
              className="w-full text-xs text-[#808080] hover:text-white"
            >
              Depois
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
