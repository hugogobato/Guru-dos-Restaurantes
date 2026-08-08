/* eslint-disable @typescript-eslint/no-explicit-any */
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
  type RestaurantCategory,
  type RestaurantDuel,
  type CuisineElo,
  type AiUserProfile,
  type AiChatMessage,
  GroupRole,
} from '../../domain/models'
import { supabase, currentUserId } from './client'
import {
  mapUser,
  userToRow,
  mapRestaurant,
  restaurantToRow,
  mapReview,
  reviewInsertToRow,
  mapComment,
  mapVibeCheck,
  mapGroup,
  mapGroupMember,
  mapList,
  mapListItem,
  mapNotification,
  mapStory,
  mapPublicIllness,
  mapIllness,
  mapDuel,
  mapElo,
  mapAiProfile,
  mapAiChat,
} from './mappers'
import { calculateElo } from '../../domain/logic/elo'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Throws on a PostgREST error, otherwise returns the data. */
function ok<T>(res: { data: T; error: any }): T {
  if (res.error) throw new Error(res.error.message ?? String(res.error))
  return res.data
}

const nowIso = () => new Date().toISOString()
const daysAgoIso = (d: number) =>
  new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString()
const MAX_LIST_ROWS = 200

// PostgREST embed graphs reused across queries. `users` is embedded via an
// explicit FK-constraint hint (e.g. !reviews_user_id_fkey) because reviews and
// notifications have multiple relationships to users (author/actor + junctions
// via comments/review_likes), which PostgREST refuses to embed ambiguously.
const REVIEW_SELECT =
  '*, author:users!reviews_user_id_fkey(*), restaurant:restaurants(*), comments(*, author:users!comments_user_id_fkey(*))'
const GROUP_SELECT = '*, group_members(*, member:users(*))'
const LIST_SELECT = '*, list_items(*, restaurant:restaurants(*))'
const STORY_SELECT =
  'id,user_id,restaurant_id,photo_url,caption,viewers,expires_at,created_at,author:users(id,username,display_name,avatar_url),restaurant:restaurants(id,name,address)'
const NOTIFICATION_SELECT =
  '*, actor:users!notifications_actor_id_fkey(*), target_review:reviews(*), target_restaurant:restaurants(*), target_group:groups(*), target_list:custom_lists(*)'

/** Set of review ids the current user has liked, scoped to the given ids. */
async function likedSet(reviewIds: string[]): Promise<Set<string>> {
  const uid = await currentUserId()
  if (!uid || reviewIds.length === 0) return new Set()
  const { data } = await supabase
    .from('review_likes')
    .select('review_id')
    .eq('user_id', uid)
    .in('review_id', reviewIds)
  return new Set((data ?? []).map((r: any) => r.review_id))
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export class SupabaseUserRepository implements UserRepository {
  async getUserById(id: string): Promise<User | null> {
    const data = ok(
      await supabase.from('users').select('*').eq('id', id).maybeSingle()
    )
    return data ? mapUser(data) : null
  }
  async updateUser(user: User): Promise<User> {
    const data = ok(
      await supabase
        .from('users')
        .update(userToRow(user))
        .eq('id', user.id)
        .select('*')
        .single()
    )
    return mapUser(data)
  }
  async observeFollowing(userId: string): Promise<User[]> {
    const ids = await this.getFollowingIds(userId)
    if (ids.length === 0) return []
    const data = ok(await supabase.from('users').select('*').in('id', ids))
    return (data ?? []).map(mapUser)
  }
  async searchUsers(query: string): Promise<User[]> {
    const q = query.trim().replace(/[%,]/g, '')
    if (!q) return []
    const data = ok(
      await supabase
        .from('users')
        .select('*')
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(25)
    )
    return (data ?? []).map(mapUser)
  }
  async getSuggestedUsers(excludeId: string): Promise<User[]> {
    const data = ok(
      await supabase
        .from('users')
        .select('*')
        .neq('id', excludeId)
        .order('created_at', { ascending: false })
        .limit(20)
    )
    return (data ?? []).map(mapUser)
  }
  async followUser(followerId: string, followingId: string): Promise<void> {
    if (followerId === followingId) return
    // Counts are kept in sync by the sync_follow_counts trigger (see schema.sql).
    ok(
      await supabase
        .from('follows')
        .upsert(
          { follower_id: followerId, following_id: followingId },
          { onConflict: 'follower_id,following_id', ignoreDuplicates: true }
        )
    )
  }
  async unfollowUser(followerId: string, followingId: string): Promise<void> {
    ok(
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
    )
  }
  async getFollowingIds(userId: string): Promise<string[]> {
    const rows = ok(
      await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId)
    )
    return (rows ?? []).map((r: any) => r.following_id)
  }
}

