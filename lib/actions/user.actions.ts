'use server'

import { revalidatePath } from 'next/cache'

import { connectToDatabase } from '@/lib/database'
import User from '@/lib/database/models/user.model'
import Order from '@/lib/database/models/order.model'
import Event from '@/lib/database/models/event.model'
import { handleError } from '@/lib/utils'

import { CreateUserParams, UpdateUserParams } from '@/types'

/**
 * Creates a new user in the database.
 * @param user - The user data to create.
 * @returns The created user or null if an error occurs.
 */
export async function createUser(user: CreateUserParams) {
	try {
		await connectToDatabase()
		console.log('Connecting to database...')

		// Log the incoming user data
		console.log('Creating user with data:', user)

		const newUser = await User.create(user)

		console.log('User created successfully:', newUser)

		return JSON.parse(JSON.stringify(newUser))
	} catch (error) {
		console.error('Error creating user:', error)
		handleError(error)
		throw new Error('Error creating user')
	}
}

/**
 * Retrieves a user by their ID.
 * @param userId - The ID of the user to retrieve.
 * @returns The user data or null if an error occurs.
 */
export async function getUserById(userId: string) {
	try {
		await connectToDatabase()

		const user = await User.findById(userId)

		if (!user) throw new Error('User not found')
		console.log('User retrieved:', user)
		return JSON.parse(JSON.stringify(user))
	} catch (error) {
		console.error('Error retrieving user:', error)
		handleError(error)
		return null
	}
}

/**
 * Updates a user based on their Clerk ID.
 * @param clerkId - The Clerk ID of the user to update.
 * @param user - The user data to update.
 * @returns The updated user or null if an error occurs.
 */
export async function updateUser(clerkId: string, user: UpdateUserParams) {
	try {
		await connectToDatabase()

		const updatedUser = await User.findOneAndUpdate({ clerkId }, user, {
			new: true,
		})

		if (!updatedUser) throw new Error('User update failed')
		console.log('User updated:', updatedUser)
		return JSON.parse(JSON.stringify(updatedUser))
	} catch (error) {
		console.error('Error updating user:', error)
		handleError(error)
		return null
	}
}

/**
 * Deletes a user based on their Clerk ID.
 * @param clerkId - The Clerk ID of the user to delete.
 * @returns The deleted user or null if an error occurs.
 */
export async function deleteUser(clerkId: string) {
	try {
		await connectToDatabase()

		// Find user to delete
		const userToDelete = await User.findOne({ clerkId })

		if (!userToDelete) {
			throw new Error('User not found')
		}

		// Unlink relationships
		await Promise.all([
			// Update the 'events' collection to remove references to the user
			Event.updateMany(
				{ _id: { $in: userToDelete.events } },
				{ $pull: { organizer: userToDelete._id } }
			),

			// Update the 'orders' collection to remove references to the user
			Order.updateMany(
				{ _id: { $in: userToDelete.orders } },
				{ $unset: { buyer: 1 } }
			),
		])

		// Delete user
		const deletedUser = await User.findByIdAndDelete(userToDelete._id)
		revalidatePath('/')

		console.log('User deleted:', deletedUser)
		return deletedUser ? JSON.parse(JSON.stringify(deletedUser)) : null
	} catch (error) {
		console.error('Error deleting user:', error)
		handleError(error)
		return null
	}
}
