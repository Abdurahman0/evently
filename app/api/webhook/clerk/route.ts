import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { clerkClient, WebhookEvent } from '@clerk/nextjs/server'
import { createUser, deleteUser, updateUser } from '@/lib/actions/user.actions'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
	const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET

	if (!WEBHOOK_SECRET) {
		throw new Error(
			'Please add WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local'
		)
	}

	// Get the headers
	const headerPayload = headers()
	const svix_id = headerPayload.get('svix-id')
	const svix_timestamp = headerPayload.get('svix-timestamp')
	const svix_signature = headerPayload.get('svix-signature')

	// If there are no headers, error out
	if (!svix_id || !svix_timestamp || !svix_signature) {
		return new Response('Error occured -- no svix headers', {
			status: 400,
		})
	}

	// Get the body
	const payload = await req.json()
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
		return new Response('Error occured', {
			status: 400,
		})
	}

	// Type guard to ensure evt.data has the properties we need
	const isUserEvent = (
		data: any
	): data is {
		id: string
		email_addresses: { email_address: string }[]
		image_url?: string
		first_name?: string
		last_name?: string
		username?: string
	} => {
		return (
			data &&
			typeof data.id === 'string' &&
			Array.isArray(data.email_addresses) &&
			data.email_addresses[0]?.email_address === 'string'
		)
	}

	// Handle the webhook events
	const { id, email_addresses, image_url, first_name, last_name, username } =
		evt.data
	const eventType = evt.type

	if (eventType === 'user.created') {
		if (isUserEvent(evt.data)) {
			const user = {
				clerkId: id,
				email: email_addresses[0].email_address,
				username: username || '', // Provide a default value
				firstName: first_name || '', // Provide a default value
				lastName: last_name || '', // Provide a default value
				photo: image_url || '', // Provide a default value
			}

			try {
				const newUser = await createUser(user)
				console.log('New user created:', newUser)

				if (newUser) {
					await clerkClient.users.updateUserMetadata(id, {
						publicMetadata: {
							userId: newUser._id,
						},
					})
				}

				return NextResponse.json({ message: 'OK', user: newUser })
			} catch (error) {
				console.error('Error creating user:', error)
				return new Response('Error creating user', {
					status: 500,
				})
			}
		} else {
			return new Response('Invalid user data', {
				status: 400,
			})
		}
	}

	if (eventType === 'user.updated') {
		// Handle user.update logic
	}

	if (eventType === 'user.deleted') {
		// Handle user.deleted logic
	}

	return new Response('', { status: 200 })
}
