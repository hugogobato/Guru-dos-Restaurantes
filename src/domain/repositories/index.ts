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
} from '../models'

export interface UserRepository {
  getUserById(id: string): Promise<User | null>
  updateUser(user: User): Promise<User>
  observeFollowing(userId: string): Promise<User[]>
  /** Search users by @username or display name (for finding friends). */
  searchUsers(query: string): Promise<User[]>
  /** People to suggest following — excludes the given user. */
  getSuggestedUsers(excludeId: string): Promise<User[]>
  followUser(followerId: string, followingId: string): Promise<void>
  unfollowUser(followerId: string, followingId: string): Promise<void>
  /** Ids the given user currently follows (to drive follow/unfollow buttons). */
  getFollowingIds(userId: string): Promise<string[]>
}

export interface RestaurantRepository {
  getRestaurantById(id: string): Promise<Restaurant | null>
  getRestaurants(): Promise<Restaurant[]>
  getRestaurantsByCity(city: string): Promise<Restaurant[]>
  updateRestaurant(restaurant: Restaurant): Promise<Restaurant>
}

export interface ReviewRepository {
  getReviewById(id: string): Promise<Review | null>
  getReviews(): Promise<Review[]>
  getReviewsByRestaurant(restaurantId: string): Promise<Review[]>
  getReviewsByUser(userId: string): Promise<Review[]>
  postReview(
    review: Omit<
      Review,
      'id' | 'createdAt' | 'likes' | 'comments' | 'isLikedByMe'
    >
  ): Promise<Review>
  deleteReview(reviewId: string, userId: string): Promise<void>
  toggleLike(reviewId: string, userId: string): Promise<boolean>
  addComment(
    reviewId: string,
    userId: string,
    text: string,
    parentId?: string | null
  ): Promise<Comment>
}

export interface VibeCheckRepository {
  getVibeChecksByRestaurant(restaurantId: string): Promise<VibeCheck[]>
  postVibeCheck(
    vibeCheck: Omit<VibeCheck, 'id' | 'createdAt' | 'expiresAt'>
  ): Promise<VibeCheck>
}

export interface GroupRepository {
  getGroups(): Promise<Group[]>
  getGroupById(id: string): Promise<Group | null>
  createGroup(
    group: Omit<
      Group,
      'id' | 'createdAt' | 'members' | 'memberCount' | 'groupRankings'
    >
  ): Promise<Group>
  joinGroup(groupId: string, userId: string): Promise<GroupMember>
  leaveGroup(groupId: string, userId: string): Promise<void>
  postPollVote(pollId: string, optionId: string, userId: string): Promise<Poll>
}

export interface ListRepository {
  getLists(): Promise<CustomList[]>
  getListById(id: string): Promise<CustomList | null>
  createList(
    list: Omit<
      CustomList,
      'id' | 'createdAt' | 'updatedAt' | 'followerCount' | 'restaurants'
    >
  ): Promise<CustomList>
  updateList(list: CustomList): Promise<CustomList>
  deleteList(id: string): Promise<void>
  addRestaurantToList(
    listId: string,
    restaurantId: string,
    note?: string | null,
    priority?: number
  ): Promise<ListItem>
  removeRestaurantFromList(listId: string, restaurantId: string): Promise<void>
}

export interface NotificationRepository {
  getNotifications(userId: string): Promise<Notification[]>
  markAsRead(notificationId: string): Promise<void>
}

export interface SessionRepository {
  getCurrentUser(): Promise<User | null>
  setCurrentUser(user: User | null): Promise<void>
}

export interface StoryRepository {
  getStories(): Promise<Story[]>
  postStory(
    userId: string,
    photoUrl: string,
    caption?: string,
    restaurantId?: string
  ): Promise<Story>
  markStoryAsViewed(storyId: string, userId: string): Promise<void>
}

export interface IllnessRepository {
  // Returns the privacy-safe shape only — reporterUserId is never exposed to clients.
  getIllnessReportsByRestaurant(
    restaurantId: string
  ): Promise<PublicIllnessReport[]>
  postIllnessReport(
    restaurantId: string,
    symptom: IllnessSymptom,
    note?: string,
    mealDate?: string
  ): Promise<IllnessReport>
  checkUserReportLimit(restaurantId: string, userId: string): Promise<boolean>
}

export interface DuelRepository {
  getDuelsByUser(userId: string): Promise<RestaurantDuel[]>
  postDuel(
    duel: Omit<RestaurantDuel, 'id' | 'createdAt'>
  ): Promise<RestaurantDuel>
  getEloLeaderboard(cuisine: RestaurantCategory): Promise<CuisineElo[]>
  updateElo(
    restaurantId: string,
    cuisine: RestaurantCategory,
    newRating: number
  ): Promise<void>
}

export interface AiRepository {
  getAiUserProfile(userId: string): Promise<AiUserProfile | null>
  updateAiUserProfile(userId: string, markdown: string): Promise<AiUserProfile>
  getChatHistory(userId: string): Promise<AiChatMessage[]>
  postChatMessage(
    userId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<AiChatMessage>
}
