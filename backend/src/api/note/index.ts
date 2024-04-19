import { safeWrap } from '../../middlewares/errorMiddleware'
import noteQuery from './noteQuery'
import noteCreate from './noteCreate'
import noteUpdate from './noteUpdate'
import noteImport from './noteImport'
import noteDestroy from './noteDestroy'
import noteAutocomplete from './noteAutocomplete'
import noteList from './noteList'
import noteFind from './noteFind'

export default (app) => {
  app.post(`/tenant/:tenantId/note/query`, safeWrap(noteQuery))
  app.post(`/tenant/:tenantId/note`, safeWrap(noteCreate))
  app.put(`/tenant/:tenantId/note/:id`, safeWrap(noteUpdate))
  app.post(`/tenant/:tenantId/note/import`, safeWrap(noteImport))
  app.delete(`/tenant/:tenantId/note`, safeWrap(noteDestroy))
  app.get(`/tenant/:tenantId/note/autocomplete`, safeWrap(noteAutocomplete))
  app.get(`/tenant/:tenantId/note`, safeWrap(noteList))
  app.get(`/tenant/:tenantId/note/:id`, safeWrap(noteFind))
}
