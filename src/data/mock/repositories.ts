/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prefer-const */
import {
  type UserRepository,
  type RestaurantRepository,
  type ReviewRepository,
  type VibeCheckRepository,
  type GroupRepository,
  type ListRepository,
  type NotificationRepository,
  type SessionRepository,
  type StoryRepository,
  type IllnessRepository,
  type DuelRepository,
  type AiRepository,
} from '../../domain/repositories'
import {
  type User,
  type Restaurant,
  type Review,
  type VibeCheck,
  type Group,
  type GroupMember,
  type CustomList,
  type ListItem,
  type Notification,
  type Poll,
  type Comment,
  type Story,
  type IllnessReport,
  type PublicIllnessReport,
  type IllnessSymptom,
  type MetricId,
  RestaurantCategory,
  type RestaurantDuel,
  type CuisineElo,
  type AiUserProfile,
  type AiChatMessage,
  GroupRole,
} from '../../domain/models'
import {
  currentUser as initialCurrentUser,
  allUsers,
  restaurants as initialRestaurants,
  reviews as initialReviews,
  groups as initialGroups,
  lists as initialLists,
  vibeChecks as initialVibeChecks,
  notifications as initialNotifications,
} from './fixtures'
import { calculateElo } from '../../domain/logic/elo'
import { summarizeIllness } from '../../domain/logic/illness'

// Mutable In-Memory Database States
let usersState = [...allUsers]
let currentUserState: User | null = { ...initialCurrentUser }
let restaurantsState = [...initialRestaurants]
let reviewsState = [...initialReviews]
let groupsState = [...initialGroups]
let listsState = [...initialLists]
let vibeChecksState = [...initialVibeChecks]
let notificationsState = [...initialNotifications]

// New Features In-Memory States
const hoursFromNow = (h: number) =>
  new Date(Date.now() + h * 60 * 60 * 1000).toISOString()
const hoursAgo = (h: number) =>
  new Date(Date.now() - h * 60 * 60 * 1000).toISOString()
const daysAgoIso = (d: number) =>
  new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString()

let storiesState: Story[] = [
  {
    id: 'story_1',
    userId: 'u_dudacomida',
    restaurantId: 'r_sp_0',
    photoUrl: 'https://picsum.photos/seed/story1/1080/1920',
    caption: 'Melhor burger da cidade! 🍔🔥',
    viewers: [], // unseen by current user → gradient ring on the rail
    expiresAt: hoursFromNow(12), // expires in 12h
    createdAt: hoursAgo(2),
  },
  {
    id: 'story_2',
    userId: 'u_chefnando',
    restaurantId: 'r_sp_1',
    photoUrl: 'https://picsum.photos/seed/story2/1080/1920',
    caption: 'Resenha de hoje 🍝',
    viewers: ['u_me', 'u_pizzaqueen'], // already seen by current user → muted ring
    expiresAt: hoursFromNow(20),
    createdAt: hoursAgo(5),
  },
  {
    id: 'story_3',
    userId: 'u_me',
    restaurantId: 'r_rp_0',
    photoUrl: 'https://picsum.photos/seed/story3/1080/1920',
    caption: 'Colei nesse pico, recomendo 👌',
    viewers: ['u_dudacomida', 'u_chefnando', 'u_pizzaqueen'], // my story → viewer list
    expiresAt: hoursFromNow(22),
    createdAt: hoursAgo(1),
  },
]

// Seeded illness reports: r_sp_2 is at/above threshold (warning), r_sp_3 is below it.
let illnessReportsState: IllnessReport[] = [
  {
    id: 'ill_seed_1',
    restaurantId: 'r_sp_2',
    reporterUserId: 'u_dudacomida',
    symptom: 'INTOXICACAO' as IllnessSymptom,
    mealDate: daysAgoIso(5).split('T')[0],
    createdAt: daysAgoIso(5),
  },
  {
    id: 'ill_seed_2',
    restaurantId: 'r_sp_2',
    reporterUserId: 'u_chefnando',
    symptom: 'DIARREIA' as IllnessSymptom,
    mealDate: daysAgoIso(12).split('T')[0],
    createdAt: daysAgoIso(12),
  },
  {
    id: 'ill_seed_3',
    restaurantId: 'r_sp_2',
    reporterUserId: 'u_pizzaqueen',
    symptom: 'VOMITO' as IllnessSymptom,
    mealDate: daysAgoIso(40).split('T')[0],
    createdAt: daysAgoIso(40),
  },
  {
    id: 'ill_seed_4',
    restaurantId: 'r_sp_3',
    reporterUserId: 'u_dudacomida',
    symptom: 'MAL_ESTAR' as IllnessSymptom,
    mealDate: daysAgoIso(8).split('T')[0],
    createdAt: daysAgoIso(8),
  },
]

