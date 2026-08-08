import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { db } from '../../data/repositoryProvider'
import {
  type CustomList,
  type Review,
  type Story,
  type RestaurantDuel,
  RestaurantCategory,
  IllnessSymptom,
} from '../../domain/models'

// ==========================================
// USER & SESSION HOOKS
// ==========================================

export function useSessionUser() {
  return useQuery({
    queryKey: ['sessionUser'],
    queryFn: () => db.session.getCurrentUser(),
    staleTime: 60 * 1000,
  })
}

export function useUser(id: string) {
  return useQuery({
    queryKey: ['users', id],
    queryFn: () => db.users.getUserById(id),
    enabled: !!id,
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (user: Parameters<typeof db.users.updateUser>[0]) =>
      db.users.updateUser(user),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['users', data.id] })
      queryClient.invalidateQueries({ queryKey: ['sessionUser'] })
    },
  })
}

export function useFollowing(userId: string) {
  return useQuery({
    queryKey: ['following', userId],
    queryFn: () => db.users.observeFollowing(userId),
    enabled: !!userId,
  })
}

export function useSearchUsers(query: string) {
  return useQuery({
    queryKey: ['searchUsers', query],
    queryFn: () => db.users.searchUsers(query),
    enabled: query.trim().length > 0,
  })
}

export function useSuggestedUsers(excludeId: string) {
  return useQuery({
    queryKey: ['suggestedUsers', excludeId],
    queryFn: () => db.users.getSuggestedUsers(excludeId),
    enabled: !!excludeId,
  })
}

export function useFollowingIds(userId: string) {
  return useQuery({
    queryKey: ['followingIds', userId],
    queryFn: () => db.users.getFollowingIds(userId),
    enabled: !!userId,
  })
}

export function useToggleFollow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      followerId,
      followingId,
      follow,
    }: {
      followerId: string
      followingId: string
      follow: boolean
    }) =>
      follow
        ? db.users.followUser(followerId, followingId)
        : db.users.unfollowUser(followerId, followingId),
    onSuccess: (_, { followerId, followingId }) => {
      queryClient.invalidateQueries({ queryKey: ['followingIds', followerId] })
      queryClient.invalidateQueries({ queryKey: ['following', followerId] })
      queryClient.invalidateQueries({ queryKey: ['users', followingId] })
      queryClient.invalidateQueries({ queryKey: ['users', followerId] })
      queryClient.invalidateQueries({ queryKey: ['sessionUser'] })
    },
  })
}

// ==========================================
// RESTAURANT HOOKS
// ==========================================

export function useRestaurants(city?: string) {
  return useQuery({
    queryKey: ['restaurants', city],
    queryFn: () =>
      city
        ? db.restaurants.getRestaurantsByCity(city)
        : db.restaurants.getRestaurants(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useRestaurant(id: string) {
  return useQuery({
    queryKey: ['restaurants', id],
    queryFn: () => db.restaurants.getRestaurantById(id),
    enabled: !!id,
  })
}

export function useUpdateRestaurant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (
      restaurant: Parameters<typeof db.restaurants.updateRestaurant>[0]
    ) => db.restaurants.updateRestaurant(restaurant),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['restaurants'] })
      queryClient.invalidateQueries({ queryKey: ['restaurants', data.id] })
    },
  })
}

// ==========================================
// REVIEW HOOKS
// ==========================================

export function useReviews(filter?: {
  restaurantId?: string
  userId?: string
}) {
  const queryKey = filter?.restaurantId
    ? ['reviews', 'restaurant', filter.restaurantId]
    : filter?.userId
      ? ['reviews', 'user', filter.userId]
      : ['reviews', 'all']

  return useQuery({
    queryKey,
    queryFn: () => {
      if (filter?.restaurantId)
        return db.reviews.getReviewsByRestaurant(filter.restaurantId)
      if (filter?.userId) return db.reviews.getReviewsByUser(filter.userId)
      return db.reviews.getReviews()
    },
    staleTime: 30 * 1000,
  })
}

export function usePostReview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (review: Parameters<typeof db.reviews.postReview>[0]) =>
      db.reviews.postReview(review),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] })
      queryClient.invalidateQueries({
        queryKey: ['restaurants', data.restaurantId],
      })
      queryClient.invalidateQueries({ queryKey: ['users', data.userId] })
    },
  })
}

