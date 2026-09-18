import Fastify from 'fastify'
import cors from '@fastify/cors'
import authPlugin from './plugins/auth'
import errorHandlerPlugin from './plugins/errorHandler'
import { config } from './config'
import { authRoutes } from './routes/auth'
import { subjectRoutes } from './routes/subjects'
import { courseRoutes } from './routes/courses'
import { levelRoutes } from './routes/levels'
import { teacherRoutes } from './routes/teachers'
import { studentRoutes } from './routes/students'
import { parentRoutes } from './routes/parents'
import { groupRoutes } from './routes/groups'
import { lessonSessionRoutes } from './routes/lessonSessions'
import { assessmentRoutes } from './routes/assessments'
import { progressRoutes } from './routes/progress'
import { paymentRoutes } from './routes/payments'
import { pointRoutes } from './routes/points'

export async function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })

  // admin-web runs on a separate dev-server port; credentials: true is
  // required so the auth cookie is sent on cross-port requests.
  await app.register(cors, { origin: config.webOrigin, credentials: true })
  await app.register(errorHandlerPlugin)
  await app.register(authPlugin)

  app.get('/health', async () => ({ status: 'ok' }))

  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(subjectRoutes, { prefix: '/subjects' })
  await app.register(courseRoutes)
  await app.register(levelRoutes)
  await app.register(teacherRoutes, { prefix: '/teachers' })
  await app.register(studentRoutes, { prefix: '/students' })
  await app.register(parentRoutes, { prefix: '/parents' })
  await app.register(groupRoutes)
  await app.register(lessonSessionRoutes)
  await app.register(assessmentRoutes)
  await app.register(progressRoutes)
  await app.register(paymentRoutes)
  await app.register(pointRoutes)

  return app
}