// ---------------------------------------------------------------------------
// Restaurants
// ---------------------------------------------------------------------------

export class SupabaseRestaurantRepository implements RestaurantRepository {
  async getRestaurantById(id: string): Promise<Restaurant | null> {
    const data = ok(
      await supabase.from('restaurants').select('*').eq('id', id).maybeSingle()
    )
    return data ? mapRestaurant(data) : null
  }
  async getRestaurants(): Promise<Restaurant[]> {
    const data = ok(
      await supabase
        .from('restaurants')
        .select('*')
        .order('name')
        .limit(MAX_LIST_ROWS)
    )
    return (data ?? []).map(mapRestaurant)
  }
  async getRestaurantsByCity(city: string): Promise<Restaurant[]> {
    const data = ok(
      await supabase
        .from('restaurants')
        .select('*')
        .ilike('address->>city', city)
        .limit(MAX_LIST_ROWS)
    )
    return (data ?? []).map(mapRestaurant)
  }
  async updateRestaurant(restaurant: Restaurant): Promise<Restaurant> {
    const data = ok(
      await supabase
        .from('restaurants')
        .upsert(restaurantToRow(restaurant))
        .select('*')
        .single()
    )
    return mapRestaurant(data)
  }
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export class SupabaseReviewRepository implements ReviewRepository {
  async getReviewById(id: string): Promise<Review | null> {
    const data = ok(
      await supabase
        .from('reviews')
        .select(REVIEW_SELECT)
        .eq('id', id)
        .maybeSingle()
    )
    if (!data) return null
    return mapReview(data, await likedSet([data.id]))
  }
  async getReviews(): Promise<Review[]> {
    const data = ok(
      await supabase
        .from('reviews')
        .select(REVIEW_SELECT)
        .order('created_at', { ascending: false })
        .limit(MAX_LIST_ROWS)
    )
    const rows = data ?? []
    const liked = await likedSet(rows.map((r: any) => r.id))
    return rows.map((r: any) => mapReview(r, liked))
  }
  async getReviewsByRestaurant(restaurantId: string): Promise<Review[]> {
    const data = ok(
      await supabase
        .from('reviews')
        .select(REVIEW_SELECT)
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .limit(MAX_LIST_ROWS)
    )
    const rows = data ?? []
    const liked = await likedSet(rows.map((r: any) => r.id))
    return rows.map((r: any) => mapReview(r, liked))
  }
  async getReviewsByUser(userId: string): Promise<Review[]> {
    const data = ok(
      await supabase
        .from('reviews')
        .select(REVIEW_SELECT)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(MAX_LIST_ROWS)
    )
    const rows = data ?? []
    const liked = await likedSet(rows.map((r: any) => r.id))
    return rows.map((r: any) => mapReview(r, liked))
  }
  async postReview(
    review: Omit<
      Review,
      'id' | 'createdAt' | 'likes' | 'comments' | 'isLikedByMe'
    >
  ): Promise<Review> {
    // Insert with a plain `*` select (no embeds): embed resolution can fail on a
    // fresh row / stale schema cache, which previously made the whole post throw
    // even though the row landed. The feed/profile refetch hydrates author +
    // restaurant afterwards.
    const data = ok(
      await supabase
        .from('reviews')
        .insert(reviewInsertToRow(review))
        .select('*')
        .single()
    )
    // Bump denormalized counters (RPC keeps fixture counts intact — see schema.sql).
    // Best-effort: never fail a posted review over a counter bump.
    const { error: rpcError } = await supabase.rpc('increment_review_counts', {
      rid: review.restaurantId,
      uid: review.userId,
    })
    if (rpcError)
      console.warn('increment_review_counts failed:', rpcError.message)
    return mapReview(data)
  }
  async deleteReview(reviewId: string, userId: string): Promise<void> {
    const existing = ok(
      await supabase
        .from('reviews')
        .select('restaurant_id, user_id')
        .eq('id', reviewId)
        .maybeSingle()
    )
    if (!existing) return
    if (existing.user_id !== userId) throw new Error('NOT_AUTHORIZED')

    ok(
      await supabase
        .from('reviews')
        .delete()
        .eq('id', reviewId)
        .eq('user_id', userId)
    )

    // Counters are intentionally maintained by RPCs so seed data remains intact.
    const { error: rpcError } = await supabase.rpc('decrement_review_counts', {
      rid: existing.restaurant_id,
      uid: userId,
    })
    if (rpcError)
      console.warn('decrement_review_counts failed:', rpcError.message)
  }
  async toggleLike(reviewId: string, userId: string): Promise<boolean> {
    const existing = ok(
      await supabase
        .from('review_likes')
        .select('review_id')
        .eq('review_id', reviewId)
        .eq('user_id', userId)
        .maybeSingle()
    )
    if (existing) {
      ok(
        await supabase
          .from('review_likes')
          .delete()
          .eq('review_id', reviewId)
          .eq('user_id', userId)
      )
      return false
    }
    ok(
      await supabase
        .from('review_likes')
        .insert({ review_id: reviewId, user_id: userId })
    )
    return true
  }
  async addComment(
    reviewId: string,
    userId: string,
    text: string,
    parentId?: string | null
  ): Promise<Comment> {
    const data = ok(
      await supabase
        .from('comments')
        .insert({
          review_id: reviewId,
          user_id: userId,
          text,
          parent_id: parentId ?? null,
        })
        .select('*, author:users(*)')
        .single()
    )
    return mapComment(data)
  }
}

// ---------------------------------------------------------------------------
// Vibe checks
// ---------------------------------------------------------------------------

export class SupabaseVibeCheckRepository implements VibeCheckRepository {
  async getVibeChecksByRestaurant(restaurantId: string): Promise<VibeCheck[]> {
    const data = ok(
      await supabase
        .from('vibe_checks')
        .select('*, author:users(*)')
        .eq('restaurant_id', restaurantId)
        .gt('expires_at', nowIso())
        .order('created_at', { ascending: false })
        .limit(MAX_LIST_ROWS)
    )
    return (data ?? []).map(mapVibeCheck)
  }
  async postVibeCheck(
    vibeCheck: Omit<VibeCheck, 'id' | 'createdAt' | 'expiresAt'>
  ): Promise<VibeCheck> {
    const data = ok(
      await supabase
        .from('vibe_checks')
        .insert({
          user_id: vibeCheck.userId,
          restaurant_id: vibeCheck.restaurantId,
          status: vibeCheck.status,
          note: vibeCheck.note ?? null,
          photo: vibeCheck.photo ?? null,
        })
        .select('*, author:users(*)')
        .single()
    )
    await supabase.rpc('increment_vibe_count', { rid: vibeCheck.restaurantId })
    return mapVibeCheck(data)
  }
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export class SupabaseGroupRepository implements GroupRepository {
  async getGroups(): Promise<Group[]> {
    const data = ok(
      await supabase.from('groups').select(GROUP_SELECT).order('created_at')
    )
    return (data ?? []).map(mapGroup)
  }
  async getGroupById(id: string): Promise<Group | null> {
    const data = ok(
      await supabase
        .from('groups')
        .select(GROUP_SELECT)
        .eq('id', id)
        .maybeSingle()
    )
    return data ? mapGroup(data) : null
  }
  async createGroup(
    group: Omit<
      Group,
      'id' | 'createdAt' | 'members' | 'memberCount' | 'groupRankings'
    >
  ): Promise<Group> {
    const created = ok(
      await supabase
        .from('groups')
        .insert({
          name: group.name,
          description: group.description ?? null,
          cover_url: group.coverUrl ?? null,
          admin_id: group.adminId,
          admins: group.admins ?? [group.adminId],
          is_open: group.isOpen ?? true,
          mandatory_metrics: group.mandatoryMetrics ?? [],
        })
        .select('id')
        .single()
    )
    const createdId = (created as { id: string }).id
    // Seed the admin as the first member.
    ok(
      await supabase.from('group_members').insert({
        group_id: createdId,
        user_id: group.adminId,
        role: GroupRole.ADMIN,
      })
    )
    const full = ok(
      await supabase
        .from('groups')
        .select(GROUP_SELECT)
        .eq('id', createdId)
        .single()
    )
    return mapGroup(full)
  }
  async joinGroup(groupId: string, userId: string): Promise<GroupMember> {
    const data = ok(
      await supabase
        .from('group_members')
        .insert({ group_id: groupId, user_id: userId, role: GroupRole.MEMBER })
        .select('*, member:users(*)')
        .single()
    )
    return mapGroupMember(data)
  }
  async leaveGroup(groupId: string, userId: string): Promise<void> {
    ok(
      await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId)
    )
  }
  async postPollVote(
    pollId: string,
    optionId: string,
    userId: string
  ): Promise<Poll> {
    // Polls are not yet persisted server-side; return a stub (parity with mock).
    void optionId
    return {
      id: pollId,
      groupId: '',
      createdBy: userId,
      question: '',
      options: [],
      expiresAt: nowIso(),
      isMultipleChoice: false,
      createdAt: nowIso(),
    }
  }
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export class SupabaseListRepository implements ListRepository {
  async getLists(): Promise<CustomList[]> {
    const data = ok(
      await supabase
        .from('custom_lists')
        .select(LIST_SELECT)
        .order('created_at')
    )
    return (data ?? []).map(mapList)
  }
  async getListById(id: string): Promise<CustomList | null> {
    const data = ok(
      await supabase
        .from('custom_lists')
        .select(LIST_SELECT)
        .eq('id', id)
        .maybeSingle()
    )
    return data ? mapList(data) : null
  }
  async createList(
    list: Omit<
      CustomList,
      'id' | 'createdAt' | 'updatedAt' | 'followerCount' | 'restaurants'
    >
  ): Promise<CustomList> {
    const data = ok(
      await supabase
        .from('custom_lists')
        .insert({
          owner_id: list.ownerId,
          name: list.name,
          description: list.description ?? null,
          icon_url: list.iconUrl ?? null,
          cover_color: list.coverColor ?? null,
          is_public: list.isPublic ?? true,
          is_wishlist: list.isWishlist ?? false,
          collaborators: list.collaborators ?? [],
          shared_with: list.sharedWith ?? [],
          themes: list.themes ?? [],
        })
        .select(LIST_SELECT)
        .single()
    )
    return mapList(data)
  }
  async updateList(list: CustomList): Promise<CustomList> {
    const data = ok(
      await supabase
        .from('custom_lists')
        .update({
          name: list.name,
          description: list.description ?? null,
          icon_url: list.iconUrl ?? null,
          cover_color: list.coverColor ?? null,
          is_public: list.isPublic,
          is_wishlist: list.isWishlist,
          collaborators: list.collaborators,
          shared_with: list.sharedWith,
          themes: list.themes,
          updated_at: nowIso(),
        })
        .eq('id', list.id)
        .select(LIST_SELECT)
        .single()
    )
    return mapList(data)
  }
  async deleteList(id: string): Promise<void> {
    ok(await supabase.from('custom_lists').delete().eq('id', id))
  }
  async addRestaurantToList(
    listId: string,
    restaurantId: string,
    note?: string | null,
    priority?: number
  ): Promise<ListItem> {
    const addedBy = await currentUserId()
    const data = ok(
      await supabase
        .from('list_items')
        .insert({
          list_id: listId,
          restaurant_id: restaurantId,
          added_by: addedBy,
          note: note ?? null,
          priority: priority ?? 1,
        })
        .select('*, restaurant:restaurants(*)')
        .single()
    )
    await supabase
      .from('custom_lists')
      .update({ updated_at: nowIso() })
      .eq('id', listId)
    return mapListItem(data)
  }
  async removeRestaurantFromList(
    listId: string,
    restaurantId: string
  ): Promise<void> {
    ok(
      await supabase
        .from('list_items')
        .delete()
        .eq('list_id', listId)
        .eq('restaurant_id', restaurantId)
    )
    await supabase
      .from('custom_lists')
      .update({ updated_at: nowIso() })
      .eq('id', listId)
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export class SupabaseNotificationRepository implements NotificationRepository {
  async getNotifications(userId: string): Promise<Notification[]> {
    const data = ok(
      await supabase
        .from('notifications')
        .select(NOTIFICATION_SELECT)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
    )
    return (data ?? []).map(mapNotification)
  }
  async markAsRead(notificationId: string): Promise<void> {
    ok(
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
    )
  }
}

// ---------------------------------------------------------------------------
// Session (driven by Supabase Auth)
// ---------------------------------------------------------------------------

export class SupabaseSessionRepository implements SessionRepository {
  async getCurrentUser(): Promise<User | null> {
    const uid = await currentUserId()
    if (!uid) return null
    const data = ok(
      await supabase.from('users').select('*').eq('id', uid).maybeSingle()
    )
    return data ? mapUser(data) : null
  }
  async setCurrentUser(user: User | null): Promise<void> {
    // Auth owns the session; the only meaningful client action is signing out.
    if (!user) await supabase.auth.signOut()
  }
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export class SupabaseStoryRepository implements StoryRepository {
  async getStories(): Promise<Story[]> {
    const data = ok(
      await supabase
        .from('stories')
        .select(STORY_SELECT)
        .gt('expires_at', nowIso())
        .order('created_at', { ascending: false })
        .limit(MAX_LIST_ROWS)
    )
    return (data ?? []).map(mapStory)
  }
  async postStory(
    userId: string,
    photoUrl: string,
    caption?: string,
    restaurantId?: string
  ): Promise<Story> {
    const data = ok(
      await supabase
        .from('stories')
        .insert({
          user_id: userId,
          photo_url: photoUrl,
          caption: caption ?? null,
          restaurant_id: restaurantId ?? null,
        })
        .select(STORY_SELECT)
        .single()
    )
    return mapStory(data)
  }
  async markStoryAsViewed(storyId: string, userId: string): Promise<void> {
    await supabase.rpc('mark_story_viewed', {
      p_story_id: storyId,
      p_viewer: userId,
    })
  }
}

// ---------------------------------------------------------------------------
// Illness (privacy-critical — reporter is never exposed to clients)
// ---------------------------------------------------------------------------

export class SupabaseIllnessRepository implements IllnessRepository {
  async getIllnessReportsByRestaurant(
    restaurantId: string
  ): Promise<PublicIllnessReport[]> {
    // Reads the public view, which omits reporter_user_id entirely.
    const data = ok(
      await supabase
        .from('public_illness_reports')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
    )
    return (data ?? []).map(mapPublicIllness)
  }
  async postIllnessReport(
    restaurantId: string,
    symptom: IllnessSymptom,
    note?: string,
    mealDate?: string
  ): Promise<IllnessReport> {
    const uid = await currentUserId()
    if (!uid) throw new Error('NOT_AUTHENTICATED')

    const allowed = await this.checkUserReportLimit(restaurantId, uid)
    if (!allowed) throw new Error('ALREADY_REPORTED')

    // The DB trigger refreshes the restaurant's public illness aggregate.
    const data = ok(
      await supabase
        .from('illness_reports')
        .insert({
          restaurant_id: restaurantId,
          reporter_user_id: uid,
          symptom,
          note: note ?? null,
          meal_date: mealDate ?? new Date().toISOString().split('T')[0],
        })
        .select('*')
        .single()
    )
    return mapIllness(data)
  }
  async checkUserReportLimit(
    restaurantId: string,
    userId: string
  ): Promise<boolean> {
    // RLS select-own means this only ever sees the caller's own rows.
    const data = ok(
      await supabase
        .from('illness_reports')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .eq('reporter_user_id', userId)
        .gte('created_at', daysAgoIso(30))
    )
    return (data ?? []).length === 0
  }
}

// ---------------------------------------------------------------------------
// Duels / ELO
// ---------------------------------------------------------------------------

export class SupabaseDuelRepository implements DuelRepository {
  async getDuelsByUser(userId: string): Promise<RestaurantDuel[]> {
    const data = ok(
      await supabase
        .from('restaurant_duels')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
    )
    return (data ?? []).map(mapDuel)
  }
  async postDuel(
    duel: Omit<RestaurantDuel, 'id' | 'createdAt'>
  ): Promise<RestaurantDuel> {
    const data = ok(
      await supabase
        .from('restaurant_duels')
        .insert({
          user_id: duel.userId,
          cuisine: duel.cuisine,
          a_id: duel.aId,
          b_id: duel.bId,
          questions: duel.questions ?? [],
          winner_id: duel.winnerId,
        })
        .select('*')
        .single()
    )

    // Recompute per-cuisine ELO for both contenders.
    const restos = ok(
      await supabase
        .from('restaurants')
        .select('id, elo_by_cuisine')
        .in('id', [duel.aId, duel.bId])
    )
    const byId = new Map<string, any>((restos ?? []).map((r: any) => [r.id, r]))
    const ratingOf = (id: string) =>
      Number(byId.get(id)?.elo_by_cuisine?.[duel.cuisine] ?? 1000)
    const outcome = duel.winnerId === duel.aId ? 'A_win' : 'B_win'
    const { ratingA, ratingB } = calculateElo(
      ratingOf(duel.aId),
      ratingOf(duel.bId),
      outcome
    )
    await this.updateElo(duel.aId, duel.cuisine, ratingA)
    await this.updateElo(duel.bId, duel.cuisine, ratingB)

    return mapDuel(data)
  }
  async getEloLeaderboard(cuisine: RestaurantCategory): Promise<CuisineElo[]> {
    // Merge every restaurant of this cuisine with its ELO row (defaulting to 1000).
    const [restos, elos] = await Promise.all([
      supabase
        .from('restaurants')
        .select('id, elo_by_cuisine')
        .contains('categories', [cuisine]),
      supabase.from('cuisine_elos').select('*').eq('cuisine', cuisine),
    ])
    const restoRows = ok(restos)
    const eloRows = ok(elos)
    const eloById = new Map<string, any>(
      (eloRows ?? []).map((e: any) => [e.restaurant_id, e])
    )
    const board: CuisineElo[] = (restoRows ?? []).map((r: any) => {
      const e = eloById.get(r.id)
      if (e) return mapElo(e)
      return {
        restaurantId: r.id,
        cuisine,
        rating: Number(r.elo_by_cuisine?.[cuisine] ?? 1000),
        duels: 0,
      }
    })
    return board.sort((a, b) => b.rating - a.rating)
  }
  async updateElo(
    restaurantId: string,
    cuisine: RestaurantCategory,
    newRating: number
  ): Promise<void> {
    const existing = ok(
      await supabase
        .from('cuisine_elos')
        .select('duels')
        .eq('restaurant_id', restaurantId)
        .eq('cuisine', cuisine)
        .maybeSingle()
    )
    ok(
      await supabase.from('cuisine_elos').upsert(
        {
          restaurant_id: restaurantId,
          cuisine,
          rating: newRating,
          duels: (existing?.duels ?? 0) + 1,
        },
        { onConflict: 'restaurant_id,cuisine' }
      )
    )
    // Mirror the rating onto the restaurant's denormalized jsonb.
    const resto = ok(
      await supabase
        .from('restaurants')
        .select('elo_by_cuisine')
        .eq('id', restaurantId)
        .maybeSingle()
    )
    const elo = { ...(resto?.elo_by_cuisine ?? {}), [cuisine]: newRating }
    await supabase
      .from('restaurants')
      .update({ elo_by_cuisine: elo })
      .eq('id', restaurantId)
  }
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

export class SupabaseAiRepository implements AiRepository {
  async getAiUserProfile(userId: string): Promise<AiUserProfile | null> {
    const data = ok(
      await supabase
        .from('ai_user_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
    )
    return data ? mapAiProfile(data) : null
  }
  async updateAiUserProfile(
    userId: string,
    markdown: string
  ): Promise<AiUserProfile> {
    const existing = ok(
      await supabase
        .from('ai_user_profiles')
        .select('version')
        .eq('user_id', userId)
        .maybeSingle()
    )
    const data = ok(
      await supabase
        .from('ai_user_profiles')
        .upsert(
          {
            user_id: userId,
            markdown,
            version: (existing?.version ?? 0) + 1,
            updated_at: nowIso(),
          },
          { onConflict: 'user_id' }
        )
        .select('*')
        .single()
    )
    return mapAiProfile(data)
  }
  async getChatHistory(userId: string): Promise<AiChatMessage[]> {
    const data = ok(
      await supabase
        .from('ai_chat_messages')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
    )
    return (data ?? []).map(mapAiChat)
  }
  async postChatMessage(
    userId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<AiChatMessage> {
    const data = ok(
      await supabase
        .from('ai_chat_messages')
        .insert({ user_id: userId, role, content })
        .select('*')
        .single()
    )
    return mapAiChat(data)
  }
}

// ---------------------------------------------------------------------------
// Assembled repository set (mirrors the `db` shape in repositoryProvider).
// ---------------------------------------------------------------------------

export const supabaseDb = {
  users: new SupabaseUserRepository(),
  restaurants: new SupabaseRestaurantRepository(),
  reviews: new SupabaseReviewRepository(),
  vibeChecks: new SupabaseVibeCheckRepository(),
  groups: new SupabaseGroupRepository(),
  lists: new SupabaseListRepository(),
  notifications: new SupabaseNotificationRepository(),
  session: new SupabaseSessionRepository(),
  stories: new SupabaseStoryRepository(),
  illness: new SupabaseIllnessRepository(),
  duels: new SupabaseDuelRepository(),
  ai: new SupabaseAiRepository(),
}