export function useDeleteReview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ reviewId, userId }: { reviewId: string; userId: string }) =>
      db.reviews.deleteReview(reviewId, userId),
    onMutate: async ({ reviewId }) => {
      await queryClient.cancelQueries({ queryKey: ['reviews'] })
      const previous = queryClient.getQueriesData<Review[]>({
        queryKey: ['reviews'],
      })

      queryClient.setQueriesData<Review[]>(
        { queryKey: ['reviews'] },
        (reviews) => reviews?.filter((review) => review.id !== reviewId)
      )

      return { previous }
    },
    onError: (_error, _variables, context) => {
      context?.previous.forEach(([queryKey, reviews]) => {
        queryClient.setQueryData(queryKey, reviews)
      })
    },
    onSuccess: (_, { reviewId }) => {
      queryClient.removeQueries({ queryKey: ['reviews', { id: reviewId }] })
      queryClient.invalidateQueries({ queryKey: ['restaurants'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['sessionUser'] })
    },
  })
}

export function useToggleLike() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ reviewId, userId }: { reviewId: string; userId: string }) =>
      db.reviews.toggleLike(reviewId, userId),
    onSuccess: (_, { reviewId }) => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] })
      queryClient.invalidateQueries({ queryKey: ['reviews', { id: reviewId }] })
    },
  })
}

export function useAddComment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      reviewId,
      userId,
      text,
      parentId,
    }: {
      reviewId: string
      userId: string
      text: string
      parentId?: string | null
    }) => db.reviews.addComment(reviewId, userId, text, parentId),
    onSuccess: (_, { reviewId }) => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] })
      queryClient.invalidateQueries({ queryKey: ['reviews', { id: reviewId }] })
    },
  })
}

// ==========================================
// VIBE CHECK HOOKS
// ==========================================

export function useVibeChecks(restaurantId: string) {
  return useQuery({
    queryKey: ['vibeChecks', restaurantId],
    queryFn: () => db.vibeChecks.getVibeChecksByRestaurant(restaurantId),
    enabled: !!restaurantId,
  })
}

export function usePostVibeCheck() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (
      vibeCheck: Parameters<typeof db.vibeChecks.postVibeCheck>[0]
    ) => db.vibeChecks.postVibeCheck(vibeCheck),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['vibeChecks', data.restaurantId],
      })
      queryClient.invalidateQueries({
        queryKey: ['restaurants', data.restaurantId],
      })
    },
  })
}

// ==========================================
// GROUP HOOKS
// ==========================================

export function useGroups() {
  return useQuery({
    queryKey: ['groups'],
    queryFn: () => db.groups.getGroups(),
    staleTime: 2 * 60 * 1000,
  })
}

export function useGroup(id: string) {
  return useQuery({
    queryKey: ['groups', id],
    queryFn: () => db.groups.getGroupById(id),
    enabled: !!id,
  })
}

export function useCreateGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (group: Parameters<typeof db.groups.createGroup>[0]) =>
      db.groups.createGroup(group),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
  })
}

export function useJoinGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      db.groups.joinGroup(groupId, userId),
    onSuccess: (_, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: ['groups', groupId] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
  })
}

export function useLeaveGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      db.groups.leaveGroup(groupId, userId),
    onSuccess: (_, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: ['groups', groupId] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
  })
}

// ==========================================
// LIST HOOKS
// ==========================================

export function useLists() {
  return useQuery({
    queryKey: ['lists'],
    queryFn: () => db.lists.getLists(),
  })
}

export function useList(id: string) {
  return useQuery({
    queryKey: ['lists', id],
    queryFn: () => db.lists.getListById(id),
    enabled: !!id,
  })
}

export function useCreateList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (list: Parameters<typeof db.lists.createList>[0]) =>
      db.lists.createList(list),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lists'] })
    },
  })
}

export function useUpdateList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (list: CustomList) => db.lists.updateList(list),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['lists', data.id] })
      queryClient.invalidateQueries({ queryKey: ['lists'] })
    },
  })
}

export function useDeleteList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => db.lists.deleteList(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lists'] })
    },
  })
}

export function useAddRestaurantToList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      listId,
      restaurantId,
      note,
      priority,
    }: {
      listId: string
      restaurantId: string
      note?: string | null
      priority?: number
    }) => db.lists.addRestaurantToList(listId, restaurantId, note, priority),
    onSuccess: (_, { listId }) => {
      queryClient.invalidateQueries({ queryKey: ['lists', listId] })
      queryClient.invalidateQueries({ queryKey: ['lists'] })
    },
  })
}

export function useRemoveRestaurantFromList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      listId,
      restaurantId,
    }: {
      listId: string
      restaurantId: string
    }) => db.lists.removeRestaurantFromList(listId, restaurantId),
    onSuccess: (_, { listId }) => {
      queryClient.invalidateQueries({ queryKey: ['lists', listId] })
      queryClient.invalidateQueries({ queryKey: ['lists'] })
    },
  })
}

