import fp from 'fastify-plugin'
import type { FastifyError, FastifyInstance } from 'fastify'
import { AppError } from '@tashkurgan/shared'

export default fp(async (app: FastifyInstance) => {
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({ error: error.message })
      return
    }
    if (error.validation) {
      reply.status(400).send({ error: error.message })
      return
    }
    // Fastify's own errors (malformed JSON, empty body with a JSON
    // content-type, oversized payloads, ...) already carry the right 4xx
    // status -- surface it instead of collapsing every non-AppError into
    // an opaque 500.
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      reply.status(error.statusCode).send({ error: error.message })
      return
    }
    app.log.error(error)
    reply.status(500).send({ error: 'Internal server error' })
  })
})