// Reconcile each restaurant's illness aggregate with the seeded reports so the
// warning banner reflects real counts from the start.
restaurantsState = restaurantsState.map((r) => {
  const reports = illnessReportsState.filter((i) => i.restaurantId === r.id)
  if (reports.length === 0) return r
  const { count90d, warning } = summarizeIllness(reports)
  return { ...r, illnessReports90d: count90d, illnessWarning: warning }
})

// Seed a duel-eligible matchup for the current user: two recent same-cuisine reviews
// sharing several metrics, so the duel trigger has data on first run.
{
  const me = currentUserState?.id || 'u_me'
  const sharedMetrics = {} as Record<MetricId, number>
  ;(['TASTE', 'SERVICE', 'COST_BENEFIT', 'VIBE'] as MetricId[]).forEach((m) => {
    sharedMetrics[m] = 4
  })
  for (const cat of Object.values(RestaurantCategory)) {
    const pair = restaurantsState
      .filter((r) => r.categories.includes(cat))
      .slice(0, 2)
    if (pair.length < 2) continue
    const seededDuelReviews: Review[] = pair.map((r, idx) => ({
      id: `rev_duel_${idx}`,
      userId: me,
      restaurantId: r.id,
      restaurant: r,
      overallScore: idx === 0 ? 5 : 4,
      metrics: sharedMetrics,
      comment: 'Colei aqui faz pouco tempo, rango de respeito.',
      photos: [],
      targetDestinations: [{ type: 'profile', id: me }],
      receiptPhoto: null,
      totalSpent: undefined,
      visitDate: daysAgoIso(idx === 0 ? 2 : 9).split('T')[0],
      companions: null,
      likes: 0,
      comments: [],
      isLikedByMe: false,
      createdAt: hoursAgo(idx === 0 ? 3 : 60),
    }))
    reviewsState = [...seededDuelReviews, ...reviewsState]
    break
  }
}
let restaurantDuelsState: RestaurantDuel[] = []
let cuisineElosState: CuisineElo[] = []
let aiUserProfilesState: AiUserProfile[] = []
let aiChatMessagesState: AiChatMessage[] = []
let followsState: Array<{ follower: string; following: string }> = []

// ==========================================
// MOCK IMPLEMENTATIONS
// ==========================================

export class MockUserRepository implements UserRepository {
  async getUserById(id: string): Promise<User | null> {
    return usersState.find((u) => u.id === id) || null
  }
  async updateUser(user: User): Promise<User> {
    usersState = usersState.map((u) => (u.id === user.id ? user : u))
    if (currentUserState && currentUserState.id === user.id) {
      currentUserState = user
    }
    return user
  }
  async observeFollowing(userId: string): Promise<User[]> {
    const ids = followsState
      .filter((f) => f.follower === userId)
      .map((f) => f.following)
    if (ids.length === 0) {
      // Demo fallback so the mock feed isn't empty before any follow is made.
      return usersState.filter((u) => u.id !== userId).slice(0, 4)
    }
    return usersState.filter((u) => ids.includes(u.id))
  }
  async searchUsers(query: string): Promise<User[]> {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return usersState
      .filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q)
      )
      .slice(0, 25)
  }
  async getSuggestedUsers(excludeId: string): Promise<User[]> {
    return usersState.filter((u) => u.id !== excludeId).slice(0, 20)
  }
  async followUser(followerId: string, followingId: string): Promise<void> {
    if (followerId === followingId) return
    if (
      !followsState.some(
        (f) => f.follower === followerId && f.following === followingId
      )
    ) {
      followsState = [
        ...followsState,
        { follower: followerId, following: followingId },
      ]
    }
  }
  async unfollowUser(followerId: string, followingId: string): Promise<void> {
    followsState = followsState.filter(
      (f) => !(f.follower === followerId && f.following === followingId)
    )
  }
  async getFollowingIds(userId: string): Promise<string[]> {
    return followsState
      .filter((f) => f.follower === userId)
      .map((f) => f.following)
  }
}

