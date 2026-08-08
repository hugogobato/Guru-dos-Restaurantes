import { describe, expect, it } from 'vitest'
import {
  MockReviewRepository,
  MockRestaurantRepository,
  MockUserRepository,
} from './repositories'

describe('Review repository — deletion', () => {
  it('deletes only the owner review and keeps denormalized counts non-negative', async () => {
    const reviews = new MockReviewRepository()
    const restaurants = new MockRestaurantRepository()
    const users = new MockUserRepository()
    const ownedReview = (await reviews.getReviewsByUser('u_me'))[0]!

    expect(ownedReview).toBeDefined()
    const restaurantBefore = await restaurants.getRestaurantById(
      ownedReview.restaurantId
    )
    const userBefore = await users.getUserById('u_me')

    await expect(
      reviews.deleteReview(ownedReview.id, 'u_dudacomida')
    ).rejects.toThrow('NOT_AUTHORIZED')
    await reviews.deleteReview(ownedReview.id, 'u_me')

    expect(await reviews.getReviewById(ownedReview.id)).toBeNull()
    expect(
      (await restaurants.getRestaurantById(ownedReview.restaurantId))
        ?.reviewCount
    ).toBe(Math.max(0, (restaurantBefore?.reviewCount ?? 0) - 1))
    expect((await users.getUserById('u_me'))?.reviewCount).toBe(
      Math.max(0, (userBefore?.reviewCount ?? 0) - 1)
    )
  })
})