// ==========================================
// NOTIFICATION HOOKS
// ==========================================

export function useNotifications(userId: string) {
  return useQuery({
    queryKey: ['notifications', userId],
    queryFn: () => db.notifications.getNotifications(userId),
    enabled: !!userId,
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (notificationId: string) =>
      db.notifications.markAsRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

// ==========================================
// STORIES HOOKS
// ==========================================

export function useStories() {
  return useQuery({
    queryKey: ['stories'],
    queryFn: () => db.stories.getStories(),
    staleTime: 15 * 1000,
  })
}

export function usePostStory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      userId,
      photoUrl,
      caption,
      restaurantId,
    }: {
      userId: string
      photoUrl: string
      caption?: string
      restaurantId?: string
    }) => db.stories.postStory(userId, photoUrl, caption, restaurantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories'] })
    },
  })
}

export function useMarkStoryViewed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ storyId, userId }: { storyId: string; userId: string }) =>
      db.stories.markStoryAsViewed(storyId, userId),
    onMutate: async ({ storyId, userId }) => {
      await queryClient.cancelQueries({ queryKey: ['stories'] })
      const previous = queryClient.getQueryData<Story[]>(['stories'])

      queryClient.setQueryData<Story[]>(['stories'], (stories) =>
        stories?.map((story) =>
          story.id === storyId && !story.viewers.includes(userId)
            ? { ...story, viewers: [...story.viewers, userId] }
            : story
        )
      )

      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['stories'], context.previous)
      }
    },
  })
}

// ==========================================
// ILLNESS WARNING HOOKS
// ==========================================

export function useIllnessReports(restaurantId: string) {
  return useQuery({
    queryKey: ['illnessReports', restaurantId],
    queryFn: () => db.illness.getIllnessReportsByRestaurant(restaurantId),
    enabled: !!restaurantId,
  })
}

/** Whether the user may submit a new illness report (one per restaurant per 30 days). */
export function useIllnessReportLimit(restaurantId: string, userId: string) {
  return useQuery({
    queryKey: ['illnessLimit', restaurantId, userId],
    queryFn: () => db.illness.checkUserReportLimit(restaurantId, userId),
    enabled: !!restaurantId && !!userId,
  })
}

export function usePostIllnessReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      restaurantId,
      symptom,
      note,
      mealDate,
    }: {
      restaurantId: string
      symptom: IllnessSymptom
      note?: string
      mealDate?: string
    }) => db.illness.postIllnessReport(restaurantId, symptom, note, mealDate),
    onSuccess: (_, { restaurantId }) => {
      queryClient.invalidateQueries({
        queryKey: ['illnessReports', restaurantId],
      })
      queryClient.invalidateQueries({
        queryKey: ['illnessLimit', restaurantId],
      })
      queryClient.invalidateQueries({ queryKey: ['restaurants', restaurantId] })
    },
  })
}

// ==========================================
// DUEL & ELO HOOKS
// ==========================================

export function useDuels(userId: string) {
  return useQuery({
    queryKey: ['duels', userId],
    queryFn: () => db.duels.getDuelsByUser(userId),
    enabled: !!userId,
  })
}

export function usePostDuel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (duel: Omit<RestaurantDuel, 'id' | 'createdAt'>) =>
      db.duels.postDuel(duel),
    onSuccess: (_, duel) => {
      queryClient.invalidateQueries({ queryKey: ['duels'] })
      queryClient.invalidateQueries({
        queryKey: ['eloLeaderboard', duel.cuisine],
      })
    },
  })
}

export function useEloLeaderboard(cuisine: RestaurantCategory) {
  return useQuery({
    queryKey: ['eloLeaderboard', cuisine],
    queryFn: () => db.duels.getEloLeaderboard(cuisine),
    enabled: !!cuisine,
  })
}

// ==========================================
// AI AGENT HOOKS
// ==========================================

export function useAiUserProfile(userId: string) {
  return useQuery({
    queryKey: ['aiProfile', userId],
    queryFn: () => db.ai.getAiUserProfile(userId),
    enabled: !!userId,
  })
}

export function useAiChatHistory(userId: string) {
  return useQuery({
    queryKey: ['aiChatHistory', userId],
    queryFn: () => db.ai.getChatHistory(userId),
    enabled: !!userId,
  })
}

export function useSendAiMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      userId,
      role,
      content,
    }: {
      userId: string
      role: 'user' | 'assistant'
      content: string
    }) => db.ai.postChatMessage(userId, role, content),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['aiChatHistory', userId] })
    },
  })
}