export class MockRestaurantRepository implements RestaurantRepository {
  async getRestaurantById(id: string): Promise<Restaurant | null> {
    return restaurantsState.find((r) => r.id === id) || null
  }
  async getRestaurants(): Promise<Restaurant[]> {
    return restaurantsState
  }
  async getRestaurantsByCity(city: string): Promise<Restaurant[]> {
    return restaurantsState.filter(
      (r) => r.address.city.toLowerCase() === city.toLowerCase()
    )
  }
  async updateRestaurant(restaurant: Restaurant): Promise<Restaurant> {
    const exists = restaurantsState.some((r) => r.id === restaurant.id)
    if (exists) {
      restaurantsState = restaurantsState.map((r) =>
        r.id === restaurant.id ? restaurant : r
      )
    } else {
      restaurantsState = [...restaurantsState, restaurant]
    }
    return restaurant
  }
}

export class MockReviewRepository implements ReviewRepository {
  async getReviewById(id: string): Promise<Review | null> {
    return reviewsState.find((r) => r.id === id) || null
  }
  async getReviews(): Promise<Review[]> {
    return reviewsState
  }
  async getReviewsByRestaurant(restaurantId: string): Promise<Review[]> {
    return reviewsState.filter((r) => r.restaurantId === restaurantId)
  }
  async getReviewsByUser(userId: string): Promise<Review[]> {
    return reviewsState.filter((r) => r.userId === userId)
  }
  async postReview(
    review: Omit<
      Review,
      'id' | 'createdAt' | 'likes' | 'comments' | 'isLikedByMe'
    >
  ): Promise<Review> {
    const newReview: Review = {
      ...review,
      id: `rev_${Math.random().toString(36).substring(2, 9)}`,
      likes: 0,
      comments: [],
      isLikedByMe: false,
      createdAt: new Date().toISOString(),
    }
    reviewsState = [newReview, ...reviewsState]

    // Update review count on restaurant
    restaurantsState = restaurantsState.map((r) => {
      if (r.id === review.restaurantId) {
        return { ...r, reviewCount: r.reviewCount + 1 }
      }
      return r
    })

    // Update review count on user
    usersState = usersState.map((u) => {
      if (u.id === review.userId) {
        return { ...u, reviewCount: u.reviewCount + 1 }
      }
      return u
    })

    return newReview
  }
  async deleteReview(reviewId: string, userId: string): Promise<void> {
    const review = reviewsState.find((r) => r.id === reviewId)
    if (!review) return
    if (review.userId !== userId) throw new Error('NOT_AUTHORIZED')

    reviewsState = reviewsState.filter((r) => r.id !== reviewId)
    restaurantsState = restaurantsState.map((r) =>
      r.id === review.restaurantId
        ? { ...r, reviewCount: Math.max(0, r.reviewCount - 1) }
        : r
    )
    usersState = usersState.map((u) =>
      u.id === review.userId
        ? { ...u, reviewCount: Math.max(0, u.reviewCount - 1) }
        : u
    )
  }
  async toggleLike(reviewId: string, _userId: string): Promise<boolean> {
    let liked = false
    reviewsState = reviewsState.map((r) => {
      if (r.id === reviewId) {
        liked = !r.isLikedByMe
        return {
          ...r,
          likes: liked ? r.likes + 1 : Math.max(0, r.likes - 1),
          isLikedByMe: liked,
        }
      }
      return r
    })
    return liked
  }
  async addComment(
    reviewId: string,
    userId: string,
    text: string,
    parentId?: string | null
  ): Promise<Comment> {
    const newComment: Comment = {
      id: `c_${Math.random().toString(36).substring(2, 9)}`,
      reviewId,
      userId,
      text,
      parentId: parentId || null,
      likes: 0,
      isLikedByMe: false,
      createdAt: new Date().toISOString(),
    }
    reviewsState = reviewsState.map((r) => {
      if (r.id === reviewId) {
        return {
          ...r,
          comments: [...r.comments, newComment],
        }
      }
      return r
    })
    return newComment
  }
}

