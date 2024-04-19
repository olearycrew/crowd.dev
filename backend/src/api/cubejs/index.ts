import { safeWrap } from '../../middlewares/errorMiddleware'
import cubeJsAuth from './cubeJsAuth'
import cubeJsVerifyToken from './cubeJsVerifyToken'

export default (app) => {
  app.get(`/tenant/:tenantId/cubejs/auth`, safeWrap(cubeJsAuth))
  app.post(`/tenant/:tenantId/cubejs/verify`, safeWrap(cubeJsVerifyToken))
}
