import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { clerkClient, WebhookEvent } from '@clerk/nextjs/server'
import { createUser, deleteUser, updateUser } from '@/lib/actions/user.actions'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
	// You can find this in the Clerk Dashboard -> Webhooks -> choose the endpoint
	const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET

	if (!WEBHOOK_SECRET) {
		console.error('WEBHOOK_SECRET is missing')
		throw new Error(
			'Please add WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local'
		)
	}

	// Get the headers
	const headerPayload = headers()
	const svix_id = headerPayload.get('svix-id')
	const svix_timestamp = headerPayload.get('svix-timestamp')
	const svix_signature = headerPayload.get('svix-signature')

	// Log headers for debugging
	console.log('Headers:', {
		svix_id,
		svix_timestamp,
		svix_signature,
	})

	// If there are no headers, error out
	if (!svix_id || !svix_timestamp || !svix_signature) {
		console.error('Missing svix headers')
		return new Response('Error occurred -- no svix headers', {
			status: 400,
		})
	}

	// Get the body
	let payload
	try {
		payload = await req.json()
	} catch (error) {
		console.error('Error parsing JSON:', error)
		return new Response('Invalid JSON', {
			status: 400,
		})
	}
	const body = JSON.stringify(payload)

	// Create a new Svix instance with your secret.
	const wh = new Webhook(WEBHOOK_SECRET)

	let evt: WebhookEvent

	// Verify the payload with the headers
	try {
		evt = wh.verify(body, {
			'svix-id': svix_id,
			'svix-timestamp': svix_timestamp,
			'svix-signature': svix_signature,
		}) as WebhookEvent
	} catch (err) {
		console.error('Error verifying webhook:', err)
		return new Response('Error occurred during verification', {
			status: 400,
		})
	}

	// Log the event type for debugging
	console.log('Event type:', evt.type)

	// Handle different event types
	const { id } = evt.data
	const eventType = evt.type

	if (eventType === 'user.created') {
		const { email_addresses, image_url, first_name, last_name, username } =
			evt.data

		const user = {
			clerkId: id,
			email: email_addresses[0].email_address,
			username: username!,
			firstName: first_name,
			lastName: last_name,
			photo: image_url,
		}

		console.log('User:', user)

		try {
			const newUser = await createUser(user)
			console.log('New user created:', newUser)

			if (newUser) {
				await clerkClient.users.updateUserMetadata(id, {
					publicMetadata: {
						userId: newUser._id,
					},
				})
				console.log('User metadata updated in Clerk:', newUser)
			}

			return NextResponse.json({ message: 'OK', user: newUser })
		} catch (error) {
			console.error('Error creating user:', error)
			return new Response('Error creating user', {
				status: 500,
			})
		}
	}

	if (eventType === 'user.updated') {
		const { image_url, first_name, last_name, username } = evt.data

		const user = {
			firstName: first_name,
			lastName: last_name,
			username: username!,
			photo: image_url,
		}

		console.log('Updating user:', user)

		try {
			const updatedUser = await updateUser(id, user)
			console.log('User updated:', updatedUser)
			return NextResponse.json({ message: 'OK', user: updatedUser })
		} catch (error) {
			console.error('Error updating user:', error)
			return new Response('Error updating user', {
				status: 500,
			})
		}
	}

	if (eventType === 'user.deleted') {
		console.log('Deleting user with id:', id)

		try {
			const deletedUser = await deleteUser(id!)
			console.log('User deleted:', deletedUser)
			return NextResponse.json({ message: 'OK', user: deletedUser })
		} catch (error) {
			console.error('Error deleting user:', error)
			return new Response('Error deleting user', {
				status: 500,
			})
		}
	}

	// Default response if no specific event is handled
	return new Response('Event type not handled', { status: 200 })
}