export class MockVibeCheckRepository implements VibeCheckRepository {
  async getVibeChecksByRestaurant(restaurantId: string): Promise<VibeCheck[]> {
    return vibeChecksState.filter((v) => v.restaurantId === restaurantId)
  }
  async postVibeCheck(
    vibeCheck: Omit<VibeCheck, 'id' | 'createdAt' | 'expiresAt'>
  ): Promise<VibeCheck> {
    const newVibeCheck: VibeCheck = {
      ...vibeCheck,
      id: `vibe_${Math.random().toString(36).substring(2, 9)}`,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4h expiration
    }
    vibeChecksState = [newVibeCheck, ...vibeChecksState]

    // Increment vibecheck count on restaurant
    restaurantsState = restaurantsState.map((r) => {
      if (r.id === vibeCheck.restaurantId) {
        return { ...r, vibeCheckCount: r.vibeCheckCount + 1 }
      }
      return r
    })

    return newVibeCheck
  }
}

export class MockGroupRepository implements GroupRepository {
  async getGroups(): Promise<Group[]> {
    return groupsState
  }
  async getGroupById(id: string): Promise<Group | null> {
    return groupsState.find((g) => g.id === id) || null
  }
  async createGroup(
    group: Omit<
      Group,
      'id' | 'createdAt' | 'members' | 'memberCount' | 'groupRankings'
    >
  ): Promise<Group> {
    const newGroup: Group = {
      ...group,
      id: `grp_${Math.random().toString(36).substring(2, 9)}`,
      members: [
        {
          userId: group.adminId,
          role: GroupRole.ADMIN,
          joinedAt: new Date().toISOString(),
        },
      ],
      memberCount: 1,
      groupRankings: null,
      createdAt: new Date().toISOString(),
    }
    groupsState = [...groupsState, newGroup]
    return newGroup
  }
  async joinGroup(groupId: string, userId: string): Promise<GroupMember> {
    const newMember: GroupMember = {
      userId,
      role: GroupRole.MEMBER,
      joinedAt: new Date().toISOString(),
    }
    groupsState = groupsState.map((g) => {
      if (g.id === groupId) {
        return {
          ...g,
          members: [...g.members, newMember],
          memberCount: g.memberCount + 1,
        }
      }
      return g
    })
    return newMember
  }
  async leaveGroup(groupId: string, userId: string): Promise<void> {
    groupsState = groupsState.map((g) => {
      if (g.id === groupId) {
        return {
          ...g,
          members: g.members.filter((m) => m.userId !== userId),
          memberCount: Math.max(0, g.memberCount - 1),
        }
      }
      return g
    })
  }
  async postPollVote(
    pollId: string,
    _optionId: string,
    _userId: string
  ): Promise<Poll> {
    // Basic stub poll voting mechanism
    return {
      id: pollId,
      groupId: 'g_1',
      createdBy: 'u_me',
      question: 'Onde comer?',
      options: [],
      expiresAt: new Date().toISOString(),
      isMultipleChoice: false,
      createdAt: new Date().toISOString(),
    }
  }
}

