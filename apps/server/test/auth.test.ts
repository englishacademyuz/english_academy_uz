import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { buildApp } from '../src/app'
import { resetDb, createAdmin, loginAs } from './helpers'

describe('auth', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeAll(async () => {
    app = await buildApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })

  it('logs in with valid credentials and resolves the actor on /auth/me', async () => {
    await createAdmin('admin', 'admin12345')
    const cookie = await loginAs(app, 'admin', 'admin12345')

    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    expect(res.json().role).toBe('ADMIN')
  })

  it('rejects invalid credentials', async () => {
    await createAdmin('admin', 'admin12345')
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'admin', password: 'wrong' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects /auth/me without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' })
    expect(res.statusCode).toBe(401)
  })

  it('logs out successfully with no request body', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/logout' })
    expect(res.statusCode).toBe(200)
  })

  // Regression: the admin-web client used to send `Content-Type:
  // application/json` on every request, including bodyless POSTs like this
  // one. Fastify's JSON parser rejects an empty body under that
  // content-type, and the error handler used to collapse that into an
  // opaque 500 instead of surfacing Fastify's own 400.
  it('returns 400, not 500, for an empty body sent with a JSON content-type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { 'content-type': 'application/json' },
    })
    expect(res.statusCode).toBe(400)
  })
})