export class MockListRepository implements ListRepository {
  async getLists(): Promise<CustomList[]> {
    return listsState
  }
  async getListById(id: string): Promise<CustomList | null> {
    return listsState.find((l) => l.id === id) || null
  }
  async createList(
    list: Omit<
      CustomList,
      'id' | 'createdAt' | 'updatedAt' | 'followerCount' | 'restaurants'
    >
  ): Promise<CustomList> {
    const newList: CustomList = {
      ...list,
      id: `lst_${Math.random().toString(36).substring(2, 9)}`,
      restaurants: [],
      followerCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    listsState = [...listsState, newList]
    return newList
  }
  async updateList(list: CustomList): Promise<CustomList> {
    listsState = listsState.map((l) =>
      l.id === list.id ? { ...list, updatedAt: new Date().toISOString() } : l
    )
    return list
  }
  async deleteList(id: string): Promise<void> {
    listsState = listsState.filter((l) => l.id !== id)
  }
  async addRestaurantToList(
    listId: string,
    restaurantId: string,
    note?: string | null,
    priority?: number
  ): Promise<ListItem> {
    const newItem: ListItem = {
      restaurantId,
      restaurant: restaurantsState.find((r) => r.id === restaurantId) || null,
      addedBy: currentUserState?.id || 'u_me',
      note: note || null,
      priority: priority || 1,
      addedAt: new Date().toISOString(),
    }
    listsState = listsState.map((l) => {
      if (l.id === listId) {
        return {
          ...l,
          restaurants: [...l.restaurants, newItem],
          updatedAt: new Date().toISOString(),
        }
      }
      return l
    })
    return newItem
  }
  async removeRestaurantFromList(
    listId: string,
    restaurantId: string
  ): Promise<void> {
    listsState = listsState.map((l) => {
      if (l.id === listId) {
        return {
          ...l,
          restaurants: l.restaurants.filter(
            (r) => r.restaurantId !== restaurantId
          ),
          updatedAt: new Date().toISOString(),
        }
      }
      return l
    })
  }
}

export class MockNotificationRepository implements NotificationRepository {
  async getNotifications(_userId: string): Promise<Notification[]> {
    return notificationsState
  }
  async markAsRead(notificationId: string): Promise<void> {
    notificationsState = notificationsState.map((n) =>
      n.id === notificationId ? { ...n, isRead: true } : n
    )
  }
}

export class MockSessionRepository implements SessionRepository {
  async getCurrentUser(): Promise<User | null> {
    return currentUserState
  }
  async setCurrentUser(user: User | null): Promise<void> {
    currentUserState = user
  }
}

export class MockStoryRepository implements StoryRepository {
  async getStories(): Promise<Story[]> {
    // Filter out expired stories
    const nowIso = new Date().toISOString()
    return storiesState
      .filter((s) => s.expiresAt > nowIso)
      .map((story) => ({
        ...story,
        user: usersState.find((user) => user.id === story.userId),
        restaurant: story.restaurantId
          ? restaurantsState.find(
              (restaurant) => restaurant.id === story.restaurantId
            )
          : undefined,
      }))
  }
  async postStory(
    userId: string,
    photoUrl: string,
    caption?: string,
    restaurantId?: string
  ): Promise<Story> {
    const newStory: Story = {
      id: `story_${Math.random().toString(36).substring(2, 9)}`,
      userId,
      photoUrl,
      caption,
      restaurantId,
      restaurant: restaurantId
        ? restaurantsState.find((r) => r.id === restaurantId)
        : undefined,
      viewers: [],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h expiry
    }
    storiesState = [newStory, ...storiesState]
    return {
      ...newStory,
      user: usersState.find((user) => user.id === userId),
    }
  }
  async markStoryAsViewed(storyId: string, userId: string): Promise<void> {
    storiesState = storiesState.map((s) => {
      if (s.id === storyId && !s.viewers.includes(userId)) {
        return { ...s, viewers: [...s.viewers, userId] }
      }
      return s
    })
  }
}

export class MockIllnessRepository implements IllnessRepository {
  async getIllnessReportsByRestaurant(
    restaurantId: string
  ): Promise<PublicIllnessReport[]> {
    // Strip reporterUserId — the reporter's identity is never returned to clients.
    return illnessReportsState
      .filter((i) => i.restaurantId === restaurantId)
      .map(
        (i): PublicIllnessReport => ({
          id: i.id,
          restaurantId: i.restaurantId,
          symptom: i.symptom,
          note: i.note,
          mealDate: i.mealDate,
          createdAt: i.createdAt,
        })
      )
  }
  async postIllnessReport(
    restaurantId: string,
    symptom: IllnessSymptom,
    note?: string,
    mealDate?: string
  ): Promise<IllnessReport> {
    const userId = currentUserState?.id || 'u_me'

    // Enforce one report per user per restaurant per 30 days (abuse guard).
    const allowed = await this.checkUserReportLimit(restaurantId, userId)
    if (!allowed) {
      throw new Error('ALREADY_REPORTED')
    }

    const newReport: IllnessReport = {
      id: `ill_${Math.random().toString(36).substring(2, 9)}`,
      restaurantId,
      reporterUserId: userId,
      symptom,
      note,
      mealDate: mealDate || new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
    }
    illnessReportsState = [...illnessReportsState, newReport]

    // Recompute the public illness aggregate (threshold logic lives in domain/logic).
    const restaurantReports = illnessReportsState.filter(
      (i) => i.restaurantId === restaurantId
    )
    const { count90d, warning } = summarizeIllness(restaurantReports)
    restaurantsState = restaurantsState.map((r) =>
      r.id === restaurantId
        ? { ...r, illnessReports90d: count90d, illnessWarning: warning }
        : r
    )

    return newReport
  }
  async checkUserReportLimit(
    restaurantId: string,
    userId: string
  ): Promise<boolean> {
    // Check if user has already reported in the last 30 days
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString()
    const reported = illnessReportsState.some(
      (i) =>
        i.restaurantId === restaurantId &&
        i.reporterUserId === userId &&
        i.createdAt >= thirtyDaysAgo
    )
    return !reported
  }
}

export class MockDuelRepository implements DuelRepository {
  async getDuelsByUser(userId: string): Promise<RestaurantDuel[]> {
    return restaurantDuelsState.filter((d) => d.userId === userId)
  }
  async postDuel(
    duel: Omit<RestaurantDuel, 'id' | 'createdAt'>
  ): Promise<RestaurantDuel> {
    const newDuel: RestaurantDuel = {
      ...duel,
      id: `duel_${Math.random().toString(36).substring(2, 9)}`,
      createdAt: new Date().toISOString(),
    }
    restaurantDuelsState = [...restaurantDuelsState, newDuel]

    // Calculate and update ELOs
    const restA = restaurantsState.find((r) => r.id === duel.aId)
    const restB = restaurantsState.find((r) => r.id === duel.bId)
    if (restA && restB) {
      const oldRatingA = restA.eloByCuisine[duel.cuisine] || 1000
      const oldRatingB = restB.eloByCuisine[duel.cuisine] || 1000
      const outcome = duel.winnerId === duel.aId ? 'A_win' : 'B_win'
      const { ratingA: newRatingA, ratingB: newRatingB } = calculateElo(
        oldRatingA,
        oldRatingB,
        outcome
      )

      // Update ELOs in lists & models
      await this.updateElo(restA.id, duel.cuisine, newRatingA)
      await this.updateElo(restB.id, duel.cuisine, newRatingB)
    }

    return newDuel
  }
  async getEloLeaderboard(cuisine: RestaurantCategory): Promise<CuisineElo[]> {
    // If empty, seed from active restaurants
    const elos = cuisineElosState.filter((e) => e.cuisine === cuisine)
    if (elos.length === 0) {
      const seeding = restaurantsState
        .filter((r) => r.categories.includes(cuisine))
        .map((r) => ({
          restaurantId: r.id,
          cuisine,
          rating: r.eloByCuisine[cuisine] || 1000,
          duels: 0,
        }))
      cuisineElosState = [...cuisineElosState, ...seeding]
      return seeding.sort((a, b) => b.rating - a.rating)
    }
    return elos.sort((a, b) => b.rating - a.rating)
  }
  async updateElo(
    restaurantId: string,
    cuisine: RestaurantCategory,
    newRating: number
  ): Promise<void> {
    // Update local ELO stats
    let found = false
    cuisineElosState = cuisineElosState.map((e) => {
      if (e.restaurantId === restaurantId && e.cuisine === cuisine) {
        found = true
        return { ...e, rating: newRating, duels: e.duels + 1 }
      }
      return e
    })

    if (!found) {
      cuisineElosState.push({
        restaurantId,
        cuisine,
        rating: newRating,
        duels: 1,
      })
    }

    // Reflect ELO in restaurant model too
    restaurantsState = restaurantsState.map((r) => {
      if (r.id === restaurantId) {
        const elos = { ...r.eloByCuisine, [cuisine]: newRating }
        return { ...r, eloByCuisine: elos }
      }
      return r
    })
  }
}

export class MockAiRepository implements AiRepository {
  async getAiUserProfile(userId: string): Promise<AiUserProfile | null> {
    return aiUserProfilesState.find((p) => p.userId === userId) || null
  }
  async updateAiUserProfile(
    userId: string,
    markdown: string
  ): Promise<AiUserProfile> {
    const existing = aiUserProfilesState.find((p) => p.userId === userId)
    if (existing) {
      existing.markdown = markdown
      existing.updatedAt = new Date().toISOString()
      existing.version += 1
      return existing
    } else {
      const newProfile: AiUserProfile = {
        userId,
        markdown,
        updatedAt: new Date().toISOString(),
        version: 1,
      }
      aiUserProfilesState.push(newProfile)
      return newProfile
    }
  }
  async getChatHistory(userId: string): Promise<AiChatMessage[]> {
    return aiChatMessagesState.filter((m) => m.userId === userId)
  }
  async postChatMessage(
    userId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<AiChatMessage> {
    const newMessage: AiChatMessage = {
      id: `msg_${Math.random().toString(36).substring(2, 9)}`,
      userId,
      role,
      content,
      createdAt: new Date().toISOString(),
    }
    aiChatMessagesState.push(newMessage)
    return newMessage
  }
}
